import fs from "node:fs";
import path from "node:path";

export type LlmProviderBase = "ollama" | "gemini" | "openai";

export type LlmProviderSettings = {
  provider?: LlmProviderBase;
  displayName?: string;
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
};

export type LlmStageKey = "structure" | "block";

export type LlmStageStrategySettings = {
  providerId?: string;
  provider?: string;
  model?: string;
  fallbackModel?: string;
};

export type LlmStageConfig = {
  priorities?: LlmStageStrategySettings[];
};

export type LlmStagesSettings = {
  structure?: LlmStageConfig;
  block?: LlmStageConfig;
};

export type TtsProviderKind =
  | "xtts"
  | "chatterbox"
  | "qwen"
  | "elevenlabs"
  | "fish_speech"
  | "f5_tts"
  | "gpt_sovits"
  | "openai"
  | "custom";

export type TtsProviderSettings = {
  provider?: TtsProviderKind;
  displayName?: string;
  baseUrl?: string;
  timeoutUs?: number;
  defaultVoiceId?: string | null;
  language?: string | null;
  languages?: string[];
  useCase?: string;
  targetChars?: number;
  maxChars?: number;
  targetSpeechSeconds?: number;
  maxSpeechSeconds?: number;
};

export type TtsLanguageRouteSettings = {
  providerId?: string;
  voiceId?: string | null;
  targetChars?: number;
  maxChars?: number;
  targetSpeechSeconds?: number;
  maxSpeechSeconds?: number;
};

export type VisualGenerationProviderKind = "comfyui" | "veo_extension" | "vertex_veo" | "custom";

export type VisualGenerationCapability =
  | "text_to_image"
  | "image_to_image"
  | "text_to_video"
  | "image_to_video"
  | "native_audio";

export type VisualGenerationModelKind =
  | "text_to_image"
  | "image_to_image"
  | "text_to_video"
  | "image_to_video";

export type VisualGenerationModelSettings = {
  displayName?: string;
  kind?: VisualGenerationModelKind;
  acceptedAspectRatios?: string[];
  acceptedDurationsSeconds?: number[];
  maxNativeSpeechSeconds?: number;
  supportsNativeAudio?: boolean;
  supportsPromptEnhancement?: boolean;
  costTier?: "local" | "low" | "medium" | "high" | "premium";
  notes?: string;
};

export type VisualGenerationProviderSettings = {
  provider?: VisualGenerationProviderKind;
  displayName?: string;
  baseUrl?: string;
  capabilities?: VisualGenerationCapability[];
  useCase?: string;
  models?: Record<string, VisualGenerationModelSettings | undefined>;
};

const TTS_PROVIDER_KINDS = [
  "xtts",
  "chatterbox",
  "qwen",
  "elevenlabs",
  "fish_speech",
  "f5_tts",
  "gpt_sovits",
  "openai",
  "custom"
] as const satisfies readonly TtsProviderKind[];

const VISUAL_PROVIDER_KINDS = ["comfyui", "veo_extension", "vertex_veo", "custom"] as const satisfies readonly VisualGenerationProviderKind[];

const VISUAL_CAPABILITIES = [
  "text_to_image",
  "image_to_image",
  "text_to_video",
  "image_to_video",
  "native_audio"
] as const satisfies readonly VisualGenerationCapability[];

const VISUAL_MODEL_KINDS = [
  "text_to_image",
  "image_to_image",
  "text_to_video",
  "image_to_video"
] as const satisfies readonly VisualGenerationModelKind[];

export type AppSettings = {
  theme?: { family?: string; mode?: string };
  llm?: {
    providers?: Record<string, LlmProviderSettings | undefined>;
    stages?: LlmStagesSettings;
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
    provider?: TtsProviderKind;
    defaultProviderId?: string;
    defaultLanguage?: string | null;
    providers?: Record<string, TtsProviderSettings | undefined>;
    languageRoutes?: Record<string, TtsLanguageRouteSettings | undefined>;
    baseUrl?: string;
    timeoutUs?: number;
    language?: string | null;
    defaultVoiceId?: string | null;
    targetChars?: number;
    maxChars?: number;
    targetSpeechSeconds?: number;
    maxSpeechSeconds?: number;
  };
  visualGeneration?: {
    providers?: Record<string, VisualGenerationProviderSettings | undefined>;
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
    providers: {
      ollama: {
        provider: "ollama",
        displayName: "Ollama local",
        baseUrl: "http://127.0.0.1:11434",
        timeoutMs: 600000
      },
      gemini: {
        provider: "gemini",
        displayName: "Google Gemini",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        apiKey: "",
        timeoutMs: 600000
      },
      openai: {
        provider: "openai",
        displayName: "OpenAI API",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "",
        timeoutMs: 600000
      }
    },
    stages: {
      structure: {
        priorities: [{ providerId: "ollama", model: "", fallbackModel: "" }]
      },
      block: {
        priorities: [{ providerId: "ollama", model: "", fallbackModel: "" }]
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
  visualGeneration: {
    providers: {
      comfyui: {
        provider: "comfyui",
        displayName: "ComfyUI",
        baseUrl: "http://127.0.0.1:8188",
        capabilities: ["text_to_image", "image_to_image"],
        useCase: "Local image generation through the current ComfyUI workflow",
        models: {
          "z-image-turbo-workflow": {
            displayName: "Z-Image Turbo workflow",
            kind: "text_to_image",
            acceptedAspectRatios: ["16:9", "9:16", "1:1", "4:5", "4:3", "3:4"],
            costTier: "local"
          }
        }
      },
      veo_extension: {
        provider: "veo_extension",
        displayName: "Veo Extension",
        baseUrl: "",
        capabilities: ["text_to_image", "image_to_image", "text_to_video", "image_to_video", "native_audio"],
        useCase: "External extension route for high-quality image/video generation",
        models: {
          "veo-3-image": {
            displayName: "Veo 3 image",
            kind: "text_to_image",
            acceptedAspectRatios: ["16:9", "9:16", "1:1"],
            supportsPromptEnhancement: true,
            costTier: "premium"
          },
          "veo-3-video": {
            displayName: "Veo 3 video",
            kind: "image_to_video",
            acceptedAspectRatios: ["16:9", "9:16"],
            acceptedDurationsSeconds: [4, 6, 8],
            maxNativeSpeechSeconds: 8,
            supportsNativeAudio: true,
            supportsPromptEnhancement: true,
            costTier: "premium"
          }
        }
      },
      vertex_veo: {
        provider: "vertex_veo",
        displayName: "Vertex Veo",
        baseUrl: "https://aiplatform.googleapis.com",
        capabilities: ["text_to_video", "image_to_video", "native_audio"],
        useCase: "Future official API route when the project should use direct Vertex AI",
        models: {
          "veo-3-video": {
            displayName: "Veo 3 video",
            kind: "image_to_video",
            acceptedAspectRatios: ["16:9", "9:16"],
            acceptedDurationsSeconds: [4, 6, 8],
            maxNativeSpeechSeconds: 8,
            supportsNativeAudio: true,
            supportsPromptEnhancement: true,
            costTier: "premium"
          }
        }
      }
    }
  },
  tts: {
    providers: {
      xtts: {
        provider: "xtts",
        displayName: "XTTS",
        baseUrl: "http://127.0.0.1:8020",
        timeoutUs: 5000000,
        language: "pt",
        languages: ["pt"],
        defaultVoiceId: "cohesive-pt-santiago-22050hz",
        useCase: "Local voice cloning and multilingual narration",
        targetChars: 170,
        maxChars: 200,
        targetSpeechSeconds: 10,
        maxSpeechSeconds: 12
      },
      chatterbox: {
        provider: "chatterbox",
        displayName: "Chatterbox",
        timeoutUs: 5000000,
        language: "en",
        languages: [],
        defaultVoiceId: "",
        useCase: "Future local multilingual TTS route"
      },
      qwen: {
        provider: "qwen",
        displayName: "Qwen TTS",
        timeoutUs: 5000000,
        language: "en",
        languages: [],
        defaultVoiceId: "Ryan",
        useCase: "Future route for English/Chinese-oriented narration"
      },
      elevenlabs: {
        provider: "elevenlabs",
        displayName: "ElevenLabs",
        timeoutUs: 5000000,
        language: "en",
        languages: [],
        defaultVoiceId: "",
        useCase: "Cloud voice cloning and high-quality English/Spanish narration"
      },
      fish_speech: {
        provider: "fish_speech",
        displayName: "Fish Speech",
        timeoutUs: 5000000,
        language: "en",
        languages: [],
        defaultVoiceId: "",
        useCase: "Future local/open voice cloning route"
      },
      f5_tts: {
        provider: "f5_tts",
        displayName: "F5-TTS",
        timeoutUs: 5000000,
        language: "en",
        languages: [],
        defaultVoiceId: "",
        useCase: "Future local zero-shot voice cloning route"
      }
    },
    languageRoutes: {
      pt: {
        providerId: "xtts",
        voiceId: "cohesive-pt-santiago-22050hz",
        targetChars: 170,
        maxChars: 200,
        targetSpeechSeconds: 10,
        maxSpeechSeconds: 12
      }
    }
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

export function normalizeLlmProvider(raw: string | undefined): LlmProviderBase {
  const provider = (raw ?? "ollama").trim().toLowerCase();
  return provider === "gemini" || provider === "openai" ? provider : "ollama";
}

function normalizeLlmProviderForId(providerId: string, raw: string | undefined): LlmProviderBase {
  const providerFromId = providerId.trim().toLowerCase();
  if (providerFromId === "ollama" || providerFromId === "gemini" || providerFromId === "openai") {
    return providerFromId;
  }
  return normalizeLlmProvider(raw);
}

export function resolveDefaultLlmModel(provider: LlmProviderBase, ollamaModel = "llama3.2:3b"): string {
  if (provider === "gemini") return "gemma-4-26b-a4b-it";
  if (provider === "openai") return "gpt-4o-mini";
  return ollamaModel;
}

export function resolveLlmProviders(settings: AppSettings["llm"] | undefined, template: AppSettings = FALLBACK_TEMPLATE): Record<string, LlmProviderSettings> {
  const templateProviders = template.llm?.providers ?? FALLBACK_TEMPLATE.llm?.providers ?? {};
  const providers: Record<string, LlmProviderSettings> = {};

  for (const [providerId, providerSettings] of Object.entries(templateProviders)) {
    providers[providerId] = { ...(providerSettings ?? {}) };
  }
  for (const [providerId, providerSettings] of Object.entries(settings?.providers ?? {})) {
    providers[providerId] = {
      ...(providers[providerId] ?? {}),
      ...(providerSettings ?? {})
    };
  }
  for (const [providerId, providerSettings] of Object.entries(providers)) {
    const provider = normalizeLlmProviderForId(providerId, providerSettings.provider);
    if (provider === "ollama") {
      const { apiKey: _ignored, ...withoutApiKey } = providerSettings;
      providers[providerId] = {
        ...withoutApiKey,
        provider,
        displayName: withoutApiKey.displayName ?? providerId
      };
    } else {
      providers[providerId] = {
        ...providerSettings,
        provider,
        displayName: providerSettings.displayName ?? providerId,
        apiKey: providerSettings.apiKey ?? ""
      };
    }
  }
  return providers;
}

function normalizeOptionalRoutingValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeLlmStrategy(strategy: LlmStageStrategySettings | undefined): LlmStageStrategySettings | null {
  if (!strategy) return null;
  const providerId = (strategy.providerId ?? strategy.provider ?? "").trim();
  if (!providerId) return null;
  return {
    providerId,
    ...(normalizeOptionalRoutingValue(strategy.model) ? { model: normalizeOptionalRoutingValue(strategy.model) } : {}),
    ...(normalizeOptionalRoutingValue(strategy.fallbackModel)
      ? { fallbackModel: normalizeOptionalRoutingValue(strategy.fallbackModel) }
      : {})
  };
}

function normalizeLlmStageConfig(stage: LlmStageConfig | undefined): LlmStageConfig {
  const priorities = (stage?.priorities ?? [])
    .map((strategy) => normalizeLlmStrategy(strategy))
    .filter((strategy): strategy is LlmStageStrategySettings => Boolean(strategy));
  return priorities.length > 0 ? { priorities } : { priorities: [] };
}

export function normalizeLlmStages(
  settings: AppSettings["llm"] | undefined,
  template: AppSettings = FALLBACK_TEMPLATE
): LlmStagesSettings {
  const merged = deepMerge(template.llm?.stages ?? {}, settings?.stages ?? {});
  return {
    structure: normalizeLlmStageConfig(merged.structure),
    block: normalizeLlmStageConfig(merged.block)
  };
}

export function resolveLlmStageConfig(
  stage: LlmStageKey,
  settings: AppSettings["llm"] | undefined,
  template: AppSettings = FALLBACK_TEMPLATE
): LlmStageConfig {
  return normalizeLlmStages(settings, template)[stage] ?? { priorities: [] };
}

export function resolveLlmProviderSettings(
  providerId: string,
  settings: AppSettings["llm"] | undefined,
  template: AppSettings = FALLBACK_TEMPLATE
): LlmProviderSettings {
  return resolveLlmProviders(settings, template)[providerId] ?? {};
}

export function normalizeTtsProvider(raw: string | undefined): TtsProviderKind {
  const provider = (raw ?? "xtts").trim().toLowerCase();
  if ((TTS_PROVIDER_KINDS as readonly string[]).includes(provider)) {
    return provider as TtsProviderKind;
  }
  return "xtts";
}

function normalizeTtsProviderForId(providerId: string, raw: string | undefined): TtsProviderKind {
  const providerFromId = providerId.trim().toLowerCase();
  if ((TTS_PROVIDER_KINDS as readonly string[]).includes(providerFromId)) {
    return providerFromId as TtsProviderKind;
  }
  return normalizeTtsProvider(raw);
}

export function normalizeVisualGenerationProvider(raw: string | undefined): VisualGenerationProviderKind {
  const provider = (raw ?? "custom").trim().toLowerCase();
  if ((VISUAL_PROVIDER_KINDS as readonly string[]).includes(provider)) {
    return provider as VisualGenerationProviderKind;
  }
  return "custom";
}

function normalizeVisualGenerationProviderForId(
  providerId: string,
  raw: string | undefined
): VisualGenerationProviderKind {
  const providerFromId = providerId.trim().toLowerCase();
  if ((VISUAL_PROVIDER_KINDS as readonly string[]).includes(providerFromId)) {
    return providerFromId as VisualGenerationProviderKind;
  }
  return normalizeVisualGenerationProvider(raw);
}

function normalizeVisualCapabilities(values: string[] | undefined): VisualGenerationCapability[] {
  const seen = new Set<string>();
  const result: VisualGenerationCapability[] = [];
  for (const value of values ?? []) {
    const capability = value.trim().toLowerCase();
    if (!(VISUAL_CAPABILITIES as readonly string[]).includes(capability) || seen.has(capability)) continue;
    seen.add(capability);
    result.push(capability as VisualGenerationCapability);
  }
  return result;
}

function normalizeVisualModelKind(value: string | undefined): VisualGenerationModelKind | undefined {
  const kind = value?.trim().toLowerCase();
  if (kind && (VISUAL_MODEL_KINDS as readonly string[]).includes(kind)) {
    return kind as VisualGenerationModelKind;
  }
  return undefined;
}

function normalizeOptionalPositiveNumber(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function normalizeOptionalPositiveNumbers(values: number[] | undefined): number[] | undefined {
  if (!Array.isArray(values)) return undefined;
  const seen = new Set<number>();
  const result: number[] = [];
  for (const value of values) {
    if (!Number.isFinite(value) || value <= 0 || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result.length > 0 ? result : undefined;
}

function normalizeLanguageCode(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeLanguageCodes(values: string[] | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values ?? []) {
    const language = normalizeLanguageCode(value);
    if (!language) continue;
    const key = language.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(language);
  }
  return result;
}

export function normalizeTtsSettings(
  settings: AppSettings["tts"] | undefined,
  template: AppSettings["tts"] | undefined = FALLBACK_TEMPLATE.tts
): NonNullable<AppSettings["tts"]> {
  const provider = normalizeTtsProvider(settings?.provider ?? template?.provider);
  const defaultProviderId = (settings?.defaultProviderId ?? template?.defaultProviderId ?? provider).trim() || provider;
  const providers: Record<string, TtsProviderSettings> = {};

  for (const [providerId, providerSettings] of Object.entries(template?.providers ?? {})) {
    if (!providerSettings) continue;
    const { status: _status, ...providerValues } = providerSettings as TtsProviderSettings & { status?: unknown };
    providers[providerId] = {
      ...providerValues,
      provider: normalizeTtsProviderForId(providerId, providerSettings.provider),
      languages: normalizeLanguageCodes(providerSettings.languages)
    };
  }
  for (const [providerId, providerSettings] of Object.entries(settings?.providers ?? {})) {
    if (!providerSettings) continue;
    const { status: _status, ...providerValues } = providerSettings as TtsProviderSettings & { status?: unknown };
    providers[providerId] = {
      ...(providers[providerId] ?? {}),
      ...providerValues,
      provider: normalizeTtsProviderForId(providerId, providerSettings.provider ?? providers[providerId]?.provider),
      languages: normalizeLanguageCodes(providerSettings.languages ?? providers[providerId]?.languages)
    };
  }

  providers[defaultProviderId] = {
    ...(providers[defaultProviderId] ?? {}),
    provider,
    displayName: settings?.providers?.[defaultProviderId]?.displayName ?? providers[defaultProviderId]?.displayName,
    baseUrl: settings?.baseUrl ?? providers[defaultProviderId]?.baseUrl ?? template?.baseUrl,
    timeoutUs: settings?.timeoutUs ?? providers[defaultProviderId]?.timeoutUs ?? template?.timeoutUs,
    language: settings?.language ?? providers[defaultProviderId]?.language ?? template?.language,
    defaultVoiceId:
      settings?.defaultVoiceId ?? providers[defaultProviderId]?.defaultVoiceId ?? template?.defaultVoiceId,
    targetChars:
      normalizeOptionalPositiveNumber(settings?.targetChars) ??
      normalizeOptionalPositiveNumber(providers[defaultProviderId]?.targetChars) ??
      normalizeOptionalPositiveNumber(template?.targetChars),
    maxChars:
      normalizeOptionalPositiveNumber(settings?.maxChars) ??
      normalizeOptionalPositiveNumber(providers[defaultProviderId]?.maxChars) ??
      normalizeOptionalPositiveNumber(template?.maxChars),
    targetSpeechSeconds:
      normalizeOptionalPositiveNumber(settings?.targetSpeechSeconds) ??
      normalizeOptionalPositiveNumber(providers[defaultProviderId]?.targetSpeechSeconds) ??
      normalizeOptionalPositiveNumber(template?.targetSpeechSeconds),
    maxSpeechSeconds:
      normalizeOptionalPositiveNumber(settings?.maxSpeechSeconds) ??
      normalizeOptionalPositiveNumber(providers[defaultProviderId]?.maxSpeechSeconds) ??
      normalizeOptionalPositiveNumber(template?.maxSpeechSeconds)
  };

  const language = (settings?.defaultLanguage ?? settings?.language ?? template?.defaultLanguage ?? template?.language)?.trim();
  const languageRoutes: Record<string, TtsLanguageRouteSettings> = {};
  for (const [routeLanguage, routeSettings] of Object.entries(template?.languageRoutes ?? {})) {
    if (!routeSettings) continue;
    languageRoutes[routeLanguage] = { ...routeSettings };
  }
  for (const [routeLanguage, routeSettings] of Object.entries(settings?.languageRoutes ?? {})) {
    if (!routeSettings) continue;
    languageRoutes[routeLanguage] = {
      ...(languageRoutes[routeLanguage] ?? {}),
      ...routeSettings
    };
  }

  for (const [providerId, providerSettings] of Object.entries(providers)) {
    for (const routeLanguage of normalizeLanguageCodes(providerSettings.languages)) {
      if (languageRoutes[routeLanguage]) continue;
      languageRoutes[routeLanguage] = {
        providerId,
        voiceId: providerSettings.defaultVoiceId ?? null,
        targetChars: providerSettings.targetChars,
        maxChars: providerSettings.maxChars,
        targetSpeechSeconds: providerSettings.targetSpeechSeconds,
        maxSpeechSeconds: providerSettings.maxSpeechSeconds
      };
    }
  }
  if (language) {
    const defaultProvider = providers[defaultProviderId] ?? {};
    languageRoutes[language] = {
      ...(languageRoutes[language] ?? {}),
      providerId: languageRoutes[language]?.providerId ?? defaultProviderId,
      voiceId: languageRoutes[language]?.voiceId ?? defaultProvider.defaultVoiceId ?? settings?.defaultVoiceId ?? null,
      targetChars:
        normalizeOptionalPositiveNumber(languageRoutes[language]?.targetChars) ??
        normalizeOptionalPositiveNumber(defaultProvider.targetChars),
      maxChars:
        normalizeOptionalPositiveNumber(languageRoutes[language]?.maxChars) ??
        normalizeOptionalPositiveNumber(defaultProvider.maxChars),
      targetSpeechSeconds:
        normalizeOptionalPositiveNumber(languageRoutes[language]?.targetSpeechSeconds) ??
        normalizeOptionalPositiveNumber(defaultProvider.targetSpeechSeconds),
      maxSpeechSeconds:
        normalizeOptionalPositiveNumber(languageRoutes[language]?.maxSpeechSeconds) ??
        normalizeOptionalPositiveNumber(defaultProvider.maxSpeechSeconds)
    };
  }

  return {
    provider,
    defaultProviderId,
    defaultLanguage: language ?? null,
    baseUrl: providers[defaultProviderId]?.baseUrl ?? template?.baseUrl,
    timeoutUs: providers[defaultProviderId]?.timeoutUs ?? template?.timeoutUs,
    language: providers[defaultProviderId]?.language ?? language ?? null,
    defaultVoiceId: providers[defaultProviderId]?.defaultVoiceId ?? null,
    targetChars: normalizeOptionalPositiveNumber(providers[defaultProviderId]?.targetChars),
    maxChars: normalizeOptionalPositiveNumber(providers[defaultProviderId]?.maxChars),
    targetSpeechSeconds: normalizeOptionalPositiveNumber(providers[defaultProviderId]?.targetSpeechSeconds),
    maxSpeechSeconds: normalizeOptionalPositiveNumber(providers[defaultProviderId]?.maxSpeechSeconds),
    providers,
    languageRoutes
  };
}

export function resolveTtsProviderSettings(
  providerId: string | undefined,
  settings: AppSettings["tts"] | undefined,
  template: AppSettings = FALLBACK_TEMPLATE
): TtsProviderSettings {
  const normalized = normalizeTtsSettings(settings, template.tts);
  const resolvedProviderId = providerId?.trim() || "xtts";
  return normalized.providers?.[resolvedProviderId] ?? {};
}

export function resolveTtsLanguageRouteSettings(
  language: string | undefined,
  settings: AppSettings["tts"] | undefined,
  template: AppSettings = FALLBACK_TEMPLATE
): (TtsLanguageRouteSettings & { language: string; providerId: string; provider: TtsProviderSettings }) | null {
  const normalized = normalizeTtsSettings(settings, template.tts);
  const resolvedLanguage = language?.trim() || "";
  if (!resolvedLanguage) return null;
  const route = normalized.languageRoutes?.[resolvedLanguage];
  if (!route?.providerId) return null;
  const provider = normalized.providers?.[route.providerId];
  if (!provider) return null;
  return {
    ...route,
    language: resolvedLanguage,
    providerId: route.providerId,
    provider
  };
}

export function normalizeVisualGenerationSettings(
  settings: AppSettings["visualGeneration"] | undefined,
  template: AppSettings["visualGeneration"] | undefined = FALLBACK_TEMPLATE.visualGeneration
): NonNullable<AppSettings["visualGeneration"]> {
  const providers: Record<string, VisualGenerationProviderSettings> = {};
  const mergeProvider = (providerId: string, providerSettings: VisualGenerationProviderSettings | undefined) => {
    if (!providerSettings) return;
    const current = providers[providerId] ?? {};
    const models: Record<string, VisualGenerationModelSettings> = {};
    for (const [modelId, modelSettings] of Object.entries(current.models ?? {})) {
      if (!modelSettings) continue;
      const { status: _status, ...modelValues } = modelSettings as VisualGenerationModelSettings & { status?: unknown };
      models[modelId] = { ...modelValues };
    }
    for (const [modelId, modelSettings] of Object.entries(providerSettings.models ?? {})) {
      if (!modelSettings) continue;
      const currentModel = models[modelId] ?? {};
      const { status: _status, ...modelValues } = modelSettings as VisualGenerationModelSettings & { status?: unknown };
      models[modelId] = {
        ...currentModel,
        ...modelValues,
        kind: normalizeVisualModelKind(modelSettings.kind ?? currentModel.kind),
        acceptedAspectRatios: normalizeLanguageCodes(
          modelSettings.acceptedAspectRatios ?? currentModel.acceptedAspectRatios
        ),
        acceptedDurationsSeconds:
          normalizeOptionalPositiveNumbers(modelSettings.acceptedDurationsSeconds) ??
          normalizeOptionalPositiveNumbers(currentModel.acceptedDurationsSeconds),
        maxNativeSpeechSeconds:
          normalizeOptionalPositiveNumber(modelSettings.maxNativeSpeechSeconds) ??
          normalizeOptionalPositiveNumber(currentModel.maxNativeSpeechSeconds)
      };
    }
    const {
      status: _status,
      defaultImageModelId: _defaultImageModelId,
      defaultVideoModelId: _defaultVideoModelId,
      ...providerValues
    } = providerSettings as VisualGenerationProviderSettings & {
      status?: unknown;
      defaultImageModelId?: unknown;
      defaultVideoModelId?: unknown;
    };
    providers[providerId] = {
      ...current,
      ...providerValues,
      provider: normalizeVisualGenerationProviderForId(providerId, providerSettings.provider ?? current.provider),
      capabilities: normalizeVisualCapabilities(providerSettings.capabilities ?? current.capabilities),
      models
    };
  };

  for (const [providerId, providerSettings] of Object.entries(template?.providers ?? {})) {
    mergeProvider(providerId, providerSettings);
  }
  for (const [providerId, providerSettings] of Object.entries(settings?.providers ?? {})) {
    mergeProvider(providerId, providerSettings);
  }

  return { providers };
}

function normalizeAppSettings(settings: AppSettings, template: AppSettings): AppSettings {
  const merged = deepMerge(template, settings);
  const providers = resolveLlmProviders(merged.llm, template);
  return {
    ...merged,
    llm: {
      providers,
      stages: normalizeLlmStages(merged.llm, template)
    },
    tts: normalizeTtsSettings(merged.tts, template.tts),
    visualGeneration: normalizeVisualGenerationSettings(merged.visualGeneration, template.visualGeneration)
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
  const issues: AppSettingsSecretIssue[] = [];
  const stages = normalizeLlmStages(settings.llm);
  const referencedProviders = new Set<string>();
  for (const stage of [stages.structure, stages.block]) {
    for (const strategy of stage?.priorities ?? []) {
      if (strategy.providerId) referencedProviders.add(strategy.providerId);
    }
  }
  for (const providerId of referencedProviders) {
    const providerSettings = resolveLlmProviderSettings(providerId, settings.llm);
    if ((providerSettings.provider ?? "ollama") === "ollama") continue;
    if (providerSettings.apiKey?.trim()) continue;
    issues.push({
      provider: providerId,
      field: "apiKey",
      message: `${providerId} API key is required by one or more LLM stage strategies`
    });
  }
  return issues;
}
