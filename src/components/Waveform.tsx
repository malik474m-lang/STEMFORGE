"use client";

import { useCallback, useEffect, useRef } from "react";

/** Волноформа дорожки с затемнением «сыгранного» участка. */
export default function Waveform({
  peaks,
  color,
  progress = -1,
  onSeek,
  interactive = false,
  className,
}: {
  peaks: Float32Array | null;
  color: string;
  progress?: number;
  onSeek?: (ratio: number) => void;
  interactive?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;

  const draw = useCallback(() => {
    const canvas = ref.current;
    if (!canvas || !peaks) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w < 2 || h < 2) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const n = peaks.length;
    const mid = h / 2;
    const barW = w / n;
    const prog = progressRef.current;

    for (let i = 0; i < n; i++) {
      const v = peaks[i];
      const bh = Math.max(1.2, v * h * 0.94);
      const played = prog >= 0 && i / n <= prog;
      ctx.globalAlpha = played ? 1 : 0.38;
      ctx.fillStyle = color;
      ctx.fillRect(i * barW, mid - bh / 2, Math.max(1, barW * 0.72), bh);
    }
    ctx.globalAlpha = 1;

    if (prog >= 0) {
      const x = prog * w;
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillRect(x - 0.75, 0, 1.5, h);
    }
  }, [peaks, color]);

  useEffect(() => {
    draw();
  }, [draw, progress]);

  useEffect(() => {
    const ro = new ResizeObserver(draw);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, [draw]);

  return (
    <canvas
      ref={ref}
      className={className}
      style={{ cursor: interactive ? "pointer" : undefined }}
      onPointerDown={(e) => {
        if (!interactive || !onSeek || !ref.current) return;
        const el = ref.current;
        const rect = el.getBoundingClientRect();
        const ratio = (x: number) => Math.min(1, Math.max(0, (x - rect.left) / rect.width));
        onSeek(ratio(e.clientX));
        const move = (ev: PointerEvent) => onSeek(ratio(ev.clientX));
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }}
    />
  );
}
