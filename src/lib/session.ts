import type { StemDef } from "./audio/stems";

export interface StemAudio {
  buffer: AudioBuffer;
  peaks: Float32Array;
  /** сдвиг относительно начала трека (сек) — для записанного вокала */
  offset: number;
  /** сухая копия для сброса эффектов */
  dry: AudioBuffer;
}

/** Не‑реактивное хранилище тяжёлых аудиоданных текущей сессии. */
export const session = {
  sourceBuffer: null as AudioBuffer | null,
  /** исходный файл — нужен для AI-функций (транскрибация и пр.) */
  file: null as File | null,
  stems: new Map<string, StemAudio>(),
  masterPeaks: null as Float32Array | null,
  originalPeaks: null as Float32Array | null,
  reset() {
    this.sourceBuffer = null;
    this.file = null;
    this.stems = new Map();
    this.masterPeaks = null;
    this.originalPeaks = null;
  },
};

/** Сквозное определение для динамических дорожек (записанный вокал, AI-результаты). */
export function passthroughDef(id: string, name: string, tag: string, color: string, desc: string): StemDef {
  return {
    id,
    name,
    tag,
    desc,
    color,
    source: "full",
    filters: [],
    gain: 1,
    limiter: false,
    approx: false,
    defaultMuted: false,
  };
}
