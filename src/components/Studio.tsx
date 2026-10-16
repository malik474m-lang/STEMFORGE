"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileAudio2, RotateCcw } from "lucide-react";
import { useStudio } from "@/lib/store";
import { formatBytes, formatTime } from "@/lib/format";
import DropZone from "./DropZone";
import ProcessingView from "./ProcessingView";
import TransportBar from "./TransportBar";
import StemRow from "./StemRow";
import LyricsPanel from "./LyricsPanel";
import RightTabs from "./RightTabs";

export default function Studio() {
  const phase = useStudio((s) => s.phase);
  const stems = useStudio((s) => s.stems);
  const fileName = useStudio((s) => s.fileName);
  const fileSize = useStudio((s) => s.fileSize);
  const durationSec = useStudio((s) => s.durationSec);
  const sampleRate = useStudio((s) => s.sampleRate);
  const warning = useStudio((s) => s.warning);
  const mode = useStudio((s) => s.mode);
  const aiAvailable = useStudio((s) => s.aiAvailable);
  const resetSession = useStudio((s) => s.resetSession);
  const checkAi = useStudio((s) => s.checkAi);
  const checkLocalAi = useStudio((s) => s.checkLocalAi);
  const loadProjects = useStudio((s) => s.loadProjects);

  useEffect(() => {
    void checkAi();
    void checkLocalAi();
    void loadProjects();
  }, [checkAi, checkLocalAi, loadProjects]);

  // горячие клавиши: пробел — play/pause
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName)) return;
      if (useStudio.getState().phase === "ready") {
        e.preventDefault();
        void useStudio.getState().togglePlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <section id="studio" className="relative mx-auto max-w-[1440px] scroll-mt-20 px-4 pb-24 sm:px-8">
      <div className="pointer-events-none absolute -top-20 right-0 h-[400px] w-[600px] rounded-full bg-[radial-gradient(closest-side,rgba(34,211,238,0.08),transparent)] blur-3xl" />

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold tracking-[0.3em] text-acid uppercase">Рабочее место</p>
          <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Студия<span className="grad-text">.</span>
          </h2>
        </div>
        {phase === "ready" && (
          <button
            onClick={resetSession}
            className="btn-ghost flex items-center gap-2 rounded-full px-4 py-2.5 text-[12px] font-bold text-ink"
          >
            <RotateCcw className="size-4 text-acid" />
            Новый трек
          </button>
        )}
      </div>

      {warning && (
        <div className="mb-4 rounded-xl border border-amber-x/40 bg-amber-x/10 px-5 py-3.5 text-[13px] text-amber-x">
          {warning}
        </div>
      )}

      <AnimatePresence mode="wait">
        {(phase === "idle" || phase === "error") && (
          <motion.div
            key="drop"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <DropZone />
          </motion.div>
        )}

        {(phase === "decoding" || phase === "separating") && (
          <motion.div
            key="processing"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <ProcessingView />
          </motion.div>
        )}

        {phase === "ready" && (
          <motion.div
            key="mixer"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* инфо о файле */}
            <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-line bg-panel/40 px-5 py-3.5">
              <FileAudio2 className="size-4.5 text-acid" />
              <span className="max-w-[40ch] truncate text-[13px] font-bold text-white">{fileName}</span>
              <span className="text-[11px] text-dim">{formatBytes(fileSize)}</span>
              <span className="text-[11px] text-dim">{formatTime(durationSec)}</span>
              <span className="text-[11px] text-dim">{(sampleRate / 1000).toFixed(1)} кГц</span>
              <span
                className={`ml-auto rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase ${
                  mode === "local" ? "bg-lime-x/15 text-lime-x" : mode === "ai" && aiAvailable ? "bg-lilac/15 text-lilac" : "bg-acid/15 text-acid"
                }`}
              >
                {mode === "local" ? "LOCAL AI · RoFormer + Demucs" : mode === "ai" && aiAvailable ? "CLOUD AI · Demucs" : "DSP · только предпросмотр"}
              </span>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="min-w-0 space-y-3">
                <TransportBar />
                <div className="space-y-2.5">
                  {stems.map((stem, i) => (
                    <StemRow key={stem.id} stem={stem} index={i} />
                  ))}
                </div>
                <p className="px-1 text-[11px] leading-relaxed text-dim/80">
                  {mode === "dsp"
                    ? "DSP — только быстрый Mid/Side-предпросмотр: он не способен физически отделить инструменты, находящиеся в одном частотном диапазоне. Для реальных стемов загрузите трек в режиме Local AI."
                    : "Стемы созданы нейросетями: BS-RoFormer отвечает за чистые вокал/инструментал, HTDemucs — за отдельные ударные, бас, гитару, пианино и прочее. Пробел — play/pause."}
                </p>
                <LyricsPanel />
              </div>
              <div className="space-y-4">
                <RightTabs />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
