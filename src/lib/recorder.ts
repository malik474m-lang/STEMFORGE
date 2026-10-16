/** Запись вокала с микрофона с анализатором уровня. */
export class VoiceRecorder {
  private stream: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private data = new Uint8Array(512);

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: true,
        channelCount: 1,
      },
    });

    this.ctx = new AudioContext();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    src.connect(this.analyser);

    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) =>
      typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m),
    );
    this.chunks = [];
    this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    this.rec.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.rec.start(250);
  }

  getLevel(): number {
    if (!this.analyser) return 0;
    this.analyser.getByteTimeDomainData(this.data);
    let max = 0;
    for (let i = 0; i < this.data.length; i++) {
      const v = Math.abs(this.data[i] - 128) / 128;
      if (v > max) max = v;
    }
    return max;
  }

  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const rec = this.rec;
      if (!rec) return reject(new Error("Запись не запущена"));
      rec.onstop = () => {
        const type = rec.mimeType || "audio/webm";
        this.cleanup();
        resolve(new Blob(this.chunks, { type }));
      };
      rec.onerror = () => {
        this.cleanup();
        reject(new Error("Ошибка записи"));
      };
      rec.stop();
    });
  }

  cancel() {
    try {
      if (this.rec && this.rec.state !== "inactive") this.rec.stop();
    } catch {
      /* noop */
    }
    this.cleanup();
  }

  private cleanup() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.rec = null;
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.analyser = null;
  }
}
