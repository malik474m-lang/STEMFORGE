"use client";

import { useEffect, useRef, useState } from "react";
import {
  AudioWaveform, Bot, Clock3, Cpu, Hash, Loader2, Mic, Music4, Radio,
  Disc3, Sparkles, Square, Trash2, Users, Wand2,
} from "lucide-react";
import { session, useStudio } from "@/lib/store";
import { useLab } from "@/lib/lab";
import { player } from "@/lib/audio/player";
import { VoiceRecorder } from "@/lib/recorder";
import { renderVoiceFx, trimLeadingSilence, type VoiceFxSpec } from "@/lib/audio/fx";
import { encodeWav } from "@/lib/audio/encode";
import { formatTime } from "@/lib/format";

type RecState = "idle" | "countdown" | "recording" | "processing";

export default function VoicePanel() {
  const stems = useStudio((s) => s.stems);
  const aiAvailable = useStudio((s) => s.aiAvailable);
  const aiJob = useLab((s) => s.aiJob);
  const toast = useStudio((s) => s.setToast);

  // ---- запись ----
  const [recState, setRecState] = useState<RecState>("idle");
  const [count, setCount] = useState(3);
  const [level, setLevel] = useState(0);
  const [recTime, setRecTime] = useState(0);
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const rafRef = useRef<number>(0);
  const savedMixRef = useRef<{ id: string; muted: boolean; solo: boolean }[]>([]);

  const myVoice = stems.find((s) => s.id === "myvoice");

  const startRecording = async () => {
    try {
      const rec = new VoiceRecorder();
      recorderRef.current = rec;
      await rec.start();
    } catch {
      toast("Нет доступа к микрофону — разрешите в браузере");
      return;
    }
    const st = useStudio.getState();
    savedMixRef.current = st.stems.map((s) => ({ id: s.id, muted: s.muted, solo: s.solo }));
    // мониторинг: соло на минус (или без вокала)
    st.setStemsMix((all) => {
      const hasMinus = all.some((s) => s.id === "instrumental");
      return all.map((s) => ({
        ...s,
        solo: hasMinus ? s.id === "instrumental" : false,
        muted: hasMinus ? false : s.id === "vocals" || s.id === "myvoice",
      }));
    });
    st.stopPlayback();
    setCount(3);
    setRecState("countdown");
    let c = 3;
    const iv = setInterval(() => {
      c -= 1;
      if (c <= 0) {
        clearInterval(iv);
        void (async () => {
          await useStudio.getState().togglePlay();
          setRecState("recording");
          setRecTime(0);
        })();
      } else setCount(c);
    }, 800);
  };

  const stopRecording = async (keep: boolean) => {
    const rec = recorderRef.current;
    cancelAnimationFrame(rafRef.current);
    player.pause();
    useStudio.setState({ playing: false });
    // восстановить микс
    const saved = savedMixRef.current;
    useStudio.getState().setStemsMix((all) =>
      all.map((s) => {
        const sv = saved.find((x) => x.id === s.id);
        return sv ? { ...s, muted: sv.muted, solo: sv.solo } : { ...s, solo: false };
      }),
    );
    setRecState("processing");
    try {
      const blob = keep ? await rec?.stop() : null;
      rec?.cancel();
      recorderRef.current = null;
      if (blob && blob.size > 1000) {
        const decoded = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await blob.arrayBuffer());
        const stereo =
          decoded.numberOfChannels === 1
            ? (() => {
                const b = new AudioBuffer({ numberOfChannels: 2, length: decoded.length, sampleRate: decoded.sampleRate });
                const ch = decoded.getChannelData(0);
                b.copyToChannel(ch, 0);
                b.copyToChannel(ch, 1);
                return b;
              })()
            : decoded;
        const trimmed = trimLeadingSilence(stereo);
        useStudio.getState().upsertStem({
          id: "myvoice",
          name: "Мой вокал",
          tag: "REC",
          color: "#fb923c",
          desc: "Дубль, записанный поверх минуса",
          buffer: trimmed,
        });
        toast(`Дубль записан (${formatTime(trimmed.duration)}) — настройте сдвиг при необходимости`);
      }
    } catch (e) {
      toast("Не удалось обработать запись: " + String(e));
    }
    setRecState("idle");
    setLevel(0);
  };

  // метр уровня + таймер записи
  useEffect(() => {
    if (recState !== "recording") return;
    const t0 = performance.now();
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      setLevel(recorderRef.current?.getLevel() ?? 0);
      setRecTime((performance.now() - t0) / 1000);
    };
    loop();
    return () => cancelAnimationFrame(rafRef.current);
  }, [recState]);

  // ---- DSP fx ----
  const [fxTarget, setFxTarget] = useState<string>("myvoice");
  const [fx, setFx] = useState<VoiceFxSpec>({ semitones: 0, formant: 0, robot: false, choir: false, radio: false });
  const [fxBusy, setFxBusy] = useState(false);

  useEffect(() => {
    if (!stems.some((s) => s.id === fxTarget)) {
      setFxTarget(stems.some((s) => s.id === "myvoice") ? "myvoice" : "vocals");
    }
  }, [stems, fxTarget]);

  const FX_PRESETS: { n: string; p: VoiceFxSpec }[] = [
    { n: "Тон +2", p: { semitones: 2, formant: 15, robot: false, choir: false, radio: false } },
    { n: "Тон -2", p: { semitones: -2, formant: -10, robot: false, choir: false, radio: false } },
    { n: "Ярче", p: { semitones: 0, formant: 65, robot: false, choir: false, radio: false } },
    { n: "Глуше", p: { semitones: 0, formant: -55, robot: false, choir: false, radio: false } },
    { n: "Робот-радио", p: { semitones: 0, formant: -25, robot: true, choir: false, radio: true } },
    { n: "Хор", p: { semitones: 0, formant: 10, robot: false, choir: true, radio: false } },
  ];

  const audition = (targetId: string) => {
    const st = useStudio.getState();
    st.setStemsMix((all) => all.map((s) => ({ ...s, solo: s.id === targetId })));
    st.seek(0);
    if (!st.playing) void st.togglePlay();
  };

  const applyFx = async () => {
    const meta = session.stems.get(fxTarget);
    if (!meta || fxBusy) return;
    setFxBusy(true);
    toast("Рендер эффектов…");
    try {
      const out = await renderVoiceFx(meta.dry, fx);
      useStudio.getState().replaceStemBuffer(fxTarget, out, false);
      toast("Эффекты применены — звучит сейчас соло-дорожка");
      audition(fxTarget);
    } catch (e) {
      toast(String(e));
    }
    setFxBusy(false);
  };

  const applyPreset = async (p: VoiceFxSpec) => {
    setFx(p);
    const meta = session.stems.get(fxTarget);
    if (!meta || fxBusy) return;
    setFxBusy(true);
    try {
      const out = await renderVoiceFx(meta.dry, p);
      useStudio.getState().replaceStemBuffer(fxTarget, out, false);
      toast("Пресет применён — звучит соло-дорожка");
      audition(fxTarget);
    } catch (e) {
      toast(String(e));
    }
    setFxBusy(false);
  };

  const resetFx = () => {
    const meta = session.stems.get(fxTarget);
    if (!meta) return;
    useStudio.getState().replaceStemBuffer(fxTarget, meta.dry, false);
    toast("Эффекты сброшены к исходному сигналу");
  };

  // ---- AI голос ----
  const [aiSource, setAiSource] = useState("vocals");
  const [rvcModel, setRvcModel] = useState("Squidward");
  const [customUrl, setCustomUrl] = useState("");
  const [pitchChange, setPitchChange] = useState("no-change");
  const [pitchAll, setPitchAll] = useState(0);
  const [indexRate, setIndexRate] = useState(0.5);

  // ---- AI песня ----
  const [tags, setTags] = useState("русский поп, эмоциональный вокал, современная аранжировка");
  const [seconds, setSeconds] = useState(120);
  const [instrumental, setInstrumental] = useState(false);

  const voiceTargets = stems.filter((s) => !s.approx || s.id === "vocals");

  // ---- мужской / женский дуэт через MVSep (бесплатная очередь) ----
  const [genderAvailable, setGenderAvailable] = useState(false);
  const [genderBusy, setGenderBusy] = useState(false);
  const [genderLabel, setGenderLabel] = useState("");
  useEffect(() => {
    fetch("/api/mvsep/gender").then((r) => r.json()).then((d) => setGenderAvailable(Boolean(d.available))).catch(() => setGenderAvailable(false));
  }, []);

  const splitGenders = async () => {
    const vocals = session.stems.get("vocals");
    if (!vocals || genderBusy) {
      toast("Сначала выполните Local AI-разделение и получите чистый вокал");
      return;
    }
    setGenderBusy(true);
    setGenderLabel("Отправка чистого вокала в MVSep…");
    try {
      const form = new FormData();
      form.append("file", new File([encodeWav(vocals.buffer, 16)], "clean-vocals.wav", { type: "audio/wav" }));
      const res = await fetch("/api/mvsep/gender", { method: "POST", body: form });
      const start = await res.json();
      if (!res.ok || !start.hash) throw new Error(start.error || JSON.stringify(start.detail) || "MVSep не принял задачу");
      let files: Record<string, string> | null = null;
      for (let i = 0; i < 1200; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const sr = await fetch(`/api/mvsep/gender/status?hash=${encodeURIComponent(start.hash)}`);
        const status = await sr.json();
        setGenderLabel("MVSep разделяет мужской и женский вокал…");
        if (status.status === "done") { files = status.files; break; }
        if (status.status === "failed") throw new Error("MVSep не смог разделить вокал");
      }
      if (!files || Object.keys(files).length === 0) throw new Error("MVSep завершил задачу, но не вернул распознаваемые стемы");
      for (const [kind, url] of Object.entries(files)) {
        const encoded = btoa(url).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        const audio = await fetch(`/api/mvsep/file?u=${encodeURIComponent(encoded)}`);
        const decoded = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(await audio.arrayBuffer());
        useStudio.getState().upsertStem({
          id: `vocal-${kind}`,
          name: kind === "female" ? "Женский вокал" : "Мужской вокал",
          tag: kind === "female" ? "F·VOX" : "M·VOX",
          color: kind === "female" ? "#f472b6" : "#60a5fa",
          desc: "Отдельный голос из чистого вокального стема (MVSep Male/Female)",
          buffer: decoded,
        });
      }
      toast("Мужской и женский вокал добавлены в микшер");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    }
    setGenderBusy(false);
    setGenderLabel("");
  };

  const locked = !aiAvailable;

  return (
    <div className="space-y-4">
      {/* ===== запись своего голоса ===== */}
      <div className="glass noise relative overflow-hidden rounded-3xl p-5">
        <div className="flex items-center gap-2">
          <Mic className="size-4 text-amber-x" />
          <h3 className="font-display text-[13px] font-bold tracking-[0.16em] text-white uppercase">
            Свой голос на минус
          </h3>
        </div>

        {recState === "idle" && !myVoice && (
          <p className="mt-2.5 text-[12px] leading-relaxed text-dim">
            Наденьте наушники, нажмите запись и спойте поверх инструментала.
            Дубль появится дорожкой в микшере — её можно улучшить, запитчить и экспортировать.
          </p>
        )}

        <div className="mt-4">
          {recState === "idle" && (
            <button onClick={() => void startRecording()} className="btn-acid flex w-full items-center justify-center gap-2.5 rounded-2xl px-5 py-4 font-display text-[12px] font-bold tracking-[0.1em] uppercase">
              <Mic className="size-4.5" strokeWidth={2.4} />
              {myVoice ? "Перезаписать дубль" : "Записать голос"}
            </button>
          )}

          {recState === "countdown" && (
            <div className="flex items-center justify-center gap-4 rounded-2xl border border-line bg-void/50 py-6">
              <Clock3 className="size-5 animate-spin text-acid" />
              <span className="font-display text-4xl font-extrabold text-white tabular-nums">{count}</span>
              <span className="text-[12px] text-dim">приготовьтесь…</span>
            </div>
          )}

          {recState === "recording" && (
            <div className="rounded-2xl border border-rose/40 bg-rose/5 p-4">
              <div className="flex items-center gap-3">
                <span className="rec-dot text-[11px] font-bold tracking-widest text-rose uppercase">REC</span>
                <span className="font-display text-xl font-bold text-white tabular-nums">{formatTime(recTime)}</span>
                <div className="ml-auto h-2 w-28 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-lime-x via-amber-x to-rose transition-[width] duration-75"
                    style={{ width: `${Math.min(100, level * 220)}%` }}
                  />
                </div>
              </div>
              <div className="mt-3.5 flex gap-2">
                <button onClick={() => void stopRecording(true)} className="btn-acid flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-[12px] font-bold">
                  <Square className="size-4" fill="currentColor" /> Готово
                </button>
                <button onClick={() => void stopRecording(false)} className="btn-ghost rounded-xl px-4 py-3 text-[12px] font-semibold text-dim hover:text-rose">
                  Отмена
                </button>
              </div>
            </div>
          )}

          {recState === "processing" && (
            <div className="flex items-center justify-center gap-3 rounded-2xl border border-line bg-void/50 py-6 text-[12px] font-semibold text-dim">
              <Loader2 className="size-4 animate-spin text-acid" /> Обработка записи…
            </div>
          )}
        </div>

        {myVoice && recState === "idle" && (
          <div className="mt-3 space-y-2.5 rounded-2xl border border-line bg-void/40 p-3.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-[12px] font-bold text-ink">
                <span className="size-2 rounded-full bg-[#fb923c] shadow-[0_0_8px_#fb923c]" />
                Дубль в микшере
              </span>
              <button
                onClick={() => useStudio.getState().removeStem("myvoice")}
                className="btn-ghost flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] text-dim hover:text-rose"
              >
                <Trash2 className="size-3.5" /> Удалить
              </button>
            </div>
            <label className="block">
              <span className="text-[10px] font-bold tracking-wider text-dim uppercase">
                Сдвиг дубля: {((session.stems.get("myvoice")?.offset ?? 0) * 1000).toFixed(0)} мс
              </span>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.005}
                defaultValue={0}
                onChange={(e) => useStudio.getState().setStemOffset("myvoice", Number(e.target.value))}
                className="vx mt-1.5 w-full"
                title="Компенсация задержки записи"
              />
            </label>
          </div>
        )}
      </div>

      {/* ===== DSP эффекты ===== */}
      <div className="glass noise relative overflow-hidden rounded-3xl p-5">
        <div className="flex items-center gap-2">
          <Wand2 className="size-4 text-lilac" />
          <h3 className="font-display text-[13px] font-bold tracking-[0.16em] text-white uppercase">
            Эффекты голоса
          </h3>
        </div>

        <label className="mt-3.5 block">
          <span className="text-[10px] font-bold tracking-[0.18em] text-dim uppercase">Дорожка</span>
          <select
            value={fxTarget}
            onChange={(e) => setFxTarget(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-line bg-void/60 px-3 py-2.5 text-[12px] font-semibold text-ink outline-none"
          >
            {stems.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>

        {/* пресеты мгновенного эффекта */}
        <div className="mt-3.5 flex flex-wrap gap-1.5">
          {FX_PRESETS.map((pre) => (
            <button
              key={pre.n}
              onClick={() => void applyPreset(pre.p)}
              disabled={fxBusy || !session.stems.has(fxTarget)}
              className="rounded-full border border-lilac/40 bg-lilac/10 px-3 py-1.5 text-[11px] font-bold text-lilac transition hover:bg-lilac/20 disabled:opacity-40"
              title={`Применить и сразу прослушать: ${pre.n}`}
            >
              {pre.n}
            </button>
          ))}
        </div>

        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="flex justify-between text-[11px] font-semibold text-dim">
              <span>Высота тона</span>
              <span className="text-acid tabular-nums">{fx.semitones > 0 ? `+${fx.semitones}` : fx.semitones} полутона</span>
            </span>
            <input type="range" min={-6} max={6} step={0.5} value={fx.semitones} onChange={(e) => setFx({ ...fx, semitones: Number(e.target.value) })} className="vx mt-1.5 w-full" />
          </label>
          <label className="block">
            <span className="flex justify-between text-[11px] font-semibold text-dim">
              <span>Форманты (характер)</span>
              <span className="text-acid tabular-nums">{fx.formant > 0 ? `+${fx.formant}` : fx.formant}%</span>
            </span>
            <input type="range" min={-100} max={100} step={5} value={fx.formant} onChange={(e) => setFx({ ...fx, formant: Number(e.target.value) })} className="vx mt-1.5 w-full" />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {[
              { key: "robot" as const, label: "Робот", icon: Bot },
              { key: "choir" as const, label: "Хор", icon: Users },
              { key: "radio" as const, label: "Радио", icon: Radio },
            ].map((p) => (
              <button
                key={p.key}
                onClick={() => setFx({ ...fx, [p.key]: !fx[p.key] })}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[11px] font-bold transition ${
                  fx[p.key]
                    ? "bg-lilac/20 text-lilac shadow-[inset_0_0_0_1px_rgba(167,139,250,0.6)]"
                    : "btn-ghost text-dim hover:text-ink"
                }`}
              >
                <p.icon className="size-3.5" />
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={() => void applyFx()} disabled={fxBusy} className="btn-acid flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-[12px] font-bold disabled:opacity-50">
            {fxBusy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Применить
          </button>
          <button onClick={resetFx} disabled={fxBusy} className="btn-ghost rounded-xl px-4 py-3 text-[12px] font-semibold text-dim hover:text-ink">
            Сброс
          </button>
        </div>
        <p className="mt-2 text-[10.5px] leading-relaxed text-dim/70">
          Эффекты не ломают оригинал: рендер идёт с сухой копии дорожки, «Сброс» возвращает её.
        </p>
      </div>

      {/* ===== мужской / женский вокал ===== */}
      <div className="glass noise relative overflow-hidden rounded-3xl p-5">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-rose" />
          <h3 className="font-display text-[13px] font-bold tracking-[0.16em] text-white uppercase">
            Мужской / женский вокал
          </h3>
          <span className="ml-auto rounded-full bg-rose/15 px-2 py-0.5 text-[9px] font-bold tracking-widest text-rose uppercase">дуэт</span>
        </div>
        <p className="mt-2.5 text-[12px] leading-relaxed text-dim">
          Второй этап над уже очищенной дорожкой «Чистый вокал». MVSep Male/Female разделяет два голоса, включая пересекающиеся партии. Для сольной песни запускать не нужно.
        </p>
        {!genderAvailable ? (
          <div className="mt-3 rounded-xl border border-dashed border-line p-3 text-[11px] leading-relaxed text-dim">
            Нужен бесплатный токен MVSep: зарегистрируйтесь на mvsep.com, скопируйте ключ со страницы
            <span className="text-acid"> mvsep.com/user-api</span> и добавьте в <code className="text-acid">.env</code> строку
            <code className="mt-1 block rounded bg-void p-1.5 text-[10px]">MVSEP_API_TOKEN=ваш_ключ</code>
          </div>
        ) : (
          <button
            onClick={() => void splitGenders()}
            disabled={genderBusy || !session.stems.has("vocals")}
            className="btn-acid mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-[12px] font-bold disabled:opacity-40"
          >
            {genderBusy ? <Loader2 className="size-4 animate-spin" /> : <Users className="size-4" />}
            {genderBusy ? genderLabel || "Разделение…" : "Разделить голоса дуэта"}
          </button>
        )}
        <p className="mt-2 text-[10.5px] leading-relaxed text-dim/70">
          Качество зависит от того, насколько одновременно и близко по высоте поют исполнители. Это отдельная ML-модель, не частотный фильтр пола голоса.
        </p>
      </div>

      {/* ===== AI голос исполнителя ===== */}
      <div className={`glass noise relative overflow-hidden rounded-3xl p-5 ${locked ? "opacity-90" : ""}`}>
        <div className="flex items-center gap-2">
          <Cpu className="size-4 text-rose" />
          <h3 className="font-display text-[13px] font-bold tracking-[0.16em] text-white uppercase">
            Голос исполнителя · RVC
          </h3>
          {!locked && <span className="ml-auto rounded-full bg-lilac/15 px-2 py-0.5 text-[9px] font-bold tracking-widest text-lilac uppercase">AI</span>}
        </div>

        {locked ? (
          <div className="mt-3 rounded-xl border border-dashed border-line px-4 py-4">
            <p className="text-[12px] leading-relaxed text-dim">
              Нейросетевая конверсия тембра выключена. Добавьте{" "}
              <code className="rounded bg-void px-1.5 py-0.5 font-mono text-[10.5px] text-acid">REPLICATE_API_TOKEN</code>{" "}
              в переменные окружения — станут доступны RVC-клонирование голоса, Whisper-транскрибация и генерация песен.
            </p>
          </div>
        ) : (
          <>
            <label className="mt-3 block">
              <span className="text-[10px] font-bold tracking-[0.18em] text-dim uppercase">Исходный вокал</span>
              <select value={aiSource} onChange={(e) => setAiSource(e.target.value)} className="mt-1.5 w-full rounded-xl border border-line bg-void/60 px-3 py-2.5 text-[12px] font-semibold text-ink outline-none">
                {voiceTargets.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
            <label className="mt-3 block">
              <span className="text-[10px] font-bold tracking-[0.18em] text-dim uppercase">Голос (RVC-модель)</span>
              <input value={rvcModel} onChange={(e) => setRvcModel(e.target.value)} placeholder="Squidward" className="mt-1.5 w-full rounded-xl border border-line bg-void/60 px-3 py-2.5 text-[12px] font-semibold text-ink outline-none placeholder:text-dim/40" />
            </label>
            <label className="mt-3 block">
              <span className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.18em] text-dim uppercase">
                <Hash className="size-3" /> свой URL модели (.zip, voice-models.com)
              </span>
              <input value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder="https://huggingface.co/…/model.zip" className="mt-1.5 w-full rounded-xl border border-line bg-void/60 px-3 py-2.5 font-mono text-[11px] text-ink outline-none placeholder:text-dim/40" />
            </label>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <label className="block">
                <span className="text-[10px] font-bold tracking-[0.18em] text-dim uppercase">Питч</span>
                <select value={pitchChange} onChange={(e) => setPitchChange(e.target.value)} className="mt-1.5 w-full rounded-xl border border-line bg-void/60 px-2 py-2.5 text-[11px] font-semibold text-ink outline-none">
                  <option value="no-change">без смены</option>
                  <option value="male-to-female">муж → жен</option>
                  <option value="female-to-male">жен → муж</option>
                </select>
              </label>
              <label className="block">
                <span className="flex justify-between text-[10px] font-bold tracking-[0.18em] text-dim uppercase">
                  Сдвиг <span className="text-acid">{pitchAll > 0 ? `+${pitchAll}` : pitchAll}</span>
                </span>
                <input type="range" min={-12} max={12} step={1} value={pitchAll} onChange={(e) => setPitchAll(Number(e.target.value))} className="vx mt-2.5 w-full" />
              </label>
            </div>
            <label className="mt-3 block">
              <span className="flex justify-between text-[10px] font-bold tracking-[0.18em] text-dim uppercase">
                Сходство индекса <span className="text-acid tabular-nums">{indexRate.toFixed(2)}</span>
              </span>
              <input type="range" min={0} max={1} step={0.05} value={indexRate} onChange={(e) => setIndexRate(Number(e.target.value))} className="vx mt-2 w-full" />
            </label>
            <button
              onClick={() =>
                void useLab.getState().convertVoice({ sourceStemId: aiSource, rvcModel, customUrl, pitchChange, indexRate, pitchAll })
              }
              disabled={aiJob.kind !== null || !stems.some((s) => s.id === aiSource)}
              className="btn-acid mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-[12px] font-bold disabled:opacity-50"
            >
              {aiJob.kind === "voice" ? <Loader2 className="size-4 animate-spin" /> : <AudioWaveform className="size-4" />}
              Конвертировать голос
            </button>
            <p className="mt-2 text-[10.5px] leading-relaxed text-dim/70">
              Используйте только голоса и модели, на которые у вас есть права или согласие их владельцев.
              Результат любой AI-конверсии проверяйте на слух.
            </p>
          </>
        )}
      </div>

      {/* ===== AI песня по тексту ===== */}
      <div className={`glass noise relative overflow-hidden rounded-3xl p-5 ${locked ? "opacity-90" : ""}`}>
        <div className="flex items-center gap-2">
          <Music4 className="size-4 text-cyan-300" />
          <h3 className="font-display text-[13px] font-bold tracking-[0.16em] text-white uppercase">
            Песня по тексту · ACE-Step
          </h3>
        </div>
        {locked ? (
          <p className="mt-3 rounded-xl border border-dashed border-line px-4 py-4 text-[12px] leading-relaxed text-dim">
            Генерация пения из текста вкладки «Текст и караоке» — доступна после подключения{" "}
            <code className="rounded bg-void px-1.5 py-0.5 font-mono text-[10.5px] text-acid">REPLICATE_API_TOKEN</code>.
          </p>
        ) : (
          <>
            <label className="mt-3 block">
              <span className="text-[10px] font-bold tracking-[0.18em] text-dim uppercase">Стиль / жанр</span>
              <input value={tags} onChange={(e) => setTags(e.target.value)} className="mt-1.5 w-full rounded-xl border border-line bg-void/60 px-3 py-2.5 text-[12px] font-semibold text-ink outline-none" />
            </label>
            <label className="mt-3 block">
              <span className="flex justify-between text-[10px] font-bold tracking-[0.18em] text-dim uppercase">
                Длительность <span className="text-acid tabular-nums">{seconds} сек</span>
              </span>
              <input type="range" min={60} max={190} step={10} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} className="vx mt-2 w-full" />
            </label>
            <label className="mt-3 flex items-center gap-2.5 text-[12px] font-semibold text-dim">
              <input type="checkbox" checked={instrumental} onChange={(e) => setInstrumental(e.target.checked)} className="size-4 accent-cyan-400" />
              Только инструментал (без вокала)
            </label>
            <button
              onClick={() => void useLab.getState().generateSong({ tags, seconds, instrumental })}
              disabled={aiJob.kind !== null}
              className="btn-acid mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-[12px] font-bold disabled:opacity-50"
            >
              {aiJob.kind === "song" ? <Loader2 className="size-4 animate-spin" /> : <Disc3 className="size-4" />}
              Сгенерировать песню
            </button>
          </>
        )}
      </div>

      {/* общий статус AI-задач */}
      {aiJob.kind && aiJob.kind !== "transcribe" && (
        <div className="glass flex items-center gap-3 rounded-2xl p-4">
          <Loader2 className="size-4 animate-spin text-lilac" />
          <span className="text-[12px] font-semibold text-ink">{aiJob.label}</span>
          <div className="ml-auto h-1 w-24 overflow-hidden rounded-full bg-white/8">
            <div className="h-full rounded-full bg-gradient-to-r from-acid to-lilac transition-[width]" style={{ width: `${aiJob.pct * 100}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
