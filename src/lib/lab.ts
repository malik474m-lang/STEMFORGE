"use client";

import { create } from "zustand";
import { computePeaks } from "@/lib/audio/engine";
import { encodeWav } from "@/lib/audio/encode";
import { player } from "@/lib/audio/player";
import { session, useStudio } from "@/lib/store";
import { plainToLines } from "@/lib/lrc";
import type { LyricsRow } from "@/db/schema";

export interface LyricLine {
  id: string;
  time: number | null;
  text: string;
}

export type AiJobKind = "transcribe" | "voice" | "song" | null;

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

async function decodeBlobToStereo(blob: Blob): Promise<AudioBuffer> {
  const ab = await blob.arrayBuffer();
  const decoded = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(ab);
  if (decoded.numberOfChannels === 1) {
    const b = new AudioBuffer({ numberOfChannels: 2, length: decoded.length, sampleRate: decoded.sampleRate });
    const ch = decoded.getChannelData(0);
    b.copyToChannel(ch, 0);
    b.copyToChannel(ch, 1);
    return b;
  }
  return decoded;
}

function proxyUrl(url: string): string {
  const b64 = btoa(url).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `/api/separate/file?u=${encodeURIComponent(b64)}`;
}

function extractAudioUrl(output: unknown): string | null {
  if (typeof output === "string" && output.startsWith("http")) return output;
  if (output && typeof output === "object") {
    for (const [k, v] of Object.entries(output as Record<string, unknown>)) {
      if (["audio", "output", "song", "url"].includes(k) && typeof v === "string" && v.startsWith("http")) return v;
    }
    for (const v of Object.values(output as Record<string, unknown>)) {
      if (typeof v === "string" && v.startsWith("http")) return v;
    }
  }
  return null;
}

/** Разбор вывода whisper в строки с таймкодами. */
function parseTranscription(output: unknown): LyricLine[] {
  const o = output as Record<string, unknown> | null;
  const chunks: unknown[] = Array.isArray(o?.chunks)
    ? (o!.chunks as unknown[])
    : Array.isArray(o?.segments)
      ? (o!.segments as unknown[])
      : [];
  const lines: LyricLine[] = [];
  for (const ch of chunks) {
    const c = ch as Record<string, unknown>;
    const text = String(c.text ?? "").trim();
    if (!text) continue;
    let time: number | null = null;
    const ts = c.timestamp;
    if (Array.isArray(ts) && typeof ts[0] === "number") time = ts[0];
    else if (typeof c.start === "number") time = c.start;
    // разбиваем длинные куски по предложениям для караоке
    const parts = text.split(/(?<=[.!?…])\s+/).filter(Boolean);
    if (parts.length <= 1 || time === null) {
      lines.push({ id: uid(), time, text });
    } else {
      const end = Array.isArray(ts) && typeof ts[1] === "number" ? ts[1] : time + 4;
      const per = (end - time) / parts.length;
      parts.forEach((p, i) => lines.push({ id: uid(), time: time + i * per, text: p }));
    }
  }
  return lines;
}

interface LabState {
  lines: LyricLine[];
  lyricsTitle: string;
  lyricsRowId: string | null;
  lyricsList: LyricsRow[];
  lyricsLoading: boolean;
  selectedLineId: string | null;
  tapSync: boolean;

  aiJob: { kind: AiJobKind; label: string; pct: number };

  setLines: (lines: LyricLine[]) => void;
  splitFromText: (text: string, title?: string) => void;
  setLineText: (id: string, text: string) => void;
  setLineTime: (id: string, time: number | null) => void;
  nudgeLine: (id: string, delta: number) => void;
  shiftAll: (delta: number) => void;
  insertLine: (afterId: string | null) => void;
  removeLine: (id: string) => void;
  clearTimings: () => void;
  setSelectedLine: (id: string | null) => void;

  startTapSync: () => void;
  stopTapSync: () => void;
  tapAdvance: () => void;

  transcribe: (language: string) => Promise<void>;
  saveLyrics: () => Promise<void>;
  loadLyricsList: () => Promise<void>;
  applyLyricsRow: (row: LyricsRow) => void;
  deleteLyricsRow: (id: string) => Promise<void>;
  resetForTrack: (fileName: string, title: string) => void;

  convertVoice: (opts: {
    sourceStemId: string;
    rvcModel: string;
    customUrl: string;
    pitchChange: string;
    indexRate: number;
    pitchAll: number;
  }) => Promise<void>;
  generateSong: (opts: { tags: string; seconds: number; instrumental: boolean; title?: string }) => Promise<void>;
}

export const useLab = create<LabState>((set, get) => {
  const toast = (msg: string) => useStudio.getState().setToast(msg);

  const pollJob = async (
    jobId: string,
    kind: Exclude<AiJobKind, null>,
    waitLabel: string,
  ): Promise<unknown> => {
    let pct = kind === "song" ? 0.08 : 0.12;
    for (let attempt = 0; attempt < 200; attempt++) {
      await new Promise((r) => setTimeout(r, 3000));
      const res = await fetch(`/api/ai/poll?id=${jobId}`);
      const data = await res.json();
      if (data.status === "succeeded") return data.output;
      if (data.status === "failed" || data.status === "canceled") {
        throw new Error(`AI-задача не выполнена: ${data.error ?? data.status}`);
      }
      pct = Math.min(0.9, pct + (kind === "voice" ? 0.02 : 0.008));
      set({ aiJob: { kind, label: waitLabel, pct } });
    }
    throw new Error("Превышено время ожидания ответа нейросети");
  };

  const downloadAndDecode = async (url: string): Promise<AudioBuffer> => {
    const res = await fetch(proxyUrl(url));
    if (!res.ok) throw new Error("Не удалось скачать результат");
    const blob = await res.blob();
    return decodeBlobToStereo(blob);
  };

  return {
    lines: [],
    lyricsTitle: "",
    lyricsRowId: null,
    lyricsList: [],
    lyricsLoading: false,
    selectedLineId: null,
    tapSync: false,
    aiJob: { kind: null, label: "", pct: 0 },

    setLines: (lines) => set({ lines, lyricsRowId: get().lyricsRowId, selectedLineId: lines[0]?.id ?? null }),

    splitFromText: (text, title) => {
      const lines = plainToLines(text).map((l) => ({ id: uid(), ...l }));
      set({ lines, selectedLineId: lines[0]?.id ?? null });
      if (title !== undefined) set({ lyricsTitle: title });
    },

    setLineText: (id, text) =>
      set({ lines: get().lines.map((l) => (l.id === id ? { ...l, text } : l)) }),

    setLineTime: (id, time) =>
      set({
        lines: get()
          .lines.map((l) => (l.id === id ? { ...l, time } : l))
          .sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity)),
      }),

    nudgeLine: (id, delta) => {
      const l = get().lines.find((x) => x.id === id);
      if (!l || l.time === null) return;
      get().setLineTime(id, Math.max(0, l.time + delta));
    },

    shiftAll: (delta) =>
      set({
        lines: get().lines.map((l) => (l.time === null ? l : { ...l, time: Math.max(0, l.time + delta) })),
      }),

    insertLine: (afterId) => {
      const lines = [...get().lines];
      const idx = afterId ? lines.findIndex((l) => l.id === afterId) : -1;
      const newline: LyricLine = { id: uid(), time: null, text: "" };
      lines.splice(idx + 1, 0, newline);
      set({ lines, selectedLineId: newline.id });
    },

    removeLine: (id) =>
      set({
        lines: get().lines.filter((l) => l.id !== id),
        selectedLineId: get().selectedLineId === id ? null : get().selectedLineId,
      }),

    clearTimings: () => set({ lines: get().lines.map((l) => ({ ...l, time: null })) }),

    setSelectedLine: (id) => set({ selectedLineId: id }),

    startTapSync: () => {
      if (get().lines.length === 0) {
        toast("Сначала добавьте текст");
        return;
      }
      set({ tapSync: true });
      toast("Нажимайте Enter или кнопку в момент начала каждой строки");
    },

    stopTapSync: () => set({ tapSync: false }),

    tapAdvance: () => {
      const s = get();
      if (!s.tapSync) return;
      const t = Math.max(0, player.getTime() - 0.12);
      const target =
        s.lines.find((l) => l.id === s.selectedLineId && l.time === null) ??
        s.lines.find((l) => l.time === null);
      if (!target) {
        set({ tapSync: false });
        toast("Все строки синхронизированы");
        return;
      }
      const lines = s.lines
        .map((l) => (l.id === target.id ? { ...l, time: t } : l))
        .sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity));
      const next = lines.find((l) => l.time === null);
      set({ lines, selectedLineId: next?.id ?? null });
      if (!next) {
        set({ tapSync: false });
        toast("Синхронизация завершена — сохраните текст");
      }
    },

    transcribe: async (language) => {
      if (get().aiJob.kind) return;
      const file = session.file;
      const source = session.stems.get("vocals")?.buffer ?? session.sourceBuffer;
      if (!file || !source) {
        toast("Сначала загрузите трек");
        return;
      }
      set({ aiJob: { kind: "transcribe", label: "Подготовка локального Whisper…", pct: 0.05 } });
      try {
        let output: unknown;
        if (useStudio.getState().localAiReady) {
          const form = new FormData();
          form.append("file", new File([encodeWav(source, 16)], "vocals.wav", { type: "audio/wav" }));
          form.append("language", language === "None" ? "auto" : language);
          const res = await fetch("/api/local-ai/transcribe", { method: "POST", body: form });
          const data = await res.json();
          if (!res.ok || !data.jobId) throw new Error(data.error || "Локальный Whisper не запустился");
          for (let i = 0; i < 1200; i++) {
            await new Promise((r) => setTimeout(r, 1500));
            const jr = await fetch(`/api/local-ai/job/${data.jobId}`, { cache: "no-store" });
            const job = await jr.json();
            set({ aiJob: { kind: "transcribe", label: job.label || "Whisper распознаёт вокал…", pct: Number(job.progress) || 0.1 } });
            if (job.state === "done") { output = job.result; break; }
            if (job.state === "error") throw new Error(job.error || "Ошибка локального Whisper");
          }
          if (!output) throw new Error("Локальный Whisper не завершил распознавание");
        } else {
          const form = new FormData();
          form.append("file", file, file.name);
          form.append("language", language);
          const res = await fetch("/api/lyrics/transcribe", { method: "POST", body: form });
          const data = await res.json();
          if (!res.ok || !data.jobId) throw new Error(data.reason || data.detail || "Сервис распознавания недоступен");
          set({ aiJob: { kind: "transcribe", label: "Облачный Whisper распознаёт вокал…", pct: 0.1 } });
          output = await pollJob(data.jobId, "transcribe", "Облачный Whisper распознаёт вокал…");
        }
        const lines = parseTranscription(output);
        set({ aiJob: { kind: null, label: "", pct: 0 } });
        if (lines.length === 0) throw new Error("Текст не найден — возможно, трек инструментальный");
        set({ lines, selectedLineId: lines[0].id });
        toast(`Распознано строк: ${lines.length}`);
      } catch (e) {
        set({ aiJob: { kind: null, label: "", pct: 0 } });
        toast(e instanceof Error ? e.message : String(e));
      }
    },

    saveLyrics: async () => {
      const s = get();
      const st = useStudio.getState();
      if (s.lines.length === 0 || !st.fileName) {
        toast("Нет текста для сохранения");
        return;
      }
      try {
        const plainText = s.lines.map((l) => l.text).join("\n");
        const res = await fetch("/api/lyrics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: s.lyricsTitle || st.fileName.replace(/\.[^.]+$/, ""),
            fileName: st.fileName,
            plainText,
            lines: s.lines,
            projectId: st.savedProjectId,
          }),
        });
        const data = await res.json();
        if (data.lyrics) {
          set({ lyricsRowId: data.lyrics.id });
          toast("Текст и синхронизация сохранены");
        }
        await get().loadLyricsList();
      } catch {
        toast("Не удалось сохранить текст");
      }
    },

    loadLyricsList: async () => {
      set({ lyricsLoading: true });
      try {
        const res = await fetch("/api/lyrics");
        const data = await res.json();
        set({ lyricsList: data.lyrics ?? [], lyricsLoading: false });
      } catch {
        set({ lyricsLoading: false });
      }
    },

    applyLyricsRow: (row) => {
      set({
        lines: row.lines.map((l) => ({ ...l, id: l.id || uid() })),
        lyricsTitle: row.title,
        lyricsRowId: row.id,
        selectedLineId: row.lines[0]?.id ?? null,
      });
      toast("Текст загружен");
    },

    deleteLyricsRow: async (id) => {
      try {
        await fetch(`/api/lyrics/${id}`, { method: "DELETE" });
        set({
          lyricsList: get().lyricsList.filter((r) => r.id !== id),
          lyricsRowId: get().lyricsRowId === id ? null : get().lyricsRowId,
        });
      } catch {
        toast("Не удалось удалить");
      }
    },

    resetForTrack: (fileName, title) => {
      const match = get().lyricsList.find((r) => r.fileName === fileName);
      if (match) {
        get().applyLyricsRow(match);
      } else {
        set({ lines: [], lyricsTitle: title, lyricsRowId: null, selectedLineId: null, tapSync: false });
      }
    },

    convertVoice: async (opts) => {
      if (get().aiJob.kind) return;
      const st = useStudio.getState();
      const meta = session.stems.get(opts.sourceStemId);
      if (!meta) {
        toast("Источник вокала не найден");
        return;
      }
      set({ aiJob: { kind: "voice", label: "Кодирование вокала…", pct: 0.03 } });
      try {
        const wav = encodeWav(meta.buffer, 16);
        const file = new File([wav], "vocals.wav", { type: "audio/wav" });
        const form = new FormData();
        form.append("file", file);
        form.append("rvcModel", opts.rvcModel);
        form.append("customUrl", opts.customUrl);
        form.append("pitchChange", opts.pitchChange);
        form.append("indexRate", String(opts.indexRate));
        form.append("pitchAll", String(opts.pitchAll));
        set({ aiJob: { kind: "voice", label: "Отправка в RVC…", pct: 0.08 } });
        const res = await fetch("/api/voice", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok || !data.jobId) {
          throw new Error(data.reason || data.detail || "Сервис конверсии недоступен");
        }
        const output = await pollJob(data.jobId, "voice", "RVC конвертирует голос…");
        const url = extractAudioUrl(output);
        if (!url) throw new Error("Модель не вернула аудио");
        set({ aiJob: { kind: "voice", label: "Загрузка результата…", pct: 0.95 } });
        const buffer = await downloadAndDecode(url);
        void computePeaks;
        const modelName = opts.customUrl ? "Custom RVC" : opts.rvcModel;
        const id = `ai-voice-${Date.now() % 100000}`;
        st.upsertStem({
          id,
          name: `Вокал · ${modelName}`,
          tag: "RVC",
          color: "#f9a8d4",
          desc: `Конверсия RVC (${modelName}) — нейросетевой тембр`,
          buffer,
        });
        st.setStemsMix((stems) => stems.map((s) => ({ ...s, solo: s.id === id })));
        set({ aiJob: { kind: null, label: "", pct: 0 } });
        toast("Голос сконвертирован — дорожка добавлена в микшер");
      } catch (e) {
        set({ aiJob: { kind: null, label: "", pct: 0 } });
        toast(e instanceof Error ? e.message : String(e));
      }
    },

    generateSong: async (opts) => {
      if (get().aiJob.kind) return;
      const st = useStudio.getState();
      const lyricsText = get()
        .lines.map((l) => l.text)
        .join("\n")
        .trim();
      if (!opts.instrumental && !lyricsText) {
        toast("Сначала добавьте текст песни во вкладке «Текст»");
        return;
      }
      set({ aiJob: { kind: "song", label: "Отправка в ACE-Step…", pct: 0.04 } });
      try {
        const res = await fetch("/api/song", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tags: opts.tags,
            lyrics: lyricsText,
            seconds: opts.seconds,
            instrumental: opts.instrumental,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.jobId) {
          throw new Error(data.reason || data.detail || "Сервис генерации недоступен");
        }
        const output = await pollJob(data.jobId, "song", "ACE-Step пишет песню (2–5 мин)…");
        const url = extractAudioUrl(output);
        if (!url) throw new Error("Модель не вернула аудио");
        set({ aiJob: { kind: "song", label: "Загрузка результата…", pct: 0.95 } });
        const buffer = await downloadAndDecode(url);
        const id = `ai-song-${Date.now() % 100000}`;
        st.upsertStem({
          id,
          name: `AI-песня${opts.instrumental ? " (инстр.)" : ""}`,
          tag: "AI",
          color: "#c4b5fd",
          desc: `Сгенерировано ACE-Step: «${opts.tags.slice(0, 60)}»`,
          buffer,
        });
        st.setStemsMix((stems) =>
          stems.map((s) => ({ ...s, solo: false, muted: s.id !== id })),
        );
        set({ aiJob: { kind: null, label: "", pct: 0 } });
        toast("Песня сгенерирована — добавлена в микшер и доступна для экспорта");
      } catch (e) {
        set({ aiJob: { kind: null, label: "", pct: 0 } });
        toast(e instanceof Error ? e.message : String(e));
      }
    },
  };
});
