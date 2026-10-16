export type StemSource = "mid" | "side" | "full";

export interface FilterSpec {
  type: BiquadFilterType;
  freq?: number;
  q?: number;
  gainDb?: number;
}

export interface StemDef {
  id: string;
  name: string;
  tag: string;
  desc: string;
  color: string;
  source: StemSource;
  filters: FilterSpec[];
  /** дополнительные слои из других источников (например, бас из центра в минусе) */
  plus?: { source: StemSource; filters: FilterSpec[]; gain?: number }[];
  comp?: { threshold: number; ratio: number; attack: number; release: number };
  gain: number;
  limiter: boolean;
  approx: boolean;
  defaultMuted: boolean;
}

/**
 * DSP-режим: математическое разделение (Mid/Side + спектральные полосы).
 * Вокал + Инструментал в сумме идеально восстанавливают оригинал,
 * остальные дорожки — изолированные полосы для анализа и экспорта.
 */
export const DSP_STEMS: StemDef[] = [
  {
    id: "vocals",
    name: "Вокал (Акапелла)",
    tag: "CLEAN VOX",
    desc: "Моно-изоляция голоса без одного грамма обертонов музыки",
    color: "#22d3ee",
    source: "mid",
    filters: [], // перехватывается процессором гейта в граф-лоуке
    plus: [{ source: "mid", filters: [], gain: 1.0 }],
    comp: { threshold: -18, ratio: 4, attack: 0.002, release: 0.1 },
    gain: 1.35,
    limiter: true,
    approx: true,
    defaultMuted: false,
  },
  {
    id: "instrumental",
    name: "Чистый Инструментал",
    tag: "CLEAN MINUS",
    desc: "Математически вычтенное со всех вокалом частое фазное обрезание",
    color: "#34d399",
    source: "side",
    filters: [],
    plus: [
      { source: "mid", filters: [{ type: "highpass", freq: 13500 }], gain: 0.5 },
      { source: "mid", filters: [{ type: "lowpass", freq: 95 }], gain: 1.0 }
    ],
    comp: { threshold: -14, ratio: 2.2, attack: 0.008, release: 0.22 },
    gain: 1.06,
    limiter: true,
    approx: true,
    defaultMuted: false,
  },
  {
    id: "backing",
    name: "Бэк-вокал",
    tag: "BACK",
    desc: "Широко распанорамированные голоса (подавление битов и басов)",
    color: "#f472b6",
    source: "side",
    filters: [
      { type: "highpass", freq: 170, q: 0.74 },
      { type: "peaking", freq: 3300, gainDb: 3.0, q: 1.1 },
      { type: "peaking", freq: 850, gainDb: -1.5, q: 1.0 },
      { type: "lowpass", freq: 6800, q: 0.7 },
    ],
    comp: { threshold: -15, ratio: 2.6, attack: 0.006, release: 0.2 },
    gain: 1.7,
    limiter: true,
    approx: true,
    defaultMuted: true,
  },
  {
    id: "bass",
    name: "Бас",
    tag: "BASS",
    // саб из центра (там голоса почти нет ниже 160 Гц) + низ с краёв
    desc: "Суббас из центра до 160 Гц + низкие частоты по краям",
    color: "#fbbf24",
    source: "mid",
    filters: [
      { type: "lowpass", freq: 160, q: 0.75 },
      { type: "lowpass", freq: 160, q: 0.75 },
    ],
    plus: [{ source: "side", filters: [{ type: "lowpass", freq: 240, q: 0.75 }], gain: 0.9 }],
    comp: { threshold: -12, ratio: 3, attack: 0.01, release: 0.25 },
    gain: 1.6,
    limiter: true,
    approx: true,
    defaultMuted: true,
  },
  {
    id: "drums",
    name: "Ударные",
    tag: "DRUM",
    // ударные с краёв панорамы (снейр/хэты) + кик из центра — без вокала
    desc: "Снейр и хэты с краёв + кик из центра, без вокального диапазона",
    color: "#fb7185",
    source: "side",
    filters: [
      { type: "highpass", freq: 60, q: 0.7 },
      { type: "peaking", freq: 3200, gainDb: 1.4, q: 0.8 },
      { type: "lowpass", freq: 9500, q: 0.7 },
    ],
    plus: [{ source: "mid", filters: [{ type: "lowpass", freq: 140, q: 0.75 }], gain: 1.1 }],
    comp: { threshold: -13, ratio: 3.2, attack: 0.002, release: 0.12 },
    gain: 1.15,
    limiter: true,
    approx: true,
    defaultMuted: true,
  },
  {
    id: "other",
    name: "Гармония",
    tag: "HARM",
    // гармонические инструменты с краёв — лид-вокал отсутствует
    desc: "Клавишные и гитары с краёв панорамы, вокал приглушён",
    color: "#a78bfa",
    source: "side",
    filters: [
      { type: "highpass", freq: 240, q: 0.7 },
      { type: "peaking", freq: 2700, gainDb: -4.5, q: 1.1 },
      { type: "lowpass", freq: 6200, q: 0.7 },
    ],
    comp: { threshold: -14, ratio: 2.4, attack: 0.01, release: 0.24 },
    gain: 1.1,
    limiter: true,
    approx: true,
    defaultMuted: true,
  },
];

/** ИИ-режим (Demucs htdemucs_6s через Replicate) — ключи соответствуют выводу модели. */
export const AI_STEMS: StemDef[] = [
  { id: "vocals", name: "Чистый вокал", tag: "ML·VOX", desc: "Вокал, изолированный BS-RoFormer", color: "#22d3ee", source: "full", filters: [], gain: 1, limiter: false, approx: false, defaultMuted: false },
  { id: "instrumental", name: "Инструментал", tag: "ML·MIN", desc: "Инструментал без вокала, изолированный BS-RoFormer (альтернативный композит — выключен в полном stem-миксе)", color: "#34d399", source: "full", filters: [], gain: 1, limiter: false, approx: false, defaultMuted: true },
  { id: "drums", name: "Ударные", tag: "AI·DRM", desc: "Барабаны и перкуссия (нейросеть)", color: "#fb7185", source: "full", filters: [], gain: 1, limiter: false, approx: false, defaultMuted: false },
  { id: "bass", name: "Бас", tag: "AI·BAS", desc: "Бас-гитара и суббас (нейросеть)", color: "#fbbf24", source: "full", filters: [], gain: 1, limiter: false, approx: false, defaultMuted: false },
  { id: "guitar", name: "Гитара", tag: "AI·GTR", desc: "Гитарные партии (нейросеть)", color: "#34d399", source: "full", filters: [], gain: 1, limiter: false, approx: false, defaultMuted: false },
  { id: "piano", name: "Клавишные", tag: "AI·KEY", desc: "Пианино и клавишные (нейросеть)", color: "#a78bfa", source: "full", filters: [], gain: 1, limiter: false, approx: false, defaultMuted: false },
  { id: "other", name: "Прочее", tag: "AI·OTH", desc: "Всё остальное: синтезаторы, эффекты", color: "#f472b6", source: "full", filters: [], gain: 1, limiter: false, approx: false, defaultMuted: false },
];
