"use client";

import { useCallback, useRef, useState } from "react";
import { CloudUpload, Cpu, Download, FileAudio, Loader2 } from "lucide-react";
import { useStudio } from "@/lib/store";
import SpectrumCanvas from "./SpectrumCanvas";

export default function DropZone() {
  const loadFile = useStudio((s) => s.loadFile);
  const error = useStudio((s) => s.error);
  const mode = useStudio((s) => s.mode);
  const setMode = useStudio((s) => s.setMode);
  const aiAvailable = useStudio((s) => s.aiAvailable);
  const localAiReady = useStudio((s) => s.localAiReady);
  const localAiDesktop = useStudio((s) => s.localAiDesktop);
  const localAiInstalling = useStudio((s) => s.localAiInstalling);
  const localAiLabel = useStudio((s) => s.localAiLabel);
  const localAiProgress = useStudio((s) => s.localAiProgress);
  const setupLocalAi = useStudio((s) => s.setupLocalAi);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(false);
      const file = e.dataTransfer.files?.[0];
      if (file && (mode !== "local" || localAiReady)) void loadFile(file);
    },
    [loadFile, mode, localAiReady],
  );

  return (
    <div>
      {/* переключатель режима */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap rounded-full border border-line bg-panel p-1">
          <button
            onClick={() => setMode("local")}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-bold tracking-wide transition ${
              mode === "local" ? "bg-lime-x/15 text-lime-x shadow-[inset_0_0_0_1px_rgba(52,211,153,0.45)]" : "text-dim hover:text-ink"
            }`}
          >
            <Cpu className="size-3.5" />
            Local AI · бесплатно
          </button>
          <button
            onClick={() => aiAvailable && setMode("ai")}
            disabled={!aiAvailable}
            title={aiAvailable ? "Облачный Demucs" : "Добавьте REPLICATE_API_TOKEN"}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-bold tracking-wide transition ${
              mode === "ai" ? "bg-lilac/15 text-lilac shadow-[inset_0_0_0_1px_rgba(167,139,250,0.4)]" : aiAvailable ? "text-dim hover:text-ink" : "cursor-not-allowed text-dim/40"
            }`}
          >
            <Cpu className="size-3.5" />
            Cloud AI{!aiAvailable && " (выкл)"}
          </button>
        </div>
        <p className="max-w-2xl text-[12px] leading-relaxed text-dim">
          {mode === "local"
            ? "Настоящее локальное ML-разделение: BS-RoFormer (чистые вокал/минус) + HTDemucs 6s (ударные, бас, гитара, пианино, прочее). Без API и оплаты."
            : mode === "ai"
              ? "Облачный Demucs через Replicate. Требует рабочий токен и оплачиваемый GPU-аккаунт."
              : "Важно: DSP — это только Mid/Side-фильтрация для быстрого предпросмотра. Она НЕ создаёт чистые независимые стемы."}
        </p>
      </div>

      {mode === "local" && !localAiReady && (
        <div className="mb-5 rounded-2xl border border-lime-x/35 bg-lime-x/5 p-5">
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-0 flex-1">
              <h4 className="text-[14px] font-bold text-white">Локальный нейросетевой модуль ещё не установлен</h4>
              <p className="mt-1 text-[12px] leading-relaxed text-dim">
                Однократно установятся Python 3.11 и открытый audio-separator. При первом разделении модели BS-RoFormer и HTDemucs скачаются в папку данных. Потребуется несколько ГБ места; обработка на CPU медленная, NVIDIA GPU быстрее.
              </p>
              {localAiInstalling && (
                <div className="mt-3">
                  <div className="flex justify-between text-[11px] font-semibold text-dim"><span>{localAiLabel}</span><span>{Math.round(localAiProgress * 100)}%</span></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/8"><div className="h-full bg-lime-x transition-[width]" style={{ width: `${localAiProgress * 100}%` }} /></div>
                </div>
              )}
            </div>
            <button
              onClick={() => void setupLocalAi()}
              disabled={localAiInstalling || !localAiDesktop}
              className="btn-acid flex items-center gap-2 rounded-full px-5 py-3 text-[12px] font-bold disabled:opacity-40"
              title={localAiDesktop ? "Установить локальный ML runtime" : "Установка доступна в Windows-приложении"}
            >
              {localAiInstalling ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              {localAiInstalling ? "Установка…" : "Установить Local AI"}
            </button>
          </div>
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`group relative cursor-pointer overflow-hidden rounded-3xl border-2 border-dashed transition-all duration-300 ${
          drag
            ? "border-acid bg-acid/8 shadow-[0_0_80px_rgba(34,211,238,0.25)]"
            : "border-line bg-panel/40 hover:border-acid/40 hover:bg-panel/70"
        }`}
      >
        <SpectrumCanvas className="absolute inset-x-0 bottom-0 h-full w-full opacity-30" bars={64} dimmed />
        <div className="relative z-10 flex flex-col items-center px-6 py-16 text-center sm:py-20">
          <span
            className={`grid size-16 place-items-center rounded-2xl transition-all duration-300 ${
              drag ? "scale-110 bg-acid text-void" : "bg-gradient-to-br from-acid/20 to-lilac/20 text-acid"
            }`}
          >
            <CloudUpload className="size-7" strokeWidth={2.2} />
          </span>
          <h3 className="mt-6 font-display text-lg font-bold tracking-wide text-white sm:text-xl">
            {drag ? "Отпускайте — начинаем!" : "Перетащите трек сюда"}
          </h3>
          <p className="mt-2 text-[13px] text-dim">
            или <span className="font-semibold text-acid underline underline-offset-4">выберите файл</span> на компьютере
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[11px] font-semibold tracking-wider text-dim/80">
            {["MP3", "WAV", "OGG", "FLAC", "M4A"].map((f) => (
              <span key={f} className="rounded-full border border-line bg-void/60 px-3 py-1">{f}</span>
            ))}
            <span className="flex items-center gap-1.5 px-2">
              <FileAudio className="size-3.5 text-acid" /> до 20 минут
            </span>
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f && (mode !== "local" || localAiReady)) void loadFile(f);
            e.target.value = "";
          }}
        />
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-rose/40 bg-rose/10 px-5 py-4 text-[13px] text-rose">
          {error}
        </div>
      )}
    </div>
  );
}
