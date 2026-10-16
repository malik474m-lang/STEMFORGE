import SiteHeader from "@/components/SiteHeader";
import Hero from "@/components/Hero";
import Studio from "@/components/Studio";
import Toast from "@/components/Toast";

export default function Page() {
  return (
    <main className="relative">
      <SiteHeader />
      <Hero />
      <Studio />
      <footer className="border-t border-line py-10">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-4 sm:px-8">
          <p className="font-display text-[11px] font-bold tracking-[0.18em] text-dim uppercase">
            STEM<span className="grad-text">FORGE</span> · студия разделения звука
          </p>
          <p className="max-w-xl text-[11px] leading-relaxed text-dim/70">
            DSP-режим обрабатывает аудио локально на компьютере — файлы не покидают устройство.
            AI-режим передаёт трек нейросети Demucs только при явном включении.
            Авторские права на исходные треки и результаты обработки сохраняются за их правообладателями.
          </p>
        </div>
      </footer>
      <Toast />
    </main>
  );
}
