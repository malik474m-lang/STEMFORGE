"use client";

import { AudioWaveform, Cpu, MonitorDown, Zap } from "lucide-react";
import { useStudio } from "@/lib/store";

export default function SiteHeader() {
  const aiAvailable = useStudio((s) => s.aiAvailable);
  const mode = useStudio((s) => s.mode);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line bg-void/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-4 px-4 sm:px-8">
        <a href="#top" className="group flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-acid via-lilac to-rose text-void shadow-[0_0_24px_rgba(34,211,238,0.4)]">
            <AudioWaveform className="size-4.5" strokeWidth={2.4} />
          </span>
          <span className="font-display text-sm font-bold tracking-[0.18em] text-white">
            STEM<span className="grad-text">FORGE</span>
          </span>
        </a>

        <nav className="ml-6 hidden items-center gap-5 text-[13px] text-dim md:flex">
          <a href="#studio" className="transition hover:text-white">Студия</a>
          <a href="#features" className="transition hover:text-white">Возможности</a>
          <a href="#how" className="transition hover:text-white">Как это работает</a>
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <span
            className="hidden items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[11px] font-semibold tracking-wide text-dim sm:flex"
            title={aiAvailable ? "Нейросеть Demucs подключена" : "DSP-режим работает у всех; ИИ включается ключом REPLICATE_API_TOKEN"}
          >
            {mode === "local" || (mode === "ai" && aiAvailable) ? (
              <Cpu className={`size-3.5 ${mode === "local" ? "text-lime-x" : "text-lilac"}`} />
            ) : (
              <Zap className="size-3.5 text-acid" />
            )}
            {mode === "local" ? "Local AI · бесплатно" : mode === "ai" && aiAvailable ? "Cloud AI · Demucs" : "DSP · предпросмотр"}
            <span
              className={`size-1.5 rounded-full ${
                aiAvailable ? "bg-lime-x shadow-[0_0_8px_#34d399]" : "bg-acid shadow-[0_0_8px_#22d3ee]"
              }`}
            />
          </span>
          <a
            href="#install"
            className="btn-ghost hidden items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-semibold text-ink sm:flex"
          >
            <MonitorDown className="size-3.5 text-acid" />
            На Windows
          </a>
        </div>
      </div>
    </header>
  );
}
