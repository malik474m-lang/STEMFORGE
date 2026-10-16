import "server-only";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
export const uvPath = () => process.env.LOCAL_AI_UV || (process.platform === "win32" ? "uv.exe" : "uv");
export const workerPath = () => process.env.LOCAL_AI_WORKER || path.join(/* turbopackIgnore: true */ process.cwd(), "scripts", "local-separator.py");
export const transcribeWorkerPath = () => process.env.LOCAL_AI_TRANSCRIBE_WORKER || path.join(/* turbopackIgnore: true */ process.cwd(), "scripts", "local-transcribe.py");

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
  const python = pythonPath();
  const uv = uvPath();
  return {
    desktop: process.env.DB_DRIVER === "sqlite",
    ready: existsSync(python) && existsSync(path.join(runtimeDir(), ".stemforge-ready")),
    python,
    uv,
    uvAvailable: existsSync(uv) || uv === "uv" || uv === "uv.exe",
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
      job.label = "Установка локального Python 3.11…";
      job.progress = 0.08;
      await run(uvPath(), ["venv", runtimeDir(), "--python", "3.11", "--python-preference", "managed"], job);
      job.label = "Установка нейросетевого CPU-runtime…";
      job.progress = 0.3;
      await run(uvPath(), [
        "pip", "install", "--python", pythonPath(),
        "audio-separator[cpu]", "faster-whisper",
      ], job, { UV_LINK_MODE: "copy" });
      job.label = "Проверка локального AI…";
      job.progress = 0.92;
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

export function startSeparation(inputPath: string, mode: "clean" | "six" | "pro"): LocalJob {
  if (!existsSync(pythonPath())) throw new Error("local_ai_not_installed");
  const job: LocalJob = {
    id: crypto.randomUUID(), kind: "separate", state: "queued", label: "Запуск локальной нейросети…",
    progress: 0.02, logs: [], createdAt: Date.now(),
  };
  jobs.set(job.id, job);
  const output = path.join(jobsDir(), job.id, "output");
  mkdirSync(output, { recursive: true });

  void new Promise<void>((resolve, reject) => {
    job.state = "running";
    const child = spawn(pythonPath(), [
      workerPath(), "--input", inputPath, "--output", output, "--models", modelDir(), "--mode", mode,
    ], { windowsHide: true, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
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
          } else if (e.event === "done") {
            job.stems = e.stems;
            job.progress = 1;
          } else if (e.event === "error") {
            job.error = e.message;
          }
        } catch { /* обычный лог библиотеки */ }
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (s: string) => s.split(/\r?\n/).forEach((x) => keepLog(job, x)));
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`ML worker: код ${code}`)));
  }).then(() => {
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
  void new Promise<void>((resolve, reject) => {
    const child = spawn(pythonPath(), [
      transcribeWorkerPath(), "--input", inputPath,
      "--models", path.join(modelDir(), "whisper"), "--language", language,
    ], { windowsHide: true, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
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
  }).then(() => {
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
