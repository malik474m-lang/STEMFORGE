"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Captions, ChevronDown, Download, FileUp, ListMusic, Loader2, MousePointerClick,
  Music2, Plus, Save, ScanText, Timer, Trash2, X,
} from "lucide-react";
import { useStudio } from "@/lib/store";
import { useLab, type LyricLine } from "@/lib/lab";
import { formatLrc, parseLrc } from "@/lib/lrc";
import { formatTime } from "@/lib/format";
import { player } from "@/lib/audio/player";

function parseTimeInput(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const full = /^(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?$/.exec(t);
  if (full) {
    const frac = full[3]
      ? Number(full[3]) / (full[3].length === 1 ? 10 : full[3].length === 2 ? 100 : 1000)
      : 0;
    return Number(full[1]) * 60 + Number(full[2]) + frac;
  }
  const secs = /^(\d+(?:\.\d+)?)$/.exec(t);
  if (secs) return Number(secs[1]);
  return null;
}

function TimeChip({ line, active }: { line: LyricLine; active: boolean }) {
  const setLineTime = useLab((s) => s.setLineTime);
  const seek = useStudio((s) => s.seek);
  const [edit, setEdit] = useState<string | null>(null);

  return (
    <input
      className={`w-[74px] shrink-0 rounded-lg border px-1.5 py-1.5 text-center font-mono text-[11px] tabular-nums transition ${
        active
          ? "border-acid/60 bg-acid/10 text-acid"
          : line.time === null
            ? "border-dashed border-line bg-transparent text-dim/60"
            : "border-line bg-void/50 text-dim"
      }`}
      value={edit ?? (line.time === null ? "--:--.--" : formatTime(line.time) + "." + Math.round((line.time % 1) * 100).toString().padStart(2, "0"))}
      onFocus={() => setEdit(line.time === null ? "" : (Math.floor(line.time / 60) + ":" + ((line.time % 60).toFixed(2)).padStart(5, "0")))}
      onChange={(e) => setEdit(e.target.value)}
      onBlur={() => {
        if (edit !== null) {
          const t = parseTimeInput(edit);
          if (t !== null) setLineTime(line.id, t);
        }
        setEdit(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setEdit(null);
      }}
      onDoubleClick={() => line.time !== null && seek(line.time)}
      title="Таймкод строки (м:сс.сс). Двойной клик — перейти на это место"
    />
  );
}

export default function LyricsPanel() {
  const fileName = useStudio((s) => s.fileName);
  const durationSec = useStudio((s) => s.durationSec);
  const aiAvailable = useStudio((s) => s.aiAvailable);
  const localAiReady = useStudio((s) => s.localAiReady);
  const seek = useStudio((s) => s.seek);
  const togglePlay = useStudio((s) => s.togglePlay);
  const playing = useStudio((s) => s.playing);
  const currentTime = useStudio((s) => s.currentTime);

  const lines = useLab((s) => s.lines);
  const lyricsTitle = useLab((s) => s.lyricsTitle);
  const lyricsList = useLab((s) => s.lyricsList);
  const selectedLineId = useLab((s) => s.selectedLineId);
  const tapSync = useLab((s) => s.tapSync);
  const aiJob = useLab((s) => s.aiJob);

  const [draft, setDraft] = useState("");
  const [lang, setLang] = useState("ru");
  const [shift, setShift] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const lrcInputRef = useRef<HTMLInputElement>(null);
  const labLoaded = useRef(false);

  // загрузка списка и привязка к треку
  useEffect(() => {
    if (!labLoaded.current) {
      labLoaded.current = true;
      void useLab.getState().loadLyricsList();
    }
  }, []);
  useEffect(() => {
    if (!fileName) return;
    const title = fileName.replace(/\.[^.]+$/, "");
    useLab.setState({ lyricsTitle: title });
    const t = setTimeout(() => useLab.getState().resetForTrack(fileName, title), 300);
    return () => clearTimeout(t);
  }, [fileName]);

  // активная строка (караоке)
  const activeId = useMemo(() => {
    let best: string | null = null;
    let bestTime = -Infinity;
    for (const l of lines) {
      if (l.time !== null && l.time <= currentTime + 0.05 && l.time > bestTime) {
        best = l.id;
        bestTime = l.time;
      }
    }
    return best;
  }, [lines, currentTime]);

  const prevActive = useRef<string | null>(null);
  useEffect(() => {
    if (!playing || !activeId || activeId === prevActive.current) return;
    prevActive.current = activeId;
    listRef.current
      ?.querySelector(`[data-line="${activeId}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeId, playing]);

  // Enter во время тап-синхронизации
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !useLab.getState().tapSync) return;
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      e.preventDefault();
      useLab.getState().tapAdvance();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const nextTapLine = lines.find((l) => l.time === null);

  const exportLrcFile = useCallback(() => {
    const synced = lines.filter((l) => l.time !== null);
    if (synced.length === 0) {
      useStudio.getState().setToast("Нет привязанных по времени строк");
      return;
    }
    const blob = new Blob([formatLrc(lines, lyricsTitle)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${lyricsTitle || "lyrics"}.lrc`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, [lines, lyricsTitle]);

  const importLrcFile = async (f: File) => {
    const text = await f.text();
    const parsed = parseLrc(text).map((l) => ({ id: crypto.randomUUID(), ...l }));
    if (parsed.length === 0) {
      useStudio.getState().setToast("Файл .lrc пуст или не распознан");
      return;
    }
    useLab.getState().setLines(parsed);
    useStudio.getState().setToast(`Импортировано строк: ${parsed.length}`);
  };

  const syncedCount = lines.filter((l) => l.time !== null).length;

  return (
    <div className="glass noise relative overflow-hidden rounded-3xl p-5">
      {/* шапка */}
      <div className="flex flex-wrap items-center gap-2.5">
        <Captions className="size-4 text-rose" />
        <h3 className="font-display text-[13px] font-bold tracking-[0.16em] text-white uppercase">
          Текст и караоке
        </h3>
        <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-bold text-dim">
          {lines.length} строк · {syncedCount} с таймингом
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            title="Язык вокала для распознавания"
            className="rounded-lg border border-line bg-void/60 px-2 py-1.5 text-[11px] font-semibold text-dim outline-none"
          >
            <option value="None">авто-язык</option>
            <option value="ru">русский</option>
            <option value="en">english</option>
          </select>
          <button
            onClick={() => {
              if (lines.length > 0 && !window.confirm("Заменить текущий текст распознанным?")) return;
              void useLab.getState().transcribe(lang);
            }}
            disabled={(!localAiReady && !aiAvailable) || aiJob.kind !== null}
            title={localAiReady ? "Локальный Whisper извлечёт текст из чистого вокала" : aiAvailable ? "Облачный Whisper" : "Сначала установите Local AI"}
            className="btn-ghost flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold text-dim hover:text-lilac disabled:cursor-not-allowed disabled:opacity-40"
          >
            {aiJob.kind === "transcribe" ? <Loader2 className="size-3.5 animate-spin" /> : <ScanText className="size-3.5" />}
            Распознать (AI)
          </button>
          <button
            onClick={() => lrcInputRef.current?.click()}
            title="Импортировать файл .lrc с таймкодами"
            className="btn-ghost flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold text-dim hover:text-acid"
          >
            <FileUp className="size-3.5" /> .lrc
          </button>
          <button
            onClick={exportLrcFile}
            title="Экспортировать синхронизированный текст в .lrc"
            className="btn-ghost flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold text-dim hover:text-acid"
          >
            <Download className="size-3.5" /> .lrc
          </button>
          <button
            onClick={() => void useLab.getState().saveLyrics()}
            title="Сохранить текст и синхронизацию в базу"
            className="btn-ghost flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold text-dim hover:text-lime-x"
          >
            <Save className="size-3.5" /> Сохранить
          </button>
          <input
            ref={lrcInputRef}
            type="file"
            accept=".lrc,.txt,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importLrcFile(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {/* статус AI-транскрибации */}
      {aiJob.kind === "transcribe" && (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-lilac/30 bg-lilac/5 px-4 py-3">
          <Loader2 className="size-4 animate-spin text-lilac" />
          <span className="text-[12px] font-semibold text-ink">{aiJob.label}</span>
          <div className="ml-auto h-1 w-32 overflow-hidden rounded-full bg-white/8">
            <div className="h-full rounded-full bg-lilac transition-[width]" style={{ width: `${aiJob.pct * 100}%` }} />
          </div>
        </div>
      )}

      {/* пустое состояние */}
      {lines.length === 0 && aiJob.kind !== "transcribe" && (
        <div className="mt-4">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={"Вставьте текст песни сюда — каждая строка станет отдельной караоке-строкой.\nИли нажмите «Распознать (AI)», чтобы извлечь текст из трека автоматически."}
            className="h-36 w-full resize-none rounded-2xl border border-line bg-void/50 p-4 text-[13px] leading-relaxed text-ink outline-none placeholder:text-dim/50 focus:border-acid/40"
          />
          <div className="mt-2.5 flex items-center justify-between">
            <p className="text-[11px] text-dim">Можно исполнить импорт из .lrc или распознавание Whisper (AI)</p>
            <button
              onClick={() => {
                if (!draft.trim()) return;
                useLab.getState().splitFromText(draft);
              }}
              className="btn-acid flex items-center gap-2 rounded-full px-5 py-2.5 text-[12px] font-bold"
            >
              <ListMusic className="size-4" />
              Разобрать на строки
            </button>
          </div>
        </div>
      )}

      {/* список строк */}
      {lines.length > 0 && (
        <>
          {/* панель управления синхронизацией */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                const lab = useLab.getState();
                if (lab.tapSync) {
                  lab.stopTapSync();
                } else {
                  lab.startTapSync();
                  if (!playing) void togglePlay();
                }
              }}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-bold transition ${
                tapSync
                  ? "bg-rose/20 text-rose shadow-[inset_0_0_0_1px_rgba(244,114,182,0.6)]"
                  : "btn-acid"
              }`}
            >
              {tapSync ? <X className="size-4" /> : <MousePointerClick className="size-4" />}
              {tapSync ? "Остановить синхронизацию" : "Тап-синхронизация"}
            </button>
            <button
              onClick={() => useLab.getState().clearTimings()}
              title="Стереть все таймкоды"
              className="btn-ghost flex items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-semibold text-dim hover:text-rose"
            >
              <Timer className="size-3.5" /> Сбросить тайминги
            </button>
            <div className="flex items-center gap-1.5 rounded-full border border-line bg-void/40 px-3 py-1.5">
              <span className="text-[10px] font-bold tracking-wider text-dim uppercase">сдвиг всего</span>
              <button onClick={() => setShift((v) => Math.round((v - 0.1) * 10) / 10)} className="px-1 text-dim hover:text-white">−</button>
              <span className="w-10 text-center text-[11px] font-bold text-acid tabular-nums">{shift > 0 ? `+${shift.toFixed(1)}` : shift.toFixed(1)}с</span>
              <button onClick={() => setShift((v) => Math.round((v + 0.1) * 10) / 10)} className="px-1 text-dim hover:text-white">+</button>
              <button
                onClick={() => {
                  if (shift !== 0) useLab.getState().shiftAll(shift);
                  setShift(0);
                }}
                className="ml-1 rounded-full bg-acid/15 px-2 py-0.5 text-[10px] font-bold text-acid"
              >
                OK
              </button>
            </div>
            <button
              onClick={() => useLab.getState().insertLine(null)}
              className="btn-ghost ml-auto flex items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-semibold text-dim hover:text-ink"
            >
              <Plus className="size-3.5" /> Строка
            </button>
            <button
              onClick={() => {
                useLab.getState().setLines([]);
                useStudio.getState().setToast("Текст очищен — вставьте новый");
              }}
              className="btn-ghost flex items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-semibold text-dim hover:text-rose"
            >
              <Trash2 className="size-3.5" /> Очистить
            </button>
          </div>

          {/* режим тап-синхронизации */}
          {tapSync && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 overflow-hidden rounded-2xl border border-rose/40 bg-gradient-to-r from-rose/15 via-lilac/10 to-acid/10 p-4"
            >
              <div className="flex flex-wrap items-center gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold tracking-[0.2em] text-rose uppercase rec-dot">синхронизация идёт · Enter</p>
                  <p className="mt-1 truncate font-display text-lg font-bold text-white">
                    {nextTapLine ? nextTapLine.text || "…" : "Готово!"}
                  </p>
                  <p className="text-[11px] text-dim">
                    {nextTapLine ? "Нажмите в момент, когда строка зазвучит" : "Все строки привязаны"}
                  </p>
                </div>
                <button
                  onClick={() => useLab.getState().tapAdvance()}
                  className="btn-acid rounded-2xl px-7 py-4 font-display text-[13px] font-extrabold tracking-[0.1em] uppercase"
                >
                  Строка · <span className="tabular-nums">{formatTime(currentTime)}</span>
                </button>
              </div>
            </motion.div>
          )}

          {/* строки */}
          <div ref={listRef} className="mt-3 max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
            {lines.map((line, i) => {
              const active = line.id === activeId;
              const selected = line.id === selectedLineId;
              return (
                <div
                  key={line.id}
                  data-line={line.id}
                  className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 transition-all duration-300 ${
                    active
                      ? "border-acid/50 bg-acid/8 shadow-[0_0_24px_-6px_rgba(34,211,238,0.4)]"
                      : selected
                        ? "border-line bg-void/60"
                        : "border-transparent bg-void/25 hover:bg-void/50"
                  }`}
                >
                  <span
                    className={`w-6 shrink-0 text-center font-mono text-[10px] tabular-nums ${active ? "text-acid" : "text-dim/40"}`}
                  >
                    {i + 1}
                  </span>
                  <TimeChip line={line} active={active} />
                  <input
                    value={line.text}
                    onChange={(e) => useLab.getState().setLineText(line.id, e.target.value)}
                    onFocus={() => useLab.getState().setSelectedLine(line.id)}
                    placeholder="текст строки…"
                    className={`min-w-0 flex-1 bg-transparent text-[13px] outline-none transition ${
                      active ? "font-semibold text-white" : "text-ink/85"
                    } placeholder:text-dim/40`}
                  />
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => useLab.getState().setLineTime(line.id, Math.min(player.getTime(), durationSec))}
                      title="Присвоить текущее время воспроизведения"
                      className="grid size-6 place-items-center rounded-md text-dim/50 transition hover:bg-acid/10 hover:text-acid"
                    >
                      <Timer className="size-3" />
                    </button>
                    <button
                      onClick={() => useLab.getState().nudgeLine(line.id, -0.1)}
                      title="−0.1 сек"
                      className="grid size-6 place-items-center rounded-md text-[10px] font-bold text-dim/50 transition hover:bg-white/5 hover:text-white"
                    >
                      −
                    </button>
                    <button
                      onClick={() => useLab.getState().nudgeLine(line.id, 0.1)}
                      title="+0.1 сек"
                      className="grid size-6 place-items-center rounded-md text-[10px] font-bold text-dim/50 transition hover:bg-white/5 hover:text-white"
                    >
                      +
                    </button>
                    <button
                      onClick={() => useLab.getState().insertLine(line.id)}
                      title="Вставить строку ниже"
                      className="grid size-6 place-items-center rounded-md text-dim/50 transition hover:bg-white/5 hover:text-ink"
                    >
                      <Plus className="size-3" />
                    </button>
                    <button
                      onClick={() => useLab.getState().removeLine(line.id)}
                      title="Удалить строку"
                      className="grid size-6 place-items-center rounded-md text-dim/50 transition hover:bg-rose/10 hover:text-rose"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* сохранённые версии */}
      {lyricsList.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <button className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.18em] text-dim uppercase">
            <Music2 className="size-3.5" /> Сохранённые тексты
            <ChevronDown className="size-3" />
          </button>
          <div className="mt-2 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
            {lyricsList.map((row) => (
              <span key={row.id} className="group flex items-center gap-1 rounded-full border border-line bg-void/40 py-1 pr-1 pl-3 text-[11px] text-dim">
                <button onClick={() => useLab.getState().applyLyricsRow(row)} className="font-semibold transition hover:text-acid" title={`${row.fileName} · ${row.lines.length} строк`}>
                  {row.title}
                </button>
                <button
                  onClick={() => void useLab.getState().deleteLyricsRow(row.id)}
                  className="grid size-4 place-items-center rounded-full text-dim/40 transition hover:text-rose"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
