import { buildEnhanceChain } from "./graph";
import type { StemAudio } from "../session";

export interface StemMixState {
  volume: number;
  muted: boolean;
  solo: boolean;
  enhance: boolean;
}

interface TrackNodes {
  gain: GainNode;
  sources: AudioBufferSourceNode[];
}

/**
 * Живой плеер: одновременно играет все дорожки через индивидуальные GainNode,
 * мастер-цепочка EQ → компрессор → анализатор → выход.
 * Дорожки могут иметь сдвиг offset (сек) относительно начала трека.
 */
export class LivePlayer {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private eqLow!: BiquadFilterNode;
  private eqMid!: BiquadFilterNode;
  private eqHigh!: BiquadFilterNode;
  private limiter!: DynamicsCompressorNode;
  analyser: AnalyserNode | null = null;

  private buffers = new Map<string, { buffer: AudioBuffer; offset: number }>();
  private originalBuffer: AudioBuffer | null = null;
  enhanceFlags = new Map<string, boolean>();
  private mix = new Map<string, StemMixState>();
  private tracks = new Map<string, TrackNodes>();
  private originalGain: GainNode | null = null;
  private originalSources: AudioBufferSourceNode[] = [];
  private originalActive = false;

  private startedAt = 0;
  private offset = 0;
  private _playing = false;
  private duration = 0;
  private endTimer: ReturnType<typeof setTimeout> | null = null;
  onEnded: (() => void) | null = null;

  private ensureCtx() {
    if (this.ctx) return;
    this.ctx = new AudioContext({ latencyHint: "playback" });
    this.eqLow = this.ctx.createBiquadFilter();
    this.eqLow.type = "lowshelf";
    this.eqLow.frequency.value = 180;
    this.eqMid = this.ctx.createBiquadFilter();
    this.eqMid.type = "peaking";
    this.eqMid.frequency.value = 1400;
    this.eqMid.Q.value = 0.8;
    this.eqHigh = this.ctx.createBiquadFilter();
    this.eqHigh.type = "highshelf";
    this.eqHigh.frequency.value = 7200;
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -4;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.12;
    this.master = this.ctx.createGain();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.82;
    this.eqLow.connect(this.eqMid);
    this.eqMid.connect(this.eqHigh);
    this.eqHigh.connect(this.limiter);
    this.limiter.connect(this.master);
    this.master.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
  }

  setBuffers(stems: Map<string, StemAudio>, original: AudioBuffer | null) {
    const wasPlaying = this._playing;
    const t = this.getTime();
    this.stopSources();
    this.buffers = new Map([...stems.entries()].map(([id, s]) => [id, { buffer: s.buffer, offset: s.offset || 0 }]));
    this.originalBuffer = original;
    let dur = original?.duration ?? 0;
    for (const s of stems.values()) dur = Math.max(dur, (s.offset || 0) + s.buffer.duration);
    this.duration = dur;
    if (wasPlaying) {
      this.startFrom(Math.min(t, Math.max(0, this.duration - 0.02)));
    } else {
      this._playing = false;
      this.offset = Math.min(this.offset, this.duration);
    }
  }

  get playing() {
    return this._playing;
  }

  getDuration() {
    return this.duration;
  }

  getTime(): number {
    if (!this.ctx || !this._playing) return Math.min(this.offset, this.duration);
    return Math.min(this.ctx.currentTime - this.startedAt + this.offset, this.duration);
  }

  setEq(low: number, mid: number, high: number) {
    this.ensureCtx();
    const t = this.ctx!.currentTime;
    this.eqLow.gain.setTargetAtTime(low, t, 0.05);
    this.eqMid.gain.setTargetAtTime(mid, t, 0.05);
    this.eqHigh.gain.setTargetAtTime(high, t, 0.05);
  }

  setMasterVolume(v: number) {
    this.ensureCtx();
    this.master.gain.setTargetAtTime(v, this.ctx!.currentTime, 0.03);
  }

  applyMix(mix: Map<string, StemMixState>, originalActive: boolean) {
    this.mix = new Map(mix);
    const needRebuild = this._playing && this.rebuildNeeded(originalActive);
    this.originalActive = originalActive;

    if (needRebuild) {
      const t = this.getTime();
      this.startFrom(t);
      return;
    }
    if (!this.ctx) return;
    const anySolo = [...this.mix.values()].some((m) => m.solo);
    for (const [id, track] of this.tracks) {
      const m = this.mix.get(id);
      let v = 0;
      if (!originalActive && m) {
        v = m.muted ? 0 : anySolo ? (m.solo ? m.volume : 0) : m.volume;
      }
      track.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
    }
    if (this.originalGain) {
      this.originalGain.gain.setTargetAtTime(originalActive ? 1 : 0, this.ctx.currentTime, 0.03);
    }
  }

  private rebuildNeeded(originalActive: boolean): boolean {
    if (originalActive !== this.originalActive) return true;
    for (const [id, flag] of this.enhanceFlags) {
      const m = this.mix.get(id);
      if (m && m.enhance !== flag) return true;
    }
    return false;
  }

  private stopSources() {
    for (const track of this.tracks.values()) {
      for (const s of track.sources) {
        try {
          s.onended = null;
          s.stop();
        } catch {
          /* already stopped */
        }
      }
    }
    for (const s of this.originalSources) {
      try {
        s.onended = null;
        s.stop();
      } catch {
        /* noop */
      }
    }
    this.originalSources = [];
    this.tracks.clear();
    if (this.endTimer) {
      clearTimeout(this.endTimer);
      this.endTimer = null;
    }
  }

  private startFrom(t: number) {
    this.ensureCtx();
    this.stopSources();
    const ctx = this.ctx!;
    const safe = Math.max(0, Math.min(t, this.duration - 0.02));
    const anySolo = [...this.mix.values()].some((x) => x.solo);

    for (const [id, { buffer, offset }] of this.buffers) {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      const m = this.mix.get(id);
      let v = 0;
      if (!this.originalActive && m) {
        v = m.muted ? 0 : anySolo ? (m.solo ? m.volume : 0) : m.volume;
      }
      gain.gain.value = v;
      if (m?.enhance) {
        const enh = buildEnhanceChain(ctx);
        src.connect(enh.input);
        enh.output.connect(gain);
      } else {
        src.connect(gain);
      }
      gain.connect(this.eqLow);

      // сдвиг дорожки: offset > 0 — источник начинает позже, < 0 — играем с позиции -offset
      const srcOffset = Math.max(0, safe - offset);
      const when = offset > safe ? ctx.currentTime + (offset - safe) : 0;
      if (srcOffset < buffer.duration) {
        src.start(when, srcOffset);
      }
      this.tracks.set(id, { gain, sources: [src] });
      this.enhanceFlags.set(id, Boolean(m?.enhance));
    }

    if (this.originalBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.originalBuffer;
      this.originalGain = ctx.createGain();
      this.originalGain.gain.value = this.originalActive ? 1 : 0;
      src.connect(this.originalGain);
      this.originalGain.connect(this.eqLow);
      src.start(0, Math.min(safe, Math.max(0, this.originalBuffer.duration - 0.02)));
      this.originalSources = [src];
    }

    this.startedAt = ctx.currentTime;
    this.offset = safe;
    this._playing = true;

    const remaining = (this.duration - safe) * 1000;
    this.endTimer = setTimeout(() => {
      this.pause();
      this.offset = 0;
      this.onEnded?.();
    }, remaining + 60);
  }

  async play() {
    if (this._playing || this.duration === 0) return;
    this.ensureCtx();
    if (this.ctx!.state === "suspended") await this.ctx!.resume();
    this.startFrom(this.offset >= this.duration - 0.05 ? 0 : this.offset);
  }

  pause() {
    if (!this._playing) return;
    this.offset = this.getTime();
    this._playing = false;
    this.stopSources();
  }

  seek(t: number) {
    const target = Math.max(0, Math.min(t, this.duration));
    if (this._playing) {
      this.startFrom(target);
    } else {
      this.offset = target;
    }
  }

  dispose() {
    this.stopSources();
    this._playing = false;
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}

export const player = new LivePlayer();
