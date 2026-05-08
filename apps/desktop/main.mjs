import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import http from "node:http";

import {
  DEFAULT_DESKTOP_RUNTIME_CONFIG,
  ensureDesktopRuntimeConfigFile,
  getDesktopRuntimeConfigPath,
  getDesktopRuntimePaths,
  readDesktopRuntimeConfig
} from "./desktop-runtime-config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require("electron");
const desktopSessionDir = path.join(process.env.LOCALAPPDATA || __dirname, "VizLec", "electron-session");
fs.mkdirSync(desktopSessionDir, { recursive: true });
app.commandLine.appendSwitch("disk-cache-dir", desktopSessionDir);
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");

const DESKTOP_DEFAULTS = {
  ...DEFAULT_DESKTOP_RUNTIME_CONFIG,
  internalJobsEventToken:
    process.env.INTERNAL_JOBS_EVENT_TOKEN ?? "vizlec-desktop-local-token",
  authJwtSecret:
    process.env.AUTH_JWT_SECRET ?? "vizlec-desktop-local-auth-secret",
  agentControlTokenSecret:
    process.env.AGENT_CONTROL_TOKEN_SECRET ?? "vizlec-desktop-local-agent-secret"
};

let mainWindow = null;
let splashWindow = null;
let runtimeState = {
  api: { status: "stopped", pid: null },
  worker: { status: "stopped", pid: null },
  dataDir: "",
  rendererTarget: ""
};
let bootstrapState = {
  title: "Inicializando runtime local",
  message: "Preparando ambiente desktop.",
  progress: 3,
  status: "booting"
};
let childProcesses = [];
let isShuttingDown = false;
let bootstrapProgressInterval = null;
let bootstrapProgressTarget = bootstrapState.progress;

function isDev() {
  return !app.isPackaged;
}

function resolveRepoRoot() {
  if (app.isPackaged) {
    return app.getAppPath();
  }
  return path.resolve(__dirname, "..", "..");
}

function resolveDataDir() {
  const explicit = process.env.DATA_DIR?.trim();
  if (explicit) {
    fs.mkdirSync(explicit, { recursive: true });
    return explicit;
  }
  const localDataDir = path.join(app.getPath("userData"), "data");
  fs.mkdirSync(localDataDir, { recursive: true });
  return localDataDir;
}

function resolveDesktopRuntimeConfig(dataDir) {
  const configPath = getDesktopRuntimeConfigPath(dataDir);
  return ensureDesktopRuntimeConfigFile(configPath, DEFAULT_DESKTOP_RUNTIME_CONFIG);
}

function resolveTsxCliPath(repoRoot) {
  const candidateBases = [
    __dirname,
    path.join(repoRoot, "apps", "desktop"),
    repoRoot
  ];
  for (const base of candidateBases) {
    try {
      const packageJsonPath = require.resolve("tsx/package.json", {
        paths: [base]
      });
      const packageRoot = path.dirname(packageJsonPath);
      const cliPath = path.join(packageRoot, "dist", "cli.mjs");
      if (fs.existsSync(cliPath)) {
        return cliPath;
      }
    } catch {
      // Try next candidate base.
    }
  }
  throw new Error("Unable to resolve tsx CLI for desktop runtime bootstrap.");
}

function resolveRuntimeNodeExecutable() {
  const executableName = process.platform === "win32" ? "node.exe" : "node";
  const repoRoot = resolveRepoRoot();
  const vendoredDevNodePath = path.join(repoRoot, "apps", "desktop", "vendor", "node", executableName);
  if (!isDev()) {
    const bundledNodePath = path.join(process.resourcesPath, "vendor", "node", executableName);
    if (fs.existsSync(bundledNodePath)) {
      return bundledNodePath;
    }
    throw new Error(`Bundled Node runtime not found at ${bundledNodePath}`);
  }
  if (fs.existsSync(vendoredDevNodePath)) {
    return vendoredDevNodePath;
  }
  const candidates = [
    process.env.npm_node_execpath,
    process.env.NODE,
    "node"
  ];
  for (const candidate of candidates) {
    if (candidate && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "node";
}

function buildRuntimeEnv(dataDir) {
  const repoRoot = resolveRepoRoot();
  const runtimeConfig = resolveDesktopRuntimeConfig(dataDir);
  const runtimeConfigPath = getDesktopRuntimeConfigPath(dataDir);
  const appSettingsTemplatePath = path.join(repoRoot, "config", "app_settings.template.json");
  const workerLogDir = getDesktopRuntimePaths(dataDir).workerLogDir;
  return {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    DATA_DIR: dataDir,
    VIZLEC_DESKTOP_MODE: "true",
    VIZLEC_DESKTOP_CONFIG_PATH: runtimeConfigPath,
    API_HOST: runtimeConfig.apiHost,
    API_PORT: String(runtimeConfig.apiPort),
    WORKER_PORT: String(runtimeConfig.workerPort),
    WEB_HOST: runtimeConfig.webHost,
    WEB_PORT: String(runtimeConfig.webPort),
    API_BASE_URL: `http://${runtimeConfig.apiHost}:${runtimeConfig.apiPort}`,
    WEB_APP_BASE_URL: `http://${runtimeConfig.webHost}:${runtimeConfig.webPort}`,
    APP_SETTINGS_TEMPLATE_PATH: appSettingsTemplatePath,
    WORKER_LOG_DIR: workerLogDir,
    INTERNAL_JOBS_EVENT_TOKEN: DESKTOP_DEFAULTS.internalJobsEventToken,
    AUTH_JWT_SECRET: DESKTOP_DEFAULTS.authJwtSecret,
    AGENT_CONTROL_TOKEN_SECRET: DESKTOP_DEFAULTS.agentControlTokenSecret,
    AUTH_COOKIE_SECURE: runtimeConfig.authCookieSecure ? "true" : "false",
    WORKER_REQUIRE_WS_ON_STARTUP: runtimeConfig.workerRequireWsOnStartup ? "true" : "false"
  };
}

function emitBootstrapState(nextState) {
  if (typeof nextState.progress === "number" && Number.isFinite(nextState.progress)) {
    bootstrapProgressTarget = Math.max(0, Math.min(100, nextState.progress));
  }
  bootstrapState = {
    ...bootstrapState,
    ...nextState
  };
  const targets = [splashWindow, mainWindow];
  for (const target of targets) {
    if (target && !target.isDestroyed()) {
      target.webContents.send("desktop:bootstrap-state", bootstrapState);
    }
  }
  if (splashWindow && !splashWindow.isDestroyed()) {
    const serializedState = JSON.stringify(bootstrapState);
    splashWindow.webContents.executeJavaScript(
      `window.__applyBootstrapState && window.__applyBootstrapState(${serializedState});`,
      true
    ).catch(() => {});
  }
}

function setBootstrapProgress(nextProgress, options = {}) {
  const clamped = Math.max(0, Math.min(100, nextProgress));
  bootstrapProgressTarget = clamped;
  if (options.immediate) {
    emitBootstrapState({ progress: clamped });
    return;
  }
  if (bootstrapProgressInterval) {
    return;
  }
  bootstrapProgressInterval = setInterval(() => {
    const current = bootstrapState.progress;
    const target = bootstrapProgressTarget;
    if (Math.abs(target - current) < 0.35) {
      emitBootstrapState({ progress: target });
      clearInterval(bootstrapProgressInterval);
      bootstrapProgressInterval = null;
      return;
    }
    const distance = target - current;
    const step = Math.sign(distance) * Math.max(0.6, Math.min(3.2, Math.abs(distance) * 0.18));
    emitBootstrapState({ progress: current + step });
  }, 90);
}

function updateBootstrapStage(message, progress, options = {}) {
  emitBootstrapState({
    ...(message ? { message } : {}),
    ...(options.status ? { status: options.status } : {})
  });
  setBootstrapProgress(progress, options);
}

function getSplashHtmlPath() {
  return path.join(__dirname, "splash.html");
}

async function waitForHttp(url, timeoutMs = 45_000, options = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const elapsed = Date.now() - startedAt;
    options.onTick?.(Math.min(1, elapsed / timeoutMs));
    const ok = await new Promise((resolve) => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve((res.statusCode ?? 500) < 500);
      });
      req.on("error", () => resolve(false));
      req.setTimeout(2_000, () => {
        req.destroy();
        resolve(false);
      });
    });
    if (ok) {
      options.onTick?.(1);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function runDetachedNodeTask(taskRelativePath, args, dataDir) {
  const repoRoot = resolveRepoRoot();
  const runtimeNodeExecutable = resolveRuntimeNodeExecutable();
  const taskFile = path.join(repoRoot, taskRelativePath);
  await new Promise((resolve, reject) => {
    const child = spawn(runtimeNodeExecutable, [taskFile, ...args], {
      cwd: repoRoot,
      env: {
        ...buildRuntimeEnv(dataDir),
        DESKTOP_RUNTIME_NODE_PATH: runtimeNodeExecutable
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout.on("data", (chunk) => {
      process.stdout.write(`[desktop-bootstrap] ${chunk}`);
    });
    child.stderr.on("data", (chunk) => {
      process.stderr.write(`[desktop-bootstrap] ${chunk}`);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Bootstrap task failed (${taskRelativePath}) with exit code ${code}`));
    });
  });
}

function spawnRuntimeProcess(name, entryRelativePath, dataDir) {
  const repoRoot = resolveRepoRoot();
  const tsxCliPath = resolveTsxCliPath(repoRoot);
  const entryFile = path.join(repoRoot, entryRelativePath);
  const runtimeNodeExecutable = resolveRuntimeNodeExecutable();
  const child = spawn(runtimeNodeExecutable, [tsxCliPath, entryFile], {
    cwd: repoRoot,
    env: buildRuntimeEnv(dataDir),
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[${name}] ${chunk}`);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[${name}] ${chunk}`);
  });
  child.on("exit", (code, signal) => {
    runtimeState[name] = {
      status: code === 0 || signal === "SIGTERM" ? "stopped" : "crashed",
      pid: null
    };
    if (!isShuttingDown && mainWindow) {
      mainWindow.webContents.send("desktop:runtime-status", {
        service: name,
        status: runtimeState[name].status
      });
    }
  });

  runtimeState[name] = { status: "starting", pid: child.pid ?? null };
  childProcesses.push(child);
  return child;
}

async function stopRuntimeProcesses() {
  isShuttingDown = true;
  const processes = [...childProcesses];
  childProcesses = [];
  await Promise.all(
    processes.map(
      (child) =>
        new Promise((resolve) => {
          if (child.killed) {
            resolve();
            return;
          }
          child.once("exit", () => resolve());
          child.kill("SIGTERM");
          setTimeout(() => {
            if (!child.killed) {
              child.kill("SIGKILL");
            }
          }, 4_000).unref();
        })
    )
  );
  runtimeState.api = { status: "stopped", pid: null };
  runtimeState.worker = { status: "stopped", pid: null };
}

function resolveRendererTarget(repoRoot) {
  if (isDev()) {
    const dataDir = runtimeState.dataDir || resolveDataDir();
    const runtimeConfig = readDesktopRuntimeConfig(
      getDesktopRuntimeConfigPath(dataDir),
      DEFAULT_DESKTOP_RUNTIME_CONFIG
    );
    return `http://${runtimeConfig.webHost}:${runtimeConfig.webPort}`;
  }
  return pathToFileURL(path.join(repoRoot, "apps", "web", "dist", "index.html")).href;
}

async function loadRenderer() {
  const repoRoot = resolveRepoRoot();
  const target = resolveRendererTarget(repoRoot);
  runtimeState.rendererTarget = target;
  if (isDev()) {
    await waitForHttp(target, 60_000, {
      onTick: (ratio) => {
        updateBootstrapStage("Carregando interface instalada...", 92 + ratio * 5);
      }
    });
  }
  await Promise.all([
    new Promise((resolve) => {
      mainWindow.once("ready-to-show", resolve);
    }),
    mainWindow.loadURL(target)
  ]);
  updateBootstrapStage("Aplicação pronta.", 100, { immediate: true });
  await new Promise((resolve) => setTimeout(resolve, 120));
  mainWindow.show();
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

async function startLocalRuntime() {
  const dataDir = resolveDataDir();
  runtimeState.dataDir = dataDir;
  const runtimeConfig = resolveDesktopRuntimeConfig(dataDir);
  updateBootstrapStage("Preparando banco e arquivos locais...", 8, { immediate: true });
  const dbProgressTimer = setInterval(() => {
    const next = Math.min(18, bootstrapProgressTarget + 0.8);
    setBootstrapProgress(next);
  }, 260);
  try {
    await runDetachedNodeTask(path.join("scripts", "ensure-desktop-db.mjs"), [], dataDir);
  } finally {
    clearInterval(dbProgressTimer);
  }
  updateBootstrapStage("Iniciando API local...", 28);
  spawnRuntimeProcess("api", path.join("apps", "api", "src", "index.ts"), dataDir);
  updateBootstrapStage("Conectando worker local...", 42);
  spawnRuntimeProcess("worker", path.join("apps", "worker", "src", "index.ts"), dataDir);
  updateBootstrapStage("Aguardando API responder...", 48);
  await waitForHttp(
    `http://${runtimeConfig.apiHost}:${runtimeConfig.apiPort}/health`,
    45_000,
    {
      onTick: (ratio) => {
        updateBootstrapStage("Aguardando API responder...", 48 + ratio * 18);
      }
    }
  );
  updateBootstrapStage("Sincronizando worker e serviços locais...", 68);
  await waitForHttp(
    `http://${runtimeConfig.apiHost}:${runtimeConfig.workerPort}/health`,
    45_000,
    {
      onTick: (ratio) => {
        updateBootstrapStage("Sincronizando worker e serviços locais...", 68 + ratio * 20);
      }
    }
  );
  runtimeState.api = {
    status: "ready",
    pid: runtimeState.api.pid
  };
  runtimeState.worker = {
    status: "ready",
    pid: runtimeState.worker.pid
  };
  updateBootstrapStage("Carregando interface instalada...", 92);
}

function registerDesktopIpc() {
  ipcMain.handle("desktop:get-runtime-info", async () => ({
    ...runtimeState,
    apiUrl: (() => {
      const runtimeConfig = readDesktopRuntimeConfig(
        getDesktopRuntimeConfigPath(runtimeState.dataDir || resolveDataDir()),
        DEFAULT_DESKTOP_RUNTIME_CONFIG
      );
      return `http://${runtimeConfig.apiHost}:${runtimeConfig.apiPort}`;
    })(),
    workerHealthUrl: (() => {
      const runtimeConfig = readDesktopRuntimeConfig(
        getDesktopRuntimeConfigPath(runtimeState.dataDir || resolveDataDir()),
        DEFAULT_DESKTOP_RUNTIME_CONFIG
      );
      return `http://${runtimeConfig.apiHost}:${runtimeConfig.workerPort}/health`;
    })()
  }));
  ipcMain.handle("desktop:get-bootstrap-state", async () => ({
    ...bootstrapState
  }));
  ipcMain.handle("desktop:open-data-dir", async () => {
    await shell.openPath(runtimeState.dataDir);
    return true;
  });
}

async function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 760,
    height: 440,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    transparent: false,
    backgroundColor: "#9f30e6",
    autoHideMenuBar: true,
    show: false,
    center: true,
    webPreferences: {
      contextIsolation: true,
      backgroundThrottling: false
    }
  });

  splashWindow.setMenu(null);
  splashWindow.once("closed", () => {
    splashWindow = null;
  });
  await Promise.all([
    new Promise((resolve) => {
      splashWindow.once("ready-to-show", resolve);
    }),
    splashWindow.loadFile(getSplashHtmlPath())
  ]);
  await splashWindow.webContents.executeJavaScript(
    `window.__applyBootstrapState && window.__applyBootstrapState(${JSON.stringify(bootstrapState)});`,
    true
  );
  splashWindow.show();
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 780,
    backgroundColor: "#09131f",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.mjs")
    }
  });

  mainWindow.setMenu(null);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function bootstrapDesktop() {
  await app.whenReady();
  Menu.setApplicationMenu(null);
  registerDesktopIpc();
  await createSplashWindow();
  await createMainWindow();
  emitBootstrapState({
    title: "VizLec Desktop",
    message: "A aplicação está preparando o runtime local.",
    progress: 4,
    status: "booting"
  });
  try {
    await startLocalRuntime();
    updateBootstrapStage("Abrindo aplicação...", 97, { status: "booting" });
    await loadRenderer();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitBootstrapState({
      title: "Falha ao iniciar",
      message: "A inicialização falhou. Verifique logs, providers locais e tente novamente.",
      progress: 100,
      status: "error"
    });
    await dialog.showErrorBox(
      "Falha ao iniciar o runtime local",
      `VizLec Desktop não conseguiu iniciar a API local, o worker local ou a interface.\n\n${message}`
    );
  }

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createSplashWindow();
      await createMainWindow();
      emitBootstrapState({
        title: "VizLec Desktop",
        message: "A aplicação está preparando o runtime local.",
        progress: 4,
        status: "booting"
      });
      await startLocalRuntime();
      updateBootstrapStage("Abrindo aplicação...", 97, { status: "booting" });
      await loadRenderer();
    }
  });
}

app.on("window-all-closed", async () => {
  if (process.platform !== "darwin") {
    await stopRuntimeProcesses();
    app.quit();
  }
});

app.on("before-quit", async () => {
  await stopRuntimeProcesses();
});

bootstrapDesktop().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  app.exit(1);
});
