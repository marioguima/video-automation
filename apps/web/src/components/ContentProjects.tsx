import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpDown,
  CalendarDays,
  CheckCircle2,
  Clapperboard,
  Clock,
  Columns3,
  Eye,
  Filter,
  Film,
  FolderKanban,
  Grid3X3,
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

type Screen = 'list' | 'create' | 'detail';
type DetailView = 'contents' | 'feed' | 'kanban' | 'agenda';
type ProjectViewMode = 'grid' | 'list';
type ProjectStatusFilter = 'all' | 'draft' | 'active' | 'archived';
type ProjectSortKey = 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'content-desc' | 'content-asc';
type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5' | '4:3' | '3:4';
type MediaType = 'image' | 'video';
type ProductionStage = 'idea' | 'script' | 'scenes' | 'assets' | 'editing' | 'ready' | 'scheduled' | 'published';
type ProjectStageCount = { value: ProductionStage; label: string; count: number };

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

type ContentBlocksResponse = {
  backing: {
    lessonId: string;
    lessonVersionId: string;
  };
  blocks: Array<{ id: string; index: number; sourceText: string; status?: string | null }>;
};

type ContentProjectsProps = {
  initialProjectId?: string | null;
  onInitialProjectConsumed?: () => void;
  onOpenVideo?: (payload: { lessonId: string; title: string }) => void;
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

function formatProjectDate(value?: string): string {
  if (!value) return 'Updated -';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Updated -';
  return `Updated ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function getProjectProgress(project: Project): number {
  const outputs = getProjectOutputs(project).length;
  if (outputs === 0) return 0;
  return Math.min(100, Math.round((outputs / OUTPUT_FORMATS.length) * 100));
}

function getContentProgress(items: ContentItem[]): number {
  if (items.length === 0) return 0;
  const maxStageIndex = STAGES.length - 1;
  const total = items.reduce((sum, item) => {
    const index = STAGES.findIndex((stage) => stage.value === getItemStage(item));
    return sum + Math.max(0, index);
  }, 0);
  return Math.round((total / (items.length * maxStageIndex)) * 100);
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
  return item.metadata?.backing?.lessonVersionId ? 'scenes' : 'idea';
}

function getItemDestinations(item: ContentItem): Destination[] {
  return asArray<Destination>(item.metadata?.destinations);
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

function previewAspectClass(aspectRatio: AspectRatio): string {
  if (aspectRatio === '9:16') return 'aspect-[9/16] max-h-[280px]';
  if (aspectRatio === '1:1') return 'aspect-square';
  if (aspectRatio === '4:5') return 'aspect-[4/5] max-h-[280px]';
  if (aspectRatio === '4:3') return 'aspect-[4/3]';
  if (aspectRatio === '3:4') return 'aspect-[3/4] max-h-[280px]';
  return 'aspect-video';
}

export default function ContentProjects({
  initialProjectId,
  onInitialProjectConsumed,
  onOpenVideo
}: ContentProjectsProps) {
  const [screen, setScreen] = useState<Screen>('list');
  const [detailView, setDetailView] = useState<DetailView>('contents');
  const [projectViewMode, setProjectViewMode] = useState<ProjectViewMode>('grid');
  const [projectStatusFilter, setProjectStatusFilter] = useState<ProjectStatusFilter>('all');
  const [projectSort, setProjectSort] = useState<ProjectSortKey>('newest');
  const [isProjectFilterMenuOpen, setIsProjectFilterMenuOpen] = useState(false);
  const [isProjectSortMenuOpen, setIsProjectSortMenuOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('Novo projeto');
  const [projectDescription, setProjectDescription] = useState('');
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

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

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

  const itemsByStage = useMemo(() => {
    const grouped = new Map<ProductionStage, ContentItem[]>();
    for (const stage of STAGES) grouped.set(stage.value, []);
    for (const item of items) grouped.get(getItemStage(item))?.push(item);
    return grouped;
  }, [items]);

  const plannedItems = useMemo(
    () =>
      [...items].sort((a, b) => {
        const aDate = a.metadata?.plannedPublishAt ?? '9999-12-31';
        const bDate = b.metadata?.plannedPublishAt ?? '9999-12-31';
        return aDate.localeCompare(bDate);
      }),
    [items]
  );

  const selectedProjectOutputs = useMemo(
    () => (selectedProject ? getProjectOutputs(selectedProject) : []),
    [selectedProject]
  );

  const selectedProjectPipeline = useMemo(
    () => (selectedProject ? getProjectPipelineConfig(selectedProject) : null),
    [selectedProject]
  );

  const selectedProjectChannels = useMemo(
    () => uniqueValues(selectedProjectOutputs.map((output) => output.channel)),
    [selectedProjectOutputs]
  );

  const selectedProjectProgress = useMemo(() => getContentProgress(items), [items]);

  const selectedProjectStageCounts = useMemo<ProjectStageCount[]>(
    () =>
      STAGES.map((stage) => ({
        ...stage,
        count: itemsByStage.get(stage.value)?.length ?? 0
      })).filter((stage) => stage.count > 0),
    [itemsByStage]
  );

  const selectedProjectPrimaryStage = useMemo<ProjectStageCount | null>(
    () =>
      selectedProjectStageCounts.reduce<ProjectStageCount | null>(
        (bestStage, stage) => (!bestStage || stage.count > bestStage.count ? stage : bestStage),
        null
      ),
    [selectedProjectStageCounts]
  );

  const selectedProjectVideoFormats = selectedProjectOutputs.filter((output) => output.mediaType === 'video').length;
  const selectedProjectImageFormats = selectedProjectOutputs.filter((output) => output.mediaType === 'image').length;

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

  useEffect(() => {
    loadProjects().catch((err) => setError(err instanceof Error ? err.message : String(err)));
    loadGenerationSettings().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    if (!initialProjectId) return;
    const projectExists = projects.some((project) => project.id === initialProjectId);
    if (!projectExists) return;
    setSelectedProjectId(initialProjectId);
    setDetailView('contents');
    setScreen('detail');
    onInitialProjectConsumed?.();
  }, [initialProjectId, projects, onInitialProjectConsumed]);

  useEffect(() => {
    if (!selectedProjectId) {
      setItems([]);
      return;
    }
    loadItems(selectedProjectId).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [selectedProjectId]);

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

  const openProject = (project: Project) => {
    setStatus('');
    setSelectedProjectId(project.id);
    setDetailView('contents');
    setScreen('detail');
  };

  const startCreateProject = () => {
    setStatus('');
    setEditingProjectId(null);
    setProjectName('Novo projeto');
    setProjectDescription('');
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
      setDetailView('contents');
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
      setDetailView('contents');
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

  const segmentItem = async (item: ContentItem) => {
    setBusy(true);
    setError(null);
    try {
      const response = await apiPost<{ blocksCount: number; job: { id: string; status: string } }>(
        `/content-items/${item.id}/segment`,
        {
          purge: true,
          autoQueue: { audio: false, image: false }
        }
      );
      const data = await apiGet<ContentBlocksResponse>(`/content-items/${item.id}/blocks`, { cacheMs: 0, dedupe: false });
      setItems((current) =>
        current.map((currentItem) =>
          currentItem.id === item.id
            ? {
                ...currentItem,
                status: 'scenes',
                metadata: {
                  ...(currentItem.metadata ?? {}),
                  productionStage: 'scenes',
                  backing: data.backing
                }
              }
            : currentItem
        )
      );
      await updateItem(item, { status: 'scenes', metadata: { productionStage: 'scenes', backing: data.backing } });
      setStatus(`Scenes queued. Estimated scenes: ${response.blocksCount}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate scenes.');
    } finally {
      setBusy(false);
    }
  };

  const openItem = async (item: ContentItem) => {
    const lessonId = item.metadata?.backing?.lessonId;
    if (lessonId) {
      onOpenVideo?.({ lessonId, title: item.title });
      return;
    }
    try {
      const data = await apiGet<ContentBlocksResponse>(`/content-items/${item.id}/blocks`, { cacheMs: 0, dedupe: false });
      onOpenVideo?.({ lessonId: data.backing.lessonId, title: item.title });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open editor.');
    }
  };

  const renderDestinationBadges = (item: ContentItem) => {
    const destinations = getItemDestinations(item);
    if (destinations.length === 0) return <Badge variant="outline">No destination</Badge>;
    return destinations.slice(0, 3).map((destination) => (
      <Badge key={destination} variant="secondary" className="capitalize">
        {formatDestination(destination)}
      </Badge>
    ));
  };

  const renderItemActions = (item: ContentItem) => {
    const canUseVideoPipeline = item.kind === 'content' || item.kind === 'video' || item.kind === 'music_video';
    if (!canUseVideoPipeline) return null;
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => segmentItem(item)} disabled={busy}>
          Generate Scenes
        </Button>
        <Button size="sm" onClick={() => openItem(item)} disabled={busy}>
          Open Editor
        </Button>
      </div>
    );
  };

  const renderProjectCover = (project: Project, mode: 'grid' | 'list') => {
    const projectOutputs = getProjectOutputs(project);
    const recency = projectRecencyTag[project.id];
    const progress = getProjectProgress(project);
    return (
      <div
        className={`relative overflow-hidden bg-slate-100 dark:bg-slate-800 ${
          mode === 'grid' ? 'aspect-video' : 'h-full min-h-[170px]'
        }`}
      >
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

        <div className="absolute inset-x-3 bottom-3 z-20 flex items-center justify-between gap-3">
          <span className="inline-flex items-center justify-center rounded-[5px] bg-black/80 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
            {project.status || 'draft'}
          </span>
          <span className="inline-flex items-center justify-center rounded-[5px] bg-black/80 px-2 py-0.5 text-xs font-bold text-white">
            {projectOutputs.length} formats
          </span>
        </div>

        <div className="absolute inset-x-3 bottom-8 z-20 h-1.5 rounded-full bg-black/45">
          <div
            className="h-full rounded-full bg-orange-600 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  };

  const renderProjectBadges = (project: Project) => {
    const projectOutputs = getProjectOutputs(project);
    return (
      <div className="flex flex-wrap gap-1">
        {projectOutputs.slice(0, 3).map((output) => (
          <Badge key={output.id} variant="secondary" className="text-[10px]">
            {formatProjectOutput(output)}
          </Badge>
        ))}
        {projectOutputs.length > 3 && (
          <Badge variant="outline" className="text-[10px]">
            +{projectOutputs.length - 3}
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

          <p className="mt-2 text-xs text-muted-foreground font-medium line-clamp-2">
            {project.description || 'No description yet.'}
          </p>

          <div className="mt-3">{renderProjectBadges(project)}</div>

          <div className="mt-3 flex items-center justify-between pt-3 text-[10px] font-bold uppercase tracking-tight text-muted-foreground">
            <span>{formatProjectDate(project.updatedAt ?? project.createdAt)}</span>
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

            <p className="text-xs text-muted-foreground font-medium line-clamp-2">
              {project.description || 'No description yet.'}
            </p>

            <div className="mt-3">{renderProjectBadges(project)}</div>
          </div>

          <div className="border-t md:border-t-0 md:border-l border-border px-4 py-3 md:w-48 flex md:block items-center justify-between gap-4">
            <div className="text-center md:text-left">
              {recency ? (
                <p className={`text-[10px] font-black uppercase tracking-[0.16em] ${recency === 'new' ? 'text-orange-600' : 'text-muted-foreground'}`}>
                  {recency === 'new' ? 'NEW' : 'UPDATED'}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">{formatProjectDate(project.updatedAt ?? project.createdAt)}</p>
              )}
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
    <article key={item.id} className="border border-border rounded-md bg-background p-4 space-y-4">
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
        <div className="flex flex-wrap gap-1 justify-end">{renderDestinationBadges(item)}</div>
      </div>
      {renderItemActions(item)}
    </article>
  );

  return (
    <div className="h-full overflow-y-auto bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {screen !== 'detail' && (
          <header className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">FlowShopy</p>
                <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
              </div>
              {screen === 'list' ? (
                <Button onClick={startCreateProject} className="gap-2">
                  <Plus size={16} /> New Project
                </Button>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground max-w-4xl">
              Projects group related content and define the default destinations and formats used to produce deliverables.
            </p>
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
              <div className="flex flex-col gap-6 md:flex-row">
                <div className="h-44 w-full flex-shrink-0 overflow-hidden rounded-[5px] border border-border bg-card shadow-sm md:w-60">
                  {renderProjectCover(selectedProject, 'list')}
                </div>

                <div className="min-w-0 flex-1 pt-1">
                  <h2 className="text-3xl font-bold leading-tight text-slate-800 dark:text-white">{selectedProject.name}</h2>
                  <p className="mt-2 max-w-4xl text-sm text-muted-foreground">
                    {selectedProject.description || 'No description yet.'}
                  </p>

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
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                      <Clock size={14} />
                      {formatProjectDate(selectedProject.updatedAt ?? selectedProject.createdAt)}
                    </span>
                  </div>

                  <div className="mt-4 h-[7px] w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <div
                      className="h-full bg-green-500 transition-all duration-500"
                      style={{ width: `${selectedProjectProgress}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    {selectedProjectProgress}% project progress
                    {selectedProjectPrimaryStage ? (
                      <span className="ml-2 text-orange-400">
                        Current stage: {selectedProjectPrimaryStage.label}
                      </span>
                    ) : null}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {selectedProjectStageCounts.length > 0 ? (
                      selectedProjectStageCounts.map((stage) => (
                        <span
                          key={stage.value}
                          className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${STAGE_TONE_CLASSES[stage.value]}`}
                        >
                          {stage.count} {stage.label}
                        </span>
                      ))
                    ) : (
                      <span className="rounded-full border border-dashed border-border px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        No content staged yet
                      </span>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {selectedProjectPipeline && (
                      <>
                        <Badge variant="outline" className="border-slate-400/30 bg-slate-500/10 text-slate-200">
                          Audio {PIPELINE_AUDIO_LABELS[selectedProjectPipeline.audio.mode ?? 'none']}
                        </Badge>
                        <Badge variant="outline" className="border-orange-500/30 bg-orange-500/10 text-orange-300">
                          Video {PIPELINE_VIDEO_LABELS[selectedProjectPipeline.video.mode ?? 'none']}
                        </Badge>
                        {selectedProjectPipeline.image.mode === 'generate' && (
                          <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
                            Image pipeline
                          </Badge>
                        )}
                        {selectedProjectPipeline.audio.tts?.providerId && selectedProjectPipeline.audio.tts?.language && (
                          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                            TTS {selectedProjectPipeline.audio.tts.providerId} / {selectedProjectPipeline.audio.tts.language}
                          </Badge>
                        )}
                        {selectedProjectPipeline.image.model?.providerId && selectedProjectPipeline.image.model?.modelId && (
                          <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
                            Image {selectedProjectPipeline.image.model.providerId} / {selectedProjectPipeline.image.model.modelId}
                          </Badge>
                        )}
                        {selectedProjectPipeline.video.model?.providerId && selectedProjectPipeline.video.model?.modelId && (
                          <Badge variant="outline" className="border-orange-500/30 bg-orange-500/10 text-orange-300">
                            Video {selectedProjectPipeline.video.model.providerId} / {selectedProjectPipeline.video.model.modelId}
                          </Badge>
                        )}
                      </>
                    )}
                    {selectedProjectVideoFormats > 0 && (
                      <Badge variant="outline" className="border-orange-500/30 bg-orange-500/10 text-orange-300">
                        Video formats {selectedProjectVideoFormats}
                      </Badge>
                    )}
                    {selectedProjectImageFormats > 0 && (
                      <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
                        Image formats {selectedProjectImageFormats}
                      </Badge>
                    )}
                    {selectedProjectOutputs.map((output) => (
                      <Badge key={output.id} variant="secondary" className="bg-slate-800/80 text-slate-100">
                        {formatProjectOutput(output)}
                      </Badge>
                    ))}
                  </div>

                  {status && <p className="mt-3 text-xs text-muted-foreground">{status}</p>}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'contents', label: 'Contents', Icon: ListChecks },
                    { value: 'feed', label: 'Feed', Icon: Grid3X3 },
                    { value: 'kanban', label: 'Kanban', Icon: Columns3 },
                    { value: 'agenda', label: 'Agenda', Icon: CalendarDays }
                  ].map(({ value, label, Icon }) => (
                    <Button
                      key={value}
                      variant={detailView === value ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setDetailView(value as DetailView)}
                      className="gap-2"
                    >
                      <Icon size={15} /> {label}
                    </Button>
                  ))}
              </div>

            {detailView === 'contents' && (
              <div className="space-y-5">
                <section className="grid gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-bold">Deliverables</h3>
                      <p className="text-sm text-muted-foreground">{items.length} associated content item{items.length === 1 ? '' : 's'}</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => selectedProjectId && loadItems(selectedProjectId)} title="Refresh content">
                      <RefreshCw size={16} />
                    </Button>
                  </div>
                  {items.map(renderContentItem)}
                  {items.length === 0 && (
                    <div className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-6">
                      No associated content.
                    </div>
                  )}
                </section>
              </div>
            )}

            {detailView === 'feed' && (
              <div>
                <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
                  {items.map((item) => {
                    const aspectRatio = getItemAspectRatios(item)[0] ?? '16:9';
                    const Icon = item.kind === 'image' ? Image : item.kind === 'music_video' ? Clapperboard : Film;
                    return (
                      <article key={item.id} className="border border-border rounded-md bg-background overflow-hidden">
                        <div className={`relative bg-muted flex items-center justify-center ${previewAspectClass(aspectRatio)}`}>
                          {item.metadata?.thumbnailUrl ? (
                            <img src={item.metadata.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex flex-col items-center gap-3 text-muted-foreground px-6 text-center">
                              <Icon size={36} />
                              <div className="text-sm font-semibold text-foreground">{item.title}</div>
                              <div className="text-xs">Preview will use thumbnail, first frame, main image or this placeholder.</div>
                            </div>
                          )}
                          <Badge className="absolute left-3 top-3" variant="secondary">
                            {aspectRatio}
                          </Badge>
                        </div>
                        <div className="p-4 space-y-3">
                          <div>
                            <h3 className="font-semibold">{item.title}</h3>
                            <p className="text-xs text-muted-foreground">Content</p>
                          </div>
                          <div className="flex flex-wrap gap-1">{renderDestinationBadges(item)}</div>
                          <div className="flex flex-wrap gap-1">
                            {getItemAspectRatios(item).map((ratio) => (
                              <Badge key={ratio} variant="outline">
                                {ratio}
                              </Badge>
                            ))}
                          </div>
                          {renderItemActions(item)}
                        </div>
                      </article>
                    );
                  })}
                </div>
                {items.length === 0 && (
                  <div className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-6">
                    The feed is empty. Add content to this project first.
                  </div>
                )}
              </div>
            )}

            {detailView === 'kanban' && (
              <div className="overflow-x-auto">
                <div className="grid grid-cols-[repeat(8,minmax(220px,1fr))] gap-3 min-w-[1760px]">
                  {STAGES.map((stage) => (
                    <section key={stage.value} className="border border-border rounded-md bg-background min-h-[420px]">
                      <div className="p-3 border-b border-border flex items-center justify-between">
                        <h3 className="font-semibold text-sm">{stage.label}</h3>
                        <Badge variant="secondary">{itemsByStage.get(stage.value)?.length ?? 0}</Badge>
                      </div>
                      <div className="p-3 space-y-3">
                        {(itemsByStage.get(stage.value) ?? []).map((item) => (
                          <article key={item.id} className="border border-border rounded-md bg-card p-3 space-y-3">
                            <div>
                              <h4 className="text-sm font-semibold">{item.title}</h4>
                              <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{item.sourceText}</p>
                            </div>
                            <div className="flex flex-wrap gap-1">{renderDestinationBadges(item)}</div>
                            <select
                              value={getItemStage(item)}
                              onChange={(event) => moveItemToStage(item, event.target.value as ProductionStage)}
                              className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
                              disabled={busy}
                            >
                              {STAGES.map((option) => (
                                <option key={option.value} value={option.value}>
                                  Move to {option.label}
                                </option>
                              ))}
                            </select>
                          </article>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            )}

            {detailView === 'agenda' && (
              <div className="space-y-4">
                <div className="border border-border rounded-md bg-background">
                  {plannedItems.map((item) => (
                    <div key={item.id} className="p-4 border-b border-border last:border-b-0 flex flex-col md:flex-row md:items-center gap-3 md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">{item.title}</h3>
                          <Badge variant="secondary">{getItemStage(item)}</Badge>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {item.metadata?.plannedPublishAt ? `Planned for ${item.metadata.plannedPublishAt}` : 'No planned publish date'}
                          {item.metadata?.ownerName ? ` - Owner: ${item.metadata.ownerName}` : ''}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 md:justify-end">{renderDestinationBadges(item)}</div>
                    </div>
                  ))}
                  {plannedItems.length === 0 && (
                    <div className="text-sm text-muted-foreground p-6">
                      No scheduled work yet. Add a date when creating content.
                    </div>
                  )}
                </div>
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 size={16} className="mt-0.5 text-primary" />
                  Agenda is project-scoped. Platform scheduling remains a future integration.
                </div>
              </div>
            )}
          </section>
          </section>
        )}
        <ConfirmDialog
          open={isDeleteDialogOpen && Boolean(selectedProject)}
          title="Delete project?"
          description={`This will delete "${selectedProject?.name ?? 'this project'}" and detach its content items. The content and generated backing data will remain available.`}
          confirmLabel="Delete project"
          onCancel={() => setIsDeleteDialogOpen(false)}
          onConfirm={deleteProject}
        />
      </div>
    </div>
  );
}
