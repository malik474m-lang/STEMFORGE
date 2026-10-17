import "server-only";
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { get } from "node:https";
import { inflateRawSync } from "node:zlib";
import path from "node:path";
import crypto from "node:crypto";

export type LocalJobState = "queued" | "running" | "done" | "error";
export interface LocalJob {
  id: string;
  kind: "setup" | "separate" | "transcribe";
  state: LocalJobState;
  label: string;
  progress: number;
  error?: string;
  stems?: Record<string, string>;
  result?: unknown;
  logs: string[];
  createdAt: number;
}

type JobGlobal = typeof globalThis & { __stemforgeLocalJobs?: Map<string, LocalJob> };
const g = globalThis as JobGlobal;
const jobs = g.__stemforgeLocalJobs ?? new Map<string, LocalJob>();
g.__stemforgeLocalJobs = jobs;

const dataDir = () => process.env.STEMFORGE_DATA_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), ".stemforge-data");
export const runtimeDir = () => path.join(dataDir(), "ml-runtime");
export const modelDir = () => path.join(dataDir(), "models");
export const jobsDir = () => path.join(dataDir(), "ml-jobs");
export const pythonPath = () =>
  process.env.LOCAL_AI_PYTHON ||
  (process.platform === "win32"
    ? path.join(runtimeDir(), "Scripts", "python.exe")
    : path.join(runtimeDir(), "bin", "python"));
export const toolsDir = () => path.join(dataDir(), "tools");
export const uvPath = () =>
  process.env.LOCAL_AI_UV || path.join(toolsDir(), process.platform === "win32" ? "uv.exe" : "uv");
export const ffmpegPath = () =>
  process.env.LOCAL_AI_FFMPEG || path.join(toolsDir(), process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
export const workerPath = () => process.env.LOCAL_AI_WORKER || path.join(/* turbopackIgnore: true */ process.cwd(), "scripts", "local-separator.py");
export const transcribeWorkerPath = () => process.env.LOCAL_AI_TRANSCRIBE_WORKER || path.join(/* turbopackIgnore: true */ process.cwd(), "scripts", "local-transcribe.py");

/** PATH, в который добавлен ffmpeg — обязателен для python-audio-separator. */
export function envWithFfmpeg(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (existsSync(ffmpegPath())) {
    env.PATH = `${path.dirname(ffmpegPath())}${path.delimiter}${env.PATH ?? ""}`;
  }
  return env;
}

/* ---------------- скачивание инструментов (uv, ffmpeg) чистым Node ---------------- */

const UV_URL = "https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip";
const FFMPEG_URL =
  "https://github.com/GyanD/codexffmpeg/releases/download/7.1.1/ffmpeg-7.1.1-essentials_build.zip";

function downloadFile(url: string, dest: string, job: LocalJob, label: string, fromP: number, toP: number): Promise<void> {
  return new Promise((resolveFn, rejectFn) => {
    const go = (u: string, depth: number) => {
      if (depth > 8) return rejectFn(new Error("слишком много редиректов"));
      get(u, { headers: { "user-agent": "stemforge" } }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode ?? 0)) {
          res.resume();
          return go(new URL(res.headers.location ?? "", u).toString(), depth + 1);
        }
        if (res.statusCode !== 200) {
          return rejectFn(new Error(`HTTP ${res.statusCode} при скачивании ${label}`));
        }
        const total = Number(res.headers["content-length"] ?? 0);
        let got = 0;
        const file = createWriteStream(dest);
        res.on("data", (chunk: Buffer) => {
          got += chunk.length;
          if (total > 0) {
            job.label = `${label} — ${Math.round((got / total) * 100)}%`;
            job.progress = fromP + (got / total) * (toP - fromP);
          }
        });
        res.pipe(file);
        file.on("finish", () => file.close(() => resolveFn()));
        file.on("error", rejectFn);
      }).on("error", rejectFn);
    };
    go(url, 0);
  });
}

/** Минимальный ZIP-распаковщик на встроенном zlib (store/DEFLATE), с выбором нужных файлов. */
function extractZip(zipPath: string, destDir: string, wanted: (name: string) => boolean) {
  const buf = readFileSync(zipPath);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("ZIP: EOCD не найден");
  const total = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);

  for (let e = 0; e < total; e++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error("ZIP: плохой центральный заголовок");
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const usize = buf.readUInt32LE(off + 24);
    const nlen = buf.readUInt16LE(off + 28);
    const elen = buf.readUInt16LE(off + 30);
    const clen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.subarray(off + 46, off + 46 + nlen).toString("utf8");
    off += 46 + nlen + elen + clen;
    if (name.endsWith("/") || !wanted(name)) continue;

    const fnlen = buf.readUInt16LE(lho + 26);
    const felen = buf.readUInt16LE(lho + 28);
    const dataStart = lho + 30 + fnlen + felen;
    const comp = buf.subarray(dataStart, dataStart + csize);
    const data = method === 0 ? comp : method === 8 ? inflateRawSync(comp) : null;
    if (!data) throw new Error(`ZIP: метод ${method} не поддерживается`);
    if (data.length !== usize) throw new Error(`ZIP: размер не совпал для ${name}`);
    mkdirSync(destDir, { recursive: true });
    writeFileSync(path.join(destDir, path.basename(name)), data);
  }
}

/** uv + ffmpeg есть? если нет — скачивание прямо на ПК пользователя. */
async function ensureTools(job: LocalJob) {
  mkdirSync(toolsDir(), { recursive: true });
  if (!existsSync(uvPath())) {
    const zip = path.join(toolsDir(), "uv.zip");
    await downloadFile(UV_URL, zip, job, "Скачивание менеджера uv", 0.02, 0.1);
    extractZip(zip, toolsDir(), (n: string) => path.basename(n) === "uv.exe");
  }
  if (process.platform === "win32" && !existsSync(ffmpegPath())) {
    const zip = path.join(toolsDir(), "ffmpeg.zip");
    await downloadFile(FFMPEG_URL, zip, job, "Скачивание FFmpeg (≈90 МБ)", 0.1, 0.28);
    extractZip(zip, toolsDir(), (n: string) => /[/\\](ffmpeg|ffprobe)\.exe$/i.test(n));
  }
  if (!existsSync(uvPath())) throw new Error("uv.exe не установлен после скачивания");
}

function keepLog(job: LocalJob, line: string) {
  if (!line.trim()) return;
  job.logs.push(line.trim());
  if (job.logs.length > 80) job.logs.splice(0, job.logs.length - 80);
}

function run(cmd: string, args: string[], job: LocalJob, env?: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      windowsHide: true,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (s: string) => s.split(/\r?\n/).forEach((x) => keepLog(job, x)));
    child.stderr.on("data", (s: string) => s.split(/\r?\n/).forEach((x) => keepLog(job, x)));
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} завершился с кодом ${code}`))));
  });
}

export function getRuntimeStatus() {
  return {
    desktop: process.env.DB_DRIVER === "sqlite",
    ready: existsSync(pythonPath()) && existsSync(path.join(runtimeDir(), ".stemforge-ready")),
    python: pythonPath(),
    uv: uvPath(),
    ffmpeg: ffmpegPath(),
    ffmpegPresent: existsSync(ffmpegPath()),
    uvPresent: existsSync(uvPath()),
    modelDir: modelDir(),
    setupJob: [...jobs.values()].reverse().find((j) => j.kind === "setup") ?? null,
  };
}

export function getJob(id: string) {
  return jobs.get(id) ?? null;
}

export function startSetup(): LocalJob {
  const active = [...jobs.values()].find((j) => j.kind === "setup" && ["queued", "running"].includes(j.state));
  if (active) return active;
  const job: LocalJob = {
    id: crypto.randomUUID(), kind: "setup", state: "queued", label: "Подготовка…", progress: 0,
    logs: [], createdAt: Date.now(),
  };
  jobs.set(job.id, job);
  void (async () => {
    try {
      mkdirSync(dataDir(), { recursive: true });
      mkdirSync(modelDir(), { recursive: true });
      job.state = "running";
      job.label = "Подготовка инструментов (uv, ffmpeg)…";
      job.progress = 0.01;
      await ensureTools(job);
      job.label = "Установка локального Python 3.11…";
      job.progress = 0.3;
      await run(uvPath(), ["venv", runtimeDir(), "--python", "3.11", "--python-preference", "managed"], job);
      job.label = "Установка нейросетевого CPU-runtime (≈2–4 ГБ)…";
      job.progress = 0.45;
      await run(uvPath(), [
        "pip", "install", "--python", pythonPath(),
        "audio-separator[cpu]", "faster-whisper",
      ], job, { UV_LINK_MODE: "copy" });
      job.label = "Проверка локального AI…";
      job.progress = 0.93;
      await run(pythonPath(), ["-c", "from audio_separator.separator import Separator; from faster_whisper import WhisperModel; print('READY')"], job);
      writeFileSync(path.join(runtimeDir(), ".stemforge-ready"), new Date().toISOString(), "utf8");
      job.state = "done";
      job.label = "Локальный AI установлен";
      job.progress = 1;
    } catch (e) {
      job.state = "error";
      job.error = `${e}\n${job.logs.slice(-10).join("\n")}`;
      job.label = "Ошибка установки";
    }
  })();
  return job;
}

export function startSeparation(inputPath: string, mode: "clean" | "six" | "pro" | "fast"): LocalJob {
  if (!existsSync(pythonPath())) throw new Error("local_ai_not_installed");
  const job: LocalJob = {
    id: crypto.randomUUID(), kind: "separate", state: "queued", label: "Запуск локальной нейросети…",
    progress: 0.02, logs: [], createdAt: Date.now(),
  };
  jobs.set(job.id, job);
  const output = path.join(jobsDir(), job.id, "output");
  mkdirSync(output, { recursive: true });

  void (async () => {
    // Авто-лечение: если ffmpeg/uv ещё не скачан (старый runtime) — докачиваем прямо перед задачей
    if (!existsSync(ffmpegPath())) {
      job.state = "running";
      job.label = "Докачиваю FFmpeg…";
      await ensureTools(job);
    }
  })().then(() => new Promise<void>((resolve, reject) => {
    job.state = "running";
    job.label = "Запуск локальной нейросети…";
    let inferBase = 0.18;
    let inferCeil = 0.94;
    let inferModel = "модель";

    const parseTqdm = (line: string) => {
      const pct = /(\d{1,3})%\|/.exec(line);
      if (!pct) return;
      const p = Math.min(100, Number(pct[1])) / 100;
      job.progress = inferBase + p * (inferCeil - inferBase);
      const eta = /<(\d+):(\d+)/.exec(line);
      job.label = eta
        ? `Инференс ${inferModel} — ${Math.round(p * 100)}% · осталось ~${Number(eta[1])}:${eta[2]}`
        : `Инференс ${inferModel} — ${Math.round(p * 100)}%`;
    };

    const child = spawn(pythonPath(), [
      workerPath(), "--input", inputPath, "--output", output, "--models", modelDir(), "--mode", mode === "fast" ? "fast" : mode,
    ], { windowsHide: true, env: envWithFfmpeg(), stdio: ["ignore", "pipe", "pipe"] });
    let pending = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      pending += chunk;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) {
        keepLog(job, line);
        try {
          const e = JSON.parse(line);
          if (e.event === "stage") {
            job.label = String(e.label);
            job.progress = Number(e.progress) || job.progress;
          } else if (e.event === "infer") {
            inferModel = String(e.model ?? "модель");
            inferBase = Number(e.base) || 0.18;
            inferCeil = Number(e.ceiling) || 0.94;
            job.label = `Инференс ${inferModel}…`;
            job.progress = inferBase;
          } else if (e.event === "done") {
            job.stems = e.stems;
            job.progress = 1;
          } else if (e.event === "error") {
            job.error = e.message;
          }
        } catch {
          parseTqdm(line);
        }
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (s: string) =>
      s.replace(/\r/g, "\n").split(/\n/).forEach((x) => {
        keepLog(job, x);
        parseTqdm(x);
      }),
    );
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`ML worker: код ${code}`)));
  })).then(() => {
    if (!job.stems || Object.keys(job.stems).length === 0) throw new Error("Нейросеть не вернула стемы");
    job.state = "done";
    job.label = "Разделение завершено";
    job.progress = 1;
  }).catch((e) => {
    job.state = "error";
    job.error = `${job.error || e}\n${job.logs.slice(-12).join("\n")}`;
    job.label = "Ошибка локального разделения";
  });

  return job;
}

export function startTranscription(inputPath: string, language: string): LocalJob {
  if (!getRuntimeStatus().ready) throw new Error("local_ai_not_installed");
  const job: LocalJob = {
    id: crypto.randomUUID(), kind: "transcribe", state: "running",
    label: "Запуск локального Whisper…", progress: 0.03, logs: [], createdAt: Date.now(),
  };
  jobs.set(job.id, job);
  void (async () => {
    if (!existsSync(ffmpegPath())) {
      job.label = "Докачиваю FFmpeg…";
      await ensureTools(job);
    }
  })().then(() => new Promise<void>((resolve, reject) => {
    const child = spawn(pythonPath(), [
      transcribeWorkerPath(), "--input", inputPath,
      "--models", path.join(modelDir(), "whisper"), "--language", language,
    ], { windowsHide: true, env: envWithFfmpeg(), stdio: ["ignore", "pipe", "pipe"] });
    let pending = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      pending += chunk;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) {
        keepLog(job, line);
        try {
          const e = JSON.parse(line);
          if (e.event === "stage" || e.event === "progress") {
            job.label = String(e.label || job.label);
            job.progress = Number(e.progress) || job.progress;
          } else if (e.event === "done") {
            job.result = e.result;
            job.progress = 1;
          } else if (e.event === "error") job.error = e.message;
        } catch { /* лог зависимости */ }
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (s: string) => s.split(/\r?\n/).forEach((x) => keepLog(job, x)));
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Whisper worker: код ${code}`)));
  })).then(() => {
    if (!job.result) throw new Error("Whisper не вернул текст");
    job.state = "done";
    job.label = "Текст распознан";
    job.progress = 1;
  }).catch((e) => {
    job.state = "error";
    job.error = `${job.error || e}\n${job.logs.slice(-12).join("\n")}`;
    job.label = "Ошибка локального Whisper";
  });
  return job;
}

export function resolveStemFile(jobId: string, stem: string): string | null {
  const job = jobs.get(jobId);
  const p = job?.stems?.[stem];
  if (!p) return null;
  const allowed = path.resolve(jobsDir(), jobId);
  const resolved = path.resolve(p);
  return resolved.startsWith(allowed) && existsSync(resolved) ? resolved : null;
}

export function readStem(jobId: string, stem: string): Buffer | null {
  const p = resolveStemFile(jobId, stem);
  return p ? readFileSync(p) : null;
}
