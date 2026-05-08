import fs from "node:fs";
import path from "node:path";

export const DEFAULT_DESKTOP_RUNTIME_CONFIG = {
  apiHost: "127.0.0.1",
  apiPort: 4110,
  workerPort: 4111,
  webHost: "127.0.0.1",
  webPort: 4173,
  authCookieSecure: false,
  workerRequireWsOnStartup: false
};

function normalizeInteger(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

function normalizeBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeString(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function getDesktopRuntimeConfigPath(dataDir) {
  return path.join(dataDir, "desktop.runtime.json");
}

export function getDesktopRuntimePaths(dataDir) {
  return {
    dataDir,
    runtimeConfigPath: getDesktopRuntimeConfigPath(dataDir),
    appSettingsPath: path.join(dataDir, "app_settings.json"),
    databasePath: path.join(dataDir, "vizlec.db"),
    workerLogDir: path.join(dataDir, "logs")
  };
}

export function normalizeDesktopRuntimeConfig(input = {}, defaults = DEFAULT_DESKTOP_RUNTIME_CONFIG) {
  return {
    apiHost: normalizeString(input.apiHost, defaults.apiHost),
    apiPort: normalizeInteger(input.apiPort, defaults.apiPort),
    workerPort: normalizeInteger(input.workerPort, defaults.workerPort),
    webHost: normalizeString(input.webHost, defaults.webHost),
    webPort: normalizeInteger(input.webPort, defaults.webPort),
    authCookieSecure: normalizeBoolean(input.authCookieSecure, defaults.authCookieSecure),
    workerRequireWsOnStartup: normalizeBoolean(
      input.workerRequireWsOnStartup,
      defaults.workerRequireWsOnStartup
    )
  };
}

export function readDesktopRuntimeConfig(configPath, defaults = DEFAULT_DESKTOP_RUNTIME_CONFIG) {
  if (!fs.existsSync(configPath)) {
    return normalizeDesktopRuntimeConfig({}, defaults);
  }
  try {
    return normalizeDesktopRuntimeConfig(JSON.parse(fs.readFileSync(configPath, "utf8")), defaults);
  } catch {
    return normalizeDesktopRuntimeConfig({}, defaults);
  }
}

export function writeDesktopRuntimeConfig(configPath, next) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(normalizeDesktopRuntimeConfig(next), null, 2)}\n`, "utf8");
}

export function ensureDesktopRuntimeConfigFile(configPath, defaults = DEFAULT_DESKTOP_RUNTIME_CONFIG) {
  const current = readDesktopRuntimeConfig(configPath, defaults);
  if (!fs.existsSync(configPath)) {
    writeDesktopRuntimeConfig(configPath, current);
  }
  return current;
}
