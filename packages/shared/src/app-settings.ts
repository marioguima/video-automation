import fs from "node:fs";
import path from "node:path";

export type LlmProviderSettings = {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
};

export type AppSettings = {
  theme?: { family?: string; mode?: string };
  llm?: {
    provider?: string;
    providers?: Record<string, LlmProviderSettings | undefined>;
    // Legacy flat fields are accepted for migration only.
    baseUrl?: string;
    model?: string;
    apiKeys?: {
      gemini?: string;
      openai?: string;
    };
    timeoutMs?: number;
  };
  comfy?: {
    baseUrl?: string;
    promptTimeoutMs?: number;
    generationTimeoutMs?: number;
    viewTimeoutMs?: number;
    masterPrompt?: string | null;
    workflowFile?: string;
  };
  tts?: {
    baseUrl?: string;
    timeoutUs?: number;
    language?: string | null;
    defaultVoiceId?: string | null;
  };
  memory?: { idleUnloadMs?: number };
  auth?: { loginBackground?: string | null };
};

export type AppSettingsSecretIssue = {
  provider: string;
  field: "apiKey";
  message: string;
};

type LegacySettingsOptions = {
  ttsSettingsPath?: string;
  comfySettingsPath?: string;
  removeLegacyFiles?: boolean;
};

type EnsureAppSettingsFileOptions = LegacySettingsOptions & {
  settingsPath: string;
  templatePath?: string;
};

const FALLBACK_TEMPLATE: AppSettings = {
  theme: { family: "premium", mode: "dark" },
  llm: {
    provider: "ollama",
    providers: {
      ollama: {
        baseUrl: "http://127.0.0.1:11434",
        model: "llama3.2:3b",
        timeoutMs: 60000
      },
      gemini: {
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        model: "gemma-4-26b-a4b-it",
        apiKey: "",
        timeoutMs: 120000
      },
      openai: {
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        apiKey: "",
        timeoutMs: 120000
      }
    }
  },
  comfy: {
    baseUrl: "http://127.0.0.1:8188",
    promptTimeoutMs: 60000,
    generationTimeoutMs: 300000,
    viewTimeoutMs: 60000,
    masterPrompt: "",
    workflowFile: "vantage-z-image-turbo-api.json"
  },
  tts: {
    baseUrl: "http://127.0.0.1:8020",
    timeoutUs: 5000000,
    language: "pt",
    defaultVoiceId: "cohesive-pt-santiago-22050hz"
  },
  memory: { idleUnloadMs: 900000 },
  auth: { loginBackground: null }
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function deepMerge<T>(base: T, override: unknown): T {
  if (!isRecord(base) || !isRecord(override)) {
    return (override === undefined ? base : override) as T;
  }
  const next: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const current = next[key];
    next[key] = isRecord(current) && isRecord(value) ? deepMerge(current, value) : value;
  }
  return next as T;
}

function hasMeaningfulProviderApiKey(provider: string, settings: LlmProviderSettings | undefined): boolean {
  if (provider === "ollama") return true;
  return Boolean(settings?.apiKey?.trim());
}

export function normalizeLlmProvider(raw: string | undefined): "ollama" | "gemini" | "openai" {
  const provider = (raw ?? "ollama").trim().toLowerCase();
  return provider === "gemini" || provider === "openai" ? provider : "ollama";
}

export function resolveLlmProviders(settings: AppSettings["llm"] | undefined, template: AppSettings = FALLBACK_TEMPLATE): Record<string, LlmProviderSettings> {
  const templateProviders = template.llm?.providers ?? FALLBACK_TEMPLATE.llm?.providers ?? {};
  const providers: Record<string, LlmProviderSettings> = {};

  for (const [provider, providerSettings] of Object.entries(templateProviders)) {
    providers[provider] = { ...(providerSettings ?? {}) };
  }
  for (const [provider, providerSettings] of Object.entries(settings?.providers ?? {})) {
    providers[provider] = {
      ...(providers[provider] ?? {}),
      ...(providerSettings ?? {})
    };
  }

  const activeProvider = normalizeLlmProvider(settings?.provider ?? template.llm?.provider);
  providers[activeProvider] = {
    ...(providers[activeProvider] ?? {}),
    ...(settings?.baseUrl ? { baseUrl: settings.baseUrl } : {}),
    ...(settings?.model ? { model: settings.model } : {}),
    ...(settings?.timeoutMs !== undefined ? { timeoutMs: settings.timeoutMs } : {})
  };
  if (settings?.apiKeys?.gemini && !hasMeaningfulProviderApiKey("gemini", providers.gemini)) {
    providers.gemini = { ...(providers.gemini ?? {}), apiKey: settings.apiKeys.gemini };
  }
  if (settings?.apiKeys?.openai && !hasMeaningfulProviderApiKey("openai", providers.openai)) {
    providers.openai = { ...(providers.openai ?? {}), apiKey: settings.apiKeys.openai };
  }

  for (const [provider, providerSettings] of Object.entries(providers)) {
    if (provider === "ollama") {
      const { apiKey: _ignored, ...withoutApiKey } = providerSettings;
      providers[provider] = withoutApiKey;
    } else {
      providers[provider] = {
        ...providerSettings,
        apiKey: providerSettings.apiKey ?? ""
      };
    }
  }
  return providers;
}

export function resolveLlmProviderSettings(
  provider: string,
  settings: AppSettings["llm"] | undefined,
  template: AppSettings = FALLBACK_TEMPLATE
): LlmProviderSettings {
  return resolveLlmProviders(settings, template)[provider] ?? {};
}

function normalizeAppSettings(settings: AppSettings, template: AppSettings): AppSettings {
  const merged = deepMerge(template, settings);
  const provider = normalizeLlmProvider(merged.llm?.provider ?? template.llm?.provider);
  return {
    ...merged,
    llm: {
      provider,
      providers: resolveLlmProviders(merged.llm, template)
    }
  };
}

function readTemplate(templatePath?: string): AppSettings {
  if (!templatePath) return FALLBACK_TEMPLATE;
  return normalizeAppSettings(readJsonFile<AppSettings>(templatePath) ?? FALLBACK_TEMPLATE, FALLBACK_TEMPLATE);
}

function readLegacySettings(options: LegacySettingsOptions): AppSettings {
  const legacy: AppSettings = {};
  const tts = options.ttsSettingsPath ? readJsonFile<{ voiceId?: string; language?: string }>(options.ttsSettingsPath) : null;
  if (tts?.voiceId || tts?.language) {
    legacy.tts = {
      defaultVoiceId: typeof tts.voiceId === "string" ? tts.voiceId : undefined,
      language: typeof tts.language === "string" ? tts.language : undefined
    };
  }

  const comfy = options.comfySettingsPath
    ? readJsonFile<{ baseUrl?: string; promptTimeoutMs?: number; generationTimeoutMs?: number; viewTimeoutMs?: number }>(options.comfySettingsPath)
    : null;
  if (comfy && Object.keys(comfy).length > 0) {
    legacy.comfy = {
      baseUrl: typeof comfy.baseUrl === "string" ? comfy.baseUrl : undefined,
      promptTimeoutMs:
        typeof comfy.promptTimeoutMs === "number" && Number.isFinite(comfy.promptTimeoutMs)
          ? comfy.promptTimeoutMs
          : undefined,
      generationTimeoutMs:
        typeof comfy.generationTimeoutMs === "number" && Number.isFinite(comfy.generationTimeoutMs)
          ? comfy.generationTimeoutMs
          : undefined,
      viewTimeoutMs:
        typeof comfy.viewTimeoutMs === "number" && Number.isFinite(comfy.viewTimeoutMs)
          ? comfy.viewTimeoutMs
          : undefined
    };
  }
  return legacy;
}

export function readAppSettingsFile(settingsPath: string, templatePath?: string): AppSettings {
  const template = readTemplate(templatePath);
  return normalizeAppSettings(readJsonFile<AppSettings>(settingsPath) ?? {}, template);
}

export function writeAppSettingsFile(settingsPath: string, next: AppSettings): void {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(next, null, 2), "utf8");
}

export function ensureAppSettingsFile(options: EnsureAppSettingsFileOptions): {
  settings: AppSettings;
  created: boolean;
  normalized: boolean;
  missingSecrets: AppSettingsSecretIssue[];
} {
  const template = readTemplate(options.templatePath);
  const currentExists = fs.existsSync(options.settingsPath);
  const legacy = currentExists ? {} : readLegacySettings(options);
  const current = readJsonFile<AppSettings>(options.settingsPath) ?? {};
  const settings = normalizeAppSettings(deepMerge(deepMerge(template, legacy), current), template);
  const serialized = JSON.stringify(settings, null, 2);
  const currentSerialized = currentExists ? fs.readFileSync(options.settingsPath, "utf8").trim() : "";
  const normalized = !currentExists || currentSerialized !== serialized.trim();
  if (normalized) {
    writeAppSettingsFile(options.settingsPath, settings);
  }

  if (options.removeLegacyFiles) {
    for (const legacyPath of [options.ttsSettingsPath, options.comfySettingsPath]) {
      if (legacyPath && fs.existsSync(legacyPath)) {
        fs.unlinkSync(legacyPath);
      }
    }
  }

  return {
    settings,
    created: !currentExists,
    normalized,
    missingSecrets: getMissingAppSettingsSecrets(settings)
  };
}

export function getMissingAppSettingsSecrets(settings: AppSettings): AppSettingsSecretIssue[] {
  const provider = normalizeLlmProvider(settings.llm?.provider);
  if (provider === "ollama") return [];
  const providerSettings = resolveLlmProviderSettings(provider, settings.llm);
  if (providerSettings.apiKey?.trim()) return [];
  return [
    {
      provider,
      field: "apiKey",
      message: `${provider} API key is required when ${provider} is selected`
    }
  ];
}
