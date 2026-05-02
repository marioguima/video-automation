import fs from "node:fs";
import path from "node:path";

export type AppConfig = {
  dataDir: string;
  databaseUrl: string;
  apiHost: string;
  apiPort: number;
  workerPort: number;
  webPort: number;
  ollamaBaseUrl: string;
  ollamaModel: string;
  ollamaTimeoutMs: number;
  comfyuiBaseUrl: string;
  comfyPromptTimeoutMs: number;
  comfyGenerationTimeoutMs: number;
  comfyViewTimeoutMs: number;
  comfySettingsPath: string;
  appSettingsPath: string;
  appSettingsTemplatePath: string;
  qwenTtsBaseUrl: string;
  ttsProvider: string;
  ttsVoicesDir: string;
  ttsVoicesIndex: string;
  ttsSettingsPath: string;
  xttsApiBaseUrl: string;
  xttsApiPython: string;
  xttsApiServerDir: string;
  xttsApiModelDir: string;
  xttsApiSpeakerDir: string;
  xttsApiOutputDir: string;
  xttsApiModelSource: string;
  xttsApiModelVersion: string;
  xttsApiDevice: string;
  xttsApiUseCache: boolean;
  xttsApiLowVram: boolean;
  xttsApiDeepspeed: boolean;
  xttsApiAutostart: boolean;
  xttsApiStartTimeoutMs: number;
  xttsApiDetach: boolean;
  xttsApiRequestTimeoutMs: number;
  qwenTtsModel: string;
  qwenTtsTask: string;
  qwenTtsSpeaker: string;
  qwenTtsLanguage: string;
  qwenTtsInstruct: string;
  qwenTtsDevice: string;
  qwenTtsDtype: string;
  qwenTtsAttnImplementation: string;
  qwenTtsPython: string;
  chatterboxPython: string;
  chatterboxDevice: string;
  chatterboxLanguage: string;
  chatterboxVoiceId: string;
  chatterboxExaggeration: number;
  chatterboxTemperature: number;
  chatterboxCfgWeight: number;
  xttsLanguage: string;
  xttsVoiceId: string;
};

function deriveDataDirFromDatabaseUrl(databaseUrl: string): string | null {
  const trimmed = databaseUrl.trim();
  if (!trimmed.startsWith("file:")) {
    return null;
  }
  let dbPath = trimmed.slice("file:".length);
  if (dbPath.length === 0) {
    return null;
  }
  if (dbPath.startsWith("//")) {
    dbPath = dbPath.replace(/^\/+/, "/");
  }
  if (/^[A-Za-z]:[\\/]/.test(dbPath)) {
    return path.dirname(dbPath);
  }
  if (dbPath.startsWith("/")) {
    return path.dirname(dbPath);
  }
  const resolved = path.resolve(process.cwd(), dbPath);
  return path.dirname(resolved);
}

export function resolveDataDir(databaseUrl = resolveDatabaseUrl()): string {
  const envValue = process.env.DATA_DIR?.trim();
  if (envValue && envValue.length > 0) {
    return envValue;
  }
  const derived = deriveDataDirFromDatabaseUrl(databaseUrl);
  if (derived) {
    return derived;
  }
  return process.cwd();
}

export function ensureDataDir(dataDir = resolveDataDir()): void {
  fs.mkdirSync(dataDir, { recursive: true });
}

export function resolveProjectRoot(startDir = process.cwd()): string {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml")) || fs.existsSync(path.join(current, ".git"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(startDir);
    }
    current = parent;
  }
}

function normalizeFilePath(filePath: string): string {
  if (process.platform === "win32") {
    return filePath.replace(/\\/g, "/");
  }
  return filePath;
}

export function resolveDatabaseUrl(dataDir?: string): string {
  const resolvedDataDir = dataDir?.trim() || process.env.DATA_DIR?.trim();
  if (resolvedDataDir && resolvedDataDir.length > 0) {
    const dbPath = path.join(resolvedDataDir, "vizlec.db");
    return `file:${normalizeFilePath(dbPath)}`;
  }
  return "file:./vizlec.db";
}

export function getConfig(): AppConfig {
  const dataDir = resolveDataDir();
  const databaseUrl = resolveDatabaseUrl(dataDir);
  const ttsVoicesDir = process.env.TTS_VOICES_DIR ?? path.join(dataDir, "voices");
  const ttsVoicesIndex = process.env.TTS_VOICES_INDEX ?? path.join(dataDir, "voices.json");
  const ttsSettingsPath =
    process.env.TTS_SETTINGS_PATH ?? path.join(dataDir, "tts_settings.json");
  const comfySettingsPath =
    process.env.COMFY_SETTINGS_PATH ?? path.join(dataDir, "comfy_settings.json");
  const appSettingsPath =
    process.env.APP_SETTINGS_PATH ?? path.join(dataDir, "app_settings.json");
  const appSettingsTemplatePath =
    process.env.APP_SETTINGS_TEMPLATE_PATH ??
    path.join(resolveProjectRoot(process.cwd()), "config", "app_settings.template.json");
  const xttsApiModelDir =
    process.env.XTTS_API_MODEL_DIR ?? path.join(dataDir, "xtts_models");
  const xttsApiOutputDir =
    process.env.XTTS_API_OUTPUT_DIR ?? path.join(dataDir, "xtts_output");
  const xttsApiSpeakerDir = process.env.XTTS_API_SPEAKER_DIR ?? ttsVoicesDir;
  process.env.VIZLEC_DB_URL = databaseUrl;
  return {
    dataDir,
    databaseUrl,
    apiHost: process.env.API_HOST ?? "127.0.0.1",
    apiPort: Number(process.env.API_PORT ?? 4010),
    workerPort: Number(process.env.WORKER_PORT ?? 4011),
    webPort: Number(process.env.WEB_PORT ?? 4173),
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
    ollamaModel: process.env.OLLAMA_MODEL ?? "llama3.2:3b",
    ollamaTimeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS ?? 120000),
    comfyuiBaseUrl: process.env.COMFYUI_BASE_URL ?? "http://127.0.0.1:8188",
    comfyPromptTimeoutMs: Number(process.env.COMFY_PROMPT_TIMEOUT_MS ?? 60000),
    comfyGenerationTimeoutMs: Number(process.env.COMFY_GENERATION_TIMEOUT_MS ?? 300000),
    comfyViewTimeoutMs: Number(process.env.COMFY_VIEW_TIMEOUT_MS ?? 60000),
    comfySettingsPath,
    appSettingsPath,
    appSettingsTemplatePath,
    qwenTtsBaseUrl: process.env.QWEN_TTS_BASE_URL ?? "http://127.0.0.1:9000",
    ttsProvider: process.env.TTS_PROVIDER ?? "xtts",
    ttsVoicesDir,
    ttsVoicesIndex,
    ttsSettingsPath,
    xttsApiBaseUrl: process.env.XTTS_API_BASE_URL ?? "http://127.0.0.1:8020",
    xttsApiPython: process.env.XTTS_API_PYTHON ?? "python",
    xttsApiServerDir: process.env.XTTS_API_SERVER_DIR ?? "",
    xttsApiModelDir,
    xttsApiSpeakerDir,
    xttsApiOutputDir,
    xttsApiModelSource: process.env.XTTS_API_MODEL_SOURCE ?? "local",
    xttsApiModelVersion: process.env.XTTS_API_MODEL_VERSION ?? "v2.0.2",
    xttsApiDevice: process.env.XTTS_API_DEVICE ?? "cuda",
    xttsApiUseCache: (process.env.XTTS_API_USE_CACHE ?? "true") === "true",
    xttsApiLowVram: (process.env.XTTS_API_LOWVRAM ?? "false") === "true",
    xttsApiDeepspeed: (process.env.XTTS_API_DEEPSPEED ?? "false") === "true",
    xttsApiAutostart: (process.env.XTTS_API_AUTOSTART ?? "true") === "true",
    xttsApiStartTimeoutMs: Number(process.env.XTTS_API_START_TIMEOUT_MS ?? 900000),
    xttsApiDetach: (process.env.XTTS_API_DETACH ?? "false") === "true",
    xttsApiRequestTimeoutMs: Number(process.env.XTTS_API_REQUEST_TIMEOUT_MS ?? 600000),
    qwenTtsModel:
      process.env.QWEN_TTS_MODEL ?? "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
    qwenTtsTask: process.env.QWEN_TTS_TASK ?? "custom_voice",
    qwenTtsSpeaker: process.env.QWEN_TTS_SPEAKER ?? "Ryan",
    qwenTtsLanguage: process.env.QWEN_TTS_LANGUAGE ?? "Auto",
    qwenTtsInstruct: process.env.QWEN_TTS_INSTRUCT ?? "",
    qwenTtsDevice: process.env.QWEN_TTS_DEVICE ?? "cuda:0",
    qwenTtsDtype: process.env.QWEN_TTS_DTYPE ?? "bfloat16",
    qwenTtsAttnImplementation:
      process.env.QWEN_TTS_ATTN_IMPLEMENTATION ?? "flash_attention_2",
    qwenTtsPython: process.env.QWEN_TTS_PYTHON ?? "python",
    chatterboxPython: process.env.CHATTERBOX_PYTHON ?? "python",
    chatterboxDevice: process.env.CHATTERBOX_DEVICE ?? "cuda",
    chatterboxLanguage: process.env.CHATTERBOX_LANGUAGE ?? "pt",
    chatterboxVoiceId: process.env.CHATTERBOX_VOICE_ID ?? "h-adulto-grave",
    chatterboxExaggeration: Number(process.env.CHATTERBOX_EXAGGERATION ?? 0.5),
    chatterboxTemperature: Number(process.env.CHATTERBOX_TEMPERATURE ?? 0.8),
    chatterboxCfgWeight: Number(process.env.CHATTERBOX_CFG_WEIGHT ?? 0.5),
    xttsLanguage: process.env.XTTS_LANGUAGE ?? "pt",
    xttsVoiceId: process.env.XTTS_VOICE_ID ?? "h-adulto-grave"
  };
}

export function resolveDataPath(...segments: string[]): string {
  return path.join(resolveDataDir(), ...segments);
}
