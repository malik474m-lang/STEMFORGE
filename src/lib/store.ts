"use client";

import { create } from "zustand";
import { decodeFile, renderAllStems, renderStem, computePeaks, mixPeaks, type RenderedStem } from "@/lib/audio/engine";
import { encodeMp3, encodeWav, type WavBits } from "@/lib/audio/encode";
import { player, type StemMixState } from "@/lib/audio/player";
import { AI_STEMS, DSP_STEMS, type StemDef } from "@/lib/audio/stems";
import { session, passthroughDef } from "@/lib/session";
import type { ProjectRow } from "@/db/schema";

export { session };

export interface StemUI {
  id: string;
  name: string;
  tag: string;
  desc: string;
  color: string;
  approx: boolean;
  volume: number;
  muted: boolean;
  solo: boolean;
  enhance: boolean;
  available: boolean;
}

export type ExportFormat = "wav16" | "wav24" | "wav32" | "mp3_320" | "mp3_192" | "mp3_128";

export const FORMAT_LABELS: Record<ExportFormat, string> = {
  wav16: "WAV 16-бит",
  wav24: "WAV 24-бит",
  wav32: "WAV 32-бит float",
  mp3_320: "MP3 320 кбит/с",
  mp3_192: "MP3 192 кбит/с",
  mp3_128: "MP3 128 кбит/с",
};

export interface ExportLogItem {
  id: string;
  label: string;
  pct: number;
  done: boolean;
  error?: string;
}

export interface NewStemPayload {
  id: string;
  name: string;
  tag: string;
  color: string;
  desc: string;
  buffer: AudioBuffer;
  offset?: number;
  volume?: number;
}

type Phase = "idle" | "decoding" | "separating" | "ready" | "error";

let cancelFlag = false;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let playbackRAF: number | null = null;

function mixMapFrom(stems: StemUI[]): Map<string, StemMixState> {
  const map = new Map<string, StemMixState>();
  for (const s of stems) {
    map.set(s.id, { volume: s.volume, muted: s.muted, solo: s.solo, enhance: s.enhance });
  }
  return map;
}

function titleFromFileName(name: string): string {
  return name.replace(/\.[^./\\]+$/, "").replace(/[_-]+/g, " ").trim() || "Трек";
}

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120);
}

interface StudioState {
  phase: Phase;
  mode: "local" | "dsp" | "ai" | "mvsep";
  aiAvailable: boolean | null;
  mvsepAvailable: boolean;
  localAiReady: boolean;
  localAiDesktop: boolean;
  localAiInstalling: boolean;
  localAiLabel: string;
  localAiProgress: number;
  localMlQuality: "pro" | "fast";
  error: string | null;
  fileName: string;
  fileSize: number;
  durationSec: number;
  sampleRate: number;
  warning: string | null;

  progressLabel: string;
  progressPct: number;
  stemProgress: Record<string, number>;

  stems: StemUI[];

  playing: boolean;
  currentTime: number;
  masterVolume: number;
  eq: { low: number; mid: number; high: number };
  originalSolo: boolean;

  exportFormat: ExportFormat;
  normalizeExport: boolean;
  exportSelection: Record<string, boolean>;
  exporting: boolean;
  exportLog: ExportLogItem[];

  projects: ProjectRow[];
  projectsLoading: boolean;
  savedProjectId: string | null;

  toast: string | null;

  setToast: (msg: string | null) => void;
  checkAi: () => Promise<void>;
  checkLocalAi: () => Promise<void>;
  setupLocalAi: () => Promise<void>;
  setLocalMlQuality: (q: "pro" | "fast") => void;
  setMode: (m: "local" | "dsp" | "ai" | "mvsep") => void;
  loadFile: (file: File) => Promise<void>;
  cancel: () => void;
  resetSession: () => void;

  togglePlay: () => Promise<void>;
  stopPlayback: () => void;
  seek: (t: number) => void;
  setCurrentTime: (t: number) => void;
  setMasterVolume: (v: number) => void;
  setEq: (band: "low" | "mid" | "high", v: number) => void;
  toggleOriginal: () => void;
  setStemVolume: (id: string, v: number) => void;
  toggleMute: (id: string) => void;
  toggleSolo: (id: string) => void;
  toggleEnhance: (id: string) => void;
  setStemsMix: (patch: (stems: StemUI[]) => StemUI[]) => void;

  upsertStem: (p: NewStemPayload) => void;
  removeStem: (id: string) => void;
  setStemOffset: (id: string, offset: number) => void;
  replaceStemBuffer: (id: string, buffer: AudioBuffer, resetDry: boolean) => void;

  setExportFormat: (f: ExportFormat) => void;
  setNormalizeExport: (b: boolean) => void;
  toggleExportSelection: (id: string) => void;
  exportOne: (id: string) => Promise<void>;
  exportAll: () => Promise<void>;

  loadProjects: () => Promise<void>;
  saveProject: () => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  applyProject: (row: ProjectRow) => void;
}

export const useStudio = create<StudioState>((set, get) => {
  const applyMixNow = () => {
    const s = get();
    player.applyMix(mixMapFrom(s.stems), s.originalSolo);
  };

  const refreshPeaksAndPlayer = () => {
    session.masterPeaks = mixPeaks([...session.stems.values()].map((v) => v.peaks));
    player.setBuffers(session.stems, session.sourceBuffer);
    applyMixNow();
  };

  const bumpTime = () => {
    if (playbackRAF !== null) return;
    const loop = () => {
      playbackRAF = null;
      const t = player.getTime();
      if (Math.abs(t - get().currentTime) > 0.02) {
        set({ currentTime: t });
      }
      if (player.playing) {
        playbackRAF = requestAnimationFrame(loop);
      } else {
        set({ currentTime: player.getTime() });
      }
    };
    playbackRAF = requestAnimationFrame(loop);
  };

  const autoSaveProject = async (exports: { at: string; format: string; stems: string[] }[]) => {
    const s = get();
    if (exports.length === 0) return;
    try {
      if (s.savedProjectId) {
        const row = s.projects.find((p) => p.id === s.savedProjectId);
        const prev = row?.exports ?? [];
        await fetch(`/api/projects/${s.savedProjectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ exports: [...prev, ...exports] }),
        });
      } else {
        const res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: titleFromFileName(s.fileName),
            fileName: s.fileName,
            durationSec: s.durationSec,
            sampleRate: s.sampleRate,
            mode: s.mode,
            stems: s.stems.map((st) => ({
              id: st.id,
              volume: st.volume,
              muted: st.muted,
              solo: st.solo,
              enhance: st.enhance,
            })),
            exports,
          }),
        });
        const data = await res.json();
        if (data.project) set({ savedProjectId: data.project.id });
      }
      await get().loadProjects();
    } catch {
      /* история не критична */
    }
  };

  return {
    phase: "idle",
    mode: "local",
    aiAvailable: null,
    mvsepAvailable: false,
    localAiReady: false,
    localAiDesktop: false,
    localAiInstalling: false,
    localAiLabel: "",
    localAiProgress: 0,
    localMlQuality: "pro",
    error: null,
    fileName: "",
    fileSize: 0,
    durationSec: 0,
    sampleRate: 44100,
    warning: null,
    progressLabel: "",
    progressPct: 0,
    stemProgress: {},
    stems: [],
    playing: false,
    currentTime: 0,
    masterVolume: 0.9,
    eq: { low: 0, mid: 0, high: 0 },
    originalSolo: false,
    exportFormat: "wav24",
    normalizeExport: true,
    exportSelection: {},
    exporting: false,
    exportLog: [],
    projects: [],
    projectsLoading: false,
    savedProjectId: null,
    toast: null,

    setToast: (msg) => {
      if (toastTimer) clearTimeout(toastTimer);
      set({ toast: msg });
      if (msg) toastTimer = setTimeout(() => set({ toast: null }), 4200);
    },

    checkAi: async () => {
      try {
        const res = await fetch("/api/separate");
        const data = await res.json();
        set({ aiAvailable: Boolean(data.available) });
      } catch {
        set({ aiAvailable: false });
      }
      try {
        const res = await fetch("/api/mvsep/gender", { cache: "no-store" });
        const data = await res.json();
        set({ mvsepAvailable: Boolean(data.available) });
      } catch {
        set({ mvsepAvailable: false });
      }
    },

    checkLocalAi: async () => {
      try {
        const res = await fetch("/api/local-ai/setup", { cache: "no-store" });
        const data = await res.json();
        const active = data.setupJob && ["queued", "running"].includes(data.setupJob.state);
        set({
          localAiReady: Boolean(data.ready),
          localAiDesktop: Boolean(data.desktop),
          localAiInstalling: Boolean(active),
          localAiLabel: active ? data.setupJob.label : "",
          localAiProgress: active ? data.setupJob.progress : data.ready ? 1 : 0,
        });
      } catch {
        set({ localAiReady: false });
      }
    },

    setupLocalAi: async () => {
      if (get().localAiInstalling) return;
      set({ localAiInstalling: true, localAiLabel: "Запуск установки…", localAiProgress: 0.01 });
      try {
        const res = await fetch("/api/local-ai/setup", { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Не удалось запустить установку");
        if (data.ready) {
          set({ localAiReady: true, localAiInstalling: false, localAiProgress: 1 });
          return;
        }
        const id = data.jobId;
        for (let i = 0; i < 1200; i++) {
          await new Promise((r) => setTimeout(r, 1500));
          const jr = await fetch(`/api/local-ai/job/${id}`, { cache: "no-store" });
          const j = await jr.json();
          set({ localAiLabel: j.label || "Установка…", localAiProgress: Number(j.progress) || 0 });
          if (j.state === "done") {
            set({ localAiReady: true, localAiInstalling: false, localAiLabel: "Локальный AI готов", localAiProgress: 1 });
            get().setToast("Локальный AI установлен. Модели загрузятся при первом разделении.");
            return;
          }
          if (j.state === "error") throw new Error(j.error || "Ошибка установки local AI");
        }
        throw new Error("Установка не завершилась за отведённое время");
      } catch (e) {
        set({ localAiInstalling: false, localAiReady: false, localAiLabel: "" });
        get().setToast(e instanceof Error ? e.message : String(e));
      }
    },

    setLocalMlQuality: (q) => set({ localMlQuality: q }),

    setMode: (m) => {
      if (get().phase !== "idle" && get().phase !== "error") {
        get().setToast("Режим переключается до загрузки нового трека");
        return;
      }
      set({ mode: m });
    },

    loadFile: async (file) => {
      const s = get();
      if (s.phase === "decoding" || s.phase === "separating") return;
      cancelFlag = false;
      get().stopPlayback();
      session.reset();
      set({
        phase: "decoding",
        error: null,
        warning: null,
        fileName: file.name,
        fileSize: file.size,
        progressLabel: "Декодирование аудио…",
        progressPct: 0.05,
        stemProgress: {},
        playing: false,
        currentTime: 0,
        originalSolo: false,
        savedProjectId: null,
      });
      try {
        const buffer = await decodeFile(file);
        session.sourceBuffer = buffer;
        session.file = file;
        session.originalPeaks = computePeaks(buffer);
        set({
          durationSec: buffer.duration,
          sampleRate: buffer.sampleRate,
          warning:
            buffer.duration > 10 * 60
              ? "Файл длиннее 10 минут — обработка займёт время и потребует много памяти."
              : null,
        });

        const mode = get().mode;
        if (mode === "local") {
          if (!get().localAiReady) throw new Error("Сначала установите локальный AI-модуль");
          await runLocalSeparation(buffer, set);
        } else if (mode === "mvsep") {
          await runMvsepSeparation(buffer, set);
        } else if (mode === "ai" && get().aiAvailable) {
          await runAiSeparation(file, set);
        } else {
          await runDspSeparation(buffer, set);
        }

        if (cancelFlag) {
          set({ phase: "idle", progressLabel: "", progressPct: 0, stems: [] });
          session.reset();
          return;
        }

        const defs = get().mode === "local" || get().mode === "mvsep" || (get().mode === "ai" && get().aiAvailable) ? AI_STEMS : DSP_STEMS;
        const stemsUI: StemUI[] = defs
          .filter((d) => session.stems.has(d.id))
          .map((d) => ({
            id: d.id,
            name: d.name,
            tag: d.tag,
            desc: d.desc,
            color: d.color,
            approx: d.approx,
            volume: 1,
            muted: d.defaultMuted,
            solo: false,
            enhance: false,
            available: true,
          }));
        session.masterPeaks = mixPeaks([...session.stems.values()].map((v) => v.peaks));

        player.setBuffers(session.stems, session.sourceBuffer);
        player.setMasterVolume(get().masterVolume);

        const exportSelection: Record<string, boolean> = {};
        for (const st of stemsUI) exportSelection[st.id] = true;

        set({
          phase: "ready",
          stems: stemsUI,
          exportSelection,
          progressLabel: "",
          progressPct: 1,
        });
        applyMixNow();
        player.onEnded = () => set({ playing: false, currentTime: 0 });
      } catch (e) {
        if (cancelFlag) {
          set({ phase: "idle", progressLabel: "", progressPct: 0, stems: [] });
          session.reset();
          return;
        }
        set({
          phase: "error",
          error: e instanceof Error ? e.message : String(e),
          progressLabel: "",
          progressPct: 0,
        });
      }
    },

    cancel: () => {
      cancelFlag = true;
    },

    resetSession: () => {
      cancelFlag = true;
      get().stopPlayback();
      session.reset();
      set({
        phase: "idle",
        stems: [],
        error: null,
        warning: null,
        fileName: "",
        fileSize: 0,
        durationSec: 0,
        progressPct: 0,
        progressLabel: "",
        stemProgress: {},
        currentTime: 0,
        playing: false,
        originalSolo: false,
        exportLog: [],
        savedProjectId: null,
      });
    },

    togglePlay: async () => {
      if (get().phase !== "ready") return;
      if (player.playing) {
        player.pause();
        set({ playing: false, currentTime: player.getTime() });
      } else {
        await player.play();
        set({ playing: true });
        bumpTime();
      }
    },

    stopPlayback: () => {
      player.pause();
      player.seek(0);
      set({ playing: false, currentTime: 0 });
    },

    seek: (t) => {
      player.seek(t);
      set({ currentTime: t });
      if (player.playing) bumpTime();
    },

    setCurrentTime: (t) => set({ currentTime: t }),

    setMasterVolume: (v) => {
      set({ masterVolume: v });
      player.setMasterVolume(v);
    },

    setEq: (band, v) => {
      const eq = { ...get().eq, [band]: v };
      set({ eq });
      player.setEq(eq.low, eq.mid, eq.high);
    },

    toggleOriginal: () => {
      set({ originalSolo: !get().originalSolo });
      applyMixNow();
    },

    setStemVolume: (id, v) => {
      set({ stems: get().stems.map((s) => (s.id === id ? { ...s, volume: v } : s)) });
      applyMixNow();
    },

    toggleMute: (id) => {
      set({ stems: get().stems.map((s) => (s.id === id ? { ...s, muted: !s.muted } : s)) });
      applyMixNow();
    },

    toggleSolo: (id) => {
      set({ stems: get().stems.map((s) => (s.id === id ? { ...s, solo: !s.solo } : s)) });
      applyMixNow();
    },

    toggleEnhance: (id) => {
      set({ stems: get().stems.map((s) => (s.id === id ? { ...s, enhance: !s.enhance } : s)) });
      applyMixNow();
    },

    setStemsMix: (patch) => {
      set({ stems: patch(get().stems) });
      applyMixNow();
    },

    upsertStem: (p) => {
      const peaks = computePeaks(p.buffer);
      session.stems.set(p.id, {
        buffer: p.buffer,
        peaks,
        offset: p.offset ?? 0,
        dry: p.buffer,
      });
      const tag = p.tag || "EXT";
      set((s) => {
        const exists = s.stems.some((x) => x.id === p.id);
        const stems = exists
          ? s.stems.map((x) =>
              x.id === p.id ? { ...x, name: p.name, desc: p.desc, color: p.color, approx: false, available: true } : x,
            )
          : [
              ...s.stems,
              {
                id: p.id,
                name: p.name,
                tag,
                desc: p.desc,
                color: p.color,
                approx: false,
                volume: p.volume ?? 1,
                muted: false,
                solo: false,
                enhance: false,
                available: true,
              },
            ];
        return { stems, exportSelection: { ...s.exportSelection, [p.id]: true } };
      });
      refreshPeaksAndPlayer();
    },

    removeStem: (id) => {
      session.stems.delete(id);
      set((s) => ({
        stems: s.stems.filter((x) => x.id !== id),
        exportSelection: { ...s.exportSelection, [id]: false },
      }));
      refreshPeaksAndPlayer();
    },

    setStemOffset: (id, offset) => {
      const meta = session.stems.get(id);
      if (!meta) return;
      meta.offset = offset;
      refreshPeaksAndPlayer();
    },

    replaceStemBuffer: (id, buffer, resetDry) => {
      const meta = session.stems.get(id);
      if (!meta) return;
      meta.buffer = buffer;
      meta.peaks = computePeaks(buffer);
      if (resetDry) meta.dry = buffer;
      refreshPeaksAndPlayer();
    },

    setExportFormat: (f) => set({ exportFormat: f }),
    setNormalizeExport: (b) => set({ normalizeExport: b }),
    toggleExportSelection: (id) => {
      const sel = { ...get().exportSelection };
      sel[id] = !sel[id];
      set({ exportSelection: sel });
    },

    exportOne: async (id) => {
      const s = get();
      if (s.exporting || !session.sourceBuffer) return;
      set({ exporting: true, exportLog: [{ id, label: nameOf(id, s.stems), pct: 0, done: false }] });
      const exportsDone: { at: string; format: string; stems: string[] }[] = [];
      try {
        const blob = await exportStem(id, s, (pct) => updateLog(set, id, { pct }));
        if (blob) {
          downloadBlob(blob, fileNameFor(s, id));
          exportsDone.push({
            at: new Date().toISOString(),
            format: FORMAT_LABELS[s.exportFormat],
            stems: [id],
          });
        }
        updateLog(set, id, { pct: 1, done: true });
      } catch (e) {
        updateLog(set, id, { done: true, error: String(e) });
      }
      set({ exporting: false });
      await autoSaveProject(exportsDone);
      if (exportsDone.length) get().setToast("Дорожка сохранена на диск");
    },

    exportAll: async () => {
      const s = get();
      if (s.exporting || !session.sourceBuffer) return;
      const ids = s.stems.filter((st) => s.exportSelection[st.id]).map((st) => st.id);
      if (ids.length === 0) {
        get().setToast("Выберите хотя бы одну дорожку");
        return;
      }
      set({
        exporting: true,
        exportLog: ids.map((id) => ({ id, label: nameOf(id, s.stems), pct: 0, done: false })),
      });
      const exportsDone: { at: string; format: string; stems: string[] }[] = [];
      try {
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        for (const id of ids) {
          const blob = await exportStem(id, get(), (pct) => updateLog(set, id, { pct }));
          if (blob) {
            zip.file(fileNameFor(get(), id), blob);
            updateLog(set, id, { pct: 1, done: true });
          }
        }
        const zipBlob = await zip.generateAsync({ type: "blob" });
        downloadBlob(zipBlob, `${sanitize(titleFromFileName(s.fileName))} — STEMS.zip`);
        exportsDone.push({
          at: new Date().toISOString(),
          format: `${FORMAT_LABELS[s.exportFormat]} · ZIP`,
          stems: ids,
        });
      } catch (e) {
        for (const item of get().exportLog) {
          if (!item.done) updateLog(set, item.id, { done: true, error: String(e) });
        }
      }
      set({ exporting: false });
      await autoSaveProject(exportsDone);
      if (exportsDone.length) get().setToast("Архив с дорожками сохранён");
    },

    loadProjects: async () => {
      set({ projectsLoading: true });
      try {
        const res = await fetch("/api/projects");
        const data = await res.json();
        set({ projects: data.projects ?? [], projectsLoading: false });
      } catch {
        set({ projectsLoading: false });
      }
    },

    saveProject: async () => {
      const s = get();
      if (s.phase !== "ready") return;
      try {
        const res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: titleFromFileName(s.fileName),
            fileName: s.fileName,
            durationSec: s.durationSec,
            sampleRate: s.sampleRate,
            mode: s.mode,
            stems: s.stems.map((st) => ({
              id: st.id,
              volume: st.volume,
              muted: st.muted,
              solo: st.solo,
              enhance: st.enhance,
            })),
            exports: [],
          }),
        });
        const data = await res.json();
        if (data.project) {
          set({ savedProjectId: data.project.id });
          get().setToast("Проект сохранён в историю");
          await get().loadProjects();
        }
      } catch {
        get().setToast("Не удалось сохранить проект");
      }
    },

    deleteProject: async (id) => {
      try {
        await fetch(`/api/projects/${id}`, { method: "DELETE" });
        set({
          projects: get().projects.filter((p) => p.id !== id),
          savedProjectId: get().savedProjectId === id ? null : get().savedProjectId,
        });
      } catch {
        get().setToast("Не удалось удалить проект");
      }
    },

    applyProject: (row) => {
      const s = get();
      if (s.phase !== "ready" || !s.fileName) {
        s.setToast("Сначала загрузите трек — настройки применяются к открытой сессии");
        return;
      }
      if (row.fileName !== s.fileName) {
        s.setToast(`Этот проект сохранён для файла «${row.fileName}»`);
        return;
      }
      const byId = new Map(row.stems.map((x) => [x.id, x]));
      const stems = s.stems.map((st) => {
        const saved = byId.get(st.id);
        return saved
          ? { ...st, volume: saved.volume, muted: saved.muted, solo: saved.solo, enhance: saved.enhance }
          : st;
      });
      set({ stems, savedProjectId: row.id });
      applyMixNow();
      get().setToast("Настройки проекта применены");
    },
  };
});

function nameOf(id: string, stems: StemUI[]): string {
  return stems.find((s) => s.id === id)?.name ?? id;
}

function updateLog(
  set: (fn: (s: StudioState) => Partial<StudioState>) => void,
  id: string,
  patch: Partial<ExportLogItem>,
) {
  set((s) => ({
    exportLog: s.exportLog.map((item) => (item.id === id ? { ...item, ...patch } : item)),
  }));
}

function extFor(format: ExportFormat): string {
  return format.startsWith("wav") ? "wav" : "mp3";
}

function fileNameFor(s: StudioState, stemId: string): string {
  const stem = s.stems.find((x) => x.id === stemId);
  const stemName = stem ? stem.name.toUpperCase() : stemId.toUpperCase();
  return `${sanitize(titleFromFileName(s.fileName))} — ${sanitize(stemName)} (STEMFORGE).${extFor(s.exportFormat)}`;
}

async function exportStem(
  id: string,
  s: StudioState,
  onProgress: (pct: number) => void,
): Promise<Blob | null> {
  const meta = session.stems.get(id);
  if (!meta || !session.sourceBuffer) return null;
  const stemUI = s.stems.find((x) => x.id === id);
  const def: StemDef =
    [...DSP_STEMS, ...AI_STEMS].find((d) => d.id === id && d.approx === Boolean(stemUI?.approx)) ??
    passthroughDef(id, stemUI?.name ?? id, stemUI?.tag ?? "EXT", stemUI?.color ?? "#22d3ee", stemUI?.desc ?? "");

  let buffer = meta.buffer;
  const needsPass = Boolean(stemUI?.enhance) || s.normalizeExport;
  if (needsPass) {
    // DSP-дорожки перерендериваем из исходника со всеми настройками,
    // остальные (AI/stems/записи) прогоняем через enhance/нормализацию поверх буфера
    const input = def.approx ? session.sourceBuffer : meta.buffer;
    buffer = await renderStem(input, def, {
      enhance: Boolean(stemUI?.enhance),
      normalize: s.normalizeExport,
      onProgress: (p) => onProgress(p * 0.6),
    });
  }

  // дорожки со сдвигом: подгоняем под длину мастер-секции, нулями в начале
  if (meta.offset !== 0 || buffer.length !== session.sourceBuffer.length) {
    const len = session.sourceBuffer.length;
    const out = new AudioBuffer({ numberOfChannels: 2, length: len, sampleRate: buffer.sampleRate });
    const startInOut = Math.round(meta.offset * buffer.sampleRate);
    for (let c = 0; c < 2; c++) {
      const src = buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1));
      const dst = out.getChannelData(c);
      for (let i = 0; i < src.length; i++) {
        const oi = i + startInOut;
        if (oi >= 0 && oi < len) dst[oi] = src[i];
      }
    }
    buffer = out;
  }

  onProgress(0.65);
  if (s.exportFormat.startsWith("wav")) {
    const bits = Number(s.exportFormat.slice(3)) as WavBits;
    const blob = encodeWav(buffer, bits);
    onProgress(1);
    return blob;
  }
  const kbps = Number(s.exportFormat.slice(4));
  return encodeMp3(buffer, kbps, (p) => onProgress(0.65 + p * 0.35));
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function runDspSeparation(
  buffer: AudioBuffer,
  set: (p: Partial<StudioState> | ((s: StudioState) => Partial<StudioState>)) => void,
) {
  set({ phase: "separating", progressLabel: "Разделение на дорожки (DSP)…", progressPct: 0 });
  const rendered: RenderedStem[] = await renderAllStems(
    buffer,
    DSP_STEMS,
    (stemId, pct, index, total) => {
      set((s) => ({
        progressPct: (index + pct) / total,
        stemProgress: { ...s.stemProgress, [stemId]: pct },
      }));
    },
    () => cancelFlag,
  );
  if (cancelFlag) return;
  session.stems = new Map(
    rendered.map((r) => [r.def.id, { buffer: r.buffer, peaks: r.peaks, offset: 0, dry: r.buffer }]),
  );
}

async function runLocalSeparation(
  buffer: AudioBuffer,
  set: (p: Partial<StudioState> | ((s: StudioState) => Partial<StudioState>)) => void,
) {
  set({ phase: "separating", progressLabel: "Подготовка WAV для локальной нейросети…", progressPct: 0.02 });
  const wav = encodeWav(buffer, 16);
  const form = new FormData();
  form.append("file", new File([wav], "input.wav", { type: "audio/wav" }));
  form.append("mode", useStudio.getState().localMlQuality === "fast" ? "fast" : "pro");
  const start = await fetch("/api/local-ai/separate", { method: "POST", body: form });
  const started = await start.json();
  if (!start.ok || !started.jobId) throw new Error(started.error || "Не удалось запустить локальное разделение");

  let urls: Record<string, string> | null = null;
  for (let i = 0; i < 2400; i++) {
    if (cancelFlag) return;
    await new Promise((r) => setTimeout(r, 1500));
    const res = await fetch(`/api/local-ai/job/${started.jobId}`, { cache: "no-store" });
    const job = await res.json();
    set({
      progressLabel: job.label || "Локальная нейросеть разделяет трек…",
      progressPct: Math.max(0.03, Math.min(0.96, Number(job.progress) || 0.1)),
    });
    if (job.state === "done") {
      urls = job.stems ?? {};
      break;
    }
    if (job.state === "error") throw new Error(job.error || "Ошибка локальной нейросети");
  }
  if (!urls) throw new Error("Локальная нейросеть не завершила задачу");

  const map = new Map<string, { buffer: AudioBuffer; peaks: Float32Array; offset: number; dry: AudioBuffer }>();
  const entries = Object.entries(urls);
  for (let i = 0; i < entries.length; i++) {
    const [key, url] = entries[i];
    set({ progressLabel: `Загрузка стема «${key}»…`, progressPct: 0.96 + (i / entries.length) * 0.04 });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Не удалось прочитать стем ${key}`);
    const decoded = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(await response.arrayBuffer());
    const stereo = decoded.numberOfChannels === 1
      ? (() => {
          const b = new AudioBuffer({ numberOfChannels: 2, length: decoded.length, sampleRate: decoded.sampleRate });
          b.copyToChannel(decoded.getChannelData(0), 0);
          b.copyToChannel(decoded.getChannelData(0), 1);
          return b;
        })()
      : decoded;
    map.set(key, { buffer: stereo, peaks: computePeaks(stereo), offset: 0, dry: stereo });
  }
  session.stems = map;
}

async function runMvsepSeparation(
  buffer: AudioBuffer,
  set: (p: Partial<StudioState> | ((s: StudioState) => Partial<StudioState>)) => void,
) {
  set({ phase: "separating", progressLabel: "Подготовка WAV для MVSep…", progressPct: 0.02 });
  const wav = encodeWav(buffer, 16);
  const form = new FormData();
  form.append("file", new File([wav], "track.wav", { type: "audio/wav" }));
  form.append("kind", "six");
  const start = await fetch("/api/mvsep/separate", { method: "POST", body: form });
  const started = await start.json();
  if (!start.ok || !started.hash) throw new Error(started.error || "MVSep не принял задачу");

  set({ progressLabel: "Загрузка трека завершена — очередь на мощностях MVSep…", progressPct: 0.1 });
  let files: Record<string, string> | null = null;
  let p = 0.1;
  for (let i = 0; i < 480; i++) {
    if (cancelFlag) return;
    await new Promise((r) => setTimeout(r, 5000));
    const res = await fetch(`/api/mvsep/status?hash=${encodeURIComponent(started.hash)}`, { cache: "no-store" });
    const status = await res.json();
    p = Math.min(0.9, p + 0.004);
    set({ progressLabel: "MVSep разделяет трек на своих серверах…", progressPct: p });
    if (status.status === "done") { files = status.files; break; }
    if (status.status === "failed") throw new Error("MVSep не смог обработать трек");
  }
  if (!files || Object.keys(files).length === 0) throw new Error("MVSep завершил задачу, но не вернул стемы");

  const map = new Map<string, { buffer: AudioBuffer; peaks: Float32Array; offset: number; dry: AudioBuffer }>();
  const entries = Object.entries(files);
  for (let i = 0; i < entries.length; i++) {
    const [key, url] = entries[i];
    const encoded = btoa(url).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    set({ progressLabel: `Загрузка стема «${key}»…`, progressPct: 0.9 + (i / entries.length) * 0.1 });
    const response = await fetch(`/api/mvsep/file?u=${encodeURIComponent(encoded)}`);
    if (!response.ok) throw new Error(`Не удалось скачать стем ${key}`);
    const decoded = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(await response.arrayBuffer());
    const stereo = decoded.numberOfChannels === 1
      ? (() => {
          const b = new AudioBuffer({ numberOfChannels: 2, length: decoded.length, sampleRate: decoded.sampleRate });
          b.copyToChannel(decoded.getChannelData(0), 0);
          b.copyToChannel(decoded.getChannelData(0), 1);
          return b;
        })()
      : decoded;
    map.set(key, { buffer: stereo, peaks: computePeaks(stereo), offset: 0, dry: stereo });
  }
  session.stems = map;
}

async function runAiSeparation(
  file: File,
  set: (p: Partial<StudioState> | ((s: StudioState) => Partial<StudioState>)) => void,
) {
  set({ phase: "separating", progressLabel: "Отправка трека в нейросеть…", progressPct: 0.05 });
  const form = new FormData();
  form.append("file", file, file.name);
  const startRes = await fetch("/api/separate", { method: "POST", body: form });
  const startData = await startRes.json();
  if (!startRes.ok || !startData.jobId) {
    throw new Error(
      startData.reason || startData.detail || "Нейросеть недоступна — попробуйте DSP-режим",
    );
  }
  const jobId: string = startData.jobId;
  let pct = 0.08;
  let stemsUrls: Record<string, string> | null = null;

  for (let attempt = 0; attempt < 180; attempt++) {
    if (cancelFlag) return;
    await new Promise((r) => setTimeout(r, 3000));
    const res = await fetch(`/api/separate/status?id=${jobId}`);
    const data = await res.json();
    if (data.status === "succeeded") {
      stemsUrls = data.stems ?? {};
      break;
    }
    if (data.status === "failed" || data.status === "canceled") {
      throw new Error(`Нейросеть не смогла обработать трек (${data.error ?? data.status})`);
    }
    pct = Math.min(0.85, pct + 0.006);
    set({
      progressPct: pct,
      progressLabel: `Нейросеть разделяет дорожки… ${Math.round(pct * 100)}%`,
    });
  }
  if (!stemsUrls) throw new Error("Превышено время ожидания ответа нейросети");

  const entries = Object.entries(stemsUrls);
  let done = 0;
  const map = new Map<string, { buffer: AudioBuffer; peaks: Float32Array; offset: number; dry: AudioBuffer }>();
  for (const [key, url] of entries) {
    if (cancelFlag) return;
    set({ progressLabel: `Загрузка дорожки «${key}»…` });
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Не удалось скачать дорожку ${key}`);
    const ab = await res.arrayBuffer();
    const decoded = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(ab);
    const stereo =
      decoded.numberOfChannels === 1
        ? (() => {
            const b = new AudioBuffer({
              numberOfChannels: 2,
              length: decoded.length,
              sampleRate: decoded.sampleRate,
            });
            const ch = decoded.getChannelData(0);
            b.copyToChannel(ch, 0);
            b.copyToChannel(ch, 1);
            return b;
          })()
        : decoded;
    map.set(key, { buffer: stereo, peaks: computePeaks(stereo), offset: 0, dry: stereo });
    done++;
    set({ progressPct: 0.85 + (done / entries.length) * 0.15 });
  }
  session.stems = map;
}
