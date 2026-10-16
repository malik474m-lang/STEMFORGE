/**
 * Запуск desktop-режима для разработки:
 * 1) next dev на порту 3210 (с DATABASE_URL из .env)
 * 2) Electron, загружающий этот URL.
 * Остановка — Ctrl+C завершает оба процесса.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import process from "node:process";

const require = createRequire(import.meta.url);
const electronBin = require("electron");
const PORT = 3210;
const URL_ = `http://127.0.0.1:${PORT}`;

const next = spawn("npx", ["next", "dev", "-p", String(PORT)], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: process.env,
});

const waitFor = async () => {
  for (;;) {
    try {
      const res = await fetch(URL_, { signal: AbortSignal.timeout(1200) });
      if (res.ok || res.status < 500) return;
    } catch {
      /* ждём */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
};

await waitFor();
console.log(`[desktop] старт Electron → ${URL_}`);

const app = spawn(electronBin, ["."], {
  stdio: "inherit",
  env: { ...process.env, ELECTRON_DEV_URL: URL_ },
});

const shutdown = () => {
  next.kill();
  app.kill();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
app.on("close", shutdown);
