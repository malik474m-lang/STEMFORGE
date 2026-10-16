export interface LrcLine {
  time: number | null;
  text: string;
}

/** Парсинг LRC: [mm:ss.xx]текст, несколько тегов на строку = несколько строк. */
export function parseLrc(text: string): LrcLine[] {
  const out: LrcLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const tags = [...raw.matchAll(/\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
    const body = raw.replace(/\[\d{1,2}:\d{1,2}(?:[.:]\d{1,3})?\]/g, "").trim();
    if (tags.length === 0) {
      if (body) out.push({ time: null, text: body });
      continue;
    }
    for (const t of tags) {
      const min = Number(t[1]);
      const sec = Number(t[2]);
      let frac = 0;
      if (t[3] !== undefined) {
        frac = Number(t[3]) / (t[3].length === 2 ? 100 : t[3].length === 3 ? 1000 : 10);
      }
      out.push({ time: min * 60 + sec + frac, text: body });
    }
  }
  return out.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
}

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const cs = Math.round((t * 100) % 100);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
}

/** Сериализация в стандартный .lrc (для караоке-плееров). */
export function formatLrc(lines: LrcLine[], title?: string): string {
  const head = [`[ti:${title ?? "STEMFORGE"}]`, "[re:STEMFORGE]", "[offset:0]"];
  const body = lines
    .filter((l) => l.time !== null && l.text.trim())
    .sort((a, b) => (a.time ?? 0) - (b.time ?? 0))
    .map((l) => `[${fmt(l.time ?? 0)}]${l.text.trim()}`);
  return [...head, ...body].join("\n");
}

/** Обычный текст → строки без таймингов (пустые строки сохраняем для разделителей). */
export function plainToLines(text: string): LrcLine[] {
  return text
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((t) => ({ time: null, text: t }));
}
