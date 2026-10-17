/**
 * STEMFORGE Desktop — главный процесс Electron.
 * Поднимает встроенный Next.js standalone-сервер (SQLite в userData),
 * ждёт healthcheck и открывает нативное окно.
 */
const { app, BrowserWindow, Menu, dialog, shell } = require("electron");
const { fork } = require("child_process");
const path = require("path");
const fs = require("fs");

app.setName("STEMFORGE");

const PORT = Number(process.env.STEMFORGE_PORT || 3210);
const HOST = "127.0.0.1";
const DEV_URL = process.env.ELECTRON_DEV_URL || null;

let serverChild = null;
let mainWindow = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function logFile() {
  const dir = app.getPath("userData");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "server.log");
}

/** Читает .env из папки данных и из папки с exe → AI-токен без системных переменных. */
function loadEnvFile() {
  const out = {};
  const candidates = [
    path.join(app.getPath("userData"), ".env"),
    path.join(path.dirname(app.getPath("exe")), ".env"),
  ];
  for (const p of candidates) {
    try {
      const text = fs.readFileSync(p, "utf8");
      for (const line of text.split(/\r?\n/)) {
        const m = /^\s*([A-Za-z_][\w.]*)\s*=\s*(.*)$/.exec(line);
        if (!m || m[1].startsWith("#")) continue;
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (!(m[1] in out)) out[m[1]] = v;
      }
    } catch {
      /* файла нет — ок */
    }
  }
  return out;
}

function startEmbeddedServer() {
  const serverPath = path.join(process.resourcesPath, "next", "standalone", "server.js");
  const dbPath = path.join(app.getPath("userData"), "stemforge.db");

  const env = {
    ...process.env,
    ...loadEnvFile(),
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
    PORT: String(PORT),
    HOSTNAME: HOST,
    DB_DRIVER: "sqlite",
    SQLITE_PATH: dbPath,
    STEMFORGE_DATA_DIR: app.getPath("userData"),
    LOCAL_AI_PYTHON: path.join(app.getPath("userData"), "ml-runtime", "Scripts", "python.exe"),
    LOCAL_AI_WORKER: path.join(process.resourcesPath, "ml", "local-separator.py"),
    LOCAL_AI_TRANSCRIBE_WORKER: path.join(process.resourcesPath, "ml", "local-transcribe.py"),
  };

  serverChild = fork(serverPath, [], { env, silent: true, cwd: app.getPath("userData") });

  const stream = fs.createWriteStream(logFile(), { flags: "a" });
  stream.write(`\n=== STEMFORGE ${new Date().toISOString()} ===\n`);
  if (serverChild.stdout) serverChild.stdout.pipe(stream);
  if (serverChild.stderr) serverChild.stderr.pipe(stream);

  serverChild.on("exit", (code) => {
    stream.write(`\nserver exited with code ${code}\n`);
    stream.end();
  });
}

async function waitForServer(url, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return true;
    } catch {
      /* ещё не поднялся */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

function buildMenu() {
  const template = [
    {
      label: "Файл",
      submenu: [
        {
          label: "Папка данных",
          click: () => shell.openPath(app.getPath("userData")),
        },
        { type: "separator" },
        { label: "Выход", role: "quit" },
      ],
    },
    {
      label: "Вид",
      submenu: [
        { label: "Обновить", role: "reload" },
        { label: "Полный экран", role: "togglefullscreen" },
        { type: "separator" },
        { label: "Увеличить", role: "zoomIn" },
        { label: "Уменьшить", role: "zoomOut" },
        { label: "Масштаб 100%", role: "resetZoom" },
        { type: "separator" },
        { label: "Инструменты разработчика", role: "toggleDevTools" },
      ],
    },
    {
      label: "Справка",
      submenu: [
        {
          label: "О программе STEMFORGE",
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: "info",
              title: "О программе",
              message: "STEMFORGE Desktop",
              detail: [
                `Версия приложения: ${app.getVersion()}`,
                "Студия разделения звука: вокал, инструментал, бэк-вокал, бас, ударные.",
                "DSP-обработка — локально; AI-функции (Whisper, RVC, ACE-Step, Demucs) —",
                "через Replicate: укажите REPLICATE_API_TOKEN в файле .env",
                `в папке данных: ${app.getPath("userData")}`,
                `AI-токен в .env: ${loadEnvFile().REPLICATE_API_TOKEN ? "найден" : "НЕ найден"}`,
                `Логи сервера: ${logFile()}`,
              ].join("\n"),
              buttons: ["OK"],
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    title: "STEMFORGE",
    backgroundColor: "#04050a",
    icon: path.join(__dirname, "icon.png"),
    autoHideMenuBar: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());

  // внешние ссылки — в системный браузер
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  void mainWindow.loadURL(DEV_URL || `http://${HOST}:${PORT}`);
}

app.whenReady().then(async () => {
  buildMenu();

  if (!DEV_URL) {
    startEmbeddedServer();
    const ok = await waitForServer(`http://${HOST}:${PORT}/api/health`);
    if (!ok) {
      dialog.showErrorBox(
        "STEMFORGE — ошибка запуска",
        `Встроенный сервер не ответил за 60 секунд.\nПроверьте лог: ${logFile()}`,
      );
      app.quit();
      return;
    }
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  if (serverChild) {
    try {
      serverChild.kill("SIGTERM");
    } catch {
      /* noop */
    }
  }
});

process.on("exit", () => {
  if (serverChild) {
    try {
      serverChild.kill();
    } catch {
      /* noop */
    }
  }
});
