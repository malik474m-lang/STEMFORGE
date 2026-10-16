"use client";

import { useEffect, useRef } from "react";

/**
 * Анимированный спектр: если передан анализатор — рисует живой сигнал,
 * иначе генерирует органичную «музыкальную» волну.
 */
export default function SpectrumCanvas({
  getAnalyser,
  className,
  bars = 72,
  dimmed = false,
}: {
  getAnalyser?: () => AnalyserNode | null;
  className?: string;
  bars?: number;
  dimmed?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let data = new Uint8Array(256);
    const levels = new Float32Array(bars);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.max(1, w * dpr);
      canvas.height = Math.max(1, h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, "#22d3ee");
    grad.addColorStop(0.5, "#a78bfa");
    grad.addColorStop(1, "#f472b6");

    let t = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      t += 0.016;
      ctx.clearRect(0, 0, w, h);

      const analyser = getAnalyser?.() ?? null;
      let hasSignal = false;
      if (analyser) {
        if (data.length !== analyser.frequencyBinCount) {
          data = new Uint8Array(analyser.frequencyBinCount);
        }
        analyser.getByteFrequencyData(data);
        hasSignal = true;
      }

      const bw = w / bars;
      for (let i = 0; i < bars; i++) {
        let target: number;
        if (hasSignal && analyser) {
          const idx = Math.floor(Math.pow(i / bars, 1.6) * data.length * 0.72);
          target = data[idx] / 255;
        } else {
          const s1 = Math.sin(t * 1.7 + i * 0.42) * 0.5 + 0.5;
          const s2 = Math.sin(t * 2.9 + i * 0.16 + 2) * 0.5 + 0.5;
          const s3 = Math.sin(t * 0.6 + i * 0.05) * 0.5 + 0.5;
          target = (s1 * 0.45 + s2 * 0.35 + s3 * 0.2) ** 1.6;
          target *= 0.45 + 0.55 * Math.sin((i / bars) * Math.PI);
        }
        levels[i] += (target - levels[i]) * 0.22;
        const val = levels[i];
        const bh = Math.max(2, val * h * 0.92);
        ctx.globalAlpha = dimmed ? 0.35 : 0.28 + val * 0.7;
        ctx.fillStyle = grad;
        const x = i * bw;
        ctx.beginPath();
        ctx.roundRect(x + bw * 0.18, h - bh, bw * 0.64, bh, 3);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [getAnalyser, bars, dimmed]);

  return <canvas ref={ref} className={className} aria-hidden />;
}
