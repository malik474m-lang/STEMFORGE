"use client";

import { Download, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { session, useStudio, type StemUI } from "@/lib/store";
import Waveform from "./Waveform";

export default function StemRow({ stem, index }: { stem: StemUI; index: number }) {
  const currentTime = useStudio((s) => s.currentTime);
  const durationSec = useStudio((s) => s.durationSec);
  const exporting = useStudio((s) => s.exporting);
  const toggleMute = useStudio((s) => s.toggleMute);
  const toggleSolo = useStudio((s) => s.toggleSolo);
  const toggleEnhance = useStudio((s) => s.toggleEnhance);
  const setStemVolume = useStudio((s) => s.setStemVolume);
  const exportOne = useStudio((s) => s.exportOne);
  const anySolo = useStudio((s) => s.stems.some((x) => x.solo));

  const peaks = session.stems.get(stem.id)?.peaks ?? null;
  const progress = durationSec > 0 ? currentTime / durationSec : 0;
  const dimmed = stem.muted || (anySolo && !stem.solo);

  return (
    <motion.div
      initial={{ opacity: 0, x: -24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.06, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={`hairline group relative overflow-hidden rounded-2xl bg-panel/50 p-3 transition-opacity sm:p-4 ${
        dimmed && !stem.solo ? "opacity-[0.58]" : ""
      }`}
    >
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-1"
        style={{ background: stem.color, boxShadow: `0 0 18px ${stem.color}` }}
      />
      <div className="grid items-center gap-3 pl-2 lg:grid-cols-[190px_minmax(120px,1fr)_auto] lg:gap-4">
        {/* имя и описание */}
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg font-display text-[9px] font-extrabold tracking-wider"
            style={{ background: `${stem.color}1c`, color: stem.color, boxShadow: `inset 0 0 0 1px ${stem.color}44` }}
          >
            {stem.tag}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="truncate text-[14px] font-bold text-white">{stem.name}</h4>
              {stem.approx && (
                <span
                  className="shrink-0 rounded-full border border-line px-1.5 py-px text-[8.5px] font-bold tracking-widest text-dim uppercase"
                  title="Спектральная аппроксимация DSP — для идеального качества включите AI-режим"
                >
                  DSP
                </span>
              )}
            </div>
            <p className="mt-0.5 line-clamp-1 text-[11px] text-dim" title={stem.desc}>
              {stem.desc}
            </p>
          </div>
        </div>

        {/* волноформа */}
        <div className="min-w-0">
          <Waveform peaks={peaks} color={stem.color} progress={progress} className="h-12 w-full lg:h-14" />
        </div>

        {/* контролы */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          <button
            onClick={() => toggleMute(stem.id)}
            title="Отключить дорожку"
            className={`grid size-8 place-items-center rounded-lg font-display text-[10px] font-extrabold transition ${
              stem.muted
                ? "bg-rose/20 text-rose shadow-[inset_0_0_0_1px_rgba(251,113,133,0.6)]"
                : "btn-ghost text-dim hover:text-white"
            }`}
          >
            M
          </button>
          <button
            onClick={() => toggleSolo(stem.id)}
            title="Соло"
            className={`grid size-8 place-items-center rounded-lg font-display text-[10px] font-extrabold transition ${
              stem.solo
                ? "bg-amber-x/20 text-amber-x shadow-[inset_0_0_0_1px_rgba(251,191,36,0.6)]"
                : "btn-ghost text-dim hover:text-white"
            }`}
          >
            S
          </button>
          <button
            onClick={() => toggleEnhance(stem.id)}
            title="Улучшение: эксайтер + воздух + компрессия (в мониторинге и при экспорте)"
            className={`grid size-8 place-items-center rounded-lg transition ${
              stem.enhance
                ? "bg-lilac/20 text-lilac shadow-[inset_0_0_0_1px_rgba(167,139,250,0.6),0_0_16px_rgba(167,139,250,0.3)]"
                : "btn-ghost text-dim hover:text-white"
            }`}
          >
            <Sparkles className="size-4" strokeWidth={2.2} />
          </button>
          <button
            onClick={() => void exportOne(stem.id)}
            disabled={exporting}
            title="Скачать эту дорожку"
            className="btn-ghost grid size-8 place-items-center rounded-lg text-dim transition hover:text-acid disabled:opacity-40"
          >
            <Download className="size-4" strokeWidth={2.2} />
          </button>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.01}
            value={stem.volume}
            onChange={(e) => setStemVolume(stem.id, Number(e.target.value))}
            className="vx w-20 sm:w-24"
            style={
              {
                background: `linear-gradient(to right, ${stem.color} 0%, ${stem.color} ${(stem.volume / 1.5) * 100}%, rgba(148,163,255,0.18) ${(stem.volume / 1.5) * 100}%)`,
                "--tw-thumb": stem.color,
              } as React.CSSProperties
            }
            title={`Громкость: ${Math.round(stem.volume * 100)}%`}
          />
          <span className="hidden w-10 text-right text-[10px] font-bold text-dim tabular-nums sm:block">
            {Math.round(stem.volume * 100)}%
          </span>
        </div>
      </div>
    </motion.div>
  );
}
