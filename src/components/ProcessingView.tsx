"use client";

import { X } from "lucide-react";
import { useStudio } from "@/lib/store";
import { DSP_STEMS, AI_STEMS } from "@/lib/audio/stems";
import SpectrumCanvas from "./SpectrumCanvas";

export default function ProcessingView() {
  const phase = useStudio((s) => s.phase);
  const pct = useStudio((s) => s.progressPct);
  const label = useStudio((s) => s.progressLabel);
  const stemProgress = useStudio((s) => s.stemProgress);
  const fileName = useStudio((s) => s.fileName);
  const mode = useStudio((s) => s.mode);
  const aiAvailable = useStudio((s) => s.aiAvailable);
  const cancel = useStudio((s) => s.cancel);

  const defs = mode === "local" || (mode === "ai" && aiAvailable) ? AI_STEMS : DSP_STEMS;
  const percent = Math.round(pct * 100);

  return (
    <div className="glass noise relative overflow-hidden rounded-3xl">
      <SpectrumCanvas className="absolute inset-x-0 bottom-0 h-full w-full opacity-20" bars={72} dimmed />
      <div className="relative z-10 px-6 py-12 sm:px-12 sm:py-16">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.22em] text-acid uppercase rec-dot">
              {phase === "decoding" ? "Чтение файла" : mode === "local" ? "Локальная нейросеть работает" : mode === "ai" ? "Облачная нейросеть работает" : "DSP-предпросмотр"}
            </p>
            <h3 className="mt-3 max-w-xl truncate font-display text-xl font-bold text-white sm:text-2xl">
              {fileName}
            </h3>
            <p className="mt-3 text-[13px] text-dim">{label || "Подготовка…"}</p>
          </div>
          <div className="text-right">
            <span className="grad-text font-display text-6xl font-extrabold tabular-nums sm:text-7xl">
              {percent}
            </span>
            <span className="font-display text-2xl font-bold text-dim">%</span>
          </div>
        </div>

        <div className="mt-8 h-1.5 overflow-hidden rounded-full bg-white/8">
          <div
            className="h-full rounded-full bg-gradient-to-r from-acid via-lilac to-rose transition-[width] duration-300 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>

        {phase === "separating" && mode === "dsp" && (
          <div className="mt-8 grid gap-x-10 gap-y-2.5 sm:grid-cols-2">
            {defs.map((d) => {
              const p = stemProgress[d.id];
              const st = p === undefined ? "ожидание" : p >= 1 ? "готово" : "рендер";
              return (
                <div key={d.id} className="flex items-center gap-3">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: d.color, boxShadow: `0 0 10px ${d.color}` }} />
                  <span className="w-28 truncate text-[12px] font-semibold text-ink">{d.name}</span>
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/8">
                    <div
                      className="h-full rounded-full transition-[width] duration-200"
                      style={{ width: `${Math.round((p ?? 0) * 100)}%`, background: d.color }}
                    />
                  </div>
                  <span className="w-16 text-right text-[10px] font-bold tracking-wider text-dim uppercase">
                    {st === "рендер" ? `${Math.round((p ?? 0) * 100)}%` : st}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {phase === "separating" && (mode === "ai" || mode === "local") && (
          <p className="mt-6 text-[12px] leading-relaxed text-dim">
            {mode === "local"
              ? "BS-RoFormer отделяет чистые вокал/инструментал, затем HTDemucs 6s извлекает ударные, бас, гитару, пианино и прочее. Первый запуск скачивает модели; CPU может обрабатывать трек дольше его длительности."
              : "Demucs htdemucs_6s извлекает вокал, ударные, бас, гитару, клавишные и остаток в облаке."}
          </p>
        )}

        <div className="mt-10 flex items-center justify-between">
          <p className="text-[11px] text-dim/70">
            {phase === "decoding"
              ? "Декодирование сжатого аудио в PCM с полной точностью float32…"
              : "Оставьте вкладку активной для максимальной скорости."}
          </p>
          <button
            onClick={cancel}
            className="btn-ghost flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-semibold text-rose"
          >
            <X className="size-3.5" />
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
