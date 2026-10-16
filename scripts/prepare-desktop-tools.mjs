import { existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

if (process.platform !== "win32") {
  console.log("[desktop-tools] uv.exe готовится только на Windows CI");
  process.exit(0);
}

const out = resolve(".desktop-tools");
const exe = resolve(out, "uv.exe");
if (existsSync(exe)) {
  console.log("[desktop-tools] uv.exe уже есть");
  process.exit(0);
}
mkdirSync(out, { recursive: true });

const escaped = out.replace(/'/g, "''");
const script = [
  `$env:UV_INSTALL_DIR='${escaped}'`,
  `$env:UV_NO_MODIFY_PATH='1'`,
  `irm https://astral.sh/uv/install.ps1 | iex`,
].join("; ");
const r = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
  stdio: "inherit",
});
if (r.status !== 0 || !existsSync(exe)) {
  console.error("[desktop-tools] Не удалось скачать uv.exe");
  process.exit(1);
}
console.log("[desktop-tools] uv.exe готов");
