import { Mp3Encoder } from "@breezystack/lamejs";
import { resampleBuffer } from "./engine";

export type WavBits = 16 | 24 | 32;

export function encodeWav(buffer: AudioBuffer, bits: WavBits): Blob {
  const numCh = Math.min(2, buffer.numberOfChannels);
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const bytesPerSample = bits === 16 ? 2 : bits === 24 ? 3 : 4;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = len * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);

  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, bits === 32 ? 3 : 1, true); // 3 = IEEE float
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bits, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  const chans: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));

  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      if (bits === 16) {
        view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        off += 2;
      } else if (bits === 24) {
        const v = Math.round(s * 0x7fffff);
        view.setUint8(off, v & 0xff);
        view.setUint8(off + 1, (v >> 8) & 0xff);
        view.setUint8(off + 2, (v >> 16) & 0xff);
        off += 3;
      } else {
        view.setFloat32(off, s, true);
        off += 4;
      }
    }
  }

  return new Blob([ab], { type: "audio/wav" });
}

function floatTo16(data: Float32Array, from: number, to: number): Int16Array {
  const out = new Int16Array(to - from);
  for (let i = from; i < to; i++) {
    const s = Math.max(-1, Math.min(1, data[i]));
    out[i - from] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/** Кодирует MP3 (lamejs) с прогрессом и уступкой потоку, чтобы UI не зависал. */
export async function encodeMp3(
  buffer: AudioBuffer,
  kbps: number,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  /** lamejs поддерживает стандартные MPEG-частоты */
  const supported = [44100, 48000, 32000, 24000, 22050, 16000, 12000, 11025, 8000];
  let buf = buffer;
  if (!supported.includes(buffer.sampleRate)) {
    buf = await resampleBuffer(buffer, 44100);
  }
  const left = buf.getChannelData(0);
  const right = buf.numberOfChannels > 1 ? buf.getChannelData(1) : buf.getChannelData(0);
  const encoder = new Mp3Encoder(2, buf.sampleRate, kbps);
  const chunk = 1152;
  const parts: Uint8Array[] = [];
  let sinceYield = 0;
  for (let i = 0; i < buf.length; i += chunk) {
    const end = Math.min(buf.length, i + chunk);
    const encoded = encoder.encodeBuffer(floatTo16(left, i, end), floatTo16(right, i, end));
    if (encoded.length > 0) parts.push(encoded);
    sinceYield += chunk;
    if (sinceYield > chunk * 220) {
      sinceYield = 0;
      onProgress?.(end / buf.length);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  const tail = encoder.flush();
  if (tail.length > 0) parts.push(tail);
  onProgress?.(1);
  return new Blob(parts.map((p) => p.slice().buffer as ArrayBuffer), { type: "audio/mpeg" });
}

export function formatForExt(ext: "wav" | "mp3"): string {
  return ext === "wav" ? "audio/wav" : "audio/mpeg";
}
