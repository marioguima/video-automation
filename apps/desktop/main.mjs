import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { DESKTOP_RUNTIME_DEFAULTS } from "../../scripts/desktop-runtime-versions.mjs";

import {
  DEFAULT_DESKTOP_RUNTIME_CONFIG,
  ensureDesktopRuntimeSecretsFile,
  ensureDesktopRuntimeConfigFile,
  getDesktopRuntimeConfigPath,
  getDesktopRuntimePaths,
  readDesktopRuntimeConfig,
  writeDesktopRuntimeConfig
} from "./desktop-runtime-config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execFile = promisify(execFileCallback);
const require = createRequire(import.meta.url);
const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require("electron");
const DESKTOP_PRODUCT_NAME = "FlowShopy";
const desktopLocalAppDataRoot = path.join(process.env.LOCALAPPDATA || __dirname, DESKTOP_PRODUCT_NAME);
const desktopSessionDir = path.join(desktopLocalAppDataRoot, "electron-session");
fs.mkdirSync(desktopLocalAppDataRoot, { recursive: true });
fs.mkdirSync(desktopSessionDir, { recursive: true });
app.setPath("userData", desktopLocalAppDataRoot);
app.setPath("sessionData", desktopSessionDir);
app.commandLine.appendSwitch("disk-cache-dir", desktopSessionDir);
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");

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
let rendererHttpServer = null;
let isShuttingDown = false;
let bootstrapProgressInterval = null;
let bootstrapProgressTarget = bootstrapState.progress;

function isDev() {
  return !app.isPackaged;
}

function resolveDesktopBootstrapLogPath() {
  const rootDir = isDev()
    ? path.join(resolveRepoRoot(), "logs", "desktop")
    : path.join(desktopLocalAppDataRoot, "logs");
  fs.mkdirSync(rootDir, { recursive: true });
  return path.join(rootDir, "desktop-bootstrap.log");
}

function writeDesktopBootstrapLog(message) {
  try {
    const logPath = resolveDesktopBootstrapLogPath();
    const line = `[${new Date().toISOString()}] ${message}\n`;
    fs.appendFileSync(logPath, line, "utf8");
  } catch {
    // Keep bootstrap resilient even if logging fails.
  }
}

function resolveRepoRoot() {
  if (app.isPackaged) {
    return app.getAppPath();
  }
  return path.resolve(__dirname, "..", "..");
}

function resolveDataDir() {
  const explicit = process.env.DATA_DIR?.trim();
  if (explicit && isDev()) {
    fs.mkdirSync(explicit, { recursive: true });
    return explicit;
  }
  const localDataDir = path.join(desktopLocalAppDataRoot, "data");
  fs.mkdirSync(localDataDir, { recursive: true });
  return localDataDir;
}

function readDesktopRuntimeSecrets(dataDir) {
  return ensureDesktopRuntimeSecretsFile(dataDir);
}

function resolveDesktopRuntimeConfig(dataDir) {
  const configPath = getDesktopRuntimeConfigPath(dataDir);
  return ensureDesktopRuntimeConfigFile(configPath, DEFAULT_DESKTOP_RUNTIME_CONFIG);
}

function resolveTsxCliPath(repoRoot) {
  const candidateBases = [
    path.join(repoRoot, "apps", "desktop"),
    repoRoot,
    __dirname
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

function resolveBootstrapNodeExecutable() {
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

function resolveRuntimeNodeExecutable(dataDir) {
  const executableName = process.platform === "win32" ? "node.exe" : "node";
  const activeNodePath = path.join(resolveRuntimeActiveVendorDir(dataDir), "node", executableName);
  if (fs.existsSync(activeNodePath)) {
    return activeNodePath;
  }
  return resolveBootstrapNodeExecutable();
}

function resolveRuntimeSeedVendorDir() {
  const repoRoot = resolveRepoRoot();
  if (isDev()) {
    return path.join(repoRoot, "apps", "desktop", "vendor");
  }
  return path.join(process.resourcesPath, "vendor");
}

function resolveRuntimeActiveVendorDir(dataDir) {
  const explicit = process.env.FLOWSHOPY_DESKTOP_VENDOR_DIR?.trim();
  if (explicit) {
    return path.resolve(explicit);
  }
  if (isDev()) {
    return resolveRuntimeSeedVendorDir();
  }
  return path.join(path.dirname(dataDir), "vendor");
}

function resolveVendoredRuntimeBinary(dataDir, relativeParts, fallback = "") {
  const relativePath = path.join(...relativeParts);
  const activePath = path.join(resolveRuntimeActiveVendorDir(dataDir), relativePath);
  if (fs.existsSync(activePath)) {
    return activePath;
  }
  const seedPath = path.join(resolveRuntimeSeedVendorDir(), relativePath);
  if (fs.existsSync(seedPath)) {
    return seedPath;
  }
  return fallback;
}

function readJsonFileSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function hashFileSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const buffer = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(buffer).digest("hex");
  } catch {
    return null;
  }
}

function copyDirectoryIfMissing(fromDir, toDir) {
  if (!fs.existsSync(fromDir) || fs.existsSync(toDir)) {
    return;
  }
  fs.mkdirSync(path.dirname(toDir), { recursive: true });
  fs.cpSync(fromDir, toDir, { recursive: true, force: true });
}

function copyDirectoryContents(fromDir, toDir) {
  if (!fs.existsSync(fromDir)) {
    return;
  }
  fs.mkdirSync(toDir, { recursive: true });
  for (const entry of fs.readdirSync(fromDir)) {
    fs.cpSync(path.join(fromDir, entry), path.join(toDir, entry), {
      recursive: true,
      force: true
    });
  }
}

function copyFileIfPresent(fromPath, toPath) {
  if (!fs.existsSync(fromPath)) {
    return;
  }
  fs.mkdirSync(path.dirname(toPath), { recursive: true });
  fs.cpSync(fromPath, toPath, { force: true });
}

function copyDirectoryFiltered(fromDir, toDir, filter) {
  if (!fs.existsSync(fromDir)) {
    return;
  }
  fs.mkdirSync(path.dirname(toDir), { recursive: true });
  fs.cpSync(fromDir, toDir, {
    recursive: true,
    force: true,
    filter
  });
}

function ensureDirectoryJunction(linkPath, targetPath) {
  if (!fs.existsSync(targetPath)) {
    return;
  }
  fs.rmSync(linkPath, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  fs.symlinkSync(targetPath, linkPath, "junction");
}

function ensureSeedRuntimeCopiedToActiveVendor(dataDir) {
  if (isDev()) {
    return;
  }
  const seedDir = resolveRuntimeSeedVendorDir();
  const activeDir = resolveRuntimeActiveVendorDir(dataDir);
  fs.mkdirSync(activeDir, { recursive: true });
  for (const segment of ["node", "esbuild", "ffmpeg", "python", "models", "db"]) {
    copyDirectoryIfMissing(path.join(seedDir, segment), path.join(activeDir, segment));
  }
}

function resolveRuntimeActiveAppDir(dataDir) {
  if (isDev()) {
    return resolveRepoRoot();
  }
  return path.join(resolveRuntimeActiveVendorDir(dataDir), "workspace-app");
}

function prepareInstalledRuntimeWorkspace(dataDir) {
  if (isDev()) {
    return resolveRepoRoot();
  }
  const seedAppDir = resolveRepoRoot();
  const seedWorkspaceModulesDir = path.join(resolveRuntimeSeedVendorDir(), "workspace-node-modules");
  const activeAppDir = resolveRuntimeActiveAppDir(dataDir);
  fs.rmSync(activeAppDir, { recursive: true, force: true });
  fs.mkdirSync(activeAppDir, { recursive: true });
  copyDirectoryIfMissing(path.join(seedAppDir, "apps", "api"), path.join(activeAppDir, "apps", "api"));
  copyDirectoryIfMissing(path.join(seedAppDir, "apps", "worker"), path.join(activeAppDir, "apps", "worker"));
  copyDirectoryFiltered(
    path.join(seedAppDir, "apps", "desktop"),
    path.join(activeAppDir, "apps", "desktop"),
    (source) => !source.replace(/\\/g, "/").includes("/apps/desktop/node_modules/")
  );
  for (const segment of ["packages", "scripts", "config"]) {
    copyDirectoryIfMissing(path.join(seedAppDir, segment), path.join(activeAppDir, segment));
  }
  for (const fileName of ["package.json", "pnpm-lock.yaml"]) {
    copyFileIfPresent(path.join(seedAppDir, fileName), path.join(activeAppDir, fileName));
  }
  ensureDirectoryJunction(
    path.join(activeAppDir, "node_modules"),
    path.join(seedWorkspaceModulesDir, "node_modules")
  );
  ensureDirectoryJunction(
    path.join(activeAppDir, "apps", "desktop", "node_modules"),
    path.join(seedWorkspaceModulesDir, "apps", "desktop", "node_modules")
  );
  ensureDirectoryJunction(
    path.join(activeAppDir, "apps", "api", "node_modules"),
    path.join(seedWorkspaceModulesDir, "apps", "api", "node_modules")
  );
  ensureDirectoryJunction(
    path.join(activeAppDir, "apps", "worker", "node_modules"),
    path.join(seedWorkspaceModulesDir, "apps", "worker", "node_modules")
  );
  ensureDirectoryJunction(
    path.join(activeAppDir, "packages", "db", "node_modules"),
    path.join(seedWorkspaceModulesDir, "packages", "db", "node_modules")
  );
  return activeAppDir;
}

function readRuntimeMetadata(dataDir, segment) {
  return readJsonFileSafe(path.join(resolveRuntimeActiveVendorDir(dataDir), segment, "runtime.json"));
}

function readSeedRuntimeMetadata(segment) {
  return readJsonFileSafe(path.join(resolveRuntimeSeedVendorDir(), segment, "runtime.json"));
}

function shouldPrepareNodeRuntime(dataDir) {
  const executableName = process.platform === "win32" ? "node.exe" : "node";
  const vendorDir = resolveRuntimeActiveVendorDir(dataDir);
  const executablePath = path.join(vendorDir, "node", executableName);
  if (!fs.existsSync(executablePath)) return true;
  const metadata = readRuntimeMetadata(dataDir, "node");
  if (!metadata) return true;
  if (isDev()) {
    return metadata.nodeVersion !== process.version || metadata.arch !== process.arch;
  }
  const seedMetadata = readSeedRuntimeMetadata("node");
  if (!seedMetadata) return false;
  return metadata.nodeVersion !== seedMetadata.nodeVersion || metadata.arch !== seedMetadata.arch;
}

function shouldPrepareFfmpegRuntime(dataDir) {
  const executableName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const probeName = process.platform === "win32" ? "ffprobe.exe" : "ffprobe";
  const vendorDir = resolveRuntimeActiveVendorDir(dataDir);
  if (!fs.existsSync(path.join(vendorDir, "ffmpeg", executableName))) return true;
  if (!fs.existsSync(path.join(vendorDir, "ffmpeg", probeName))) return true;
  const metadata = readRuntimeMetadata(dataDir, "ffmpeg");
  return (
    !metadata ||
    metadata.sourceUrl !== DESKTOP_RUNTIME_DEFAULTS.ffmpegUrl ||
    metadata.archiveName !== DESKTOP_RUNTIME_DEFAULTS.ffmpegArchiveName ||
    metadata.arch !== process.arch
  );
}

function shouldPreparePythonRuntime(dataDir) {
  const executableName = process.platform === "win32" ? "python.exe" : "python";
  const vendorDir = resolveRuntimeActiveVendorDir(dataDir);
  const repoRoot = resolveRepoRoot();
  const requirementsPath = path.join(repoRoot, "apps", "worker", "python-requirements.txt");
  const expectedRequirementsHash = hashFileSafe(requirementsPath);
  if (!fs.existsSync(path.join(vendorDir, "python", executableName))) return true;
  const metadata = readRuntimeMetadata(dataDir, "python");
  if (!metadata) return true;
  if (metadata.pythonVersion !== DESKTOP_RUNTIME_DEFAULTS.pythonVersion) return true;
  if (metadata.sourceUrl !== DESKTOP_RUNTIME_DEFAULTS.pythonUrl) return true;
  if (metadata.getPipUrl !== DESKTOP_RUNTIME_DEFAULTS.getPipUrl) return true;
  if (metadata.fasterWhisperModel !== DESKTOP_RUNTIME_DEFAULTS.fasterWhisperModel) return true;
  if (metadata.requirementsHash !== expectedRequirementsHash) return true;
  if (metadata.arch !== process.arch) return true;
  return false;
}

function shouldPrepareEsbuildRuntime(dataDir) {
  const executableName = process.platform === "win32" ? "esbuild.exe" : "esbuild";
  const vendorDir = resolveRuntimeActiveVendorDir(dataDir);
  if (!fs.existsSync(path.join(vendorDir, "esbuild", executableName))) return true;
  const metadata = readRuntimeMetadata(dataDir, "esbuild");
  if (!metadata) return true;
  return metadata.platform !== process.platform || metadata.arch !== process.arch;
}

function shouldPrepareWhisperModel(dataDir) {
  const vendorDir = resolveRuntimeActiveVendorDir(dataDir);
  const modelRoot = path.join(vendorDir, "models", "faster-whisper");
  const expectedCacheDir = `models--Systran--faster-whisper-${DESKTOP_RUNTIME_DEFAULTS.fasterWhisperModel}`;
  if (!fs.existsSync(path.join(modelRoot, expectedCacheDir))) return true;
  const metadata = readRuntimeMetadata(dataDir, "python");
  return !metadata || metadata.fasterWhisperModel !== DESKTOP_RUNTIME_DEFAULTS.fasterWhisperModel;
}

function collectRuntimePreparationReasons(dataDir) {
  return {
    node: shouldPrepareNodeRuntime(dataDir),
    esbuild: shouldPrepareEsbuildRuntime(dataDir),
    ffmpeg: shouldPrepareFfmpegRuntime(dataDir),
    python: shouldPreparePythonRuntime(dataDir),
    whisperModel: shouldPrepareWhisperModel(dataDir)
  };
}

function buildRuntimeEnv(dataDir) {
  const repoRoot = isDev() ? resolveRepoRoot() : resolveRuntimeActiveAppDir(dataDir);
  const runtimeConfig = resolveDesktopRuntimeConfig(dataDir);
  const runtimeSecrets = readDesktopRuntimeSecrets(dataDir);
  const runtimeConfigPath = getDesktopRuntimeConfigPath(dataDir);
  const appSettingsTemplatePath = path.join(repoRoot, "config", "app_settings.template.json");
  const workerLogDir = getDesktopRuntimePaths(dataDir).workerLogDir;
  const activeVendorDir = resolveRuntimeActiveVendorDir(dataDir);
  const pythonExecutableName = process.platform === "win32" ? "python.exe" : "python";
  const esbuildExecutableName = process.platform === "win32" ? "esbuild.exe" : "esbuild";
  const ffmpegExecutableName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const ffprobeExecutableName = process.platform === "win32" ? "ffprobe.exe" : "ffprobe";
  const fasterWhisperModelName =
    process.env.FLOWSHOPY_FASTER_WHISPER_MODEL?.trim() || "small";
  const pythonPath = resolveVendoredRuntimeBinary(dataDir, ["python", pythonExecutableName], process.env.FLOWSHOPY_PYTHON_PATH?.trim() || "");
  const esbuildPath = resolveVendoredRuntimeBinary(dataDir, ["esbuild", esbuildExecutableName], process.env.ESBUILD_BINARY_PATH?.trim() || "");
  const ffmpegPath = resolveVendoredRuntimeBinary(dataDir, ["ffmpeg", ffmpegExecutableName], process.env.FFMPEG_PATH?.trim() || "");
  const ffprobePath = resolveVendoredRuntimeBinary(dataDir, ["ffmpeg", ffprobeExecutableName], process.env.FFPROBE_PATH?.trim() || "");
  const fasterWhisperModelDir = path.join(
    activeVendorDir,
    "models",
    "faster-whisper"
  );
  return {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    DATA_DIR: dataDir,
    FLOWSHOPY_DESKTOP_MODE: "true",
    FLOWSHOPY_DESKTOP_CONFIG_PATH: runtimeConfigPath,
    APP_SETTINGS_TEMPLATE_PATH: appSettingsTemplatePath,
    FLOWSHOPY_DESKTOP_VENDOR_DIR: activeVendorDir,
    FLOWSHOPY_PYTHON_REQUIREMENTS_PATH: path.join(repoRoot, "apps", "worker", "python-requirements.txt"),
    FLOWSHOPY_PYTHON_PATH: pythonPath || process.env.FLOWSHOPY_PYTHON_PATH || "",
    ESBUILD_BINARY_PATH: esbuildPath || process.env.ESBUILD_BINARY_PATH || "",
    XTTS_API_PYTHON: pythonPath || process.env.XTTS_API_PYTHON || "",
    QWEN_TTS_PYTHON: pythonPath || process.env.QWEN_TTS_PYTHON || "",
    CHATTERBOX_PYTHON: pythonPath || process.env.CHATTERBOX_PYTHON || "",
    FFMPEG_PATH: ffmpegPath || process.env.FFMPEG_PATH || "",
    FFPROBE_PATH: ffprobePath || process.env.FFPROBE_PATH || "",
    FLOWSHOPY_FASTER_WHISPER_MODEL: fasterWhisperModelName,
    FLOWSHOPY_FASTER_WHISPER_MODEL_DIR: fasterWhisperModelDir,
    WORKER_LOG_DIR: workerLogDir,
    INTERNAL_JOBS_EVENT_TOKEN: runtimeSecrets.internalJobsEventToken,
    AUTH_JWT_SECRET: runtimeSecrets.authJwtSecret,
    AGENT_CONTROL_TOKEN_SECRET: runtimeSecrets.agentControlTokenSecret,
    AUTH_COOKIE_SECURE: runtimeConfig.authCookieSecure ? "true" : "false",
    WORKER_REQUIRE_WS_ON_STARTUP: runtimeConfig.workerRequireWsOnStartup ? "true" : "false"
  };
}

async function isPortFree(host, port) {
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

async function readHealthPayload(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    return null;
  }
}

async function findListeningPid(port) {
  if (process.platform === "win32") {
    try {
      const { stdout } = await execFile("powershell", [
        "-NoProfile",
        "-Command",
        `Get-NetTCPConnection -State Listen -LocalPort ${port} | Select-Object -First 1 -ExpandProperty OwningProcess`
      ]);
      const pid = Number(String(stdout).trim());
      return Number.isFinite(pid) && pid > 0 ? pid : null;
    } catch {
      return null;
    }
  }
  try {
    const { stdout } = await execFile("lsof", ["-ti", `tcp:${port}`]);
    const pid = Number(String(stdout).split(/\r?\n/).find(Boolean) ?? "");
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

async function killProcessByPid(pid) {
  if (!pid) {
    return false;
  }
  try {
    if (process.platform === "win32") {
      await execFile("taskkill", ["/PID", String(pid), "/F", "/T"]);
    } else {
      process.kill(pid, "SIGTERM");
    }
    return true;
  } catch {
    return false;
  }
}

async function waitForPortToFree(host, port, timeoutMs = 10_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isPortFree(host, port)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function findNextFreePort(host, startPort) {
  let candidate = startPort + 1;
  while (candidate < 65535) {
    if (await isPortFree(host, candidate)) {
      return candidate;
    }
    candidate += 1;
  }
  throw new Error(`No free port available after ${startPort}`);
}

async function resolveRuntimePortConflicts(dataDir) {
  const configPath = getDesktopRuntimeConfigPath(dataDir);
  const current = ensureDesktopRuntimeConfigFile(configPath, DEFAULT_DESKTOP_RUNTIME_CONFIG);
  const next = { ...current };
  let changed = false;
  for (const [portKey, hostKey, healthPath] of [
    ["apiPort", "apiHost", "/health"],
    ["workerPort", "apiHost", "/health"],
    ["webPort", "webHost", null]
  ]) {
    const port = next[portKey];
    const host = next[hostKey];
    if (await isPortFree(host, port)) {
      continue;
    }
    if (healthPath) {
      const payload = await readHealthPayload(`http://${host}:${port}${healthPath}`);
      const looksLikeOurRuntime = payload && payload.ok === true && payload.dataDir === dataDir;
      if (looksLikeOurRuntime) {
        const pid = await findListeningPid(port);
        if (pid) {
          await killProcessByPid(pid);
          if (await waitForPortToFree(host, port)) {
            continue;
          }
        }
      }
    }
    next[portKey] = await findNextFreePort(host, port);
    changed = true;
  }
  if (changed) {
    writeDesktopRuntimeConfig(configPath, next);
  }
  return changed ? next : current;
}

function emitBootstrapState(nextState) {
  if (typeof nextState.progress === "number" && Number.isFinite(nextState.progress)) {
    bootstrapProgressTarget = Math.max(0, Math.min(100, nextState.progress));
  }
  bootstrapState = {
    ...bootstrapState,
    ...nextState
  };
  writeDesktopBootstrapLog(
    `state title="${bootstrapState.title}" message="${bootstrapState.message}" status=${bootstrapState.status} progress=${Math.round(bootstrapState.progress)}`
  );
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

function getRendererContentType(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".ico":
      return "image/x-icon";
    default:
      return "application/octet-stream";
  }
}

async function ensurePackagedRendererServer(dataDir) {
  if (isDev() || rendererHttpServer) {
    return;
  }
  const runtimeConfig = readDesktopRuntimeConfig(
    getDesktopRuntimeConfigPath(dataDir),
    DEFAULT_DESKTOP_RUNTIME_CONFIG
  );
  const distDir = path.join(resolveRepoRoot(), "apps", "web", "dist");
  const indexPath = path.join(distDir, "index.html");
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Built web UI not found at ${indexPath}`);
  }

  rendererHttpServer = http.createServer((req, res) => {
    try {
      const requestUrl = new URL(req.url || "/", `http://${runtimeConfig.webHost}:${runtimeConfig.webPort}`);
      let pathname = decodeURIComponent(requestUrl.pathname);
      if (pathname === "/") {
        pathname = "/index.html";
      }
      const candidatePath = path.normalize(path.join(distDir, pathname));
      const isWithinDist =
        candidatePath === distDir ||
        candidatePath.startsWith(`${distDir}${path.sep}`);
      if (!isWithinDist) {
        res.statusCode = 403;
        res.end("Forbidden");
        return;
      }

      let filePath = candidatePath;
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = indexPath;
      }

      res.statusCode = 200;
      res.setHeader("Content-Type", getRendererContentType(filePath));
      fs.createReadStream(filePath)
        .on("error", () => {
          if (!res.headersSent) {
            res.statusCode = 500;
          }
          res.end("Failed to read renderer asset");
        })
        .pipe(res);
    } catch {
      res.statusCode = 500;
      res.end("Failed to serve renderer");
    }
  });

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      rendererHttpServer?.off("error", onError);
      reject(error);
    };
    rendererHttpServer.once("error", onError);
    rendererHttpServer.listen(runtimeConfig.webPort, runtimeConfig.webHost, () => {
      rendererHttpServer?.off("error", onError);
      writeDesktopBootstrapLog(
        `renderer server listening at http://${runtimeConfig.webHost}:${runtimeConfig.webPort}`
      );
      resolve();
    });
  });
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
  const runtimeNodeExecutable = resolveBootstrapNodeExecutable();
  const taskFile = path.join(repoRoot, taskRelativePath);
  await new Promise((resolve, reject) => {
    writeDesktopBootstrapLog(`bootstrap task start ${taskRelativePath}`);
    const child = spawn(runtimeNodeExecutable, [taskFile, ...args], {
      cwd: repoRoot,
      env: {
        ...buildRuntimeEnv(dataDir),
        DESKTOP_RUNTIME_NODE_PATH: runtimeNodeExecutable
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout.on("data", (chunk) => {
      writeDesktopBootstrapLog(`[task:${path.basename(taskRelativePath)}][stdout] ${String(chunk).trimEnd()}`);
      process.stdout.write(`[desktop-bootstrap] ${chunk}`);
    });
    child.stderr.on("data", (chunk) => {
      writeDesktopBootstrapLog(`[task:${path.basename(taskRelativePath)}][stderr] ${String(chunk).trimEnd()}`);
      process.stderr.write(`[desktop-bootstrap] ${chunk}`);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      writeDesktopBootstrapLog(`bootstrap task exit ${taskRelativePath} code=${code}`);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Bootstrap task failed (${taskRelativePath}) with exit code ${code}`));
    });
  });
}

async function runBootstrapTaskWithProgress(options) {
  const {
    dataDir,
    taskRelativePath,
    args = [],
    startProgress,
    maxProgress,
    message
  } = options;
  updateBootstrapStage(message, startProgress, { immediate: true });
  const timer = setInterval(() => {
    const next = Math.min(maxProgress, bootstrapProgressTarget + 0.7);
    setBootstrapProgress(next);
  }, 300);
  try {
    await runDetachedNodeTask(taskRelativePath, args, dataDir);
  } finally {
    clearInterval(timer);
  }
  updateBootstrapStage(message, maxProgress, { immediate: true });
}

async function ensureDesktopRuntimeDependencies(dataDir) {
  ensureSeedRuntimeCopiedToActiveVendor(dataDir);
  const required = collectRuntimePreparationReasons(dataDir);

  updateBootstrapStage("Verificando runtimes locais...", 5, { immediate: true });

  if (required.node) {
    await runBootstrapTaskWithProgress({
      dataDir,
      taskRelativePath: path.join("scripts", "prepare-desktop-node.mjs"),
      startProgress: 6,
      maxProgress: 11,
      message: "Preparando runtime Node local..."
    });
  }

  if (required.esbuild) {
    await runBootstrapTaskWithProgress({
      dataDir,
      taskRelativePath: path.join("scripts", "prepare-desktop-esbuild.mjs"),
      startProgress: 11,
      maxProgress: 16,
      message: "Preparando runtime esbuild local..."
    });
  }

  if (required.ffmpeg) {
    await runBootstrapTaskWithProgress({
      dataDir,
      taskRelativePath: path.join("scripts", "prepare-desktop-ffmpeg.mjs"),
      startProgress: 16,
      maxProgress: 22,
      message: "Baixando runtime de mídia..."
    });
  }

  if (required.python || required.whisperModel) {
    await runBootstrapTaskWithProgress({
      dataDir,
      taskRelativePath: path.join("scripts", "prepare-desktop-python.mjs"),
      startProgress: 22,
      maxProgress: 38,
      message: "Preparando runtime Python e transcrição..."
    });
  }
}

function spawnRuntimeProcess(name, entryRelativePath, dataDir) {
  const repoRoot = isDev() ? resolveRepoRoot() : resolveRuntimeActiveAppDir(dataDir);
  const tsxCliPath = resolveTsxCliPath(repoRoot);
  const entryFile = path.join(repoRoot, entryRelativePath);
  const runtimeNodeExecutable = resolveRuntimeNodeExecutable(dataDir);
  writeDesktopBootstrapLog(
    `spawning ${name}: ${JSON.stringify({
      node: runtimeNodeExecutable,
      tsx: tsxCliPath,
      entry: entryFile,
      cwd: repoRoot
    })}`
  );
  const child = spawn(runtimeNodeExecutable, [tsxCliPath, entryFile], {
    cwd: repoRoot,
    env: buildRuntimeEnv(dataDir),
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.on("data", (chunk) => {
    const text = chunk.toString("utf8").trimEnd();
    if (text) {
      writeDesktopBootstrapLog(`[${name}:stdout] ${text}`);
    }
    process.stdout.write(`[${name}] ${chunk}`);
  });
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString("utf8").trimEnd();
    if (text) {
      writeDesktopBootstrapLog(`[${name}:stderr] ${text}`);
    }
    process.stderr.write(`[${name}] ${chunk}`);
  });
  child.on("error", (error) => {
    writeDesktopBootstrapLog(`[${name}:error] ${error.stack || error.message}`);
  });
  child.on("exit", (code, signal) => {
    writeDesktopBootstrapLog(`[${name}:exit] code=${code ?? "null"} signal=${signal ?? "null"}`);
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
  await new Promise((resolve) => {
    if (!rendererHttpServer) {
      resolve();
      return;
    }
    const server = rendererHttpServer;
    rendererHttpServer = null;
    server.close(() => resolve());
  });
  runtimeState.api = { status: "stopped", pid: null };
  runtimeState.worker = { status: "stopped", pid: null };
}

function resolveRendererTarget(repoRoot) {
  const dataDir = runtimeState.dataDir || resolveDataDir();
  const runtimeConfig = readDesktopRuntimeConfig(
    getDesktopRuntimeConfigPath(dataDir),
    DEFAULT_DESKTOP_RUNTIME_CONFIG
  );
  return `http://${runtimeConfig.webHost}:${runtimeConfig.webPort}`;
}

async function loadRenderer() {
  const repoRoot = resolveRepoRoot();
  const target = resolveRendererTarget(repoRoot);
  runtimeState.rendererTarget = target;
  await waitForHttp(target, 60_000, {
    onTick: (ratio) => {
      updateBootstrapStage("Carregando interface instalada...", 92 + ratio * 5);
    }
  });
  await Promise.all([
    new Promise((resolve) => {
      mainWindow.once("ready-to-show", resolve);
    }),
    mainWindow.loadURL(target)
  ]);
  updateBootstrapStage("Aplicação pronta.", 100, { immediate: true });
  await new Promise((resolve) => setTimeout(resolve, 120));
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
  mainWindow.maximize();
  mainWindow.show();
}

async function startLocalRuntime() {
  const dataDir = resolveDataDir();
  runtimeState.dataDir = dataDir;
  readDesktopRuntimeSecrets(dataDir);
  await ensureDesktopRuntimeDependencies(dataDir);
  prepareInstalledRuntimeWorkspace(dataDir);
  updateBootstrapStage("Validando portas e runtime local...", 6, { immediate: true });
  const runtimeConfig = await resolveRuntimePortConflicts(dataDir);
  await ensurePackagedRendererServer(dataDir);
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
    backgroundColor: "#ff6a1f",
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
  writeDesktopBootstrapLog(`bootstrap start pid=${process.pid} packaged=${app.isPackaged}`);
  await app.whenReady();
  writeDesktopBootstrapLog("app ready");
  Menu.setApplicationMenu(null);
  registerDesktopIpc();
  await createSplashWindow();
  writeDesktopBootstrapLog("splash window created");
  await createMainWindow();
  writeDesktopBootstrapLog("main window created");
  emitBootstrapState({
    title: "FlowShopy",
    message: "A aplicação está preparando o runtime local.",
    progress: 4,
    status: "booting"
  });
  try {
    writeDesktopBootstrapLog("starting local runtime");
    await startLocalRuntime();
    updateBootstrapStage("Abrindo aplicação...", 97, { status: "booting" });
    await loadRenderer();
    writeDesktopBootstrapLog("renderer loaded");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeDesktopBootstrapLog(`bootstrap error ${message}`);
    emitBootstrapState({
      title: "Falha ao iniciar",
      message: "A inicialização falhou. Verifique logs, providers locais e tente novamente.",
      progress: 100,
      status: "error"
    });
    await dialog.showErrorBox(
      "Falha ao iniciar o runtime local",
      `FlowShopy não conseguiu iniciar a API local, o worker local ou a interface.\n\n${message}`
    );
  }

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createSplashWindow();
      await createMainWindow();
      emitBootstrapState({
        title: "FlowShopy",
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
  writeDesktopBootstrapLog("window-all-closed");
  if (process.platform !== "darwin") {
    await stopRuntimeProcesses();
    app.quit();
  }
});

app.on("before-quit", async () => {
  writeDesktopBootstrapLog("before-quit");
  await stopRuntimeProcesses();
});

bootstrapDesktop().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  writeDesktopBootstrapLog(`bootstrap fatal ${message}`);
  console.error(message);
  app.exit(1);
});
