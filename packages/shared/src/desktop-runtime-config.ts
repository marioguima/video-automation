import fs from "node:fs";
import path from "node:path";

export type DesktopRuntimeConfig = {
  apiHost?: string;
  apiPort?: number;
  workerPort?: number;
  webHost?: string;
  webPort?: number;
  authCookieSecure?: boolean;
  workerRequireWsOnStartup?: boolean;
};

export type DesktopRuntimePaths = {
  dataDir: string;
  runtimeConfigPath: string;
  appSettingsPath: string;
  databasePath: string;
  workerLogDir: string;
};

export const DEFAULT_DESKTOP_RUNTIME_CONFIG: Required<DesktopRuntimeConfig> = {
  apiHost: "127.0.0.1",
  apiPort: 4110,
  workerPort: 4111,
  webHost: "127.0.0.1",
  webPort: 4173,
  authCookieSecure: false,
  workerRequireWsOnStartup: false
};

function normalizeInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function getDesktopRuntimeConfigPath(dataDir: string): string {
  return path.join(dataDir, "desktop.runtime.json");
}

export function getDesktopRuntimePaths(dataDir: string): DesktopRuntimePaths {
  return {
    dataDir,
    runtimeConfigPath: getDesktopRuntimeConfigPath(dataDir),
    appSettingsPath: path.join(dataDir, "app_settings.json"),
    databasePath: path.join(dataDir, "vizlec.db"),
    workerLogDir: path.join(dataDir, "logs")
  };
}

export function normalizeDesktopRuntimeConfig(
  input: DesktopRuntimeConfig | undefined,
  defaults: DesktopRuntimeConfig = DEFAULT_DESKTOP_RUNTIME_CONFIG
): Required<DesktopRuntimeConfig> {
  return {
    apiHost: normalizeString(input?.apiHost, defaults.apiHost ?? DEFAULT_DESKTOP_RUNTIME_CONFIG.apiHost),
    apiPort: normalizeInteger(input?.apiPort, defaults.apiPort ?? DEFAULT_DESKTOP_RUNTIME_CONFIG.apiPort),
    workerPort: normalizeInteger(input?.workerPort, defaults.workerPort ?? DEFAULT_DESKTOP_RUNTIME_CONFIG.workerPort),
    webHost: normalizeString(input?.webHost, defaults.webHost ?? DEFAULT_DESKTOP_RUNTIME_CONFIG.webHost),
    webPort: normalizeInteger(input?.webPort, defaults.webPort ?? DEFAULT_DESKTOP_RUNTIME_CONFIG.webPort),
    authCookieSecure: normalizeBoolean(
      input?.authCookieSecure,
      defaults.authCookieSecure ?? DEFAULT_DESKTOP_RUNTIME_CONFIG.authCookieSecure
    ),
    workerRequireWsOnStartup: normalizeBoolean(
      input?.workerRequireWsOnStartup,
      defaults.workerRequireWsOnStartup ?? DEFAULT_DESKTOP_RUNTIME_CONFIG.workerRequireWsOnStartup
    )
  };
}

export function readDesktopRuntimeConfig(
  configPath: string,
  defaults: DesktopRuntimeConfig = DEFAULT_DESKTOP_RUNTIME_CONFIG
): Required<DesktopRuntimeConfig> {
  if (!fs.existsSync(configPath)) {
    return normalizeDesktopRuntimeConfig(undefined, defaults);
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as DesktopRuntimeConfig;
    return normalizeDesktopRuntimeConfig(parsed, defaults);
  } catch {
    return normalizeDesktopRuntimeConfig(undefined, defaults);
  }
}

export function writeDesktopRuntimeConfig(configPath: string, next: DesktopRuntimeConfig): void {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(normalizeDesktopRuntimeConfig(next), null, 2)}\n`, "utf8");
}

export function ensureDesktopRuntimeConfigFile(
  configPath: string,
  defaults: DesktopRuntimeConfig = DEFAULT_DESKTOP_RUNTIME_CONFIG
): Required<DesktopRuntimeConfig> {
  const current = readDesktopRuntimeConfig(configPath, defaults);
  if (!fs.existsSync(configPath)) {
    writeDesktopRuntimeConfig(configPath, current);
  }
  return current;
}
