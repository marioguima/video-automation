
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Server, 
  Cpu, 
  Mic, 
  Settings as SettingsIcon,
  Save,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Film,
  Globe,
  Monitor,
  ExternalLink
} from 'lucide-react';
import { Theme } from '../types';
import { apiGet, apiPatch, apiPost } from '../lib/api';
import ConfirmDialog from './ui/confirm-dialog';

type LLMProvider = 'ollama' | 'gemini' | 'openai';
type TtsProvider = 'xtts' | 'chatterbox' | 'qwen' | 'elevenlabs' | 'fish_speech' | 'f5_tts' | 'gpt_sovits' | 'openai' | 'custom';
type VisualProvider = 'comfyui' | 'veo_extension' | 'vertex_veo' | 'custom';
type VisualModelKind = 'text_to_image' | 'image_to_image' | 'text_to_video' | 'image_to_video';
type LlmProviderConfig = {
  baseUrl: string;
  timeoutSeconds: string;
  apiKey: string;
};
type LlmRoutingConfig = {
  segmentStructureModel: string;
  segmentStructureFallbackModel: string;
  segmentBlockModel: string;
  segmentBlockFallbackModel: string;
};
const DEFAULT_LLM_CONFIGS: Record<LLMProvider, LlmProviderConfig> = {
  ollama: {
    baseUrl: 'http://127.0.0.1:11434',
    timeoutSeconds: '600',
    apiKey: ''
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    timeoutSeconds: '600',
    apiKey: ''
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    timeoutSeconds: '600',
    apiKey: ''
  }
};
const DEFAULT_LLM_ROUTING_CONFIG: LlmRoutingConfig = {
  segmentStructureModel: '',
  segmentStructureFallbackModel: '',
  segmentBlockModel: '',
  segmentBlockFallbackModel: ''
};

type TtsProviderConfig = {
  provider: TtsProvider;
  label: string;
  useCase: string;
  baseUrl: string;
  timeoutUs: string;
  language: string;
  languages: string;
  defaultVoiceId: string;
  targetChars: string;
  maxChars: string;
  targetSpeechSeconds: string;
  maxSpeechSeconds: string;
};

const DEFAULT_TTS_PROVIDER_CONFIGS: Record<string, TtsProviderConfig> = {
  xtts: {
    provider: 'xtts',
    label: 'XTTS',
    useCase: 'Local voice cloning and multilingual narration.',
    baseUrl: 'http://127.0.0.1:8020',
    timeoutUs: '5000000',
    language: 'pt',
    languages: 'pt',
    defaultVoiceId: 'cohesive-pt-santiago-22050hz',
    targetChars: '170',
    maxChars: '200',
    targetSpeechSeconds: '10',
    maxSpeechSeconds: '12'
  },
  chatterbox: {
    provider: 'chatterbox',
    label: 'Chatterbox',
    useCase: 'Future local multilingual route.',
    baseUrl: '',
    timeoutUs: '5000000',
    language: 'en',
    languages: '',
    defaultVoiceId: '',
    targetChars: '170',
    maxChars: '200',
    targetSpeechSeconds: '10',
    maxSpeechSeconds: '12'
  },
  qwen: {
    provider: 'qwen',
    label: 'Qwen TTS',
    useCase: 'Future route for English/Chinese-oriented narration.',
    baseUrl: '',
    timeoutUs: '5000000',
    language: 'en',
    languages: '',
    defaultVoiceId: 'Ryan',
    targetChars: '170',
    maxChars: '200',
    targetSpeechSeconds: '10',
    maxSpeechSeconds: '12'
  },
  elevenlabs: {
    provider: 'elevenlabs',
    label: 'ElevenLabs',
    useCase: 'Cloud voice cloning and high-quality English/Spanish narration.',
    baseUrl: 'https://api.elevenlabs.io',
    timeoutUs: '5000000',
    language: 'en',
    languages: '',
    defaultVoiceId: '',
    targetChars: '4000',
    maxChars: '5000',
    targetSpeechSeconds: '30',
    maxSpeechSeconds: '45'
  },
  fish_speech: {
    provider: 'fish_speech',
    label: 'Fish Speech',
    useCase: 'Future local/open voice cloning route.',
    baseUrl: '',
    timeoutUs: '5000000',
    language: 'en',
    languages: '',
    defaultVoiceId: '',
    targetChars: '170',
    maxChars: '200',
    targetSpeechSeconds: '10',
    maxSpeechSeconds: '12'
  },
  f5_tts: {
    provider: 'f5_tts',
    label: 'F5-TTS',
    useCase: 'Future local zero-shot voice cloning route.',
    baseUrl: '',
    timeoutUs: '5000000',
    language: 'en',
    languages: '',
    defaultVoiceId: '',
    targetChars: '170',
    maxChars: '200',
    targetSpeechSeconds: '10',
    maxSpeechSeconds: '12'
  }
};

type VisualModelConfig = {
  displayName: string;
  kind: VisualModelKind;
  acceptedAspectRatios: string;
  acceptedDurationsSeconds: string;
  maxNativeSpeechSeconds: string;
  supportsNativeAudio: boolean;
  supportsPromptEnhancement: boolean;
  costTier: 'local' | 'low' | 'medium' | 'high' | 'premium';
};

type VisualProviderConfig = {
  provider: VisualProvider;
  label: string;
  useCase: string;
  baseUrl: string;
  capabilities: string;
  models: Record<string, VisualModelConfig>;
};

const DEFAULT_VISUAL_PROVIDER_CONFIGS: Record<string, VisualProviderConfig> = {
  comfyui: {
    provider: 'comfyui',
    label: 'ComfyUI',
    useCase: 'Local image generation through the current ComfyUI workflow.',
    baseUrl: 'http://127.0.0.1:8188',
    capabilities: 'text_to_image, image_to_image',
    models: {
      'z-image-turbo-workflow': {
        displayName: 'Z-Image Turbo workflow',
        kind: 'text_to_image',
        acceptedAspectRatios: '16:9, 9:16, 1:1, 4:5, 4:3, 3:4',
        acceptedDurationsSeconds: '',
        maxNativeSpeechSeconds: '',
        supportsNativeAudio: false,
        supportsPromptEnhancement: false,
        costTier: 'local'
      }
    }
  },
  veo_extension: {
    provider: 'veo_extension',
    label: 'Veo Extension',
    useCase: 'External extension route for high-quality image/video generation.',
    baseUrl: '',
    capabilities: 'text_to_image, image_to_image, text_to_video, image_to_video, native_audio',
    models: {
      'veo-3-image': {
        displayName: 'Veo 3 image',
        kind: 'text_to_image',
        acceptedAspectRatios: '16:9, 9:16, 1:1',
        acceptedDurationsSeconds: '',
        maxNativeSpeechSeconds: '',
        supportsNativeAudio: false,
        supportsPromptEnhancement: true,
        costTier: 'premium'
      },
      'veo-3-video': {
        displayName: 'Veo 3 video',
        kind: 'image_to_video',
        acceptedAspectRatios: '16:9, 9:16',
        acceptedDurationsSeconds: '4, 6, 8',
        maxNativeSpeechSeconds: '8',
        supportsNativeAudio: true,
        supportsPromptEnhancement: true,
        costTier: 'premium'
      }
    }
  },
  vertex_veo: {
    provider: 'vertex_veo',
    label: 'Vertex Veo',
    useCase: 'Future official API route when direct Vertex AI should be used.',
    baseUrl: 'https://aiplatform.googleapis.com',
    capabilities: 'text_to_video, image_to_video, native_audio',
    models: {
      'veo-3-video': {
        displayName: 'Veo 3 video',
        kind: 'image_to_video',
        acceptedAspectRatios: '16:9, 9:16',
        acceptedDurationsSeconds: '4, 6, 8',
        maxNativeSpeechSeconds: '8',
        supportsNativeAudio: true,
        supportsPromptEnhancement: true,
        costTier: 'premium'
      }
    }
  }
};

interface SettingsProps {
  currentTheme: Theme;
  setTheme: (theme: Theme) => void;
}

const Settings: React.FC<SettingsProps> = ({ currentTheme, setTheme }) => {
  // General State
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeSection, setActiveSection] = useState<'appearance' | 'llm' | 'comfy' | 'visual' | 'tts' | 'runtime'>('appearance');
  const [currentFamily, currentMode] = currentTheme.split('-') as [
    'classic' | 'premium' | 'minimal',
    'light' | 'dark'
  ];

  // LLM State
  const [llmProvider, setLlmProvider] = useState<LLMProvider>('ollama');
  const [llmConfigs, setLlmConfigs] = useState<Record<LLMProvider, LlmProviderConfig>>(DEFAULT_LLM_CONFIGS);
  const [llmRouting, setLlmRouting] = useState<LlmRoutingConfig>(DEFAULT_LLM_ROUTING_CONFIG);

  // ComfyUI State
  const [comfyUiUrl, setComfyUiUrl] = useState('http://127.0.0.1:8188');
  const [comfyPromptTimeoutMs, setComfyPromptTimeoutMs] = useState('60000');
  const [comfyGenerationTimeoutMs, setComfyGenerationTimeoutMs] = useState('300000');
  const [comfyViewTimeoutMs, setComfyViewTimeoutMs] = useState('60000');
  const [comfyMasterPrompt, setComfyMasterPrompt] = useState('');
  const [comfyWorkflowFile, setComfyWorkflowFile] = useState('vantage-z-image-turbo-api.json');
  const [availableComfyWorkflows, setAvailableComfyWorkflows] = useState<string[]>([]);
  const [isImportingComfyWorkflow, setIsImportingComfyWorkflow] = useState(false);
  const [comfyImportStatus, setComfyImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [comfyImportMessage, setComfyImportMessage] = useState('');
  const [isOverwriteWorkflowConfirmOpen, setIsOverwriteWorkflowConfirmOpen] = useState(false);
  const [overwriteWorkflowTargetName, setOverwriteWorkflowTargetName] = useState('');
  const [pendingWorkflowOverwrite, setPendingWorkflowOverwrite] = useState<{
    fileName: string;
    workflow: unknown;
  } | null>(null);
  const [isTestingComfy, setIsTestingComfy] = useState(false);
  const [comfyTestStatus, setComfyTestStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [comfyTestMessage, setComfyTestMessage] = useState('');
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // TTS State
  const [ttsProviderConfigs, setTtsProviderConfigs] = useState<Record<string, TtsProviderConfig>>(DEFAULT_TTS_PROVIDER_CONFIGS);
  const [visualProviderConfigs, setVisualProviderConfigs] = useState<Record<string, VisualProviderConfig>>(DEFAULT_VISUAL_PROVIDER_CONFIGS);
  const [idleUnloadMs, setIdleUnloadMs] = useState('900000');

  type ComfyWorkflowNode = {
    inputs?: Record<string, unknown>;
    class_type?: string;
  };

  const validateComfyWorkflowMinimum = (workflow: unknown): string | null => {
    if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) {
      return 'Workflow must be a JSON object in ComfyUI API format.';
    }
    const nodes = Object.values(workflow as Record<string, ComfyWorkflowNode>);
    if (nodes.length === 0) {
      return 'Workflow cannot be empty.';
    }
    const hasPromptNode = nodes.some(
      (node) => node.class_type === 'CLIPTextEncode' && typeof node.inputs?.text === 'string'
    );
    if (!hasPromptNode) {
      return 'Workflow missing CLIPTextEncode node with text input.';
    }
    const hasSeedNode = nodes.some(
      (node) => node.class_type === 'KSampler' && Boolean(node.inputs && 'seed' in node.inputs)
    );
    if (!hasSeedNode) {
      return 'Workflow missing KSampler node with seed input.';
    }
    const hasSaveNode = nodes.some((node) => node.class_type === 'SaveImage');
    if (!hasSaveNode) {
      return 'Workflow missing SaveImage node.';
    }
    return null;
  };

  const activeLlmConfig = llmConfigs[llmProvider];
  const updateLlmConfig = (provider: LLMProvider, patch: Partial<LlmProviderConfig>) => {
    setLlmConfigs((current) => ({
      ...current,
      [provider]: {
        ...current[provider],
        ...patch
      }
    }));
  };

  const updateLlmRouting = (patch: Partial<LlmRoutingConfig>) => {
    setLlmRouting((current) => ({
      ...current,
      ...patch
    }));
  };

  const selectLlmProvider = (provider: LLMProvider) => {
    setLlmProvider(provider);
  };

  const parseTtsLanguages = (value: string): string[] => {
    const seen = new Set<string>();
    const languages: string[] = [];
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((language) => {
        const key = language.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        languages.push(language);
      });
    return languages;
  };

  const updateTtsProviderConfig = (providerId: string, patch: Partial<TtsProviderConfig>) => {
    setTtsProviderConfigs((current) => ({
      ...current,
      [providerId]: {
        ...(current[providerId] ?? DEFAULT_TTS_PROVIDER_CONFIGS[providerId] ?? DEFAULT_TTS_PROVIDER_CONFIGS.xtts),
        ...patch
      }
    }));
  };

  const parseCommaList = (value: string): string[] => {
    const seen = new Set<string>();
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => {
        const key = item.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };

  const parseNumberList = (value: string): number[] => {
    return parseCommaList(value)
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item) && item > 0);
  };

  const updateVisualProviderConfig = (providerId: string, patch: Partial<VisualProviderConfig>) => {
    setVisualProviderConfigs((current) => ({
      ...current,
      [providerId]: {
        ...(current[providerId] ?? DEFAULT_VISUAL_PROVIDER_CONFIGS[providerId] ?? DEFAULT_VISUAL_PROVIDER_CONFIGS.comfyui),
        ...patch
      }
    }));
  };

  useEffect(() => {
    apiGet<{
      theme?: { family?: string; mode?: string };
      llm?: {
        provider?: LLMProvider;
        providers?: Partial<Record<LLMProvider, {
          baseUrl?: string;
          apiKey?: string;
          timeoutMs?: number;
        }>>;
        routing?: {
          segmentStructureModel?: string;
          segmentStructureFallbackModel?: string;
          segmentBlockModel?: string;
          segmentBlockFallbackModel?: string;
        };
        // Legacy fields are read only for old local settings.
        baseUrl?: string;
        model?: string;
        apiKeys?: { gemini?: string; openai?: string };
        timeoutMs?: number;
      };
      comfy?: {
        baseUrl?: string;
        promptTimeoutMs?: number;
        generationTimeoutMs?: number;
        viewTimeoutMs?: number;
        masterPrompt?: string;
        workflowFile?: string;
        availableWorkflows?: string[];
      };
      tts?: {
        providers?: Record<string, {
          provider?: TtsProvider;
          displayName?: string;
          baseUrl?: string;
          timeoutUs?: number;
          language?: string;
          languages?: string[];
          defaultVoiceId?: string;
          useCase?: string;
          targetChars?: number;
          maxChars?: number;
          targetSpeechSeconds?: number;
          maxSpeechSeconds?: number;
        }>;
        languageRoutes?: Record<string, {
          providerId?: string;
          voiceId?: string;
          targetChars?: number;
          maxChars?: number;
          targetSpeechSeconds?: number;
          maxSpeechSeconds?: number;
        }>;
      };
      visualGeneration?: {
        providers?: Record<string, {
          provider?: VisualProvider;
          displayName?: string;
          baseUrl?: string;
          capabilities?: string[];
          useCase?: string;
          models?: Record<string, {
            displayName?: string;
            kind?: VisualModelKind;
            acceptedAspectRatios?: string[];
            acceptedDurationsSeconds?: number[];
            maxNativeSpeechSeconds?: number;
            supportsNativeAudio?: boolean;
            supportsPromptEnhancement?: boolean;
            costTier?: 'local' | 'low' | 'medium' | 'high' | 'premium';
          }>;
        }>;
      };
      memory?: { idleUnloadMs?: number };
    }>('/settings')
      .then((data) => {
        if (data.llm?.provider) setLlmProvider(data.llm.provider);
        setLlmConfigs((current) => {
          const next: Record<LLMProvider, LlmProviderConfig> = {
            ollama: { ...current.ollama },
            gemini: { ...current.gemini },
            openai: { ...current.openai }
          };
          (['ollama', 'gemini', 'openai'] as const).forEach((provider) => {
            const providerSettings = data.llm?.providers?.[provider];
            if (!providerSettings) return;
            next[provider] = {
              ...next[provider],
              baseUrl: providerSettings.baseUrl ?? next[provider].baseUrl,
              timeoutSeconds:
                providerSettings.timeoutMs !== undefined
                  ? String(Math.round(providerSettings.timeoutMs / 1000))
                  : next[provider].timeoutSeconds,
              apiKey: provider === 'ollama' ? '' : providerSettings.apiKey ?? next[provider].apiKey
            };
          });

          const provider = data.llm?.provider;
          if (provider && !data.llm?.providers?.[provider]) {
            next[provider] = {
              ...next[provider],
              baseUrl: data.llm?.baseUrl ?? next[provider].baseUrl,
              timeoutSeconds:
                data.llm?.timeoutMs !== undefined
                  ? String(Math.round(data.llm.timeoutMs / 1000))
                  : next[provider].timeoutSeconds,
              apiKey:
                provider === 'gemini'
                  ? data.llm?.apiKeys?.gemini ?? next[provider].apiKey
                  : provider === 'openai'
                    ? data.llm?.apiKeys?.openai ?? next[provider].apiKey
                    : ''
            };
          }
          return next;
        });
        setLlmRouting({
          segmentStructureModel: data.llm?.routing?.segmentStructureModel ?? '',
          segmentStructureFallbackModel: data.llm?.routing?.segmentStructureFallbackModel ?? '',
          segmentBlockModel: data.llm?.routing?.segmentBlockModel ?? '',
          segmentBlockFallbackModel: data.llm?.routing?.segmentBlockFallbackModel ?? ''
        });

        if (data.comfy?.baseUrl) setComfyUiUrl(data.comfy.baseUrl);
        if (data.comfy?.promptTimeoutMs) setComfyPromptTimeoutMs(String(data.comfy.promptTimeoutMs));
        if (data.comfy?.generationTimeoutMs) setComfyGenerationTimeoutMs(String(data.comfy.generationTimeoutMs));
        if (data.comfy?.viewTimeoutMs) setComfyViewTimeoutMs(String(data.comfy.viewTimeoutMs));
        if (data.comfy?.masterPrompt !== undefined && data.comfy?.masterPrompt !== null) {
          setComfyMasterPrompt(data.comfy.masterPrompt);
        }
        if (data.comfy?.workflowFile) {
          setComfyWorkflowFile(data.comfy.workflowFile);
        }
        if (Array.isArray(data.comfy?.availableWorkflows)) {
          setAvailableComfyWorkflows(data.comfy.availableWorkflows);
          if (!data.comfy?.workflowFile && data.comfy.availableWorkflows.length > 0) {
            setComfyWorkflowFile(data.comfy.availableWorkflows[0]);
          }
        }

        if (data.theme?.family && data.theme?.mode) {
          setTheme(`${data.theme.family}-${data.theme.mode}` as Theme);
        }
        const routeLanguagesByProvider = new Map<string, string[]>();
        Object.entries(data.tts?.languageRoutes ?? {}).forEach(([language, route]) => {
          const providerId = route?.providerId;
          if (!providerId) return;
          const list = routeLanguagesByProvider.get(providerId) ?? [];
          list.push(language);
          routeLanguagesByProvider.set(providerId, list);
        });
        setTtsProviderConfigs((current) => {
          const next: Record<string, TtsProviderConfig> = { ...current };
          const providerIds = Array.from(
            new Set([...Object.keys(DEFAULT_TTS_PROVIDER_CONFIGS), ...Object.keys(data.tts?.providers ?? {})])
          );
          providerIds.forEach((providerId) => {
            const preset = DEFAULT_TTS_PROVIDER_CONFIGS[providerId] ?? DEFAULT_TTS_PROVIDER_CONFIGS.xtts;
            const providerSettings = data.tts?.providers?.[providerId];
            const routeLanguages = routeLanguagesByProvider.get(providerId);
            next[providerId] = {
              ...preset,
              provider: providerSettings?.provider ?? preset.provider,
              label: providerSettings?.displayName ?? preset.label,
              useCase: providerSettings?.useCase ?? preset.useCase,
              baseUrl: providerSettings?.baseUrl ?? preset.baseUrl,
              timeoutUs: providerSettings?.timeoutUs !== undefined ? String(providerSettings.timeoutUs) : preset.timeoutUs,
              language: providerSettings?.language ?? preset.language,
              languages: (providerSettings?.languages ?? routeLanguages ?? parseTtsLanguages(preset.languages)).join(', '),
              defaultVoiceId: providerSettings?.defaultVoiceId ?? preset.defaultVoiceId,
              targetChars: providerSettings?.targetChars !== undefined ? String(providerSettings.targetChars) : preset.targetChars,
              maxChars: providerSettings?.maxChars !== undefined ? String(providerSettings.maxChars) : preset.maxChars,
              targetSpeechSeconds:
                providerSettings?.targetSpeechSeconds !== undefined
                  ? String(providerSettings.targetSpeechSeconds)
                  : preset.targetSpeechSeconds,
              maxSpeechSeconds:
                providerSettings?.maxSpeechSeconds !== undefined
                  ? String(providerSettings.maxSpeechSeconds)
                  : preset.maxSpeechSeconds
            };
          });
          return next;
        });
        setVisualProviderConfigs((current) => {
          const next: Record<string, VisualProviderConfig> = { ...current };
          const providerIds = Array.from(
            new Set([...Object.keys(DEFAULT_VISUAL_PROVIDER_CONFIGS), ...Object.keys(data.visualGeneration?.providers ?? {})])
          );
          providerIds.forEach((providerId) => {
            const preset = DEFAULT_VISUAL_PROVIDER_CONFIGS[providerId] ?? DEFAULT_VISUAL_PROVIDER_CONFIGS.comfyui;
            const providerSettings = data.visualGeneration?.providers?.[providerId];
            const models: Record<string, VisualModelConfig> = { ...preset.models };
            Object.entries(providerSettings?.models ?? {}).forEach(([modelId, modelSettings]) => {
              const modelPreset = models[modelId] ?? {
                displayName: modelId,
                kind: 'text_to_image' as VisualModelKind,
                acceptedAspectRatios: '',
                acceptedDurationsSeconds: '',
                maxNativeSpeechSeconds: '',
                supportsNativeAudio: false,
                supportsPromptEnhancement: false,
                costTier: 'medium' as const
              };
              models[modelId] = {
                ...modelPreset,
                displayName: modelSettings?.displayName ?? modelPreset.displayName,
                kind: modelSettings?.kind ?? modelPreset.kind,
                acceptedAspectRatios:
                  modelSettings?.acceptedAspectRatios?.join(', ') ?? modelPreset.acceptedAspectRatios,
                acceptedDurationsSeconds:
                  modelSettings?.acceptedDurationsSeconds?.join(', ') ?? modelPreset.acceptedDurationsSeconds,
                maxNativeSpeechSeconds:
                  modelSettings?.maxNativeSpeechSeconds !== undefined
                    ? String(modelSettings.maxNativeSpeechSeconds)
                    : modelPreset.maxNativeSpeechSeconds,
                supportsNativeAudio: modelSettings?.supportsNativeAudio ?? modelPreset.supportsNativeAudio,
                supportsPromptEnhancement:
                  modelSettings?.supportsPromptEnhancement ?? modelPreset.supportsPromptEnhancement,
                costTier: modelSettings?.costTier ?? modelPreset.costTier
              };
            });
            next[providerId] = {
              ...preset,
              provider: providerSettings?.provider ?? preset.provider,
              label: providerSettings?.displayName ?? preset.label,
              useCase: providerSettings?.useCase ?? preset.useCase,
              baseUrl: providerSettings?.baseUrl ?? preset.baseUrl,
              capabilities: providerSettings?.capabilities?.join(', ') ?? preset.capabilities,
              models
            };
          });
          return next;
        });
        if (data.memory?.idleUnloadMs !== undefined) setIdleUnloadMs(String(data.memory.idleUnloadMs));
      })
      .catch(() => {
        // keep defaults
      });
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setSettingsError(null);
    const promptMs = Number(comfyPromptTimeoutMs);
    const generationMs = Number(comfyGenerationTimeoutMs);
    const viewMs = Number(comfyViewTimeoutMs);
    const llmTimeoutMs = Number(activeLlmConfig.timeoutSeconds) * 1000;
    const idleUnloadMsValue = Number(idleUnloadMs);
    if (!Number.isFinite(promptMs) || promptMs <= 0) {
      setIsSaving(false);
      setSettingsError('Comfy prompt timeout must be a positive number.');
      return;
    }
    if (!Number.isFinite(generationMs) || generationMs <= 0) {
      setIsSaving(false);
      setSettingsError('Comfy generation timeout must be a positive number.');
      return;
    }
    if (!Number.isFinite(viewMs) || viewMs <= 0) {
      setIsSaving(false);
      setSettingsError('Comfy view timeout must be a positive number.');
      return;
    }
    if (!Number.isFinite(llmTimeoutMs) || llmTimeoutMs <= 0) {
      setIsSaving(false);
      setSettingsError('LLM timeout must be a positive number.');
      return;
    }
    const ttsProvidersPayload: Record<string, {
      provider: TtsProvider;
      displayName: string;
      baseUrl?: string;
      timeoutUs: number;
      language: string;
      languages: string[];
      defaultVoiceId: string;
      useCase: string;
      targetChars: number;
      maxChars: number;
      targetSpeechSeconds: number;
      maxSpeechSeconds: number;
    }> = {};
    const ttsLanguageRoutesPayload: Record<string, {
      providerId: string;
      voiceId: string;
      targetChars: number;
      maxChars: number;
      targetSpeechSeconds: number;
      maxSpeechSeconds: number;
    }> = {};
    const ttsLanguageOwner = new Map<string, string>();
    for (const [providerId, config] of Object.entries(ttsProviderConfigs)) {
      const providerLanguages = parseTtsLanguages(config.languages);
      const timeoutUs = Number(config.timeoutUs);
      const targetChars = Number(config.targetChars);
      const maxChars = Number(config.maxChars);
      const targetSpeechSeconds = Number(config.targetSpeechSeconds);
      const maxSpeechSeconds = Number(config.maxSpeechSeconds);
      if (!Number.isFinite(timeoutUs) || timeoutUs <= 0) {
        setIsSaving(false);
        setSettingsError(`${config.label} timeout must be a positive number.`);
        return;
      }
      if (!Number.isFinite(targetChars) || targetChars <= 0 || !Number.isFinite(maxChars) || maxChars <= 0) {
        setIsSaving(false);
        setSettingsError(`${config.label} character limits must be positive numbers.`);
        return;
      }
      if (targetChars > maxChars) {
        setIsSaving(false);
        setSettingsError(`${config.label} target characters cannot be greater than max characters.`);
        return;
      }
      if (
        !Number.isFinite(targetSpeechSeconds) ||
        targetSpeechSeconds <= 0 ||
        !Number.isFinite(maxSpeechSeconds) ||
        maxSpeechSeconds <= 0
      ) {
        setIsSaving(false);
        setSettingsError(`${config.label} speech limits must be positive numbers.`);
        return;
      }
      if (targetSpeechSeconds > maxSpeechSeconds) {
        setIsSaving(false);
        setSettingsError(`${config.label} target speech seconds cannot be greater than max speech seconds.`);
        return;
      }
      if (providerLanguages.length > 0 && !config.defaultVoiceId.trim()) {
        setIsSaving(false);
        setSettingsError(`${config.label} default voice ID is required when languages are assigned.`);
        return;
      }
      for (const language of providerLanguages) {
        const key = language.toLowerCase();
        const owner = ttsLanguageOwner.get(key);
        if (owner && owner !== providerId) {
          setIsSaving(false);
          setSettingsError(`Language ${language} is assigned to both ${owner} and ${providerId}.`);
          return;
        }
        ttsLanguageOwner.set(key, providerId);
        ttsLanguageRoutesPayload[language] = {
          providerId,
          voiceId: config.defaultVoiceId.trim(),
          targetChars: Math.trunc(targetChars),
          maxChars: Math.trunc(maxChars),
          targetSpeechSeconds,
          maxSpeechSeconds
        };
      }
      ttsProvidersPayload[providerId] = {
        provider: config.provider,
        displayName: config.label,
        baseUrl: config.baseUrl.trim() || undefined,
        timeoutUs: Math.trunc(timeoutUs),
        language: providerLanguages[0] ?? config.language.trim(),
        languages: providerLanguages,
        defaultVoiceId: config.defaultVoiceId.trim(),
        useCase: config.useCase,
        targetChars: Math.trunc(targetChars),
        maxChars: Math.trunc(maxChars),
        targetSpeechSeconds,
        maxSpeechSeconds
      };
    }
    if (duplicateTtsLanguages.length > 0) {
      setIsSaving(false);
      setSettingsError(`Each language can only be assigned to one TTS route. Duplicates: ${duplicateTtsLanguages.join(', ')}.`);
      return;
    }
    if (ttsLanguageOwner.size === 0) {
      setIsSaving(false);
      setSettingsError('At least one TTS language route is required.');
      return;
    }
    const visualProvidersPayload: Record<string, {
      provider: VisualProvider;
      displayName: string;
      baseUrl?: string;
      capabilities: string[];
      useCase: string;
      models: Record<string, {
        displayName: string;
        kind: VisualModelKind;
        acceptedAspectRatios: string[];
        acceptedDurationsSeconds?: number[];
        maxNativeSpeechSeconds?: number;
        supportsNativeAudio: boolean;
        supportsPromptEnhancement: boolean;
        costTier: 'local' | 'low' | 'medium' | 'high' | 'premium';
      }>;
    }> = {};
    for (const [providerId, config] of Object.entries(visualProviderConfigs)) {
      const models: Record<string, {
        displayName: string;
        kind: VisualModelKind;
        acceptedAspectRatios: string[];
        acceptedDurationsSeconds?: number[];
        maxNativeSpeechSeconds?: number;
        supportsNativeAudio: boolean;
        supportsPromptEnhancement: boolean;
        costTier: 'local' | 'low' | 'medium' | 'high' | 'premium';
      }> = {};
      for (const [modelId, model] of Object.entries(config.models)) {
        const maxNativeSpeechSeconds = model.maxNativeSpeechSeconds.trim()
          ? Number(model.maxNativeSpeechSeconds)
          : undefined;
        if (
          maxNativeSpeechSeconds !== undefined &&
          (!Number.isFinite(maxNativeSpeechSeconds) || maxNativeSpeechSeconds <= 0)
        ) {
          setIsSaving(false);
          setSettingsError(`${config.label} ${model.displayName} native speech limit must be a positive number.`);
          return;
        }
        models[modelId] = {
          displayName: model.displayName,
          kind: model.kind,
          acceptedAspectRatios: parseCommaList(model.acceptedAspectRatios),
          acceptedDurationsSeconds: parseNumberList(model.acceptedDurationsSeconds),
          maxNativeSpeechSeconds,
          supportsNativeAudio: model.supportsNativeAudio,
          supportsPromptEnhancement: model.supportsPromptEnhancement,
          costTier: model.costTier
        };
      }
      visualProvidersPayload[providerId] = {
        provider: config.provider,
        displayName: config.label,
        baseUrl: config.baseUrl.trim() || undefined,
        capabilities: parseCommaList(config.capabilities),
        useCase: config.useCase,
        models
      };
    }
    if (!Number.isFinite(idleUnloadMsValue) || idleUnloadMsValue < 0) {
      setIsSaving(false);
      setSettingsError('Idle unload must be zero or a positive number.');
      return;
    }
    if (!comfyWorkflowFile.trim()) {
      setIsSaving(false);
      setSettingsError('Comfy workflow is required.');
      return;
    }
    try {
      await apiPatch('/settings', {
        theme: { family: currentFamily, mode: currentMode },
        llm: {
          provider: llmProvider,
          providers: {
            ollama: {
              baseUrl: llmConfigs.ollama.baseUrl.trim(),
              model: '',
              timeoutMs: Math.trunc(Number(llmConfigs.ollama.timeoutSeconds) * 1000)
            },
            gemini: {
              baseUrl: llmConfigs.gemini.baseUrl.trim(),
              model: '',
              apiKey: llmConfigs.gemini.apiKey.trim(),
              timeoutMs: Math.trunc(Number(llmConfigs.gemini.timeoutSeconds) * 1000)
            },
            openai: {
              baseUrl: llmConfigs.openai.baseUrl.trim(),
              model: '',
              apiKey: llmConfigs.openai.apiKey.trim(),
              timeoutMs: Math.trunc(Number(llmConfigs.openai.timeoutSeconds) * 1000)
            }
          },
          routing: {
            segmentStructureModel: llmRouting.segmentStructureModel.trim() || undefined,
            segmentStructureFallbackModel: llmRouting.segmentStructureFallbackModel.trim() || undefined,
            segmentBlockModel: llmRouting.segmentBlockModel.trim() || undefined,
            segmentBlockFallbackModel: llmRouting.segmentBlockFallbackModel.trim() || undefined
          }
        },
        comfy: {
          baseUrl: comfyUiUrl,
          promptTimeoutMs: promptMs,
          generationTimeoutMs: generationMs,
          viewTimeoutMs: viewMs,
          masterPrompt: comfyMasterPrompt,
          workflowFile: comfyWorkflowFile
        },
        visualGeneration: {
          providers: visualProvidersPayload
        },
        tts: {
          providers: ttsProvidersPayload,
          languageRoutes: ttsLanguageRoutesPayload
        },
        memory: {
          idleUnloadMs: Math.trunc(idleUnloadMsValue)
        }
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSettingsError((err as Error).message ?? 'Failed to save settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleThemeSelect = (family: 'classic' | 'premium' | 'minimal', mode: 'light' | 'dark') => {
    const nextTheme = `${family}-${mode}` as Theme;
    setTheme(nextTheme);
  };

  const handleTestComfy = async () => {
    setIsTestingComfy(true);
    setComfyTestStatus('idle');
    setComfyTestMessage('');
    try {
      await apiPost('/integrations/comfyui/health', { baseUrl: comfyUiUrl });
      setComfyTestStatus('success');
      setComfyTestMessage('Connection successful.');
    } catch (err) {
      setComfyTestStatus('error');
      setComfyTestMessage((err as Error).message ?? 'Connection failed.');
    } finally {
      setIsTestingComfy(false);
    }
  };

  const handleImportComfyWorkflow = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setComfyImportStatus('idle');
    setComfyImportMessage('');
    setSettingsError(null);
    setIsImportingComfyWorkflow(true);
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as unknown;
      const validationError = validateComfyWorkflowMinimum(parsed);
      if (validationError) {
        throw new Error(validationError);
      }
      let response: { workflowFile: string; availableWorkflows: string[] };
      try {
        response = await apiPost<{ workflowFile: string; availableWorkflows: string[] }>(
          '/integrations/comfyui/workflows/import',
          { fileName: file.name, workflow: parsed }
        );
      } catch (err) {
        const message = (err as Error).message ?? 'Failed to import workflow.';
        const existsPrefix = 'Workflow already exists: ';
        if (!message.includes(existsPrefix)) {
          throw err;
        }
        const existingFileName = message.split(existsPrefix)[1]?.trim() || file.name;
        setOverwriteWorkflowTargetName(existingFileName);
        setPendingWorkflowOverwrite({ fileName: file.name, workflow: parsed });
        setIsOverwriteWorkflowConfirmOpen(true);
        return;
      }
      setAvailableComfyWorkflows(response.availableWorkflows ?? []);
      if (response.workflowFile) {
        setComfyWorkflowFile(response.workflowFile);
      }
      setComfyImportStatus('success');
      setComfyImportMessage(`Workflow imported: ${response.workflowFile}`);
    } catch (err) {
      setComfyImportStatus('error');
      setComfyImportMessage((err as Error).message ?? 'Failed to import workflow.');
    } finally {
      setIsImportingComfyWorkflow(false);
    }
  };

  const handleCancelOverwriteWorkflow = () => {
    setIsOverwriteWorkflowConfirmOpen(false);
    setOverwriteWorkflowTargetName('');
    setPendingWorkflowOverwrite(null);
  };

  const handleConfirmOverwriteWorkflow = async () => {
    if (!pendingWorkflowOverwrite) {
      handleCancelOverwriteWorkflow();
      return;
    }
    setIsImportingComfyWorkflow(true);
    setComfyImportStatus('idle');
    setComfyImportMessage('');
    try {
      const response = await apiPost<{ workflowFile: string; availableWorkflows: string[] }>(
        '/integrations/comfyui/workflows/import',
        {
          fileName: pendingWorkflowOverwrite.fileName,
          workflow: pendingWorkflowOverwrite.workflow,
          overwrite: true
        }
      );
      setAvailableComfyWorkflows(response.availableWorkflows ?? []);
      if (response.workflowFile) {
        setComfyWorkflowFile(response.workflowFile);
      }
      setComfyImportStatus('success');
      setComfyImportMessage(`Workflow imported: ${response.workflowFile}`);
      handleCancelOverwriteWorkflow();
    } catch (err) {
      setComfyImportStatus('error');
      setComfyImportMessage((err as Error).message ?? 'Failed to import workflow.');
    } finally {
      setIsImportingComfyWorkflow(false);
    }
  };

  const sections = [
    { id: 'appearance' as const, label: 'Appearance', hint: 'Themes & mode', icon: Monitor },
    { id: 'llm' as const, label: 'LLM', hint: 'Providers & models', icon: Cpu },
    { id: 'comfy' as const, label: 'ComfyUI', hint: 'Image generation', icon: Server },
    { id: 'visual' as const, label: 'Visual', hint: 'Image & video models', icon: Film },
    { id: 'tts' as const, label: 'TTS', hint: 'Voices & language', icon: Mic },
    { id: 'runtime' as const, label: 'Runtime', hint: 'Memory behavior', icon: SettingsIcon }
  ];

  const duplicateTtsLanguages = useMemo(() => {
    const owners = new Map<string, string>();
    const duplicates = new Set<string>();
    Object.entries(ttsProviderConfigs).forEach(([providerId, config]) => {
      parseTtsLanguages(config.languages).forEach((language) => {
        const key = language.toLowerCase();
        const owner = owners.get(key);
        if (owner && owner !== providerId) {
          duplicates.add(language);
          return;
        }
        owners.set(key, providerId);
      });
    });
    return Array.from(duplicates);
  }, [ttsProviderConfigs]);

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-background">
      <div className="max-w-6xl mx-auto p-6 md:p-10 pb-24">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-10">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-[5px] bg-slate-100 dark:bg-slate-800 text-slate-500">
                <SettingsIcon size={18} />
              </div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">System Settings</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-2">Configure themes, AI providers, endpoints, and behaviors.</p>
          </div>
          
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className={`flex items-center gap-2 px-6 rounded-[5px] text-xs font-bold uppercase tracking-widest transition-all shadow-lg h-9 ${ saveSuccess ? 'bg-green-500 text-white shadow-green-500/20' : 'bg-orange-600 hover:bg-orange-700 text-white shadow-orange-600/20 active:scale-95' }`}
          >
            {isSaving ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : saveSuccess ? (
              <CheckCircle2 size={16} />
            ) : (
              <Save size={16} />
            )}
            {isSaving ? 'Saving...' : saveSuccess ? 'Saved' : 'Save Changes'}
          </button>
        </div>

        {settingsError && (
          <div className="mb-6 flex items-center gap-2 rounded-[5px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            <AlertCircle size={16} />
            {settingsError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <div className="lg:sticky lg:top-6 space-y-4">
              <div className="bg-card border border-border rounded-[5px] p-4 shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-2 pb-3">
                  Sections
                </div>
                <div className="space-y-1">
                  {sections.map((section) => {
                    const Icon = section.icon;
                    const isActive = activeSection === section.id;
                    return (
                      <button
                        key={section.id}
                        onClick={() => setActiveSection(section.id)}
                        className={`w-full text-left px-3 py-2 rounded-[5px] transition-all border ${
                          isActive
                            ? 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:border-orange-500/20'
                            : 'border-transparent hover:border-border hover:bg-[hsl(var(--secondary))]/60 text-muted-foreground'
                        }`}
                        aria-pressed={isActive}
                      >
                        <div className="flex items-center gap-2">
                          <Icon size={14} />
                          <span className="text-sm font-bold">{section.label}</span>
                        </div>
                        <div className="text-[10px] uppercase tracking-widest mt-1 opacity-70">{section.hint}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-[hsl(var(--secondary))]/50 border border-border rounded-[5px] p-4">
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Tip</div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Changes are saved manually. Review each section and click Save when ready.
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-8">

          {/* 1. Theme Configuration (NEW) */}
          {activeSection === 'appearance' && (
          <div className="bg-card border border-border rounded-[5px] shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-[hsl(var(--secondary))]/60">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-500/10 rounded-[5px] text-purple-600 dark:text-purple-400">
                  <Monitor size={18} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800 dark:text-white">Appearance</h2>
                  <p className="text-xs text-muted-foreground">Theme family and display mode.</p>
                </div>
              </div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Mode: {currentMode === 'dark' ? 'Dark' : 'Light'}
              </div>
            </div>

            <div className="p-8">
              <div className="space-y-4">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Interface Theme</label>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {(['classic', 'premium', 'minimal'] as const).map((family) => (
                    <div
                      key={family}
                      className={`rounded-[5px] border ${currentFamily === family ? 'border-orange-200 dark:border-orange-500/20' : 'border-border'} overflow-hidden bg-card`}
                    >
                      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                        <div className="font-bold text-sm text-foreground">
                          {family === 'classic' ? 'Classic' : family === 'premium' ? 'Premium Navy' : 'Minimal'}
                        </div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Theme</div>
                      </div>

                      <div className="p-4 space-y-3">
                        {/* Light */}
                        <button
                          onClick={() => handleThemeSelect(family, 'light')}
                          className={`w-full text-left rounded-[5px] border transition-all overflow-hidden ${
                            currentFamily === family && currentMode === 'light'
                              ? 'border-orange-500 ring-2 ring-orange-500/20'
                              : 'border-border hover:border-slate-300 dark:hover:border-slate-700'
                          }`}
                        >
                          <div className={`aspect-[10/4] relative p-3 flex flex-col gap-2 ${family === 'minimal' ? 'bg-white' : family === 'premium' ? 'bg-[#eef2f7]' : 'bg-slate-50'}`}>
                            <div className="w-full h-2 bg-white rounded-full shadow-sm"></div>
                            <div className="flex gap-2 h-full">
                              <div className="w-1/4 h-full bg-white rounded-[5px] shadow-sm"></div>
                              <div className="w-3/4 h-full bg-white rounded-[5px] border border-slate-100 shadow-sm"></div>
                            </div>
                          </div>
                          <div className="px-3 py-2 flex items-center justify-between text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            Light
                            {currentFamily === family && currentMode === 'light' && (
                              <span className="text-orange-600">Selected</span>
                            )}
                          </div>
                        </button>

                        {/* Dark */}
                        <button
                          onClick={() => handleThemeSelect(family, 'dark')}
                          className={`w-full text-left rounded-[5px] border transition-all overflow-hidden ${
                            currentFamily === family && currentMode === 'dark'
                              ? 'border-orange-500 ring-2 ring-orange-500/20'
                              : 'border-border hover:border-slate-300 dark:hover:border-slate-700'
                          }`}
                        >
                          <div
                            className={`aspect-[10/4] relative p-3 flex flex-col gap-2 ${
                              family === 'premium' ? 'bg-[#0b0e14]' : family === 'minimal' ? 'bg-[#0b0f19]' : 'bg-[#0b1020]'
                            }`}
                          >
                            <div className={`w-full h-2 rounded-full ${family === 'premium' ? 'bg-[#151a25]' : family === 'minimal' ? 'bg-[#0b0f19]' : 'bg-[#1c2540]'} ${family === 'minimal' ? 'border border-[#1f2937]' : ''}`}></div>
                            <div className="flex gap-2 h-full">
                              <div className={`w-1/4 h-full rounded-[5px] ${family === 'premium' ? 'bg-[#151a25]' : family === 'minimal' ? 'bg-[#0b0f19] border border-[#1f2937]' : 'bg-[#1c2540]'}`}></div>
                              <div className={`w-3/4 h-full rounded-[5px] border ${
                                family === 'premium'
                                  ? 'bg-[#151a25] border-[#2a3245]'
                                  : family === 'minimal'
                                  ? 'bg-[#0b0f19] border-[#1f2937]'
                                  : 'bg-[#1c2540] border-[#2a355a]'
                              }`}></div>
                            </div>
                          </div>
                          <div className="px-3 py-2 flex items-center justify-between text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            Dark
                            {currentFamily === family && currentMode === 'dark' && (
                              <span className="text-orange-600">Selected</span>
                            )}
                          </div>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          )}

          {/* 2. LLM Configuration */}
          {activeSection === 'llm' && (
          <div className="bg-card border border-border rounded-[5px] shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 bg-[hsl(var(--secondary))]/60">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-500/10 rounded-[5px] text-indigo-600 dark:text-indigo-400">
                <Cpu size={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-white">LLM Configuration</h2>
                <p className="text-xs text-muted-foreground">Provider, model, timeout, and runtime endpoint.</p>
                <p className="text-[10px] text-slate-400 mt-1">Saved to the runtime settings file `DATA_DIR/app_settings.json`, not `config/app_settings.template.json`.</p>
              </div>
            </div>

            <div className="p-8 space-y-8">
              {/* Provider Selection */}
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">AI Provider</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {(['ollama', 'gemini', 'openai'] as const).map((provider) => (
                    <div 
                      key={provider}
                      onClick={() => selectLlmProvider(provider)}
                      className={`cursor-pointer rounded-[5px] p-4 border-2 transition-all flex items-center gap-3 ${
                        llmProvider === provider 
                          ? 'border-orange-500 bg-orange-50 dark:bg-orange-500/5' 
                          : 'border-slate-100 dark:border-slate-800 hover:border-orange-500/30'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        llmProvider === provider ? 'border-orange-600' : 'border-slate-300 dark:border-slate-600'
                      }`}>
                        {llmProvider === provider && <div className="w-2.5 h-2.5 rounded-full bg-orange-600" />}
                      </div>
                      <span className="font-bold capitalize text-slate-700 dark:text-slate-200">{provider}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Provider Specific Settings */}
              {llmProvider === 'ollama' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Server URL</label>
                      <input 
                        className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm font-mono outline-none focus:border-primary/40 transition-all text-foreground"
                        value={activeLlmConfig.baseUrl}
                        onChange={(e) => updateLlmConfig('ollama', { baseUrl: e.target.value })}
                      />
                      <p className="text-[10px] text-slate-400">Default: http://127.0.0.1:11434</p>
                    </div>

                    <div className="space-y-2">
                       <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Timeout (Seconds)</label>
                       <input 
                        type="number"
                        className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm outline-none focus:border-primary/40 transition-all text-foreground"
                        value={activeLlmConfig.timeoutSeconds}
                        onChange={(e) => updateLlmConfig('ollama', { timeoutSeconds: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}

              {(llmProvider === 'gemini' || llmProvider === 'openai') && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Timeout (Seconds)</label>
                      <input
                        type="number"
                        value={activeLlmConfig.timeoutSeconds}
                        onChange={(e) => updateLlmConfig(llmProvider, { timeoutSeconds: e.target.value })}
                        className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm outline-none focus:border-primary/40 transition-all text-foreground"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">API Base URL</label>
                    <input
                      value={activeLlmConfig.baseUrl}
                      onChange={(e) => updateLlmConfig(llmProvider, { baseUrl: e.target.value })}
                      className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm font-mono outline-none focus:border-primary/40 transition-all text-foreground"
                    />
                    <p className="text-[10px] text-slate-400">
                      {llmProvider === 'openai'
                        ? 'Supports OpenAI-compatible endpoints such as OpenAI and Groq.'
                        : 'Saved in the runtime settings file after Save Changes.'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                        {llmProvider === 'gemini' ? 'Gemini API Key' : 'OpenAI API Key'}
                      </label>
                      {llmProvider === 'gemini' && (
                        <a
                          href="https://aistudio.google.com/apikey"
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-[11px] font-bold text-orange-600 hover:text-orange-500 transition-colors"
                        >
                          Create Gemini API key
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                    <input
                      type="password"
                      value={activeLlmConfig.apiKey}
                      onChange={(e) => updateLlmConfig(llmProvider, { apiKey: e.target.value })}
                      placeholder={`Enter your ${llmProvider === 'gemini' ? 'Google Gemini' : 'OpenAI or Groq'} API Key`}
                      className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm font-mono outline-none focus:border-primary/40 transition-all text-foreground"
                    />
                    {llmProvider === 'gemini' && (
                      <p className="text-[10px] text-slate-400">
                        Opens Google AI Studio, where Gemini API keys are created and managed.
                      </p>
                    )}
                  </div>

                </div>
              )}

              <div className="rounded-[5px] border border-border bg-[hsl(var(--secondary))]/25 p-4 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-foreground">Segmentation Routing</h3>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Optional stage-specific overrides. Leave blank to use the provider default model.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Structure Model</label>
                    <input
                      value={llmRouting.segmentStructureModel}
                      onChange={(e) => updateLlmRouting({ segmentStructureModel: e.target.value })}
                      placeholder="Provider default"
                      className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm font-mono outline-none focus:border-primary/40 transition-all text-foreground"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Structure Fallback</label>
                    <input
                      value={llmRouting.segmentStructureFallbackModel}
                      onChange={(e) => updateLlmRouting({ segmentStructureFallbackModel: e.target.value })}
                      placeholder="Optional fallback model"
                      className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm font-mono outline-none focus:border-primary/40 transition-all text-foreground"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Block Meta Model</label>
                    <input
                      value={llmRouting.segmentBlockModel}
                      onChange={(e) => updateLlmRouting({ segmentBlockModel: e.target.value })}
                      placeholder="Provider default"
                      className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm font-mono outline-none focus:border-primary/40 transition-all text-foreground"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Block Meta Fallback</label>
                    <input
                      value={llmRouting.segmentBlockFallbackModel}
                      onChange={(e) => updateLlmRouting({ segmentBlockFallbackModel: e.target.value })}
                      placeholder="Optional fallback model"
                      className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm font-mono outline-none focus:border-primary/40 transition-all text-foreground"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          )}

          {/* 3. ComfyUI Configuration */}
          {activeSection === 'comfy' && (
          <div className="bg-card border border-border rounded-[5px] shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 bg-[hsl(var(--secondary))]/60">
              <div className="p-2 bg-pink-100 dark:bg-pink-500/10 rounded-[5px] text-pink-600 dark:text-pink-400">
                <Server size={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-white">ComfyUI Integration</h2>
                <p className="text-xs text-muted-foreground">Base URL, timeouts, and master prompt.</p>
              </div>
            </div>

            <div className="p-8">
              <div className="space-y-6">
                {settingsError && (
                  <div className="flex items-center gap-2 text-xs text-red-500">
                    <AlertCircle size={14} />
                    {settingsError}
                  </div>
                )}
                <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">ComfyUI URL</label>
                <div className="flex gap-4 items-start">
                  <div className="flex-1 space-y-2">
                    <input 
                      className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm font-mono outline-none focus:border-primary/40 transition-all text-foreground"
                      value={comfyUiUrl}
                      onChange={(e) => {
                        setComfyUiUrl(e.target.value);
                        if (comfyTestStatus !== 'idle') {
                          setComfyTestStatus('idle');
                          setComfyTestMessage('');
                        }
                      }}
                    />
                    <p className="text-[10px] text-slate-400">Default: http://127.0.0.1:8188</p>
                  </div>
                  <div className="relative flex flex-col items-start">
                    {comfyTestStatus !== 'idle' && (
                      <div
                        className={`absolute -top-5 left-0 text-xs font-medium ${
                          comfyTestStatus === 'success' ? 'text-emerald-600' : 'text-red-500'
                        }`}
                      >
                        {comfyTestMessage}
                      </div>
                    )}
                    <button
                      onClick={handleTestComfy}
                      disabled={isTestingComfy}
                      className="px-6 h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] text-muted-foreground font-bold text-xs uppercase rounded-[5px] hover:text-orange-600 transition-all disabled:opacity-60"
                    >
                      {isTestingComfy ? 'Testing...' : 'Test Connection'}
                    </button>
                  </div>
                </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Workflow</label>
                    <select
                      className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm outline-none focus:border-primary/40 transition-all text-foreground"
                      value={comfyWorkflowFile}
                      onChange={(e) => setComfyWorkflowFile(e.target.value)}
                    >
                      {availableComfyWorkflows.length === 0 && (
                        <option value={comfyWorkflowFile}>{comfyWorkflowFile}</option>
                      )}
                      {availableComfyWorkflows.map((workflow) => (
                        <option key={workflow} value={workflow}>
                          {workflow}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-400">Workflow em formato API do ComfyUI (JSON).</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Import Workflow</label>
                    <div className="flex items-center gap-3">
                      <label className="px-4 h-9 inline-flex items-center bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] text-muted-foreground font-bold text-xs uppercase rounded-[5px] hover:text-orange-600 transition-all cursor-pointer">
                        {isImportingComfyWorkflow ? 'Importing...' : 'Import .json'}
                        <input
                          type="file"
                          accept=".json,application/json"
                          className="hidden"
                          onChange={handleImportComfyWorkflow}
                          disabled={isImportingComfyWorkflow}
                        />
                      </label>
                    </div>
                    {comfyImportStatus !== 'idle' && (
                      <p className={`text-xs ${comfyImportStatus === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>
                        {comfyImportMessage}
                      </p>
                    )}
                    <p className="text-[10px] text-slate-400">Valida: CLIPTextEncode(text), KSampler(seed) e SaveImage.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Prompt Timeout (ms)</label>
                    <input 
                      type="number"
                      className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm outline-none focus:border-primary/40 transition-all text-foreground"
                      value={comfyPromptTimeoutMs}
                      onChange={(e) => setComfyPromptTimeoutMs(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Generation Timeout (ms)</label>
                    <input 
                      type="number"
                      className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm outline-none focus:border-primary/40 transition-all text-foreground"
                      value={comfyGenerationTimeoutMs}
                      onChange={(e) => setComfyGenerationTimeoutMs(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">View Timeout (ms)</label>
                    <input 
                      type="number"
                      className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm outline-none focus:border-primary/40 transition-all text-foreground"
                      value={comfyViewTimeoutMs}
                      onChange={(e) => setComfyViewTimeoutMs(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Master Prompt</label>
                  <textarea
                    rows={4}
                    className="w-full bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 py-2 text-sm outline-none focus:border-primary/40 transition-all text-foreground resize-y"
                    value={comfyMasterPrompt}
                    onChange={(e) => setComfyMasterPrompt(e.target.value)}
                    placeholder="Always prepended to image prompts (will be placed before the block prompt)."
                  />
                  <p className="text-[10px] text-slate-400">This text is concatenated before each block prompt when generating images.</p>
                </div>
              </div>
            </div>
          </div>
          )}

          {/* 4. Visual Generation Configuration */}
          {activeSection === 'visual' && (
          <div className="bg-card border border-border rounded-[5px] shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 bg-[hsl(var(--secondary))]/60">
              <div className="p-2 bg-cyan-100 dark:bg-cyan-500/10 rounded-[5px] text-cyan-600 dark:text-cyan-400">
                <Film size={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-white">Visual Generation</h2>
                <p className="text-xs text-muted-foreground">Catalog of image and video providers/models available to projects.</p>
              </div>
            </div>

            <div className="p-8 space-y-6">
              <div className="rounded-[5px] border border-border/70 bg-[hsl(var(--secondary))]/40 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Project Scoped</p>
                  <p className="text-sm font-semibold text-foreground mt-1">Projects choose image and optional video models</p>
                </div>
                <p className="text-xs text-muted-foreground max-w-2xl">
                  Keep provider/model capabilities here. Each project decides whether it uses ComfyUI, the Veo extension, Vertex Veo, or another route.
                </p>
              </div>

              <div className="space-y-4">
                {Object.entries(visualProviderConfigs).map(([providerId, config]) => {
                  return (
                    <div key={providerId} className="border border-border rounded-[5px] bg-[hsl(var(--secondary))]/25 p-4 space-y-4">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-bold text-foreground">{config.label}</h3>
                          <p className="text-xs text-muted-foreground mt-1">{config.useCase}</p>
                        </div>
                        <p className="text-[10px] text-muted-foreground font-mono">{providerId}</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">API URL</label>
                          <input
                            className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm font-mono outline-none focus:border-primary/40 transition-all text-foreground"
                            value={config.baseUrl}
                            onChange={(e) => updateVisualProviderConfig(providerId, { baseUrl: e.target.value })}
                            placeholder={providerId === 'veo_extension' ? 'Extension API URL' : 'Provider API URL'}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Capabilities</label>
                          <input
                            className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm outline-none focus:border-primary/40 transition-all text-foreground"
                            value={config.capabilities}
                            onChange={(e) => updateVisualProviderConfig(providerId, { capabilities: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {Object.entries(config.models).map(([modelId, model]) => (
                          <div key={modelId} className="rounded-[5px] border border-border/70 bg-background/40 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-foreground">{model.displayName}</p>
                                <p className="text-[10px] text-muted-foreground font-mono">{modelId}</p>
                              </div>
                              <span className="text-[10px] font-bold uppercase text-muted-foreground">{model.kind}</span>
                            </div>
                            <div className="mt-2 text-[11px] text-muted-foreground">
                              {model.acceptedAspectRatios && <p>Ratios: {model.acceptedAspectRatios}</p>}
                              {model.acceptedDurationsSeconds && <p>Durations: {model.acceptedDurationsSeconds}s</p>}
                              {model.maxNativeSpeechSeconds && <p>Native speech: {model.maxNativeSpeechSeconds}s max</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          )}

          {/* 5. TTS Configuration */}
          {activeSection === 'tts' && (
          <div className="bg-card border border-border rounded-[5px] shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 bg-[hsl(var(--secondary))]/60">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-500/10 rounded-[5px] text-emerald-600 dark:text-emerald-400">
                <Mic size={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-white">Text-to-Speech (TTS)</h2>
                <p className="text-xs text-muted-foreground">Provider endpoints, supported languages, voices, and speech budgets.</p>
              </div>
            </div>

            <div className="p-8 space-y-6">
              <div className="rounded-[5px] border border-border/70 bg-[hsl(var(--secondary))]/40 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Routing Rule</p>
                  <p className="text-sm font-semibold text-foreground mt-1">One available TTS route per language</p>
                </div>
                <p className="text-xs text-muted-foreground max-w-2xl">
                  Configure which providers can serve each language. Projects choose one of these routes when they are created or edited.
                </p>
              </div>
              {duplicateTtsLanguages.length > 0 && (
                <div className="rounded-[5px] border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-500">
                  Duplicate TTS language routes: {duplicateTtsLanguages.join(', ')}.
                </div>
              )}

              <div className="space-y-4">
                {Object.entries(ttsProviderConfigs).map(([providerId, config]) => (
                  <div key={providerId} className="border border-border rounded-[5px] bg-[hsl(var(--secondary))]/25 p-4 space-y-4">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-foreground">{config.label}</h3>
                        <p className="text-xs text-muted-foreground mt-1">{config.useCase}</p>
                      </div>
                      <p className="text-[10px] text-muted-foreground font-mono">{providerId}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                          <Globe size={12} /> Supported Languages
                        </label>
                        <input
                          className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm outline-none focus:border-primary/40 transition-all text-foreground"
                          value={config.languages}
                          onChange={(e) => updateTtsProviderConfig(providerId, { languages: e.target.value })}
                          placeholder="pt-BR, en-US, es-ES"
                        />
                        <p className="text-[10px] text-slate-400">Comma-separated. A language can appear in only one provider.</p>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Voice ID</label>
                        <input
                          className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm outline-none focus:border-primary/40 transition-all text-foreground"
                          value={config.defaultVoiceId}
                          onChange={(e) => updateTtsProviderConfig(providerId, { defaultVoiceId: e.target.value })}
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">API URL</label>
                        <input
                          className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm font-mono outline-none focus:border-primary/40 transition-all text-foreground"
                          value={config.baseUrl}
                          onChange={(e) => updateTtsProviderConfig(providerId, { baseUrl: e.target.value })}
                          placeholder={providerId === 'xtts' ? 'http://127.0.0.1:8020' : 'Optional until provider is implemented'}
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Timeout (Microseconds)</label>
                        <input
                          type="number"
                          min="1"
                          className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm outline-none focus:border-primary/40 transition-all text-foreground"
                          value={config.timeoutUs}
                          onChange={(e) => updateTtsProviderConfig(providerId, { timeoutUs: e.target.value })}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Target Chars</label>
                          <input
                            type="number"
                            min="1"
                            className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm outline-none focus:border-primary/40 transition-all text-foreground"
                            value={config.targetChars}
                            onChange={(e) => updateTtsProviderConfig(providerId, { targetChars: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Max Chars</label>
                          <input
                            type="number"
                            min="1"
                            className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm outline-none focus:border-primary/40 transition-all text-foreground"
                            value={config.maxChars}
                            onChange={(e) => updateTtsProviderConfig(providerId, { maxChars: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Target Speech (s)</label>
                          <input
                            type="number"
                            min="1"
                            step="0.1"
                            className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm outline-none focus:border-primary/40 transition-all text-foreground"
                            value={config.targetSpeechSeconds}
                            onChange={(e) => updateTtsProviderConfig(providerId, { targetSpeechSeconds: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Max Speech (s)</label>
                          <input
                            type="number"
                            min="1"
                            step="0.1"
                            className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm outline-none focus:border-primary/40 transition-all text-foreground"
                            value={config.maxSpeechSeconds}
                            onChange={(e) => updateTtsProviderConfig(providerId, { maxSpeechSeconds: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          )}

          {/* 5. Runtime Configuration */}
          {activeSection === 'runtime' && (
          <div className="bg-card border border-border rounded-[5px] shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 bg-[hsl(var(--secondary))]/60">
              <div className="p-2 bg-amber-100 dark:bg-amber-500/10 rounded-[5px] text-amber-600 dark:text-amber-400">
                <SettingsIcon size={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-white">Runtime Memory</h2>
                <p className="text-xs text-muted-foreground">Global memory behavior for model unload.</p>
              </div>
            </div>

            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Idle Unload (ms)</label>
                <input
                  type="number"
                  min="0"
                  className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] px-3 text-sm outline-none focus:border-primary/40 transition-all text-foreground"
                  value={idleUnloadMs}
                  onChange={(e) => setIdleUnloadMs(e.target.value)}
                />
              </div>

              <div className="rounded-[5px] border border-border/70 p-4 text-xs text-muted-foreground leading-relaxed">
                <p>
                  Defines how long the worker stays idle before unloading generation models from memory.
                </p>
                <p className="mt-2">
                  This setting is global: it applies to project-selected image, video, and TTS routes when the provider supports unload.
                </p>
                <p className="mt-2">
                  Use <strong>0</strong> to disable idle-based unload.
                </p>
                <p className="mt-2">
                  Quick conversion: <strong>1000 ms = 1 s</strong>.
                </p>
                <p className="mt-1">
                  Examples: 60000 ms = 60 s (1 min), 300000 ms = 300 s (5 min), 600000 ms = 600 s (10 min), 1200000 ms = 1200 s (20 min), 1800000 ms = 1800 s (30 min).
                </p>
              </div>
            </div>
          </div>
          )}

          </div>
        </div>
      </div>
      <ConfirmDialog
        open={isOverwriteWorkflowConfirmOpen}
        title="Sobrescrever workflow?"
        description={`Ja existe um workflow com o nome "${overwriteWorkflowTargetName}". Deseja substituir esse arquivo?`}
        confirmLabel="Sobrescrever"
        cancelLabel="Cancelar"
        confirmClassName="bg-red-600 hover:bg-red-700 text-white"
        onCancel={handleCancelOverwriteWorkflow}
        onConfirm={handleConfirmOverwriteWorkflow}
      />
    </div>
  );
};

export default Settings;
