"use client";

import { Pause, Play, Repeat, Square, Volume2 } from "lucide-react";
import { player } from "@/lib/audio/player";
import { session, useStudio } from "@/lib/store";
import { formatTime } from "@/lib/format";
import Waveform from "./Waveform";
import SpectrumCanvas from "./SpectrumCanvas";

function EqFader({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-8 shrink-0 text-right text-[9px] font-bold tracking-[0.14em] text-dim uppercase">{label}</span>
      <input
        type="range"
        min={-12}
        max={12}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(0)}
        className="vx w-20"
        title={`${label}: двойной клик — сброс`}
      />
      <span className="w-7 shrink-0 text-[10px] font-semibold text-dim tabular-nums">
        {value > 0 ? `+${value}` : value}
      </span>
    </label>
  );
}

export default function TransportBar() {
  const playing = useStudio((s) => s.playing);
  const currentTime = useStudio((s) => s.currentTime);
  const durationSec = useStudio((s) => s.durationSec);
  const togglePlay = useStudio((s) => s.togglePlay);
  const stopPlayback = useStudio((s) => s.stopPlayback);
  const seek = useStudio((s) => s.seek);
  const masterVolume = useStudio((s) => s.masterVolume);
  const setMasterVolume = useStudio((s) => s.setMasterVolume);
  const eq = useStudio((s) => s.eq);
  const setEq = useStudio((s) => s.setEq);
  const originalSolo = useStudio((s) => s.originalSolo);
  const toggleOriginal = useStudio((s) => s.toggleOriginal);

  const progress = durationSec > 0 ? currentTime / durationSec : 0;

  return (
    <div className="glass noise relative overflow-hidden rounded-3xl p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => void togglePlay()}
            aria-label={playing ? "Пауза" : "Играть"}
            className="btn-acid grid size-12 place-items-center rounded-full"
          >
            {playing ? <Pause className="size-5" fill="currentColor" /> : <Play className="size-5 translate-x-0.5" fill="currentColor" />}
          </button>
          <button
            onClick={stopPlayback}
            aria-label="Стоп"
            className="btn-ghost grid size-10 place-items-center rounded-full text-dim hover:text-white"
          >
            <Square className="size-4" fill="currentColor" />
          </button>
        </div>

        <div className="flex items-baseline gap-2 font-display tabular-nums">
          <span className="text-lg font-bold text-white">{formatTime(currentTime)}</span>
          <span className="text-[11px] font-semibold text-dim">/ {formatTime(durationSec)}</span>
        </div>

        <button
          onClick={toggleOriginal}
          className={`ml-auto flex items-center gap-2 rounded-full px-3.5 py-2 text-[11px] font-bold tracking-wide transition ${
            originalSolo
              ? "bg-rose/15 text-rose shadow-[inset_0_0_0_1px_rgba(244,114,182,0.5)]"
              : "btn-ghost text-dim hover:text-ink"
          }`}
          title="A/B: послушать исходный трек без обработки"
        >
          <Repeat className="size-3.5" />
          A/B ОРИГИНАЛ
        </button>

        <div className="hidden items-center gap-2 md:flex">
          <Volume2 className="size-4 text-dim" />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={masterVolume}
            onChange={(e) => setMasterVolume(Number(e.target.value))}
            className="vx w-24"
          />
        </div>

        <div className="hidden flex-col justify-center gap-1.5 border-l border-line pl-4 xl:flex">
          <EqFader label="Низ" value={eq.low} onChange={(v) => setEq("low", v)} />
          <EqFader label="Сер" value={eq.mid} onChange={(v) => setEq("mid", v)} />
          <EqFader label="Верх" value={eq.high} onChange={(v) => setEq("high", v)} />
        </div>

        <SpectrumCanvas
          getAnalyser={() => player.analyser}
          className="hidden h-16 w-40 shrink-0 sm:block"
          bars={36}
        />
      </div>

      <div className="mt-4">
        <Waveform
          peaks={session.masterPeaks}
          color="#818cf8"
          progress={progress}
          interactive
          onSeek={(r) => seek(r * durationSec)}
          className="h-20 w-full sm:h-24"
        />
      </div>
    </div>
  );
}
