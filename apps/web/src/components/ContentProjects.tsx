import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpDown,
  Eye,
  Filter,
  Film,
  FolderKanban,
  Image,
  LayoutGrid,
  List,
  ListChecks,
  Mic,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Video,
  type LucideIcon
} from 'lucide-react';
import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api';
import {
  DEFAULT_PROJECT_DESTINATIONS,
  formatDestination,
  type Destination
} from '../lib/contentDestinations';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import ConfirmDialog from './ui/confirm-dialog';
import CompositionPreview, {
  type CompositionAspectRatio,
  type NarrativeRole,
  type StudioCompositionTimeline
} from './composition/CompositionPreview';

type Screen = 'list' | 'create' | 'detail' | 'studio';
type ProjectViewMode = 'grid' | 'list';
type ProjectStatusFilter = 'all' | 'draft' | 'active' | 'archived';
type ProjectSortKey = 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'content-desc' | 'content-asc';
type AspectRatio = CompositionAspectRatio;
type MediaType = 'image' | 'video';
type StudioChannelFilter = 'all' | string;
type ProductionStage = 'idea' | 'script' | 'scenes' | 'assets' | 'editing' | 'ready' | 'scheduled' | 'published';
type OutputStatus =
  | 'not_started'
  | 'queued'
  | 'in_progress'
  | 'ready_for_review'
  | 'approved'
  | 'rendered'
  | 'published'
  | 'failed';

type ProjectOutput = {
  id: string;
  channel: string;
  label: string;
  mediaType?: MediaType;
  destination: Destination;
  aspectRatio: AspectRatio;
};

type ProjectTtsConfig = {
  providerId?: string;
  provider?: string;
  language?: string;
  voiceId?: string | null;
  targetChars?: number | null;
  maxChars?: number | null;
  targetSpeechSeconds?: number | null;
  maxSpeechSeconds?: number | null;
};

type ProjectVisualModelConfig = {
  providerId?: string;
  provider?: string;
  providerLabel?: string;
  modelId?: string;
  modelLabel?: string;
  kind?: 'text_to_image' | 'image_to_image' | 'text_to_video' | 'image_to_video';
  acceptedAspectRatios?: string[] | null;
  acceptedDurationsSeconds?: number[] | null;
  maxNativeSpeechSeconds?: number | null;
  supportsNativeAudio?: boolean;
  supportsPromptEnhancement?: boolean;
  costTier?: string | null;
};

type ProjectPipelineScriptMode = 'none' | 'scene_blocks' | 'music_storyboard';
type ProjectPipelineAudioMode = 'none' | 'tts' | 'music' | 'video_native_audio';
type ProjectPipelineImageMode = 'none' | 'generate';
type ProjectPipelineVideoMode = 'none' | 'editor_motion' | 'text_to_video' | 'image_to_video' | 'looped_clips';
type ProjectPipelineRenderOutputMode = 'images_only' | 'single_video' | 'clips';

type ProjectPipelineConfig = {
  version?: 1;
  script?: { mode?: ProjectPipelineScriptMode };
  audio?: { mode?: ProjectPipelineAudioMode; tts?: ProjectTtsConfig | null };
  image?: { mode?: ProjectPipelineImageMode; model?: ProjectVisualModelConfig | null };
  video?: { mode?: ProjectPipelineVideoMode; model?: ProjectVisualModelConfig | null };
  render?: { outputMode?: ProjectPipelineRenderOutputMode };
};

type Project = {
  id: string;
  name: string;
  description?: string | null;
  language?: string | null;
  status: string;
  itemsCount: number;
  createdAt: string;
  updatedAt?: string;
  metadata?: {
    defaultDestinations?: Destination[];
    defaultAspectRatios?: AspectRatio[];
    defaultOutputs?: ProjectOutput[];
    pipeline?: ProjectPipelineConfig;
    coverImageUrl?: string;
  } | null;
};

type AppTtsProviderSettings = {
  provider?: string;
  displayName?: string;
  defaultVoiceId?: string | null;
  targetChars?: number;
  maxChars?: number;
  targetSpeechSeconds?: number;
  maxSpeechSeconds?: number;
};

type AppTtsLanguageRouteSettings = {
  providerId?: string;
  voiceId?: string | null;
  targetChars?: number;
  maxChars?: number;
  targetSpeechSeconds?: number;
  maxSpeechSeconds?: number;
};

type TtsRouteOption = {
  key: string;
  providerId: string;
  provider?: string;
  providerLabel: string;
  language: string;
  voiceId?: string | null;
  targetChars?: number | null;
  maxChars?: number | null;
  targetSpeechSeconds?: number | null;
  maxSpeechSeconds?: number | null;
};

type AppVisualProviderSettings = {
  provider?: string;
  displayName?: string;
  models?: Record<string, AppVisualModelSettings | undefined>;
};

type AppVisualModelSettings = {
  displayName?: string;
  kind?: 'text_to_image' | 'image_to_image' | 'text_to_video' | 'image_to_video';
  acceptedAspectRatios?: string[];
  acceptedDurationsSeconds?: number[];
  maxNativeSpeechSeconds?: number;
  supportsNativeAudio?: boolean;
  supportsPromptEnhancement?: boolean;
  costTier?: string;
};

type VisualModelOption = {
  key: string;
  providerId: string;
  provider?: string;
  providerLabel: string;
  modelId: string;
  modelLabel: string;
  kind: 'text_to_image' | 'image_to_image' | 'text_to_video' | 'image_to_video';
  acceptedAspectRatios?: string[];
  acceptedDurationsSeconds?: number[];
  maxNativeSpeechSeconds?: number | null;
  supportsNativeAudio?: boolean;
  supportsPromptEnhancement?: boolean;
  costTier?: string;
};

type ContentItem = {
  id: string;
  kind: string;
  title: string;
  sourceText?: string | null;
  orientation?: string | null;
  status: string;
  projectIds?: string[];
  projectNames?: string[];
  metadata?: {
    backing?: {
      lessonId?: string;
      lessonVersionId?: string;
    };
    destinations?: Destination[];
    aspectRatios?: AspectRatio[];
    productionStage?: ProductionStage;
    plannedPublishAt?: string;
    ownerName?: string;
    thumbnailUrl?: string;
  } | null;
};

type ShortLink = {
  id: string;
  code: string;
  url: string;
  status: string;
};

type PromotionTarget = {
  id: string;
  projectId: string;
  name: string;
  description?: string | null;
  destinationUrl: string;
  ctaLabel?: string | null;
  status: string;
  shortLinks: ShortLink[];
};

type ProjectContentOutput = {
  id: string;
  workspaceId: string;
  projectId: string;
  projectItemId: string;
  itemId: string;
  outputDefinitionId: string;
  title: string;
  mediaType: string;
  channel: string;
  destination: string;
  aspectRatio: AspectRatio;
  presetId: string;
  currentStage?: string | null;
  targetDurationS?: number | null;
  status: string;
  narrativeUnitsCount: number;
  composition?: OutputComposition | null;
};

type NarrativeUnit = {
  id: string;
  projectContentOutputId: string;
  order: number;
  role: NarrativeRole;
  sourceText: string;
  narrationText?: string | null;
  title?: string | null;
  durationEstimateS?: number | null;
  visualIntent?: {
    visualStyle?: string;
    assetPreference?: string;
    emphasis?: string;
    motionHint?: string;
  } | null;
}

type OutputComposition = {
  id: string;
  projectContentOutputId: string;
  fps: number;
  width: number;
  height: number;
  durationFrames: number;
  status: string;
  timeline: StudioCompositionTimeline | null;
};

type ContentProjectsProps = {
  initialProjectId?: string | null;
  onInitialProjectConsumed?: () => void;
  onOpenEditor?: (payload: { editorEntityId: string; title: string }) => void;
};

const STAGES: Array<{ value: ProductionStage; label: string }> = [
  { value: 'idea', label: 'Idea' },
  { value: 'script', label: 'Script' },
  { value: 'scenes', label: 'Scenes' },
  { value: 'assets', label: 'Assets' },
  { value: 'editing', label: 'Editing' },
  { value: 'ready', label: 'Ready' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'published', label: 'Published' }
];

const PIPELINE_SCRIPT_MODE_OPTIONS: Array<{ value: ProjectPipelineScriptMode; label: string; hint: string }> = [
  { value: 'scene_blocks', label: 'Scene blocks', hint: 'Roteiro dividido em cenas para fala, imagem ou vídeo.' },
  { value: 'music_storyboard', label: 'Music storyboard', hint: 'Roteiro visual guiado por música, álbum ou playlist.' },
  { value: 'none', label: 'No script', hint: 'Projeto sem roteiro textual estruturado.' }
];

const PIPELINE_AUDIO_MODE_OPTIONS: Array<{ value: ProjectPipelineAudioMode; label: string; hint: string }> = [
  { value: 'tts', label: 'TTS narration', hint: 'Converte blocos do roteiro em fala externa.' },
  { value: 'music', label: 'Music / external audio', hint: 'Áudio principal vem de faixas ou mix externo.' },
  { value: 'video_native_audio', label: 'Video native audio', hint: 'Fala ou áudio vem do provider de vídeo.' },
  { value: 'none', label: 'No generated audio', hint: 'Fluxo visual sem fala ou áudio gerado.' }
];

const PIPELINE_VIDEO_MODE_OPTIONS: Array<{ value: ProjectPipelineVideoMode; label: string; hint: string }> = [
  { value: 'none', label: 'No video generation', hint: 'Não gera vídeo por IA nem movimento automatizado.' },
  { value: 'editor_motion', label: 'Editor motion', hint: 'Usa imagem com pan, zoom, loop e montagem automatizada.' },
  { value: 'text_to_video', label: 'Text to video', hint: 'Gera vídeo diretamente do texto/prompt.' },
  { value: 'image_to_video', label: 'Image to video', hint: 'Gera imagem base e anima com prompt de vídeo.' },
  { value: 'looped_clips', label: 'Looped clips', hint: 'Gera poucos clipes curtos e repete para cobrir a duração final.' }
];

const PIPELINE_RENDER_OUTPUT_OPTIONS: Array<{ value: ProjectPipelineRenderOutputMode; label: string; hint: string }> = [
  { value: 'single_video', label: 'Single video', hint: 'Produto final renderizado como um vídeo único.' },
  { value: 'clips', label: 'Clips', hint: 'Produto final dividido em clipes reutilizáveis.' },
  { value: 'images_only', label: 'Images only', hint: 'Produto final composto apenas por imagens.' }
];

const PIPELINE_AUDIO_LABELS: Record<ProjectPipelineAudioMode, string> = {
  none: 'No audio',
  tts: 'TTS',
  music: 'Music',
  video_native_audio: 'Native audio'
};

const PIPELINE_VIDEO_LABELS: Record<ProjectPipelineVideoMode, string> = {
  none: 'No video IA',
  editor_motion: 'Editor motion',
  text_to_video: 'Text to video',
  image_to_video: 'Image to video',
  looped_clips: 'Looped clips'
};

const DEFAULT_PROJECT_ASPECT_RATIOS: AspectRatio[] = ['16:9', '9:16'];

const PROJECT_STATUS_FILTERS: Array<{ value: ProjectStatusFilter; label: string }> = [
  { value: 'all', label: 'All projects' },
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' }
];

const PROJECT_SORT_OPTIONS: Array<{ value: ProjectSortKey; label: string }> = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name-asc', label: 'Name A-Z' },
  { value: 'name-desc', label: 'Name Z-A' },
  { value: 'content-desc', label: 'Most content' },
  { value: 'content-asc', label: 'Least content' }
];

const STAGE_TONE_CLASSES: Record<ProductionStage, string> = {
  idea: 'border-sky-500/20 bg-sky-500/10 text-sky-300',
  script: 'border-indigo-500/20 bg-indigo-500/10 text-indigo-300',
  scenes: 'border-orange-500/25 bg-orange-500/10 text-orange-300',
  assets: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
  editing: 'border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-300',
  ready: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
  scheduled: 'border-cyan-500/25 bg-cyan-500/10 text-cyan-300',
  published: 'border-green-500/25 bg-green-500/10 text-green-300'
};

const OUTPUT_STATUS_COLUMNS: Array<{ value: OutputStatus; label: string }> = [
  { value: 'not_started', label: 'Not started' },
  { value: 'queued', label: 'Queued' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'ready_for_review', label: 'Ready for review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rendered', label: 'Rendered' },
  { value: 'published', label: 'Published' },
  { value: 'failed', label: 'Failed' }
];

type OutputFormat = ProjectOutput & {
  mediaType: MediaType;
  hint: string;
};

type OutputChannel = {
  id: string;
  label: string;
  hint: string;
  formats: OutputFormat[];
};

const OUTPUT_CHANNELS: OutputChannel[] = [
  {
    id: 'youtube',
    label: 'YouTube',
    hint: 'Video only for now',
    formats: [
      {
        id: 'youtube-video-16-9',
        channel: 'YouTube',
        label: 'Long video',
        mediaType: 'video',
        hint: '16:9 landscape',
        destination: 'youtube',
        aspectRatio: '16:9'
      },
      {
        id: 'youtube-video-9-16',
        channel: 'YouTube',
        label: 'Shorts',
        mediaType: 'video',
        hint: '9:16 vertical',
        destination: 'youtube_shorts',
        aspectRatio: '9:16'
      }
    ]
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    hint: 'Vertical video',
    formats: [
      {
        id: 'tiktok-video-9-16',
        channel: 'TikTok',
        label: 'TikTok video',
        mediaType: 'video',
        hint: '9:16 vertical',
        destination: 'tiktok',
        aspectRatio: '9:16'
      }
    ]
  },
  {
    id: 'instagram',
    label: 'Instagram',
    hint: 'Feed and reels',
    formats: [
      {
        id: 'instagram-image-1-1',
        channel: 'Instagram',
        label: 'Feed image',
        mediaType: 'image',
        hint: '1:1 square',
        destination: 'instagram_feed',
        aspectRatio: '1:1'
      },
      {
        id: 'instagram-image-4-5',
        channel: 'Instagram',
        label: 'Feed image',
        mediaType: 'image',
        hint: '4:5 portrait',
        destination: 'instagram_feed',
        aspectRatio: '4:5'
      },
      {
        id: 'instagram-video-9-16',
        channel: 'Instagram',
        label: 'Reels',
        mediaType: 'video',
        hint: '9:16 vertical',
        destination: 'instagram_reels',
        aspectRatio: '9:16'
      },
      {
        id: 'instagram-video-1-1',
        channel: 'Instagram',
        label: 'Feed video',
        mediaType: 'video',
        hint: '1:1 square',
        destination: 'instagram_feed',
        aspectRatio: '1:1'
      },
      {
        id: 'instagram-video-4-5',
        channel: 'Instagram',
        label: 'Feed video',
        mediaType: 'video',
        hint: '4:5 portrait',
        destination: 'instagram_feed',
        aspectRatio: '4:5'
      }
    ]
  },
  {
    id: 'facebook',
    label: 'Facebook',
    hint: 'Feed images and videos',
    formats: [
      {
        id: 'facebook-image-16-9',
        channel: 'Facebook',
        label: 'Feed image',
        mediaType: 'image',
        hint: '16:9 landscape',
        destination: 'facebook_feed',
        aspectRatio: '16:9'
      },
      {
        id: 'facebook-image-4-3',
        channel: 'Facebook',
        label: 'Feed image',
        mediaType: 'image',
        hint: '4:3 landscape',
        destination: 'facebook_feed',
        aspectRatio: '4:3'
      },
      {
        id: 'facebook-image-1-1',
        channel: 'Facebook',
        label: 'Feed image',
        mediaType: 'image',
        hint: '1:1 square',
        destination: 'facebook_feed',
        aspectRatio: '1:1'
      },
      {
        id: 'facebook-image-3-4',
        channel: 'Facebook',
        label: 'Feed image',
        mediaType: 'image',
        hint: '3:4 portrait',
        destination: 'facebook_feed',
        aspectRatio: '3:4'
      },
      {
        id: 'facebook-image-9-16',
        channel: 'Facebook',
        label: 'Feed image',
        mediaType: 'image',
        hint: '9:16 vertical',
        destination: 'facebook_feed',
        aspectRatio: '9:16'
      },
      {
        id: 'facebook-video-16-9',
        channel: 'Facebook',
        label: 'Video post',
        mediaType: 'video',
        hint: '16:9 landscape',
        destination: 'facebook_video',
        aspectRatio: '16:9'
      },
      {
        id: 'facebook-video-1-1',
        channel: 'Facebook',
        label: 'Feed video',
        mediaType: 'video',
        hint: '1:1 square',
        destination: 'facebook_video',
        aspectRatio: '1:1'
      },
      {
        id: 'facebook-video-9-16',
        channel: 'Facebook',
        label: 'Vertical video',
        mediaType: 'video',
        hint: '9:16 reels/story',
        destination: 'facebook_video',
        aspectRatio: '9:16'
      }
    ]
  },
  {
    id: 'course',
    label: 'Course',
    hint: 'Lesson video',
    formats: [
      {
        id: 'course-video-16-9',
        channel: 'Course',
        label: 'Lesson video',
        mediaType: 'video',
        hint: '16:9 landscape',
        destination: 'course',
        aspectRatio: '16:9'
      }
    ]
  }
];

const OUTPUT_FORMATS = OUTPUT_CHANNELS.flatMap((channel) => channel.formats);
const DEFAULT_PROJECT_OUTPUT_IDS = OUTPUT_FORMATS.filter(
  (format) =>
    DEFAULT_PROJECT_DESTINATIONS.includes(format.destination) &&
    DEFAULT_PROJECT_ASPECT_RATIOS.includes(format.aspectRatio)
).map((format) => format.id);

const MEDIA_GROUPS: Array<{ value: MediaType; label: string; Icon: LucideIcon }> = [
  { value: 'image', label: 'Image', Icon: Image },
  { value: 'video', label: 'Video', Icon: Video }
];

const ASPECT_RATIO_DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  '16:9': { width: 25, height: 14 },
  '4:3': { width: 22, height: 16 },
  '1:1': { width: 18, height: 18 },
  '4:5': { width: 16, height: 20 },
  '3:4': { width: 15, height: 20 },
  '9:16': { width: 14, height: 25 }
};

function asArray<T extends string>(value: unknown): T[] {
  return Array.isArray(value) ? value.filter((item): item is T => typeof item === 'string') : [];
}

function uniqueValues<T extends string>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function makeTtsRouteKey(providerId: string, language: string): string {
  return `${providerId}::${language}`;
}

function getProjectTtsRouteKey(project: Project): string {
  const providerId = project.metadata?.pipeline?.audio?.tts?.providerId;
  const language = project.metadata?.pipeline?.audio?.tts?.language ?? project.language;
  return providerId && language ? makeTtsRouteKey(providerId, language) : '';
}

function formatTtsRouteOption(option: TtsRouteOption): string {
  return `${option.providerLabel} - ${option.language}`;
}

function buildProjectTtsConfig(option: TtsRouteOption): ProjectTtsConfig {
  return {
    providerId: option.providerId,
    provider: option.provider,
    language: option.language,
    voiceId: option.voiceId ?? null,
    targetChars: option.targetChars ?? null,
    maxChars: option.maxChars ?? null,
    targetSpeechSeconds: option.targetSpeechSeconds ?? null,
    maxSpeechSeconds: option.maxSpeechSeconds ?? null
  };
}

function makeVisualModelKey(providerId: string, modelId: string): string {
  return `${providerId}::${modelId}`;
}

function getProjectVisualModelKey(project: Project, kind: 'image' | 'video'): string {
  const config = kind === 'image' ? project.metadata?.pipeline?.image?.model : project.metadata?.pipeline?.video?.model;
  return config?.providerId && config?.modelId ? makeVisualModelKey(config.providerId, config.modelId) : '';
}

function formatVisualModelOption(option: VisualModelOption): string {
  return `${option.providerLabel} - ${option.modelLabel}`;
}

function buildProjectVisualModelConfig(option: VisualModelOption): ProjectVisualModelConfig {
  return {
    providerId: option.providerId,
    provider: option.provider,
    providerLabel: option.providerLabel,
    modelId: option.modelId,
    modelLabel: option.modelLabel,
    kind: option.kind,
    acceptedAspectRatios: option.acceptedAspectRatios ?? null,
    acceptedDurationsSeconds: option.acceptedDurationsSeconds ?? null,
    maxNativeSpeechSeconds: option.maxNativeSpeechSeconds ?? null,
    supportsNativeAudio: option.supportsNativeAudio ?? false,
    supportsPromptEnhancement: option.supportsPromptEnhancement ?? false,
    costTier: option.costTier ?? null
  };
}

function getProjectPipelineConfig(project: Project): Required<ProjectPipelineConfig> {
  const pipeline = project.metadata?.pipeline;
  return {
    version: 1,
    script: { mode: pipeline?.script?.mode ?? 'scene_blocks' },
    audio: {
      mode: pipeline?.audio?.mode ?? 'none',
      tts: pipeline?.audio?.tts ?? null
    },
    image: {
      mode: pipeline?.image?.mode ?? (pipeline?.image?.model ? 'generate' : 'none'),
      model: pipeline?.image?.model ?? null
    },
    video: {
      mode: pipeline?.video?.mode ?? 'none',
      model: pipeline?.video?.model ?? null
    },
    render: { outputMode: pipeline?.render?.outputMode ?? 'single_video' }
  };
}

function buildProjectPipelineConfig(options: {
  scriptMode: ProjectPipelineScriptMode;
  audioMode: ProjectPipelineAudioMode;
  ttsRoute?: TtsRouteOption | null;
  imageMode: ProjectPipelineImageMode;
  imageModel?: VisualModelOption | null;
  videoMode: ProjectPipelineVideoMode;
  videoModel?: VisualModelOption | null;
  renderOutputMode: ProjectPipelineRenderOutputMode;
}): Required<ProjectPipelineConfig> {
  return {
    version: 1,
    script: { mode: options.scriptMode },
    audio:
      options.audioMode === 'tts' && options.ttsRoute
        ? { mode: options.audioMode, tts: buildProjectTtsConfig(options.ttsRoute) }
        : { mode: options.audioMode },
    image:
      options.imageMode === 'generate' && options.imageModel
        ? { mode: options.imageMode, model: buildProjectVisualModelConfig(options.imageModel) }
        : { mode: 'none' },
    video:
      isVideoProviderMode(options.videoMode) && options.videoModel
        ? { mode: options.videoMode, model: buildProjectVisualModelConfig(options.videoModel) }
        : { mode: options.videoMode },
    render: { outputMode: options.renderOutputMode }
  };
}

function isVideoProviderMode(mode: ProjectPipelineVideoMode): boolean {
  return mode === 'text_to_video' || mode === 'image_to_video' || mode === 'looped_clips';
}

function isImageRequiredByPipeline(
  videoMode: ProjectPipelineVideoMode,
  renderOutputMode: ProjectPipelineRenderOutputMode,
  videoModel?: VisualModelOption | null
): boolean {
  return (
    videoMode === 'editor_motion' ||
    videoMode === 'image_to_video' ||
    renderOutputMode === 'images_only' ||
    (videoMode === 'looped_clips' && videoModel?.kind === 'image_to_video')
  );
}

function getOutputFormatsByIds(outputIds: string[]): OutputFormat[] {
  const selectedIds = new Set(outputIds);
  return OUTPUT_FORMATS.filter((format) => selectedIds.has(format.id));
}

function toProjectOutput(format: OutputFormat): ProjectOutput {
  return {
    id: format.id,
    channel: format.channel,
    label: format.label,
    mediaType: format.mediaType,
    destination: format.destination,
    aspectRatio: format.aspectRatio
  };
}

function getProjectOutputs(project: Project): ProjectOutput[] {
  const saved = project.metadata?.defaultOutputs;
  if (Array.isArray(saved) && saved.length > 0) return saved;
  const destinations = getProjectDestinations(project);
  const aspectRatios = getProjectAspectRatios(project);
  return OUTPUT_FORMATS.filter(
    (format) => destinations.includes(format.destination) && aspectRatios.includes(format.aspectRatio)
  ).map(toProjectOutput);
}

function formatProjectOutput(output: ProjectOutput): string {
  const mediaLabel = output.mediaType ? output.mediaType[0].toUpperCase() + output.mediaType.slice(1) : output.label;
  return `${output.channel}: ${mediaLabel} ${output.aspectRatio}`;
}

function getProjectChannelLabels(project: Project): string[] {
  return uniqueValues(getProjectOutputs(project).map((output) => output.channel));
}

function getProjectOutputIds(project: Project): string[] {
  const formatIds = new Set(OUTPUT_FORMATS.map((format) => format.id));
  const savedIds = getProjectOutputs(project)
    .map((output) => output.id)
    .filter((id) => formatIds.has(id));
  return savedIds.length > 0 ? uniqueValues(savedIds) : DEFAULT_PROJECT_OUTPUT_IDS;
}

function getProjectTimestamp(project: Project): number {
  const raw = project.updatedAt ?? project.createdAt;
  const value = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(value) ? value : 0;
}

function formatProjectStatusLabel(status?: string | null): string {
  if (!status) return 'Draft';
  return status.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function AspectRatioGlyph({ aspectRatio, selected }: { aspectRatio: AspectRatio; selected: boolean }) {
  const dimensions = ASPECT_RATIO_DIMENSIONS[aspectRatio];
  return (
    <span className="flex h-7 w-9 items-center justify-center">
      <span
        className={`rounded-[2px] border-2 transition-colors ${
          selected ? 'border-primary bg-primary/20' : 'border-muted-foreground/80'
        }`}
        style={{ width: dimensions.width, height: dimensions.height }}
      />
    </span>
  );
}

function getItemStage(item: ContentItem): ProductionStage {
  const stage = item.metadata?.productionStage;
  if (stage && STAGES.some((itemStage) => itemStage.value === stage)) return stage;
  if (STAGES.some((itemStage) => itemStage.value === item.status)) return item.status as ProductionStage;
  return item.sourceText?.trim() ? 'script' : 'idea';
}

function getItemAspectRatios(item: ContentItem): AspectRatio[] {
  const saved = asArray<AspectRatio>(item.metadata?.aspectRatios);
  if (saved.length > 0) return saved;
  if (item.orientation === 'vertical') return ['9:16'];
  if (item.orientation === 'square') return ['1:1'];
  return ['16:9'];
}

function getProjectDestinations(project: Project): Destination[] {
  const saved = asArray<Destination>(project.metadata?.defaultDestinations);
  return saved.length > 0 ? saved : DEFAULT_PROJECT_DESTINATIONS;
}

function getProjectAspectRatios(project: Project): AspectRatio[] {
  const saved = asArray<AspectRatio>(project.metadata?.defaultAspectRatios);
  return saved.length > 0 ? saved : DEFAULT_PROJECT_ASPECT_RATIOS;
}

function normalizeOutputStatus(value: string | null | undefined): OutputStatus {
  return OUTPUT_STATUS_COLUMNS.some((column) => column.value === value) ? (value as OutputStatus) : 'not_started';
}

export default function ContentProjects({
  initialProjectId,
  onInitialProjectConsumed,
  onOpenEditor
}: ContentProjectsProps) {
  const [screen, setScreen] = useState<Screen>('list');
  const [projectViewMode, setProjectViewMode] = useState<ProjectViewMode>('grid');
  const [projectStatusFilter, setProjectStatusFilter] = useState<ProjectStatusFilter>('all');
  const [projectSort, setProjectSort] = useState<ProjectSortKey>('newest');
  const [isProjectFilterMenuOpen, setIsProjectFilterMenuOpen] = useState(false);
  const [isProjectSortMenuOpen, setIsProjectSortMenuOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [libraryItems, setLibraryItems] = useState<ContentItem[]>([]);
  const [promotionTargets, setPromotionTargets] = useState<PromotionTarget[]>([]);
  const [outputsByItem, setOutputsByItem] = useState<Record<string, ProjectContentOutput[]>>({});
  const [selectedStudioItemId, setSelectedStudioItemId] = useState<string | null>(null);
  const [selectedOutputId, setSelectedOutputId] = useState<string | null>(null);
  const [studioChannelFilter, setStudioChannelFilter] = useState<StudioChannelFilter>('all');
  const [narrativeUnits, setNarrativeUnits] = useState<NarrativeUnit[]>([]);
  const [activeComposition, setActiveComposition] = useState<OutputComposition | null>(null);
  const [isLinkExistingOpen, setIsLinkExistingOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('Novo projeto');
  const [projectDescription, setProjectDescription] = useState('');
  const [projectCoverImageUrl, setProjectCoverImageUrl] = useState('');
  const [selectedOutputIds, setSelectedOutputIds] = useState<string[]>(DEFAULT_PROJECT_OUTPUT_IDS);
  const [ttsRouteOptions, setTtsRouteOptions] = useState<TtsRouteOption[]>([]);
  const [imageModelOptions, setImageModelOptions] = useState<VisualModelOption[]>([]);
  const [videoModelOptions, setVideoModelOptions] = useState<VisualModelOption[]>([]);
  const [pipelineScriptMode, setPipelineScriptMode] = useState<ProjectPipelineScriptMode>('scene_blocks');
  const [pipelineAudioMode, setPipelineAudioMode] = useState<ProjectPipelineAudioMode>('tts');
  const [pipelineImageMode, setPipelineImageMode] = useState<ProjectPipelineImageMode>('generate');
  const [pipelineVideoMode, setPipelineVideoMode] = useState<ProjectPipelineVideoMode>('none');
  const [pipelineRenderOutputMode, setPipelineRenderOutputMode] = useState<ProjectPipelineRenderOutputMode>('single_video');
  const [selectedTtsRouteKey, setSelectedTtsRouteKey] = useState('');
  const [selectedImageModelKey, setSelectedImageModelKey] = useState('');
  const [selectedVideoModelKey, setSelectedVideoModelKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const projectFilterMenuRef = useRef<HTMLDivElement | null>(null);
  const projectSortMenuRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const detailScrollTopRef = useRef(0);
  const shouldRestoreDetailScrollRef = useRef(false);
  const editorInitInFlightRef = useRef<Set<string>>(new Set());

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const selectedStudioItem = useMemo(
    () => items.find((item) => item.id === selectedStudioItemId) ?? null,
    [items, selectedStudioItemId]
  );

  const selectedProjectContentOutputs = useMemo(
    () => (selectedStudioItemId ? outputsByItem[selectedStudioItemId] ?? [] : []),
    [selectedStudioItemId, outputsByItem]
  );

  const selectedProjectContentOutput = useMemo(
    () => selectedProjectContentOutputs.find((output) => output.id === selectedOutputId) ?? null,
    [selectedOutputId, selectedProjectContentOutputs]
  );

  const linkableLibraryItems = useMemo(() => {
    if (!selectedProjectId) return [];
    const associatedIds = new Set(items.map((item) => item.id));
    return libraryItems.filter((item) => !associatedIds.has(item.id));
  }, [items, libraryItems, selectedProjectId]);

  const editingProject = useMemo(
    () => projects.find((project) => project.id === editingProjectId) ?? null,
    [editingProjectId, projects]
  );

  const selectedOutputFormats = useMemo(
    () => getOutputFormatsByIds(selectedOutputIds),
    [selectedOutputIds]
  );

  const selectedTtsRoute = useMemo(
    () => ttsRouteOptions.find((option) => option.key === selectedTtsRouteKey) ?? null,
    [selectedTtsRouteKey, ttsRouteOptions]
  );

  const selectedImageModel = useMemo(
    () => imageModelOptions.find((option) => option.key === selectedImageModelKey) ?? null,
    [imageModelOptions, selectedImageModelKey]
  );

  const selectedVideoModel = useMemo(
    () => videoModelOptions.find((option) => option.key === selectedVideoModelKey) ?? null,
    [selectedVideoModelKey, videoModelOptions]
  );

  const pipelineUsesTts = pipelineAudioMode === 'tts';
  const pipelineImageRequired = isImageRequiredByPipeline(pipelineVideoMode, pipelineRenderOutputMode, selectedVideoModel);
  const pipelineNeedsImageModel = pipelineImageRequired || pipelineImageMode === 'generate';
  const pipelineNeedsVideoModel = isVideoProviderMode(pipelineVideoMode) || pipelineAudioMode === 'video_native_audio';
  const pipelineReady =
    (!pipelineUsesTts || Boolean(selectedTtsRoute)) &&
    (!pipelineNeedsImageModel || Boolean(selectedImageModel)) &&
    (!pipelineNeedsVideoModel || Boolean(selectedVideoModel));

  const selectedChannelCount = useMemo(
    () => new Set(selectedOutputFormats.map((format) => format.channel)).size,
    [selectedOutputFormats]
  );

  const selectedProjectOutputs = useMemo(
    () => (selectedProject ? getProjectOutputs(selectedProject) : []),
    [selectedProject]
  );

  const studioFilteredOutputs = useMemo(
    () =>
      studioChannelFilter === 'all'
        ? selectedProjectContentOutputs
        : selectedProjectContentOutputs.filter((output) => output.channel === studioChannelFilter),
    [selectedProjectContentOutputs, studioChannelFilter]
  );

  const selectedOutputColumns = useMemo(
    () =>
      OUTPUT_STATUS_COLUMNS.map((column) => ({
        ...column,
        items: studioFilteredOutputs.filter((output) => normalizeOutputStatus(output.status) === column.value)
      })),
    [studioFilteredOutputs]
  );

  const selectedProjectChannels = useMemo(
    () => uniqueValues(selectedProjectOutputs.map((output) => output.channel)),
    [selectedProjectOutputs]
  );

  const projectRecencyTag = useMemo(() => {
    const now = Date.now();
    const seventyTwoHoursMs = 72 * 60 * 60 * 1000;
    return projects.reduce<Record<string, 'new' | 'updated'>>((acc, project) => {
      const updatedAtMs = getProjectTimestamp(project);
      if (!updatedAtMs) return acc;
      acc[project.id] = now - updatedAtMs <= seventyTwoHoursMs ? 'new' : 'updated';
      return acc;
    }, {});
  }, [projects]);

  const visibleProjects = useMemo(() => {
    const filtered =
      projectStatusFilter === 'all'
        ? [...projects]
        : projects.filter((project) => project.status === projectStatusFilter);

    return filtered.sort((a, b) => {
      if (projectSort === 'oldest') return getProjectTimestamp(a) - getProjectTimestamp(b);
      if (projectSort === 'name-asc') return a.name.localeCompare(b.name);
      if (projectSort === 'name-desc') return b.name.localeCompare(a.name);
      if (projectSort === 'content-desc') return b.itemsCount - a.itemsCount;
      if (projectSort === 'content-asc') return a.itemsCount - b.itemsCount;
      return getProjectTimestamp(b) - getProjectTimestamp(a);
    });
  }, [projectSort, projectStatusFilter, projects]);

  const selectedProjectFilterLabel =
    PROJECT_STATUS_FILTERS.find((option) => option.value === projectStatusFilter)?.label ?? 'All projects';
  const selectedProjectSortLabel =
    PROJECT_SORT_OPTIONS.find((option) => option.value === projectSort)?.label ?? 'Newest first';

  const loadProjects = async () => {
    const data = await apiGet<Project[]>('/content-projects', { cacheMs: 0, dedupe: false });
    setProjects(data);
  };

  const loadLibraryItems = async () => {
    const data = await apiGet<ContentItem[]>('/content-items', { cacheMs: 0, dedupe: false });
    setLibraryItems(data);
    return data;
  };

  const loadGenerationSettings = async () => {
    const data = await apiGet<{
      tts?: {
        providers?: Record<string, AppTtsProviderSettings | undefined>;
        languageRoutes?: Record<string, AppTtsLanguageRouteSettings | undefined>;
      };
      visualGeneration?: {
        providers?: Record<string, AppVisualProviderSettings | undefined>;
      };
    }>('/settings', { cacheMs: 0, dedupe: false });

    const nextTtsRoutes: TtsRouteOption[] = [];
    Object.entries(data.tts?.languageRoutes ?? {}).forEach(([language, route]) => {
      if (!route?.providerId) return;
      const provider = data.tts?.providers?.[route.providerId];
      nextTtsRoutes.push({
        key: makeTtsRouteKey(route.providerId, language),
        providerId: route.providerId,
        provider: provider?.provider,
        providerLabel: provider?.displayName ?? route.providerId,
        language,
        voiceId: route.voiceId ?? provider?.defaultVoiceId ?? null,
        targetChars: route.targetChars ?? provider?.targetChars ?? null,
        maxChars: route.maxChars ?? provider?.maxChars ?? null,
        targetSpeechSeconds: route.targetSpeechSeconds ?? provider?.targetSpeechSeconds ?? null,
        maxSpeechSeconds: route.maxSpeechSeconds ?? provider?.maxSpeechSeconds ?? null
      });
    });

    const nextImageModels: VisualModelOption[] = [];
    const nextVideoModels: VisualModelOption[] = [];
    Object.entries(data.visualGeneration?.providers ?? {}).forEach(([providerId, provider]) => {
      if (!provider) return;
      Object.entries(provider.models ?? {}).forEach(([modelId, model]) => {
        if (!model?.kind) return;
        const option: VisualModelOption = {
          key: makeVisualModelKey(providerId, modelId),
          providerId,
          provider: provider.provider,
          providerLabel: provider.displayName ?? providerId,
          modelId,
          modelLabel: model.displayName ?? modelId,
          kind: model.kind,
          acceptedAspectRatios: model.acceptedAspectRatios,
          acceptedDurationsSeconds: model.acceptedDurationsSeconds,
          maxNativeSpeechSeconds: model.maxNativeSpeechSeconds ?? null,
          supportsNativeAudio: model.supportsNativeAudio,
          supportsPromptEnhancement: model.supportsPromptEnhancement,
          costTier: model.costTier
        };
        if (model.kind === 'text_to_image' || model.kind === 'image_to_image') {
          nextImageModels.push(option);
        } else {
          nextVideoModels.push(option);
        }
      });
    });

    setTtsRouteOptions(nextTtsRoutes);
    setImageModelOptions(nextImageModels);
    setVideoModelOptions(nextVideoModels);
    setSelectedTtsRouteKey((current) => current || nextTtsRoutes[0]?.key || '');
    setSelectedImageModelKey((current) => current || nextImageModels[0]?.key || '');
  };

  const loadItems = async (projectId: string) => {
    const data = await apiGet<ContentItem[]>(`/content-projects/${projectId}/items`, { cacheMs: 0, dedupe: false });
    setItems(data);
  };

  const loadPromotionTargets = async (projectId: string) => {
    const data = await apiGet<PromotionTarget[]>(`/content-projects/${projectId}/promotion-targets`, {
      cacheMs: 0,
      dedupe: false
    });
    setPromotionTargets(data);
  };

  const loadOutputsForItem = async (itemId: string) => {
    if (!selectedProjectId) return [];
    const data = await apiGet<ProjectContentOutput[]>(`/content-projects/${selectedProjectId}/items/${itemId}/outputs`, {
      cacheMs: 0,
      dedupe: false
    });
    setOutputsByItem((current) => ({ ...current, [itemId]: data }));
    if (!selectedOutputId && data[0]?.id) {
      setSelectedOutputId(data[0].id);
    }
    return data;
  };

  const loadNarrativeForOutput = async (outputId: string) => {
    const [units, composition] = await Promise.all([
      apiGet<NarrativeUnit[]>(`/project-content-outputs/${outputId}/narrative-units`, { cacheMs: 0, dedupe: false }),
      apiGet<OutputComposition>(`/project-content-outputs/${outputId}/composition`, { cacheMs: 0, dedupe: false }).catch(() => null)
    ]);
    setNarrativeUnits(units);
    setActiveComposition(composition);
  };

  useEffect(() => {
    loadProjects().catch((err) => setError(err instanceof Error ? err.message : String(err)));
    loadGenerationSettings().catch((err) => setError(err instanceof Error ? err.message : String(err)));
    loadLibraryItems().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    if (!initialProjectId) return;
    const projectExists = projects.some((project) => project.id === initialProjectId);
    if (!projectExists) return;
    setSelectedProjectId(initialProjectId);
      setScreen('detail');
    onInitialProjectConsumed?.();
  }, [initialProjectId, projects, onInitialProjectConsumed]);

  useEffect(() => {
    if (!selectedProjectId) {
      setItems([]);
      setPromotionTargets([]);
      setOutputsByItem({});
      setSelectedStudioItemId(null);
      setSelectedOutputId(null);
      setNarrativeUnits([]);
      setActiveComposition(null);
      return;
    }
    loadItems(selectedProjectId).catch((err) => setError(err instanceof Error ? err.message : String(err)));
    loadPromotionTargets(selectedProjectId).catch((err) => setError(err instanceof Error ? err.message : String(err)));
    loadLibraryItems().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [selectedProjectId]);

  useEffect(() => {
    if (!items.length) {
      setSelectedStudioItemId(null);
      return;
    }
    if (!selectedStudioItemId || !items.some((item) => item.id === selectedStudioItemId)) {
      setSelectedStudioItemId(items[0]?.id ?? null);
    }
  }, [items, selectedStudioItemId]);

  useEffect(() => {
    if (!selectedStudioItemId) {
      setSelectedOutputId(null);
      setStudioChannelFilter('all');
      setNarrativeUnits([]);
      setActiveComposition(null);
      return;
    }
    loadOutputsForItem(selectedStudioItemId).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [selectedProjectId, selectedStudioItemId]);

  useEffect(() => {
    if (!selectedProjectContentOutputs.length) {
      setSelectedOutputId(null);
      setNarrativeUnits([]);
      setActiveComposition(null);
      return;
    }
    if (!selectedOutputId || !selectedProjectContentOutputs.some((output) => output.id === selectedOutputId)) {
      setSelectedOutputId(selectedProjectContentOutputs[0]?.id ?? null);
    }
  }, [selectedOutputId, selectedProjectContentOutputs]);

  useEffect(() => {
    if (!selectedOutputId) {
      setNarrativeUnits([]);
      setActiveComposition(null);
      return;
    }
    loadNarrativeForOutput(selectedOutputId).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [selectedOutputId]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (isProjectFilterMenuOpen) {
        const node = projectFilterMenuRef.current;
        if (node && !node.contains(target)) setIsProjectFilterMenuOpen(false);
      }
      if (isProjectSortMenuOpen) {
        const node = projectSortMenuRef.current;
        if (node && !node.contains(target)) setIsProjectSortMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [isProjectFilterMenuOpen, isProjectSortMenuOpen]);

  useEffect(() => {
    if (screen !== 'studio') return;
    scrollContainerRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [screen, selectedStudioItemId]);

  useEffect(() => {
    if (screen !== 'detail' || !shouldRestoreDetailScrollRef.current) return;
    scrollContainerRef.current?.scrollTo({ top: detailScrollTopRef.current, left: 0, behavior: 'auto' });
    shouldRestoreDetailScrollRef.current = false;
  }, [screen]);

  const openProject = (project: Project) => {
    setStatus('');
    setSelectedProjectId(project.id);
    setScreen('detail');
  };

  const startCreateProject = () => {
    setStatus('');
    setEditingProjectId(null);
    setProjectName('Novo projeto');
    setProjectDescription('');
    setProjectCoverImageUrl('');
    setSelectedOutputIds(DEFAULT_PROJECT_OUTPUT_IDS);
    setPipelineScriptMode('scene_blocks');
    setPipelineAudioMode('tts');
    setPipelineImageMode('generate');
    setPipelineVideoMode('none');
    setPipelineRenderOutputMode('single_video');
    setSelectedTtsRouteKey(ttsRouteOptions[0]?.key ?? '');
    setSelectedImageModelKey(imageModelOptions[0]?.key ?? '');
    setSelectedVideoModelKey('');
    setScreen('create');
  };

  const startEditProject = (project: Project) => {
    setStatus('');
    setEditingProjectId(project.id);
    setProjectName(project.name);
    setProjectDescription(project.description ?? '');
    setProjectCoverImageUrl(typeof project.metadata?.coverImageUrl === 'string' ? project.metadata.coverImageUrl : '');
    setSelectedOutputIds(getProjectOutputIds(project));
    const pipeline = getProjectPipelineConfig(project);
    setPipelineScriptMode(pipeline.script.mode ?? 'scene_blocks');
    setPipelineAudioMode(pipeline.audio.mode ?? 'none');
    setPipelineImageMode(pipeline.image.mode ?? 'none');
    setPipelineVideoMode(pipeline.video.mode ?? 'none');
    setPipelineRenderOutputMode(pipeline.render.outputMode ?? 'single_video');
    setSelectedTtsRouteKey(getProjectTtsRouteKey(project) || ttsRouteOptions[0]?.key || '');
    setSelectedImageModelKey(getProjectVisualModelKey(project, 'image') || imageModelOptions[0]?.key || '');
    setSelectedVideoModelKey(getProjectVisualModelKey(project, 'video'));
    setScreen('create');
  };

  const saveProject = async () => {
    if (!projectName.trim()) return;
    const imageRequired = isImageRequiredByPipeline(pipelineVideoMode, pipelineRenderOutputMode, selectedVideoModel);
    const needsImageModel = imageRequired || pipelineImageMode === 'generate';
    const needsVideoModel = isVideoProviderMode(pipelineVideoMode) || pipelineAudioMode === 'video_native_audio';
    if (pipelineAudioMode === 'tts' && !selectedTtsRoute) {
      setError('Select a TTS route for this project.');
      return;
    }
    if (needsImageModel && !selectedImageModel) {
      setError('Select an image generation model for this project.');
      return;
    }
    if (needsVideoModel && !selectedVideoModel) {
      setError('Select a video generation model for this project.');
      return;
    }
    if (pipelineAudioMode === 'video_native_audio' && (pipelineVideoMode === 'none' || pipelineVideoMode === 'editor_motion')) {
      setError('Native video audio requires a video generation mode.');
      return;
    }
    if (pipelineVideoMode === 'text_to_video' && selectedVideoModel?.kind !== 'text_to_video') {
      setError('Select a text-to-video model for this project video mode.');
      return;
    }
    if (pipelineVideoMode === 'image_to_video' && selectedVideoModel?.kind !== 'image_to_video') {
      setError('Select an image-to-video model for this project video mode.');
      return;
    }
    if (pipelineAudioMode === 'video_native_audio' && selectedVideoModel?.supportsNativeAudio !== true) {
      setError('Select a video model that supports native audio.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const outputFormats = getOutputFormatsByIds(selectedOutputIds);
      const pipeline = buildProjectPipelineConfig({
        scriptMode: pipelineScriptMode,
        audioMode: pipelineAudioMode,
        ttsRoute: selectedTtsRoute,
        imageMode: needsImageModel ? 'generate' : 'none',
        imageModel: selectedImageModel,
        videoMode: pipelineVideoMode,
        videoModel: selectedVideoModel,
        renderOutputMode: pipelineRenderOutputMode
      });
      const payload = {
        name: projectName,
        description: projectDescription,
        language: editingProject?.language ?? 'pt-BR',
        status: editingProject?.status ?? 'draft',
        metadata: {
          defaultDestinations: uniqueValues(outputFormats.map((format) => format.destination)),
          defaultAspectRatios: uniqueValues(outputFormats.map((format) => format.aspectRatio)),
          defaultOutputs: outputFormats.map(toProjectOutput),
          pipeline,
          coverImageUrl: projectCoverImageUrl.trim() || undefined,
          product: 'flowshopy'
        }
      };
      const project = editingProjectId
        ? await apiPatch<Project>(`/content-projects/${editingProjectId}`, payload)
        : await apiPost<Project>('/content-projects', payload);
      setProjects((current) =>
        editingProjectId
          ? current.map((currentProject) => (currentProject.id === project.id ? project : currentProject))
          : [project, ...current]
      );
      setSelectedProjectId(project.id);
      setEditingProjectId(null);
      setStatus(editingProjectId ? 'Project updated.' : 'Project created.');
      setScreen('detail');
      } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save project.');
    } finally {
      setBusy(false);
    }
  };

  const deleteProject = async () => {
    if (!selectedProject || busy) return;
    const projectToDelete = selectedProject;
    setIsDeleteDialogOpen(false);
    setBusy(true);
    setError(null);
    try {
      await apiDelete<{ ok: boolean; detachedItems: number; deletedItems: number; deletedBackingCourses: number }>(
        `/content-projects/${projectToDelete.id}`
      );
      setProjects((current) => current.filter((project) => project.id !== projectToDelete.id));
      setItems([]);
      setSelectedProjectId(null);
        setScreen('list');
      setStatus(`Project deleted: ${projectToDelete.name}. Content remains in the library.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project.');
    } finally {
      setBusy(false);
    }
  };

  const toggleOutputFormat = (formatId: string) => {
    setSelectedOutputIds((current) =>
      current.includes(formatId) ? current.filter((item) => item !== formatId) : [...current, formatId]
    );
  };

  const updateItem = async (item: ContentItem, payload: { status?: string; metadata?: Record<string, unknown> }) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await apiPatch<ContentItem>(`/content-items/${item.id}`, payload);
      setItems((current) => current.map((currentItem) => (currentItem.id === item.id ? updated : currentItem)));
      setStatus('Content updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update content.');
    } finally {
      setBusy(false);
    }
  };

  const moveItemToStage = async (item: ContentItem, stage: ProductionStage) => {
    await updateItem(item, {
      status: stage,
      metadata: { productionStage: stage }
    });
  };

  const linkExistingContentToProject = async (item: ContentItem) => {
    if (!selectedProjectId) return;
    setBusy(true);
    setError(null);
    try {
      const projectIds = Array.from(new Set([...(item.projectIds ?? []), selectedProjectId]));
      const linkedItem = await apiPatch<ContentItem>(`/content-items/${item.id}`, { projectIds });
      await ensureEditorForItem(linkedItem, { silent: true });
      await Promise.all([loadItems(selectedProjectId), loadProjects(), loadLibraryItems()]);
      setStatus(`Content linked: ${item.title}.`);
      if (projectIds.length > 0) {
        setIsLinkExistingOpen(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link content.');
    } finally {
      setBusy(false);
    }
  };

  const generateNarrative = async (output: ProjectContentOutput, item: ContentItem) => {
    setBusy(true);
    setError(null);
    try {
      const response = await apiPost<{
        output: ProjectContentOutput;
        narrativeUnits: NarrativeUnit[];
        composition: OutputComposition | null;
      }>(`/project-content-outputs/${output.id}/narrative/generate`, {});
      setOutputsByItem((current) => ({
        ...current,
        [item.id]: (current[item.id] ?? []).map((currentOutput) =>
          currentOutput.id === output.id ? response.output : currentOutput
        )
      }));
      setNarrativeUnits(response.narrativeUnits);
      setActiveComposition(response.composition);
      setItems((current) =>
        current.map((currentItem) =>
          currentItem.id === item.id
            ? {
                ...currentItem,
                status: 'editing',
                metadata: {
                  ...(currentItem.metadata ?? {}),
                  productionStage: 'editing'
                }
              }
            : currentItem
        )
      );
      setStatus(`Narrative generated for ${output.channel} ${output.aspectRatio}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate narrative.');
    } finally {
      setBusy(false);
    }
  };

  const openStudio = async (item: ContentItem) => {
    detailScrollTopRef.current = scrollContainerRef.current?.scrollTop ?? 0;
    setSelectedStudioItemId(item.id);
    setScreen('studio');
    try {
      const outputs = outputsByItem[item.id] ?? (await loadOutputsForItem(item.id));
      if (outputs[0]?.id) {
        setSelectedOutputId(outputs[0].id);
      } else {
        setSelectedOutputId(null);
        setNarrativeUnits([]);
        setActiveComposition(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open studio.');
    }
  };

  const backToProjectDetail = () => {
    shouldRestoreDetailScrollRef.current = true;
    setScreen('detail');
  };

  const openEditorForItem = (item: ContentItem) => {
    const editorEntityId = item.metadata?.backing?.lessonId;
    if (!editorEntityId || !onOpenEditor) return;
    onOpenEditor({ editorEntityId, title: item.title });
  };

  const ensureEditorForItem = async (item: ContentItem, options?: { openWhenReady?: boolean; silent?: boolean }) => {
    const existingEditorEntityId = item.metadata?.backing?.lessonId;
    if (existingEditorEntityId) {
      if (options?.openWhenReady && onOpenEditor) {
        onOpenEditor({ editorEntityId: existingEditorEntityId, title: item.title });
      }
      return existingEditorEntityId;
    }
    if (editorInitInFlightRef.current.has(item.id)) return null;

    editorInitInFlightRef.current.add(item.id);
    if (!options?.silent) {
      setBusy(true);
      setError(null);
    }
    try {
      const data = await apiGet<{
        itemId: string;
        backing?: {
          lessonId?: string;
          lessonVersionId?: string;
        } | null;
      }>(`/content-items/${item.id}/blocks`, { cacheMs: 0, dedupe: false });
      const editorEntityId = data.backing?.lessonId;
      if (!editorEntityId) {
        throw new Error('Editor session not available for this content.');
      }
      setItems((current) =>
        current.map((currentItem) =>
          currentItem.id === item.id
            ? {
                ...currentItem,
                metadata: {
                  ...(currentItem.metadata ?? {}),
                  backing: {
                    lessonId: data.backing?.lessonId,
                    lessonVersionId: data.backing?.lessonVersionId
                  }
                }
              }
            : currentItem
        )
      );
      if (options?.openWhenReady && onOpenEditor) {
        onOpenEditor({ editorEntityId, title: item.title });
      }
      return editorEntityId;
    } catch (err) {
      if (!options?.silent) {
        setError(err instanceof Error ? err.message : 'Failed to initialize editor.');
      }
      return null;
    } finally {
      editorInitInFlightRef.current.delete(item.id);
      if (!options?.silent) {
        setBusy(false);
      }
    }
  };

  const renderProjectCover = (project: Project, mode: 'grid' | 'list') => {
    const recency = projectRecencyTag[project.id];
    const coverImageUrl = typeof project.metadata?.coverImageUrl === 'string' ? project.metadata.coverImageUrl : '';
    return (
      <div
        className={`relative overflow-hidden bg-slate-100 dark:bg-slate-800 ${
          mode === 'grid' ? 'aspect-video' : 'h-full min-h-[170px]'
        }`}
      >
        {coverImageUrl ? (
          <img src={coverImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(15,23,42,0.08),rgba(249,115,22,0.14))] dark:bg-[linear-gradient(135deg,rgba(148,163,184,0.12),rgba(249,115,22,0.13))]" />
        <div className="absolute left-8 top-8 h-2 w-32 rounded-full bg-slate-400/55 dark:bg-slate-300/50" />
        <div className="absolute left-8 top-14 h-1.5 w-44 rounded-full bg-slate-400/40 dark:bg-slate-300/35" />
        <div className="absolute left-8 top-[4.6rem] h-1.5 w-36 rounded-full bg-slate-400/35 dark:bg-slate-300/30" />
        <div className="absolute right-8 top-0 h-16 w-16 rounded-full bg-slate-500/25 dark:bg-slate-200/20" />
        <div className="absolute left-8 bottom-9 flex h-20 w-20 items-center justify-center rounded-full bg-slate-600/20 dark:bg-slate-200/15">
          <FolderKanban size={32} className="text-white/85 drop-shadow" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

        {recency ? (
          <div
            className={`absolute left-3 top-3 inline-flex items-center justify-center rounded-[5px] px-2.5 py-1 text-center text-[9px] font-black uppercase leading-none tracking-[0.16em] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${
              recency === 'new' ? 'bg-orange-500/80' : 'bg-[#3d2a1f]/80 border border-orange-500/40'
            }`}
          >
            {recency === 'new' ? 'NEW' : 'UPDATED'}
          </div>
        ) : null}
      </div>
    );
  };

  const renderProjectBadges = (project: Project) => {
    const channels = getProjectChannelLabels(project);
    return (
      <div className="flex flex-wrap gap-1">
        {channels.slice(0, 5).map((channel) => (
          <Badge key={channel} variant="secondary" className="text-[10px]">
            {channel}
          </Badge>
        ))}
        {channels.length > 5 && (
          <Badge variant="outline" className="text-[10px]">
            +{channels.length - 5}
          </Badge>
        )}
      </div>
    );
  };

  const renderProjectGridCard = (project: Project) => {
    const projectOutputs = getProjectOutputs(project);
    const channelCount = new Set(projectOutputs.map((output) => output.channel)).size;
    return (
      <Card
        key={project.id}
        className="overflow-hidden transition-all group flex flex-col rounded-[6px] border-border/70 shadow-[0_2px_8px_-4px_rgba(15,23,42,0.18)] hover:-translate-y-0.5 hover:shadow-[0_12px_26px_-14px_rgba(15,23,42,0.36)]"
      >
        <div className="relative cursor-pointer" onClick={() => openProject(project)}>
          {renderProjectCover(project, 'grid')}
          <div className="absolute right-3 top-3 z-30 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                startEditProject(project);
              }}
              className="h-8 w-8 rounded-[5px] bg-white/90 text-slate-600 shadow-sm transition-colors hover:text-primary dark:bg-slate-900/90 dark:text-slate-300"
              aria-label="Edit project"
              title="Edit project"
            >
              <Pencil size={14} className="mx-auto" />
            </button>
          </div>
        </div>

        <div className="p-4 flex-1 cursor-pointer" onClick={() => openProject(project)}>
          <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold uppercase tracking-tight">
            <span className="inline-flex items-center gap-1 text-cyan-500">
              <Eye size={12} strokeWidth={2} />
              {project.itemsCount} content
            </span>
            <span className="text-slate-400">{channelCount} channels</span>
            <span className="text-amber-500">{projectOutputs.length} formats</span>
          </div>

          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-orange-600">
            {project.status || 'draft'}
          </p>

          <h3 className="min-h-[2.5rem] overflow-hidden text-base font-bold leading-tight line-clamp-2 break-words">
            {project.name}
          </h3>

          <div className="mt-3">{renderProjectBadges(project)}</div>

          <div className="mt-3 flex items-center justify-end pt-3 text-[10px] font-bold uppercase tracking-tight text-muted-foreground">
            <span>{project.itemsCount} items</span>
          </div>
        </div>
      </Card>
    );
  };

  const renderProjectListCard = (project: Project) => {
    const projectOutputs = getProjectOutputs(project);
    const channelCount = new Set(projectOutputs.map((output) => output.channel)).size;
    const recency = projectRecencyTag[project.id];
    return (
      <Card key={project.id} className="overflow-hidden border-border rounded-[6px] transition-all hover:shadow-md group">
        <div className="flex flex-col md:flex-row">
          <div
            className="relative md:w-56 lg:w-64 aspect-video md:aspect-auto md:h-auto overflow-hidden cursor-pointer"
            onClick={() => openProject(project)}
          >
            {renderProjectCover(project, 'list')}
            <div className="absolute right-3 top-3 z-30 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  startEditProject(project);
                }}
                className="h-8 w-8 rounded-[5px] bg-white/90 text-slate-600 shadow-sm transition-colors hover:text-primary dark:bg-slate-900/90 dark:text-slate-300"
                aria-label="Edit project"
                title="Edit project"
              >
                <Pencil size={14} className="mx-auto" />
              </button>
            </div>
          </div>

          <div className="flex-1 p-4 md:p-5 cursor-pointer" onClick={() => openProject(project)}>
            <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold uppercase tracking-tight">
              <span className="inline-flex items-center gap-1 text-cyan-500">
                <Eye size={12} strokeWidth={2} />
                {project.itemsCount} content
              </span>
              <span className="text-slate-400">{channelCount} channels</span>
              <span className="text-amber-500">{projectOutputs.length} formats</span>
            </div>

            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-orange-600">
              {project.status || 'draft'}
            </p>

            <h3 className="text-lg font-bold leading-tight mb-2">{project.name}</h3>

            <div className="mt-3">{renderProjectBadges(project)}</div>
          </div>

          <div className="border-t md:border-t-0 md:border-l border-border px-4 py-3 md:w-48 flex md:block items-center justify-between gap-4">
            <div className="text-center md:text-left">
              {recency ? (
                <p className={`text-[10px] font-black uppercase tracking-[0.16em] ${recency === 'new' ? 'text-orange-600' : 'text-muted-foreground'}`}>
                  {recency === 'new' ? 'NEW' : 'UPDATED'}
                </p>
              ) : null}
              <p className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-foreground">
                {(project.status || 'draft').toUpperCase()}
              </p>
              <p className="mt-1 text-sm font-bold text-foreground">{project.itemsCount} items</p>
            </div>
            <div className="flex items-center gap-2 md:mt-3 md:justify-end">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-orange-600"
                onClick={(event) => {
                  event.stopPropagation();
                  startEditProject(project);
                }}
                title="Edit project"
              >
                <Pencil size={16} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-slate-900 dark:hover:text-white"
                onClick={(event) => {
                  event.stopPropagation();
                  openProject(project);
                }}
                title="Open project"
              >
                <MoreHorizontal size={16} />
              </Button>
            </div>
          </div>
        </div>
      </Card>
    );
  };

  const renderContentItem = (item: ContentItem) => (
    <article
      key={item.id}
      className="border border-border rounded-md bg-background p-4 space-y-4 cursor-pointer transition-colors hover:border-orange-500/30"
      onClick={() => openStudio(item)}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{item.title}</h3>
            <Badge variant="outline" className="border-cyan-500/25 bg-cyan-500/10 text-cyan-300">
              Content
            </Badge>
            <Badge variant="secondary" className={STAGE_TONE_CLASSES[getItemStage(item)]}>
              {STAGES.find((stage) => stage.value === getItemStage(item))?.label ?? getItemStage(item)}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{item.sourceText}</p>
        </div>
      </div>
      </article>
    );

  const renderStudio = () => {
    const selectedTarget = promotionTargets[0] ?? null;
    const selectedBacking = selectedStudioItem?.metadata?.backing ?? null;
    const selectedItemHasEditor = Boolean(selectedBacking?.lessonId && onOpenEditor);
    const visibleOutputColumns = OUTPUT_STATUS_COLUMNS.map((column) => ({
      ...column,
      items: selectedOutputColumns.find((candidate) => candidate.value === column.value)?.items ?? []
    }));
    return (
      <div className="space-y-6">
        <section className="space-y-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2">
              <button
                type="button"
                onClick={backToProjectDetail}
                className="flex items-center gap-2 text-slate-500 hover:text-primary font-bold text-xs uppercase tracking-widest transition-colors"
              >
                <ArrowLeft size={16} />
                {selectedProject ? `Back to ${selectedProject.name}` : 'Back to Project'}
              </button>
              <div>
                <h2 className="text-3xl font-bold leading-tight text-slate-800 dark:text-white">{selectedStudioItem?.title ?? 'Content'}</h2>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedStudioItem ? (
                <Button
                  onClick={() => openEditorForItem(selectedStudioItem)}
                  disabled={busy || !selectedItemHasEditor}
                >
                  {selectedItemHasEditor ? 'Open Editor' : 'Editor Initializing'}
                </Button>
              ) : null}
            </div>
          </div>
        </section>

        {selectedStudioItem ? (
          <>
            <section className="p-1">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={studioChannelFilter === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStudioChannelFilter('all')}
                  >
                    All channels
                  </Button>
                  {selectedProjectChannels.map((channel) => (
                    <Button
                      key={channel}
                      variant={studioChannelFilter === channel ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setStudioChannelFilter(channel)}
                    >
                      {channel}
                    </Button>
                  ))}
                </div>
              </div>

                <div className="mt-5 overflow-x-auto pb-2">
                  <div className="flex min-w-max items-stretch gap-4">
                    {visibleOutputColumns.map((column) => (
                      <section
                        key={column.value}
                        className="min-h-[520px] w-[160px] flex-none rounded-[6px] bg-transparent"
                      >
                        <div className="border-b border-border/60 px-2 py-3">
                          <div className="text-sm font-semibold text-muted-foreground">
                            {column.label} ({column.items.length})
                          </div>
                        </div>
                      <div className="space-y-2.5 px-1 py-3">
                        {column.items.length > 0 ? (
                          column.items.map((output) => {
                            const active = output.id === selectedOutputId;
                            return (
                              <button
                                key={output.id}
                                type="button"
                                onClick={() => setSelectedOutputId(output.id)}
                                className={`w-full rounded-[6px] px-3 py-3 text-left transition-colors ${
                                  active
                                    ? 'bg-orange-500/10 ring-1 ring-orange-500/40'
                                    : 'bg-card/40 hover:bg-card/70'
                                }`}
                              >
                                <div>
                                  <div>
                                    <div className="font-semibold">{output.channel}</div>
                                    <div className="mt-1 text-xs text-muted-foreground">{output.aspectRatio}</div>
                                  </div>
                                </div>
                                <div className="mt-3 text-xs text-muted-foreground">
                                  {output.currentStage ? `Stage: ${output.currentStage}` : 'No current stage'}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {output.narrativeUnitsCount} units
                                </div>
                              </button>
                            );
                          })
                          ) : null}
                        </div>
                      </section>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr),360px]">
              <section className="rounded-[6px] border border-border bg-background p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold">Selected Output</h3>
                    <p className="text-sm text-muted-foreground">
                      {!selectedItemHasEditor
                        ? 'Prepare o editor para iniciar o fluxo deste conteúdo.'
                        : selectedProjectContentOutput
                          ? `${selectedProjectContentOutput.channel} • ${selectedProjectContentOutput.aspectRatio} • ${selectedProjectContentOutput.presetId}`
                          : 'Selecione um card do kanban para ver detalhes.'}
                    </p>
                  </div>
                  {selectedProjectContentOutput && selectedStudioItem ? (
                    <Button variant="outline" onClick={() => generateNarrative(selectedProjectContentOutput, selectedStudioItem)} disabled={busy}>
                      Build Narrative
                    </Button>
                  ) : null}
                </div>
                <div className="mt-4">
                  <CompositionPreview timeline={activeComposition?.timeline ?? null} />
                </div>
              </section>

              <section className="rounded-[6px] border border-border bg-background p-4">
                <div>
                  <h3 className="font-bold">Narrative</h3>
                  <p className="text-sm text-muted-foreground">Resumo do que já existe para o entregável selecionado.</p>
                </div>
                {narrativeUnits.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {narrativeUnits.slice(0, 5).map((unit) => (
                      <article key={unit.id} className="rounded-[5px] border border-border bg-card px-3 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="secondary">{unit.role}</Badge>
                          <div className="text-xs text-muted-foreground">
                            {unit.durationEstimateS ? `${unit.durationEstimateS.toFixed(1)}s` : 'No duration'}
                          </div>
                        </div>
                        <div className="mt-2 text-sm font-medium">{unit.title || `Unit ${unit.order + 1}`}</div>
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-3">{unit.narrationText || unit.sourceText}</p>
                      </article>
                    ))}
                    {narrativeUnits.length > 5 ? (
                      <div className="text-xs text-muted-foreground">+{narrativeUnits.length - 5} units no editor</div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-4 rounded-[5px] border border-dashed border-border px-3 py-6 text-sm text-muted-foreground">
                    {selectedStudioItem && selectedProjectContentOutput
                      ? 'Ainda nao existe narrativa para este entregável.'
                      : selectedStudioItem && selectedItemHasEditor
                        ? 'Abra o editor para iniciar o fluxo deste conteúdo.'
                        : 'Prepare o editor para começar o fluxo deste conteúdo.'}
                  </div>
                )}

                {selectedTarget ? (
                  <div className="mt-6 rounded-[6px] border border-border bg-card p-3">
                    <div className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Promotion</div>
                    <div className="mt-2 text-sm font-semibold">{selectedTarget.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground break-all">{selectedTarget.destinationUrl}</div>
                  </div>
                ) : null}
              </section>
            </section>
          </>
        ) : null}
      </div>
    );
  };

  return (
    <div ref={scrollContainerRef} className="h-full overflow-y-auto bg-background text-foreground">
      <div
        className={`px-6 py-6 space-y-6 ${
          screen === 'studio' ? 'w-full max-w-none' : 'max-w-7xl mx-auto'
        }`}
      >
        {screen !== 'detail' && screen !== 'studio' && (
          <header className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
              </div>
              {screen === 'list' ? (
                <Button onClick={startCreateProject} className="gap-2">
                  <Plus size={16} /> New Project
                </Button>
              ) : null}
            </div>
          </header>
        )}

        {error && (
          <div className="border border-destructive/30 bg-destructive/10 text-destructive rounded-md px-4 py-3 text-sm">
            {error}
          </div>
        )}
        {status && screen !== 'detail' && <div className="text-xs text-muted-foreground">{status}</div>}

        {screen === 'list' && (
          <section className="space-y-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-tight text-muted-foreground">
                <span>{visibleProjects.length} shown</span>
                <span className="text-border">/</span>
                <span>{projects.length} total</span>
                <span className="text-border">/</span>
                <span>{projects.reduce((sum, project) => sum + project.itemsCount, 0)} content items</span>
              </div>

              <div className="flex items-center gap-3 bg-card p-1.5 rounded-[5px] border border-border shadow-sm">
                <div className="flex items-center gap-1 mr-2 border-r border-border pr-2">
                  <button
                    type="button"
                    onClick={() => setProjectViewMode('grid')}
                    className={`p-1.5 rounded-[3px] transition-all ${
                      projectViewMode === 'grid'
                        ? 'bg-orange-600 text-white'
                        : 'text-slate-400 hover:text-orange-600'
                    }`}
                    title="Grid view"
                    aria-label="Grid view"
                  >
                    <LayoutGrid size={18} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setProjectViewMode('list')}
                    className={`p-1.5 rounded-[3px] transition-all ${
                      projectViewMode === 'list'
                        ? 'bg-orange-600 text-white'
                        : 'text-slate-400 hover:text-orange-600'
                    }`}
                    title="List view"
                    aria-label="List view"
                  >
                    <List size={18} strokeWidth={2} />
                  </button>
                </div>

                <div ref={projectFilterMenuRef} className="relative">
                  <button
                    type="button"
                    className={`p-1.5 transition-all h-9 rounded-[3px] ${
                      projectStatusFilter !== 'all'
                        ? 'text-orange-600 bg-orange-600/10'
                        : 'text-slate-400 hover:text-orange-600'
                    }`}
                    title={`Filter: ${selectedProjectFilterLabel}`}
                    aria-label="Filter projects"
                    onClick={() => setIsProjectFilterMenuOpen((current) => !current)}
                  >
                    <Filter size={18} strokeWidth={1.5} />
                  </button>
                  {isProjectFilterMenuOpen ? (
                    <div className="absolute right-0 z-30 mt-2 min-w-[170px] rounded-[5px] border bg-card p-1.5 shadow-lg">
                      {PROJECT_STATUS_FILTERS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setProjectStatusFilter(option.value);
                            setIsProjectFilterMenuOpen(false);
                          }}
                          className={`w-full rounded-[5px] px-2.5 py-2 text-left text-xs font-semibold transition-colors ${
                            option.value === projectStatusFilter
                              ? 'bg-primary/10 text-primary'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div ref={projectSortMenuRef} className="relative">
                  <button
                    type="button"
                    className="p-1.5 text-slate-400 hover:text-orange-600 transition-all h-9 rounded-[3px]"
                    title={`Sort: ${selectedProjectSortLabel}`}
                    aria-label="Sort projects"
                    onClick={() => setIsProjectSortMenuOpen((current) => !current)}
                  >
                    <ArrowUpDown size={18} strokeWidth={1.5} />
                  </button>
                  {isProjectSortMenuOpen ? (
                    <div className="absolute right-0 z-30 mt-2 min-w-[180px] rounded-[5px] border bg-card p-1.5 shadow-lg">
                      {PROJECT_SORT_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setProjectSort(option.value);
                            setIsProjectSortMenuOpen(false);
                          }}
                          className={`w-full rounded-[5px] px-2.5 py-2 text-left text-xs font-semibold transition-colors ${
                            option.value === projectSort
                              ? 'bg-primary/10 text-primary'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  className="p-1.5 text-slate-400 hover:text-orange-600 transition-all h-9 rounded-[3px]"
                  title="Refresh projects"
                  aria-label="Refresh projects"
                  onClick={() => loadProjects()}
                >
                  <RefreshCw size={18} strokeWidth={1.5} />
                </button>
              </div>
            </div>

            {projectViewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {visibleProjects.map(renderProjectGridCard)}
              </div>
            ) : (
              <div className="space-y-4">
                {visibleProjects.map(renderProjectListCard)}
              </div>
            )}

            {projects.length === 0 && (
              <div className="border border-dashed border-border rounded-[6px] bg-card p-8 text-center text-sm text-muted-foreground">
                <p>No projects yet. Create the first project before adding content.</p>
                <Button onClick={startCreateProject} className="mt-4 gap-2">
                  <Plus size={16} /> Create Project
                </Button>
              </div>
            )}

            {projects.length > 0 && visibleProjects.length === 0 && (
              <div className="border border-dashed border-border rounded-[6px] bg-card p-8 text-center text-sm text-muted-foreground">
                <p>No projects match the current filter.</p>
                <Button variant="outline" onClick={() => setProjectStatusFilter('all')} className="mt-4">
                  Clear filter
                </Button>
              </div>
            )}
          </section>
        )}

        {screen === 'create' && (
          <section className="border border-border rounded-md bg-card p-6 space-y-6">
            <div>
              <h2 className="text-xl font-bold">{editingProjectId ? 'Edit Project' : 'Create Project'}</h2>
              <p className="text-sm text-muted-foreground">
                {editingProjectId
                  ? 'Update the editorial workspace, destinations, and output formats.'
                  : 'Name the editorial workspace, then define destinations and formats.'}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <input
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                className="h-11 rounded-md border border-border bg-background px-3 text-sm"
                placeholder="Project name"
              />
            </div>

            <textarea
              value={projectDescription}
              onChange={(event) => setProjectDescription(event.target.value)}
              className="min-h-[120px] w-full rounded-md border border-border bg-background p-3 text-sm"
              placeholder="What content belongs in this project?"
            />

            <input
              value={projectCoverImageUrl}
              onChange={(event) => setProjectCoverImageUrl(event.target.value)}
              className="h-11 rounded-md border border-border bg-background px-3 text-sm"
              placeholder="Project image URL (optional)"
            />

            <div className="border border-border rounded-md bg-background p-4 space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-bold">Production pipeline</h3>
                  <p className="text-sm text-muted-foreground">Turn on only the production steps this project needs.</p>
                </div>
                <Badge variant="outline" className="w-fit">
                  {PIPELINE_AUDIO_LABELS[pipelineAudioMode]} / {PIPELINE_VIDEO_LABELS[pipelineVideoMode]}
                </Badge>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <section className="rounded-md border border-border bg-card/60 p-3 space-y-3">
                  <div className="flex items-start gap-2">
                    <ListChecks size={16} className="mt-0.5 text-primary" />
                    <div>
                      <h4 className="text-sm font-bold">Script structure</h4>
                      <p className="text-xs text-muted-foreground">How text will guide scenes, storyboard, and prompts.</p>
                    </div>
                  </div>
                  <select
                    value={pipelineScriptMode}
                    onChange={(event) => setPipelineScriptMode(event.target.value as ProjectPipelineScriptMode)}
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                  >
                    {PIPELINE_SCRIPT_MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {PIPELINE_SCRIPT_MODE_OPTIONS.find((option) => option.value === pipelineScriptMode)?.hint}
                  </p>
                </section>

                <section className="rounded-md border border-border bg-card/60 p-3 space-y-3">
                  <div className="flex items-start gap-2">
                    <Mic size={16} className="mt-0.5 text-emerald-400" />
                    <div>
                      <h4 className="text-sm font-bold">Audio source</h4>
                      <p className="text-xs text-muted-foreground">Choose whether this project generates speech, uses music, or stays visual.</p>
                    </div>
                  </div>
                  <select
                    value={pipelineAudioMode}
                    onChange={(event) => {
                      const mode = event.target.value as ProjectPipelineAudioMode;
                      setPipelineAudioMode(mode);
                      if (mode === 'video_native_audio' && (pipelineVideoMode === 'none' || pipelineVideoMode === 'editor_motion')) {
                        setPipelineVideoMode('text_to_video');
                      }
                    }}
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                  >
                    {PIPELINE_AUDIO_MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {PIPELINE_AUDIO_MODE_OPTIONS.find((option) => option.value === pipelineAudioMode)?.hint}
                  </p>
                  {pipelineAudioMode === 'tts' && (
                    <label className="space-y-2 block">
                      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">TTS route</span>
                      <select
                        value={selectedTtsRouteKey}
                        onChange={(event) => setSelectedTtsRouteKey(event.target.value)}
                        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                      >
                        {ttsRouteOptions.length === 0 && <option value="">No TTS routes configured</option>}
                        {ttsRouteOptions.map((option) => (
                          <option key={option.key} value={option.key}>
                            {formatTtsRouteOption(option)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </section>

                <section className="rounded-md border border-border bg-card/60 p-3 space-y-3">
                  <div className="flex items-start gap-2">
                    <Image size={16} className="mt-0.5 text-cyan-400" />
                    <h4 className="text-sm font-bold">Image generation</h4>
                  </div>
                  <label className="space-y-2 block">
                    <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Image model</span>
                    <select
                      value={pipelineNeedsImageModel ? selectedImageModelKey : ''}
                      onChange={(event) => {
                        const modelKey = event.target.value;
                        setSelectedImageModelKey(modelKey);
                        setPipelineImageMode(modelKey ? 'generate' : 'none');
                      }}
                      className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                    >
                      {!pipelineImageRequired && <option value="">No image</option>}
                      {pipelineImageRequired && (
                        <option value="" disabled>
                          {imageModelOptions.length === 0 ? 'No image models configured' : 'Select image model'}
                        </option>
                      )}
                      {imageModelOptions.map((option) => (
                        <option key={option.key} value={option.key}>
                          {formatVisualModelOption(option)}
                        </option>
                      ))}
                    </select>
                  </label>
                </section>

                <section className="rounded-md border border-border bg-card/60 p-3 space-y-3">
                  <div className="flex items-start gap-2">
                    <Video size={16} className="mt-0.5 text-orange-400" />
                    <div>
                      <h4 className="text-sm font-bold">Video production</h4>
                      <p className="text-xs text-muted-foreground">Use editor motion, text-to-video, image-to-video, or looped short clips.</p>
                    </div>
                  </div>
                  <select
                    value={pipelineVideoMode}
                    onChange={(event) => {
                      const mode = event.target.value as ProjectPipelineVideoMode;
                      setPipelineVideoMode(mode);
                      if (mode === 'editor_motion' || mode === 'image_to_video') {
                        setPipelineImageMode('generate');
                        setSelectedImageModelKey((current) => current || imageModelOptions[0]?.key || '');
                      }
                    }}
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                  >
                    {PIPELINE_VIDEO_MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {PIPELINE_VIDEO_MODE_OPTIONS.find((option) => option.value === pipelineVideoMode)?.hint}
                  </p>
                  {pipelineNeedsVideoModel && (
                    <label className="space-y-2 block">
                      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Video model</span>
                      <select
                        value={selectedVideoModelKey}
                        onChange={(event) => {
                          const modelKey = event.target.value;
                          const model = videoModelOptions.find((option) => option.key === modelKey);
                          setSelectedVideoModelKey(modelKey);
                          if (pipelineVideoMode === 'looped_clips' && model?.kind === 'image_to_video') {
                            setPipelineImageMode('generate');
                            setSelectedImageModelKey((current) => current || imageModelOptions[0]?.key || '');
                          }
                        }}
                        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                      >
                        <option value="">Select video model</option>
                        {videoModelOptions.map((option) => (
                          <option key={option.key} value={option.key}>
                            {formatVisualModelOption(option)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </section>
              </div>

              <label className="space-y-2 block">
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                  <Film size={13} /> Render output
                </span>
                <select
                  value={pipelineRenderOutputMode}
                  onChange={(event) => {
                    const outputMode = event.target.value as ProjectPipelineRenderOutputMode;
                    setPipelineRenderOutputMode(outputMode);
                    if (outputMode === 'images_only') {
                      setPipelineImageMode('generate');
                      setSelectedImageModelKey((current) => current || imageModelOptions[0]?.key || '');
                    }
                  }}
                  className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
                >
                  {PIPELINE_RENDER_OUTPUT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="block text-xs text-muted-foreground">
                  {PIPELINE_RENDER_OUTPUT_OPTIONS.find((option) => option.value === pipelineRenderOutputMode)?.hint}
                </span>
              </label>
            </div>

            <div className="border border-border rounded-md bg-background p-4 space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-bold">Default outputs</h3>
                  <p className="text-sm text-muted-foreground">Channel-specific formats for new content in this project.</p>
                </div>
                <Badge variant="outline" className="w-fit">
                  {selectedOutputFormats.length} format{selectedOutputFormats.length === 1 ? '' : 's'} / {selectedChannelCount} channel{selectedChannelCount === 1 ? '' : 's'}
                </Badge>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {OUTPUT_CHANNELS.map((channel) => {
                  const selectedCount = channel.formats.filter((format) => selectedOutputIds.includes(format.id)).length;
                  const visibleMediaGroups = MEDIA_GROUPS.filter(({ value }) =>
                    channel.formats.some((format) => format.mediaType === value)
                  );
                  return (
                    <section key={channel.id} className="rounded-md border border-border bg-card/60 p-3 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-bold">{channel.label}</h4>
                          <p className="text-xs text-muted-foreground">{channel.hint}</p>
                        </div>
                        <Badge variant={selectedCount > 0 ? 'secondary' : 'outline'} className="shrink-0">
                          {selectedCount > 0 ? `${selectedCount} selected` : 'Not selected'}
                        </Badge>
                      </div>

                      <div className="flex items-start gap-4 overflow-x-auto pb-1">
                        {visibleMediaGroups.map(({ value, label, Icon }, groupIndex) => {
                          const formats = channel.formats.filter((format) => format.mediaType === value);
                          return (
                            <div key={value} className="flex flex-none items-stretch gap-4">
                              {groupIndex > 0 && <div className="w-px rounded-full bg-border" aria-hidden="true" />}
                              <div className="space-y-2">
                                <div className="inline-flex h-7 items-center gap-2 rounded-md bg-muted px-2.5 text-xs font-bold">
                                  <Icon size={13} />
                                  <span>{label}</span>
                                </div>
                                <div className="flex flex-nowrap gap-2">
                                  {formats.map((format) => {
                                    const isSelected = selectedOutputIds.includes(format.id);
                                    return (
                                      <button
                                        key={format.id}
                                        type="button"
                                        title={`${format.label} - ${format.hint}`}
                                        aria-label={`${channel.label} ${label} ${format.aspectRatio}`}
                                        aria-pressed={isSelected}
                                        onClick={() => toggleOutputFormat(format.id)}
                                        className={`flex h-[55px] w-[57px] flex-none flex-col items-center justify-center gap-1 rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                                          isSelected
                                            ? 'border-primary bg-primary/10 text-foreground'
                                            : 'border-border bg-background/60 text-muted-foreground hover:border-primary/60 hover:text-foreground'
                                        }`}
                                      >
                                        <AspectRatioGlyph aspectRatio={format.aspectRatio} selected={isSelected} />
                                        <span className="text-[11px] font-bold leading-none">{format.aspectRatio}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setEditingProjectId(null);
                  setScreen('list');
                }}
              >
                Cancel
              </Button>
              <Button onClick={saveProject} disabled={busy || !projectName.trim() || !pipelineReady} className="gap-2">
                <Plus size={16} /> {editingProjectId ? 'Save Changes' : 'Save Project'}
              </Button>
            </div>
          </section>
        )}

        {screen === 'detail' && selectedProject && (
          <section className="space-y-8 pb-16">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setEditingProjectId(null);
                  setScreen('list');
                }}
                className="flex items-center gap-2 text-slate-500 hover:text-primary font-bold text-xs uppercase tracking-widest transition-colors"
              >
                <ArrowLeft size={16} />
                Back to Projects
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => startEditProject(selectedProject)}
                  className="inline-flex items-center gap-2 h-9 px-3 rounded-[5px] border border-border text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/10 transition-colors text-[11px] font-semibold tracking-wide"
                >
                  <Pencil size={14} />
                  Edit project
                </button>
                <button
                  type="button"
                  onClick={() => setIsDeleteDialogOpen(true)}
                  disabled={busy}
                  className="inline-flex items-center gap-2 h-9 px-3 rounded-[5px] border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/10 transition-colors text-[11px] font-semibold tracking-wide disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 size={14} />
                  Delete project
                </button>
              </div>
            </div>

            <section className="space-y-10">
              <div className="flex flex-col gap-6 md:flex-row md:items-start">
                <div className="h-44 w-full flex-shrink-0 overflow-hidden rounded-[5px] border border-border bg-card shadow-sm md:w-64">
                  {renderProjectCover(selectedProject, 'list')}
                </div>

                <div className="min-w-0 flex-1 pt-1">
                  <h2 className="text-3xl font-bold leading-tight text-slate-800 dark:text-white">{selectedProject.name}</h2>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                      {formatProjectStatusLabel(selectedProject.status)}
                    </span>
                    <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                      {selectedProjectChannels.length} channels
                    </span>
                    <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-orange-300">
                      {selectedProjectOutputs.length} formats
                    </span>
                    <span className="rounded-full border border-slate-400/20 bg-slate-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-300">
                      {items.length} content items
                    </span>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {getProjectChannelLabels(selectedProject).map((channel) => (
                      <Badge key={channel} variant="secondary" className="bg-slate-800/80 text-slate-100">
                        {channel}
                      </Badge>
                    ))}
                  </div>

                  {status && <p className="mt-3 text-xs text-muted-foreground">{status}</p>}
                </div>
              </div>
              <div className="space-y-5">
                <section className="grid gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-bold">Associated Content</h3>
                      <p className="text-sm text-muted-foreground">{items.length} associated content item{items.length === 1 ? '' : 's'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setIsLinkExistingOpen((current) => !current)}>
                        <Plus size={14} /> Link existing
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => selectedProjectId && loadItems(selectedProjectId)} title="Refresh content">
                        <RefreshCw size={16} />
                      </Button>
                    </div>
                  </div>

                  {isLinkExistingOpen && (
                    <div className="rounded-[6px] border border-border bg-card p-4 space-y-4">
                      <div>
                        <h4 className="font-semibold">Link existing content</h4>
                        <p className="text-sm text-muted-foreground">Associe conteúdo já existente da biblioteca a este projeto. A criação do conteúdo continua sendo feita no menu Content.</p>
                      </div>
                      {linkableLibraryItems.length > 0 ? (
                        <div className="space-y-2">
                          {linkableLibraryItems.map((item) => (
                            <div key={item.id} className="flex items-start justify-between gap-3 rounded-[5px] border border-border bg-background px-3 py-3">
                              <div className="min-w-0">
                                <div className="font-semibold">{item.title}</div>
                                <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{item.sourceText}</div>
                                {(item.projectNames ?? []).length > 0 ? (
                                  <div className="mt-2 text-[11px] text-muted-foreground">
                                    In: {(item.projectNames ?? []).join(', ')}
                                  </div>
                                ) : null}
                              </div>
                              <Button size="sm" variant="outline" onClick={() => linkExistingContentToProject(item)} disabled={busy}>
                                Link
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-[5px] border border-dashed border-border px-3 py-6 text-sm text-muted-foreground">
                          Nenhum conteúdo disponível para vincular.
                        </div>
                      )}
                    </div>
                  )}

                  {items.map(renderContentItem)}
                  {items.length === 0 && (
                    <div className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-6">
                      No associated content. Create content in the Content menu and link it here to this project.
                    </div>
                  )}
                </section>
              </div>
          </section>
          </section>
        )}
        {screen === 'studio' && selectedProject && selectedStudioItem && (
          <section className="space-y-8 pb-16">
            {renderStudio()}
          </section>
        )}
        <ConfirmDialog
          open={isDeleteDialogOpen && Boolean(selectedProject)}
          title="Delete project?"
          description={`This will delete "${selectedProject?.name ?? 'this project'}" and detach its content items. The content remains available in the library.`}
          confirmLabel="Delete project"
          onCancel={() => setIsDeleteDialogOpen(false)}
          onConfirm={deleteProject}
        />
      </div>
    </div>
  );
}
