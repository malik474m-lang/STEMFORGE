"use client";

import { motion } from "framer-motion";
import {
  ArrowDown,
  AudioLines,
  Cpu,
  FileAudio,
  FolderDown,
  MonitorDown,
  SlidersHorizontal,
  Sparkles,
  Split,
  Zap,
} from "lucide-react";
import SpectrumCanvas from "./SpectrumCanvas";

const CHIPS = [
  { label: "Вокал", color: "#22d3ee", cls: "left-[6%] top-[16%]" },
  { label: "Инструментал", color: "#34d399", cls: "right-[4%] top-[10%]" },
  { label: "Бэк-вокал", color: "#f472b6", cls: "left-[2%] bottom-[24%]" },
  { label: "Бас", color: "#fbbf24", cls: "right-[8%] bottom-[30%]" },
  { label: "Ударные", color: "#fb7185", cls: "left-[38%] top-[4%]" },
];

const FEATURES = [
  {
    icon: Split,
    title: "До 6 дорожек",
    text: "Вокал, инструментал, бэк-вокал, бас, ударные и гармония — из одного MP3/WAV/FLAC файла.",
    color: "#22d3ee",
  },
  {
    icon: Sparkles,
    title: "Улучшение звука",
    text: "Эксайтер, «воздух» 8 кГц, glue-компрессия и лимитер применяются к каждой дорожке перед экспортом.",
    color: "#a78bfa",
  },
  {
    icon: SlidersHorizontal,
    title: "Живой микшер",
    text: "Mute/Solo, громкости, мастер-EQ и A/B-сравнение с оригиналом — всё звучит в реальном времени.",
    color: "#34d399",
  },
  {
    icon: FolderDown,
    title: "Экспорт и история",
    text: "WAV 16/24/32f, MP3 до 320 кбит/с, ZIP-архивом или по одной дорожке. Проекты хранятся в базе.",
    color: "#f472b6",
  },
];

const MARQUEE = [
  "ВОКАЛ", "ИНСТРУМЕНТАЛ", "БЭК-ВОКАЛ", "БАС", "УДАРНЫЕ", "ГАРМОНИЯ",
  "WAV 24-БИТ", "MP3 320", "НОРМАЛИЗАЦИЯ", "ЭКСАЙТЕР", "A/B-СРАВНЕНИЕ",
];

const fade = {
  hidden: { opacity: 0, y: 26 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.08 * i, duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export default function Hero() {
  return (
    <section id="top" className="noise relative overflow-hidden pt-14">
      {/* фоновые свечения */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(99,102,241,0.22),transparent)] blur-2xl" />
      <div className="pointer-events-none absolute top-40 -left-40 h-[420px] w-[420px] rounded-full bg-[radial-gradient(closest-side,rgba(34,211,238,0.14),transparent)] blur-2xl" />
      <div className="pointer-events-none absolute top-64 -right-32 h-[420px] w-[420px] rounded-full bg-[radial-gradient(closest-side,rgba(244,114,182,0.12),transparent)] blur-2xl" />

      <div className="relative mx-auto grid max-w-[1440px] gap-10 px-4 pt-14 pb-10 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-6 lg:pt-20">
        <div>
          <motion.div variants={fade} initial="hidden" animate="show" custom={0}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-panel/60 px-4 py-1.5 text-[11px] font-semibold tracking-[0.2em] text-dim uppercase">
            <AudioLines className="size-3.5 text-acid" />
            Студия разделения звука · бесплатно
          </motion.div>

          <motion.h1 variants={fade} initial="hidden" animate="show" custom={1}
            className="font-display text-[clamp(2.2rem,6.2vw,4.9rem)] leading-[1.02] font-extrabold tracking-tight text-white">
            Раздели трек
            <br />
            <span className="text-stroke">на отдельные</span>
            <br />
            <span className="grad-text drop-shadow-[0_0_30px_rgba(167,139,250,0.35)]">дорожки</span>
          </motion.h1>

          <motion.p variants={fade} initial="hidden" animate="show" custom={2}
            className="mt-6 max-w-xl text-[15px] leading-relaxed text-dim sm:text-base">
            Загрузите MP3 — получите акапеллу, минус, бэк-вокал, бас и ударные.
            Прослушайте и подмешайте в живом микшере, улучшите обработкой и сохраните
            каждую дорожку в WAV или MP3. Всё прямо в браузере, без установки программ.
          </motion.p>

          <motion.div variants={fade} initial="hidden" animate="show" custom={3}
            className="mt-9 flex flex-wrap items-center gap-4">
            <a href="#studio" className="btn-acid flex items-center gap-2.5 rounded-full px-8 py-4 font-display text-[13px] font-bold tracking-[0.14em] uppercase">
              <Zap className="size-4" strokeWidth={2.6} />
              Открыть студию
            </a>
            <a href="#how" className="btn-ghost flex items-center gap-2 rounded-full px-6 py-4 text-[13px] font-semibold text-ink">
              Как это работает
              <ArrowDown className="size-4 text-acid" />
            </a>
          </motion.div>

          <motion.div variants={fade} initial="hidden" animate="show" custom={4}
            className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-[12px] text-dim">
            <span><b className="font-display text-lg text-white">6</b> дорожек из трека</span>
            <span><b className="font-display text-lg text-white">WAV/MP3</b> экспорт</span>
            <span><b className="font-display text-lg text-white">0</b> установок и загрузок ПО</span>
          </motion.div>
        </div>

        {/* декоративная консоль */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="relative hidden lg:block"
        >
          <div className="glass noise relative h-[440px] overflow-hidden rounded-3xl">
            <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between border-b border-line px-5 py-3">
              <span className="text-[10px] font-semibold tracking-[0.22em] text-dim uppercase rec-dot">Master bus</span>
              <span className="text-[10px] font-semibold tracking-[0.22em] text-acid uppercase">44.1 кГц · стерео</span>
            </div>
            <SpectrumCanvas className="absolute inset-x-0 bottom-0 h-[86%] w-full" bars={84} />
            {CHIPS.map((c, i) => (
              <span
                key={c.label}
                className={`animate-float absolute ${c.cls} rounded-full border px-3.5 py-1.5 text-[11px] font-bold tracking-wide backdrop-blur-md`}
                style={{
                  color: c.color,
                  borderColor: `${c.color}55`,
                  background: `${c.color}14`,
                  boxShadow: `0 0 24px ${c.color}33`,
                  animationDelay: `${i * 0.85}s`,
                }}
              >
                {c.label}
              </span>
            ))}
            <div className="animate-scan absolute top-0 left-0 h-full w-[8%] bg-gradient-to-r from-transparent via-acid/30 to-transparent" />
          </div>
        </motion.div>
      </div>

      {/* бегущая строка */}
      <div className="relative border-y border-line bg-panel/40 py-3.5">
        <div className="flex w-max animate-marquee gap-10 whitespace-nowrap">
          {[...MARQUEE, ...MARQUEE].map((w, i) => (
            <span key={i} className="flex items-center gap-10 font-display text-[12px] font-bold tracking-[0.28em] text-dim/70">
              {w}
              <span className="size-1 rounded-full bg-acid/60" />
            </span>
          ))}
        </div>
      </div>

      {/* возможности */}
      <div id="features" className="relative mx-auto max-w-[1440px] px-4 py-16 sm:px-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ delay: i * 0.08, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="glass group relative overflow-hidden rounded-2xl p-6"
            >
              <div
                className="pointer-events-none absolute -top-16 -right-16 size-40 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-30"
                style={{ background: f.color }}
              />
              <f.icon className="size-6" style={{ color: f.color }} strokeWidth={2.2} />
              <h3 className="mt-4 font-display text-[15px] font-bold tracking-wide text-white">{f.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-dim">{f.text}</p>
            </motion.div>
          ))}
        </div>

        {/* установка на Windows */}
        <motion.div
          id="install"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="glass mt-4 flex flex-col items-start gap-4 rounded-2xl p-6 sm:flex-row sm:items-center"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-acid to-lilac text-void">
            <MonitorDown className="size-5" strokeWidth={2.4} />
          </span>
          <div className="flex-1">
            <h3 className="font-display text-[15px] font-bold tracking-wide text-white">Программа для Windows — без установки</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-dim">
              Откройте студию в Chrome или Edge и выберите <b className="text-ink">«Установить приложение»</b> в меню браузера —
              STEMFORGE появится в меню «Пуск» как отдельное окно-программа. Аудиофайлы обрабатываются локально и не покидают компьютер.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[12px] font-semibold text-dim">
            <FileAudio className="size-4 text-acid" /> MP3 · WAV · OGG · FLAC · M4A
          </div>
        </motion.div>
      </div>

      {/* как это работает */}
      <div id="how" className="relative mx-auto max-w-[1440px] px-4 pb-20 sm:px-8">
        <div className="grid gap-4 lg:grid-cols-3">
          {[
            { n: "01", icon: FileAudio, t: "Загрузите трек", d: "Перетащите MP3 в студию. DSP-режим разделяет моментально на вашем компьютере, AI-режим — нейросетью Demucs на сервере." },
            { n: "02", icon: Cpu, t: "Дорожки и микшер", d: "Слушайте каждую дорожку соло, сводите громкости, добавляйте улучшение: эксайтер, воздух, компрессия, лимитер." },
            { n: "03", icon: FolderDown, t: "Сохраните результат", d: "Скачайте дорожки по одной или ZIP-архивом в WAV 24-бит или MP3 320 с нормализацией под −1 дБ." },
          ].map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 26 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: i * 0.1, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="hairline relative overflow-hidden rounded-2xl bg-panel/50 p-6"
            >
              <span className="font-display text-[44px] leading-none font-extrabold text-white/6">{s.n}</span>
              <s.icon className="absolute top-6 right-6 size-5 text-acid/70" strokeWidth={2.2} />
              <h3 className="mt-2 font-display text-[15px] font-bold text-white">{s.t}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-dim">{s.d}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
