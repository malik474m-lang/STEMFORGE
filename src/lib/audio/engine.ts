import { buildStemChain } from "./graph";
import type { StemDef } from "./stems";

export interface RenderedStem {
  def: StemDef;
  buffer: AudioBuffer;
  peaks: Float32Array;
}

export const MAX_DURATION_SEC = 20 * 60;

/** Декодирует аудиофайл в стерео AudioBuffer. */
export async function decodeFile(file: File): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  // контекст строго стерео — декодер подстраивает число каналов под контекст,
  // иначе стерео свернулось бы в моно и Mid/Side-разделение развалилось бы
  const ctx = new OfflineAudioContext(2, 1, 44100);
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(arrayBuffer);
  } catch {
    throw new Error("Не удалось прочитать аудиофайл. Поддерживаются MP3, WAV, OGG, FLAC, M4A.");
  }
  if (decoded.duration > MAX_DURATION_SEC) {
    throw new Error("Файл длиннее 20 минут — сократите трек для обработки в браузере.");
  }
  if (decoded.numberOfChannels === 1) {
    const stereo = new AudioBuffer({
      numberOfChannels: 2,
      length: decoded.length,
      sampleRate: decoded.sampleRate,
    });
    const ch = decoded.getChannelData(0);
    stereo.copyToChannel(ch, 0);
    stereo.copyToChannel(ch, 1);
    return stereo;
  }
  return decoded;
}

/** Максимум |амплитуды| по корзинам — для рисования волноформы. */
export function computePeaks(buffer: AudioBuffer, buckets = 480): Float32Array {
  const channels: Float32Array[] = [];
  for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) {
    channels.push(buffer.getChannelData(c));
  }
  const peaks = new Float32Array(buckets);
  const len = buffer.length;
  const per = len / buckets;
  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * per);
    const end = Math.min(len, Math.floor((b + 1) * per));
    let max = 0;
    for (let i = start; i < end; i += 16) {
      for (const ch of channels) {
        const v = Math.abs(ch[i]);
        if (v > max) max = v;
      }
    }
    peaks[b] = max;
  }
  return peaks;
}

export function mixPeaks(list: Float32Array[]): Float32Array {
  if (list.length === 0) return new Float32Array(0);
  const out = new Float32Array(list[0].length);
  for (const p of list) {
    for (let i = 0; i < out.length; i++) if (p[i] > out[i]) out[i] = p[i];
  }
  return out;
}

function waitFrame(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

/**
 * Рендерит одну дорожку через OfflineAudioContext с отчётом о прогрессе
 * (suspend/resume по контрольным точкам времени).
 */
export async function renderStem(
  source: AudioBuffer,
  def: StemDef,
  opts: {
    enhance?: boolean;
    normalize?: boolean;
    onProgress?: (pct: number) => void;
  } = {},
): Promise<AudioBuffer> {
  const offline = new OfflineAudioContext(2, source.length, source.sampleRate);
  const src = offline.createBufferSource();
  src.buffer = source;
  const chain = buildStemChain(offline, def, Boolean(opts.enhance));
  src.connect(chain.input);
  chain.output.connect(offline.destination);
  src.start(0, 0, source.duration);

  // ВАЖНО: startRendering запускается до постановки suspend-точек в очередь,
  // иначе ожидание suspend() до старта рендера привело бы к вечной блокировке.
  const renderPromise = offline.startRendering();
  const step = Math.max(2, Math.floor(source.duration / 24));
  for (let t = step; t < source.duration; t += step) {
    try {
      await offline.suspend(t);
      opts.onProgress?.(Math.min(0.99, t / source.duration));
      await waitFrame();
      await offline.resume();
    } catch {
      // рендер уже прошёл контрольную точку — выходим из прогресса
      break;
    }
  }
  const rendered = await renderPromise;
  if (opts.normalize) normalizeBuffer(rendered);
  return rendered;
}

export async function renderAllStems(
  source: AudioBuffer,
  defs: StemDef[],
  onStep: (stemId: string, pct: number, index: number, total: number) => void,
  shouldCancel: () => boolean,
): Promise<RenderedStem[]> {
  const out: RenderedStem[] = [];
  for (let i = 0; i < defs.length; i++) {
    if (shouldCancel()) throw new Error("cancelled");
    const def = defs[i];
    const buffer = await renderStem(source, def, {
      onProgress: (pct) => onStep(def.id, pct, i, defs.length),
    });
    const peaks = computePeaks(buffer);
    out.push({ def, buffer, peaks });
    onStep(def.id, 1, i, defs.length);
    await waitFrame();
  }
  return out;
}

/** Пиковая нормализация под потолок −1 дБ. */
export function normalizeBuffer(buffer: AudioBuffer, ceiling = 0.891): void {
  let max = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i += 4) {
      const v = Math.abs(data[i]);
      if (v > max) max = v;
    }
  }
  if (max <= 0 || max > ceiling) {
    const gain = max > 0 ? ceiling / max : 1;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < data.length; i++) data[i] *= gain;
    }
  }
}

/** Ресемплинг через OfflineAudioContext (для MP3-кодирования). */
export async function resampleBuffer(buffer: AudioBuffer, sampleRate: number): Promise<AudioBuffer> {
  if (buffer.sampleRate === sampleRate) return buffer;
  const length = Math.ceil((buffer.length * sampleRate) / buffer.sampleRate);
  const offline = new OfflineAudioContext(2, length, sampleRate);
  const src = offline.createBufferSource();
  src.buffer = buffer;
  src.connect(offline.destination);
  src.start(0);
  return offline.startRendering();
}
