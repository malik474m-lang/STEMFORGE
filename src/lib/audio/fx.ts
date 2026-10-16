/**
 * DSP-эффекты голоса: питч-шифт, форманты, робот (AM), хор, радио.
 * Всё рендерится офлайн через OfflineAudioContext.
 */

function makeLfoBuffer(ctx: BaseAudioContext, period: number, kind: "asc" | "desc" | "tri"): AudioBuffer {
  const len = Math.max(64, Math.round(period * ctx.sampleRate));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const p = i / len;
    if (kind === "asc") d[i] = p;
    else if (kind === "desc") d[i] = 1 - p;
    else d[i] = 1 - Math.abs(2 * p - 1); // треугольник с пиком в середине
  }
  return buf;
}

/**
 * Классический двухслойный питч-шифтер: два модулируемых дилэя с кроссфейдом.
 * LFO — зацикленные буферы (точная фаза, второй канал со сдвигом полпериода).
 */
export async function renderPitchShift(buffer: AudioBuffer, semitones: number): Promise<AudioBuffer> {
  if (Math.abs(semitones) < 0.01) return buffer;
  const sr = buffer.sampleRate;
  const ratio = Math.pow(2, semitones / 12);
  const up = ratio > 1;
  const windowSec = 0.055;
  const slope = Math.abs(ratio - 1);
  const period = windowSec / slope;

  const tail = Math.ceil(0.15 * sr);
  const offline = new OfflineAudioContext(2, buffer.length + tail, sr);

  const src = offline.createBufferSource();
  src.buffer = buffer;

  const ramp = makeLfoBuffer(offline, period, up ? "desc" : "asc");
  const tri = makeLfoBuffer(offline, period, "tri");

  const mix = offline.createGain();
  const normalize = offline.createGain();
  normalize.gain.value = 1.05;

  for (const phaseOffset of [0, period / 2]) {
    const lfo = offline.createBufferSource();
    lfo.buffer = ramp;
    lfo.loop = true;
    const lfoScale = offline.createGain();
    lfoScale.gain.value = windowSec;
    lfo.connect(lfoScale);

    const delay = offline.createDelay(1);
    delay.delayTime.value = 0.0015;
    lfoScale.connect(delay.delayTime);

    const fadeLfo = offline.createBufferSource();
    fadeLfo.buffer = tri;
    fadeLfo.loop = true;
    const tapGain = offline.createGain();
    tapGain.gain.value = 0;
    fadeLfo.connect(tapGain.gain);

    const smooth = offline.createBiquadFilter();
    smooth.type = "lowpass";
    smooth.frequency.value = 9000;

    src.connect(delay);
    delay.connect(smooth);
    smooth.connect(tapGain);
    tapGain.connect(mix);

    lfo.start(0, phaseOffset);
    fadeLfo.start(0, phaseOffset);
  }

  src.start(0);
  mix.connect(normalize);
  normalize.connect(offline.destination);
  const out = await offline.startRendering();
  // подрезаем хвост до исходной длины + короткий фейд
  const result = new AudioBuffer({ numberOfChannels: 2, length: buffer.length, sampleRate: sr });
  for (let c = 0; c < 2; c++) {
    const s = out.getChannelData(c);
    result.copyToChannel(s.subarray(0, buffer.length), c);
  }
  return result;
}

function softClipCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 512;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const norm = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * x) / norm;
  }
  return curve;
}

export interface VoiceFxSpec {
  semitones: number;
  formant: number; // -100..100 %
  robot: boolean;
  choir: boolean;
  radio: boolean;
}

/** Полный голосовой FX-проход. */
export async function renderVoiceFx(buffer: AudioBuffer, spec: VoiceFxSpec): Promise<AudioBuffer> {
  let current = buffer;
  if (Math.abs(spec.semitones) > 0.01) {
    current = await renderPitchShift(current, spec.semitones);
  }

  const needChain = spec.formant !== 0 || spec.robot || spec.radio;
  if (needChain) {
    const sr = current.sampleRate;
    const offline = new OfflineAudioContext(2, current.length, sr);
    const src = offline.createBufferSource();
    src.buffer = current;
    let node: AudioNode = src;

    if (spec.formant !== 0) {
      const amt = spec.formant * 0.07; // до ±7 дБ
      const p1 = offline.createBiquadFilter();
      p1.type = "peaking";
      p1.frequency.value = 900;
      p1.Q.value = 1.1;
      p1.gain.value = amt;
      const p2 = offline.createBiquadFilter();
      p2.type = "peaking";
      p2.frequency.value = 2900;
      p2.Q.value = 1.1;
      p2.gain.value = amt;
      const cut = offline.createBiquadFilter();
      cut.type = "peaking";
      cut.frequency.value = 480;
      cut.Q.value = 0.9;
      cut.gain.value = -amt * 0.6;
      node.connect(p1).connect(p2).connect(cut);
      node = cut;
    }

    if (spec.radio) {
      const hp = offline.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 420;
      const lp = offline.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 3300;
      const shaper = offline.createWaveShaper();
      shaper.curve = softClipCurve(3.2);
      const makeup = offline.createGain();
      makeup.gain.value = 1.35;
      node.connect(hp).connect(lp).connect(shaper).connect(makeup);
      node = makeup;
    }

    if (spec.robot) {
      const am = offline.createGain();
      am.gain.value = 0.5;
      const lfo = offline.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 55;
      const lfoGain = offline.createGain();
      lfoGain.gain.value = 0.5;
      lfo.connect(lfoGain).connect(am.gain);
      lfo.start(0);
      node.connect(am);
      node = am;
    }

    const out = offline.createGain();
    node.connect(out);
    out.connect(offline.destination);
    src.start(0);
    current = await offline.startRendering();
  }

  if (spec.choir) {
    const [upD, downD] = await Promise.all([
      renderPitchShift(current, 0.16),
      renderPitchShift(current, -0.14),
    ]);
    const sr = current.sampleRate;
    const offline = new OfflineAudioContext(2, current.length, sr);
    const mix = offline.createGain();
    const parts: Array<[AudioBuffer, number, number]> = [
      [current, 0, 1],
      [upD, 0.014, 0.55],
      [downD, 0.027, 0.55],
    ];
    for (const [buf, delaySec, vol] of parts) {
      const s = offline.createBufferSource();
      s.buffer = buf;
      const d = offline.createDelay(0.1);
      d.delayTime.value = delaySec;
      const g = offline.createGain();
      g.gain.value = vol;
      s.connect(d).connect(g).connect(mix);
      s.start(0);
    }
    const comp = offline.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 3;
    mix.connect(comp);
    comp.connect(offline.destination);
    current = await offline.startRendering();
  }

  return current;
}

/** Обрезка тишины в начале записи (автовыравнивание дубля). */
export function trimLeadingSilence(buffer: AudioBuffer, threshold = 0.012, preRollMs = 30): AudioBuffer {
  const ch = buffer.getChannelData(0);
  let start = 0;
  let run = 0;
  for (let i = 0; i < ch.length; i++) {
    if (Math.abs(ch[i]) > threshold) {
      run++;
      if (run > 8) {
        start = Math.max(0, i - Math.round((preRollMs / 1000) * buffer.sampleRate));
        break;
      }
    } else {
      run = 0;
    }
  }
  if (start === 0) return buffer;
  const out = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length - start,
    sampleRate: buffer.sampleRate,
  });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    out.copyToChannel(buffer.getChannelData(c).subarray(start), c);
  }
  return out;
}
