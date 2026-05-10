import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileText,
  LayoutGrid,
  Link2,
  List,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  Youtube
} from 'lucide-react';
import ConfirmDialog from './ui/confirm-dialog';
import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api';
import { DEFAULT_PROJECT_DESTINATIONS, DESTINATIONS, formatDestination } from '../lib/contentDestinations';

type Project = {
  id: string;
  name: string;
  metadata?: {
    defaultDestinations?: string[];
    defaultAspectRatios?: string[];
  } | null;
};

type ContentItem = {
  id: string;
  projectIds: string[];
  title: string;
  kind: string;
  sourceText?: string | null;
  status?: string;
  createdAt?: string;
  metadata?: {
    destinations?: string[];
    aspectRatios?: string[];
    productionStage?: string;
    editorialState?: string;
    sourceMode?: string;
    contentSources?: ContentSourceDraft[];
    backing?: {
      lessonId?: string;
      lessonVersionId?: string;
    };
  } | null;
  projectName?: string | null;
  projectNames?: string[];
  destinations?: string[];
};

export type ContentQuickStartDraft = {
  title?: string;
  sourceText: string;
  nonce: number;
};

type ContentQuickStartProps = {
  initialDraft?: ContentQuickStartDraft | null;
  onInitialDraftConsumed?: () => void;
};

type ContentSourceKind = 'text' | 'youtube_url' | 'pdf';
type ContentSourceDraftStatus = 'raw_text_ready' | 'queued';

type ContentSourceDraft = {
  id: string;
  type: ContentSourceKind;
  label: string;
  value?: string;
  fileNames?: string[];
  status: ContentSourceDraftStatus;
};

const TEXT_SOURCE_PLACEHOLDER =
  'Cole uma ideia, pauta, briefing, pesquisa ou rascunho.';

const PRE_PRODUCTION_STAGES = new Set(['idea', 'script', 'draft']);
const DEFAULT_PROJECT_ASPECT_RATIOS = ['16:9', '9:16'];

function hasStartedDeliverableProduction(item: ContentItem): boolean {
  const productionStage = item.metadata?.productionStage ?? item.status ?? 'script';
  return !PRE_PRODUCTION_STAGES.has(productionStage);
}

function formatDate(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function getProjectDestinations(project: Project): string[] {
  const savedDestinations = asStringArray(project.metadata?.defaultDestinations);
  return savedDestinations.length > 0 ? savedDestinations : DEFAULT_PROJECT_DESTINATIONS;
}

function getProjectAspectRatios(project: Project): string[] {
  const savedAspectRatios = asStringArray(project.metadata?.defaultAspectRatios);
  return savedAspectRatios.length > 0 ? savedAspectRatios : DEFAULT_PROJECT_ASPECT_RATIOS;
}

function orientationFromAspectRatios(aspectRatios: string[]): 'horizontal' | 'vertical' | 'square' {
  if (aspectRatios.includes('9:16') || aspectRatios.includes('4:5')) return 'vertical';
  if (aspectRatios.includes('1:1')) return 'square';
  return 'horizontal';
}

function getContentDestinations(item: ContentItem): string[] {
  return asStringArray(item.destinations);
}

function getItemProjectIds(item: ContentItem): string[] {
  return item.projectIds;
}

function getSavedContentSources(item: ContentItem): ContentSourceDraft[] {
  return Array.isArray(item.metadata?.contentSources) ? item.metadata?.contentSources : [];
}

function getContentPreparationStatus(item: ContentItem): 'Processando' | 'Pronto' {
  const sources = deriveSourcesFromItem(item);
  if (sources.length === 0) {
    return (item.sourceText ?? '').trim() ? 'Pronto' : 'Processando';
  }
  return sources.every((source) => source.status === 'raw_text_ready') ? 'Pronto' : 'Processando';
}

const VISIBLE_LIST_ITEM_LIMIT = 10;
const VISIBLE_LIST_MAX_HEIGHT_CLASS = 'max-h-[540px]';

function parseYouTubeLinks(value: string): string[] {
  return value
    .split(/[\s\r\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isValidYouTubeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (host === 'youtu.be') {
      return url.pathname.replace(/\//g, '').length > 0;
    }
    if (host === 'www.youtube.com' || host === 'youtube.com' || host === 'm.youtube.com') {
      return url.pathname === '/watch'
        ? url.searchParams.has('v')
        : url.pathname.startsWith('/shorts/') || url.pathname.startsWith('/live/') || url.pathname.startsWith('/embed/');
    }
    return false;
  } catch {
    return false;
  }
}

function getYouTubeVideoId(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (host === 'youtu.be') {
      const id = url.pathname.replace(/\//g, '').trim();
      return id || null;
    }
    if (host === 'www.youtube.com' || host === 'youtube.com' || host === 'm.youtube.com') {
      if (url.pathname === '/watch') {
        return url.searchParams.get('v')?.trim() || null;
      }
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] === 'shorts' || parts[0] === 'live' || parts[0] === 'embed') {
        return parts[1]?.trim() || null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

const SOURCE_TYPE_OPTIONS: Array<{
  value: ContentSourceKind;
  label: string;
  Icon: typeof FileText;
}> = [
  { value: 'text', label: 'Text', Icon: FileText },
  { value: 'youtube_url', label: 'YouTube links', Icon: Youtube },
  { value: 'pdf', label: 'PDF files', Icon: Upload }
];

function createDraftSourceId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `src-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function deriveSourcesFromItem(item: ContentItem): ContentSourceDraft[] {
  const saved = Array.isArray(item.metadata?.contentSources) ? item.metadata?.contentSources : [];
  if (saved && saved.length > 0) {
    return saved.map((source) => ({
      id: source.id || createDraftSourceId(),
      type: source.type,
      label: source.label,
      value: source.value,
      fileNames: source.fileNames,
      status: source.status
    }));
  }
  if ((item.sourceText ?? '').trim()) {
    return [
      {
        id: createDraftSourceId(),
        type: 'text',
        label: 'Imported text',
        value: item.sourceText ?? '',
        status: 'raw_text_ready'
      }
    ];
  }
  return [];
}

function buildRawTextFromSources(sources: ContentSourceDraft[]): string {
  return sources
    .filter((source) => source.type === 'text' && source.status === 'raw_text_ready')
    .map((source) => source.value?.trim() ?? '')
    .filter(Boolean)
    .join('\n\n---\n\n');
}

function getPreparationReadiness(sources: ContentSourceDraft[]) {
  const total = sources.length;
  const ready = sources.filter((source) => source.status === 'raw_text_ready').length;
  const queued = total - ready;
  const hasPending = queued > 0;
  return {
    total,
    ready,
    queued,
    allReady: total > 0 && !hasPending,
    editorialState: total === 0 ? 'source_ingested' : hasPending ? 'source_ingested' : 'script_ready',
    productionStage: total === 0 ? 'idea' : hasPending ? 'idea' : 'script'
  };
}

export default function ContentQuickStart({ initialDraft, onInitialDraftConsumed }: ContentQuickStartProps) {
  const [screen, setScreen] = useState<'list' | 'form'>('list');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [projects, setProjects] = useState<Project[]>([]);
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [editingContent, setEditingContent] = useState<ContentItem | null>(null);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [title, setTitle] = useState('Novo conteúdo');
  const [draftSources, setDraftSources] = useState<ContentSourceDraft[]>([]);
  const [activeSourceType, setActiveSourceType] = useState<ContentSourceKind>('text');
  const [pendingSourceText, setPendingSourceText] = useState('');
  const [pendingSourceLinks, setPendingSourceLinks] = useState('');
  const [pendingPdfFiles, setPendingPdfFiles] = useState<File[]>([]);
  const [nameFilter, setNameFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [destinationFilter, setDestinationFilter] = useState('');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [contentToDelete, setContentToDelete] = useState<ContentItem | null>(null);
  const [contentToRename, setContentToRename] = useState<ContentItem | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Ready');
  const pdfInputRef = useRef<HTMLInputElement | null>(null);

  const loadProjects = async (): Promise<Project[]> => {
    const data = await apiGet<Project[]>('/content-projects', { cacheMs: 0, dedupe: false });
    setProjects(data);
    return data;
  };

  const loadContentList = async () => {
    const loadedProjects = await loadProjects();
    const projectById = new Map(loadedProjects.map((project) => [project.id, project]));
    const items = await apiGet<ContentItem[]>('/content-items', { cacheMs: 0, dedupe: false });
    setContents(
      items
        .map((item) => {
          const itemProjectIds = getItemProjectIds(item);
          const itemProjects = itemProjectIds.map((projectId) => projectById.get(projectId)).filter((project): project is Project => Boolean(project));
          const project = itemProjects[0];
          const itemDestinations = asStringArray(item.metadata?.destinations);
          const projectDestinations = itemProjects.flatMap(getProjectDestinations);
          return {
            ...item,
            projectIds: itemProjectIds,
            projectName: item.projectName ?? project?.name ?? null,
            projectNames: item.projectNames ?? itemProjects.map((projectItem) => projectItem.name),
            destinations: itemDestinations.length > 0 ? itemDestinations : projectDestinations
          };
        })
        .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    );
  };

  useEffect(() => {
    loadContentList().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    const handleClickOutside = () => setOpenMenuId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!initialDraft) return;
    setEditingContent(null);
    setTitle(initialDraft.title?.trim() || 'Novo conteúdo');
    setDraftSources([
      {
        id: createDraftSourceId(),
        type: 'text',
        label: 'Imported text',
        value: initialDraft.sourceText,
        status: 'raw_text_ready'
      }
    ]);
    setPendingSourceText(initialDraft.sourceText);
    setPendingSourceLinks('');
    setPendingPdfFiles([]);
    setActiveSourceType('text');
    setError(null);
    setStatus('Ready');
    setScreen('form');
    onInitialDraftConsumed?.();
  }, [initialDraft?.nonce]);

  const rawTextPreview = useMemo(() => buildRawTextFromSources(draftSources), [draftSources]);
  const parsedYouTubeLinks = useMemo(() => parseYouTubeLinks(pendingSourceLinks), [pendingSourceLinks]);
  const parsedYouTubeEntries = useMemo(
    () =>
      parsedYouTubeLinks.map((link) => ({
        link,
        videoId: getYouTubeVideoId(link)
      })),
    [parsedYouTubeLinks]
  );
  const invalidYouTubeLinks = useMemo(
    () => parsedYouTubeEntries.filter((entry) => !entry.videoId).map((entry) => entry.link),
    [parsedYouTubeEntries]
  );
  const uniqueYouTubeEntries = useMemo(() => {
    const seen = new Set<string>();
    return parsedYouTubeEntries.filter((entry) => {
      if (!entry.videoId || seen.has(entry.videoId)) return false;
      seen.add(entry.videoId);
      return true;
    });
  }, [parsedYouTubeEntries]);
  const duplicateYouTubeCount = Math.max(0, parsedYouTubeEntries.length - invalidYouTubeLinks.length - uniqueYouTubeEntries.length);
  const existingYouTubeVideoIds = useMemo(
    () =>
      new Set(
        draftSources
          .filter((source) => source.type === 'youtube_url' && source.value)
          .map((source) => getYouTubeVideoId(source.value ?? ''))
          .filter((value): value is string => Boolean(value))
      ),
    [draftSources]
  );
  const canAddSource =
    activeSourceType === 'text'
      ? pendingSourceText.trim().length > 0
      : activeSourceType === 'youtube_url'
        ? uniqueYouTubeEntries.some((entry) => entry.videoId && !existingYouTubeVideoIds.has(entry.videoId)) && invalidYouTubeLinks.length === 0
        : pendingPdfFiles.length > 0;

  const toggleSelectedProject = (projectId: string) => {
    setSelectedProjectIds((current) =>
      current.includes(projectId) ? current.filter((id) => id !== projectId) : [...current, projectId]
    );
  };

  const resetPendingSourceInputs = () => {
    setPendingSourceText('');
    setPendingSourceLinks('');
    setPendingPdfFiles([]);
  };

  const addDraftSource = () => {
    if (activeSourceType === 'text') {
      const value = pendingSourceText.trim();
      if (!value) {
        setError('Text source is required.');
        return;
      }
      setDraftSources((current) => [
        ...current,
        {
          id: createDraftSourceId(),
          type: 'text',
          label: `Text source ${current.filter((item) => item.type === 'text').length + 1}`,
          value,
          status: 'raw_text_ready'
        }
      ]);
      setPendingSourceText('');
      setError(null);
      return;
    }

    if (activeSourceType === 'youtube_url') {
      if (parsedYouTubeEntries.length === 0) {
        setError('Add at least one YouTube link.');
        return;
      }
      if (invalidYouTubeLinks.length > 0) {
        setError('Only valid YouTube links are accepted.');
        return;
      }
      const freshEntries = uniqueYouTubeEntries.filter(
        (entry) => entry.videoId && !existingYouTubeVideoIds.has(entry.videoId)
      );
      if (freshEntries.length === 0) {
        setError('All pasted YouTube links are already in this content.');
        return;
      }
      setDraftSources((current) => [
        ...current,
        ...freshEntries.map((entry, index) => ({
          id: createDraftSourceId(),
          type: 'youtube_url' as const,
          label: `YouTube source ${current.filter((item) => item.type === 'youtube_url').length + index + 1}`,
          value: entry.link,
          status: 'queued' as const
        }))
      ]);
      setPendingSourceLinks('');
      setError(null);
      return;
    }

    if (pendingPdfFiles.length === 0) {
      setError('Select at least one PDF file.');
      return;
    }
    setDraftSources((current) => [
      ...current,
      ...pendingPdfFiles.map((file, index) => ({
        id: createDraftSourceId(),
        type: 'pdf' as const,
        label: `PDF source ${current.filter((item) => item.type === 'pdf').length + index + 1}`,
        fileNames: [file.name],
        status: 'queued' as const
      }))
    ]);
    setPendingPdfFiles([]);
    if (pdfInputRef.current) {
      pdfInputRef.current.value = '';
    }
    setError(null);
  };

  const removeDraftSource = (sourceId: string) => {
    setDraftSources((current) => current.filter((source) => source.id !== sourceId));
  };

  const saveContent = async () => {
    if (!title.trim()) {
      setError('Content title is required.');
      return;
    }
    if (draftSources.length === 0) {
      setError('Add at least one source.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const preparationState = getPreparationReadiness(draftSources);
      const sourceText = rawTextPreview.trim();
      if (editingContent) {
        const editable = !hasStartedDeliverableProduction(editingContent);
        await apiPatch<ContentItem>(
          `/content-items/${editingContent.id}`,
          editable
            ? {
                title,
                sourceText,
                projectIds: selectedProjectIds,
                metadata: {
                  contentSources: draftSources,
                  sourceMode: 'source',
                  editorialState: preparationState.editorialState,
                  productionStage: preparationState.productionStage
                }
              }
            : {
                projectIds: selectedProjectIds
              }
        );
        setStatus(editable ? 'Content updated.' : 'Project associations updated.');
      } else {
        const selectedProjects = selectedProjectIds
          .map((projectId) => projects.find((projectItem) => projectItem.id === projectId))
          .filter((project): project is Project => Boolean(project));
        const destinations = Array.from(new Set(selectedProjects.flatMap(getProjectDestinations)));
        const aspectRatios = Array.from(new Set(selectedProjects.flatMap(getProjectAspectRatios)));
        await apiPost<ContentItem>('/content-items', {
          kind: 'content',
          title,
          sourceText,
          orientation: orientationFromAspectRatios(aspectRatios),
          projectIds: selectedProjectIds,
          status: preparationState.productionStage,
          metadata: {
            source: 'content_production',
            sourceMode: 'source',
            editorialState: preparationState.editorialState,
            productionStage: preparationState.productionStage,
            contentSources: draftSources,
            destinations: destinations.length > 0 ? destinations : undefined,
            aspectRatios: aspectRatios.length > 0 ? aspectRatios : undefined
          }
        });
        setStatus(selectedProjectIds.length > 0 ? 'Content saved and associated to projects.' : 'Content saved without project.');
      }
      await loadContentList();
      setScreen('list');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save content.');
    } finally {
      setBusy(false);
    }
  };

  const startCreate = () => {
    setEditingContent(null);
    setTitle('Novo conteúdo');
    setDraftSources([]);
    setActiveSourceType('text');
    setPendingSourceText('');
    setPendingSourceLinks('');
    setPendingPdfFiles([]);
    setSelectedProjectIds([]);
    setError(null);
    setStatus('Ready');
    setScreen('form');
  };

  const startEdit = (item: ContentItem) => {
    setEditingContent(item);
    setTitle(item.title);
    const sources = deriveSourcesFromItem(item);
    setDraftSources(sources);
    setActiveSourceType('text');
    setPendingSourceText('');
    setPendingSourceLinks('');
    setPendingPdfFiles([]);
    setSelectedProjectIds(getItemProjectIds(item));
    setError(null);
    setStatus('Ready');
    setScreen('form');
  };

  const renameContentTitle = async () => {
    if (!contentToRename) return;
    const nextTitle = renameTitle.trim();
    const originalTitle = contentToRename.title;
    const itemId = contentToRename.id;
    if (!nextTitle || nextTitle === originalTitle) {
      setContentToRename(null);
      setRenameTitle('');
      return;
    }
    setOpenMenuId(null);
    setBusy(true);
    setError(null);
    try {
      await apiPatch<ContentItem>(`/content-items/${itemId}`, { title: nextTitle });
      setStatus('Title updated.');
      setContentToRename(null);
      setRenameTitle('');
      await loadContentList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update title.');
    } finally {
      setBusy(false);
    }
  };

  const openRenameDialog = (item: ContentItem) => {
    setOpenMenuId(null);
    setContentToRename(item);
    setRenameTitle(item.title);
  };

  const requestDeleteContent = (item: ContentItem) => {
    setOpenMenuId(null);
    if (hasStartedDeliverableProduction(item)) {
      setError(
        'This content cannot be deleted because it is already being used in deliverable creation. Open the content to see which projects are using it.'
      );
      return;
    }
    setContentToDelete(item);
  };

  const confirmDeleteContent = async () => {
    if (!contentToDelete) return;
    setBusy(true);
    setError(null);
    try {
      await apiDelete<{ ok: true }>(`/content-items/${contentToDelete.id}`);
      setStatus('Content deleted.');
      if (editingContent?.id === contentToDelete.id) {
        setEditingContent(null);
        setScreen('list');
      }
      setContentToDelete(null);
      await loadContentList();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete content.';
      if (message === 'Not Found' || message.includes('DELETE /content-items/') || message.toLowerCase() === 'not found') {
        setError('Delete content is not available in the current runtime yet. Restart the desktop app and try again.');
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  };

  const filteredContents = contents.filter((item) => {
    const nameMatch = item.title.toLowerCase().includes(nameFilter.trim().toLowerCase());
    const projectMatch = !projectFilter || getItemProjectIds(item).includes(projectFilter);
    const destinationMatch = !destinationFilter || getContentDestinations(item).includes(destinationFilter);
    const createdAt = item.createdAt ? new Date(item.createdAt) : null;
    const from = dateFromFilter ? new Date(`${dateFromFilter}T00:00:00`) : null;
    const to = dateToFilter ? new Date(`${dateToFilter}T23:59:59`) : null;
    const fromMatch = !from || (createdAt !== null && createdAt >= from);
    const toMatch = !to || (createdAt !== null && createdAt <= to);
    return nameMatch && projectMatch && destinationMatch && fromMatch && toMatch;
  });

  const destinationOptions = Array.from(
    new Set([
      ...DESTINATIONS.map((destination) => destination.value),
      ...projects.flatMap(getProjectDestinations),
      ...contents.flatMap(getContentDestinations)
    ])
  ).sort((a, b) => formatDestination(a).localeCompare(formatDestination(b)));

  const renderDestinationBadges = (item: ContentItem) => {
    const destinations = getContentDestinations(item);
    if (destinations.length === 0) {
      return (
        <span className="inline-flex h-6 items-center rounded-[4px] border border-border px-2 text-[10px] font-bold uppercase text-muted-foreground">
          No destination
        </span>
      );
    }

    return (
      <>
        {destinations.slice(0, 3).map((destination) => (
          <span
            key={destination}
            title={formatDestination(destination)}
            className="inline-flex h-6 max-w-[150px] items-center rounded-[4px] bg-secondary px-2 text-[10px] font-bold uppercase text-secondary-foreground"
          >
            <span className="truncate">{formatDestination(destination)}</span>
          </span>
        ))}
        {destinations.length > 3 && (
          <span className="inline-flex h-6 items-center rounded-[4px] border border-border px-2 text-[10px] font-bold text-muted-foreground">
            +{destinations.length - 3}
          </span>
        )}
      </>
    );
  };

  const renderContentMenu = (item: ContentItem) => (
    <div className="relative">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpenMenuId((current) => (current === item.id ? null : item.id));
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-[5px] border border-border bg-background text-muted-foreground transition-colors hover:text-orange-600"
        title="More actions"
      >
        <MoreVertical size={16} />
      </button>
      {openMenuId === item.id ? (
        <div
          className="absolute right-0 top-10 z-20 min-w-[180px] rounded-[5px] border border-border bg-popover p-1 shadow-xl"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => openRenameDialog(item)}
            className="flex h-9 w-full items-center gap-2 rounded-[4px] px-3 text-sm text-foreground transition-colors hover:bg-muted"
          >
            <Pencil size={14} />
            Edit title
          </button>
          <button
            type="button"
            onClick={() => requestDeleteContent(item)}
            className="flex h-9 w-full items-center gap-2 rounded-[4px] px-3 text-sm text-red-500 transition-colors hover:bg-muted"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );

  const renderContentCard = (item: ContentItem) => {
    const contentStatus = getContentPreparationStatus(item);
    const projectCount = item.projectIds.length;
    return (
      <article
        key={item.id}
        onClick={() => startEdit(item)}
        className="cursor-pointer overflow-hidden transition-all group flex flex-col rounded-[6px] border border-border/70 bg-card shadow-[0_2px_8px_-4px_rgba(15,23,42,0.18)] hover:-translate-y-0.5 hover:shadow-[0_12px_26px_-14px_rgba(15,23,42,0.36)]"
      >
        <div className="flex h-full flex-1 flex-col p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="inline-flex items-center justify-center rounded-[5px] bg-muted px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              {contentStatus}
            </div>
            {renderContentMenu(item)}
          </div>
          <h3 className="min-h-[3.5rem] overflow-hidden text-base font-bold leading-tight line-clamp-2 break-words">
            {item.title}
          </h3>
          <div className="mt-3 flex min-h-6 flex-wrap content-start gap-1.5">
            {renderDestinationBadges(item)}
          </div>
          <div className="mt-auto pt-4 space-y-2 text-[11px] font-bold uppercase tracking-tight text-muted-foreground">
            <div>{formatDate(item.createdAt)}</div>
            <div title={(item.projectNames ?? []).join(', ') || undefined}>
              {projectCount === 1 ? '1 associated project' : `${projectCount} associated projects`}
            </div>
          </div>
        </div>
      </article>
    );
  };

  const renderContentRow = (item: ContentItem) => {
    const contentStatus = getContentPreparationStatus(item);
    const projectCount = item.projectIds.length;
    return (
      <div
        key={item.id}
        onClick={() => startEdit(item)}
        className="grid cursor-pointer grid-cols-[minmax(220px,1fr)_160px_190px_120px_80px] gap-4 items-center border border-border rounded-[5px] bg-card px-4 py-3"
      >
        <div className="min-w-0">
          <h3 className="font-bold truncate">{item.title}</h3>
        </div>
        <div className="text-xs text-muted-foreground truncate" title={(item.projectNames ?? []).join(', ') || undefined}>
          {projectCount === 1 ? '1 associated project' : `${projectCount} associated projects`}
        </div>
        <div className="flex min-w-0 flex-wrap gap-1.5">{renderDestinationBadges(item)}</div>
        <div className="text-xs font-bold uppercase text-muted-foreground">{contentStatus}</div>
        <div className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</div>
        <div className="flex justify-end">{renderContentMenu(item)}</div>
      </div>
    );
  };

  const renderList = () => (
    <div className="h-full overflow-y-auto custom-scrollbar bg-background text-foreground">
      <div className="p-8 max-w-7xl mx-auto pb-24">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">Content</h2>
            <p className="text-sm text-muted-foreground mt-1 font-medium">Manage reusable source content.</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => loadContentList()}
              className="h-9 w-9 rounded-[5px] border border-border bg-card text-slate-400 hover:text-orange-600 inline-flex items-center justify-center transition-colors"
              title="Refresh content"
            >
              <RefreshCw size={16} />
            </button>
            <button
              type="button"
              onClick={startCreate}
              className="h-9 px-4 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-[5px] inline-flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <Plus size={16} />
              New Content
            </button>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 lg:grid-cols-[1fr_180px_180px_160px_160px_auto] gap-3 bg-card p-3 rounded-[5px] border border-border">
          <input
            value={nameFilter}
            onChange={(event) => setNameFilter(event.target.value)}
            className="h-9 rounded-[5px] border border-[hsl(var(--editor-input-border))] bg-[hsl(var(--editor-input))] px-3 text-sm"
            placeholder="Filter by name"
          />
          <select
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
            className="h-9 rounded-[5px] border border-[hsl(var(--editor-input-border))] bg-[hsl(var(--editor-input))] px-3 text-sm"
          >
            <option value="">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <select
            value={destinationFilter}
            onChange={(event) => setDestinationFilter(event.target.value)}
            className="h-9 rounded-[5px] border border-[hsl(var(--editor-input-border))] bg-[hsl(var(--editor-input))] px-3 text-sm"
          >
            <option value="">All destinations</option>
            {destinationOptions.map((destination) => (
              <option key={destination} value={destination}>
                {formatDestination(destination)}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dateFromFilter}
            onChange={(event) => setDateFromFilter(event.target.value)}
            className="h-9 rounded-[5px] border border-[hsl(var(--editor-input-border))] bg-[hsl(var(--editor-input))] px-3 text-sm"
          />
          <input
            type="date"
            value={dateToFilter}
            onChange={(event) => setDateToFilter(event.target.value)}
            className="h-9 rounded-[5px] border border-[hsl(var(--editor-input-border))] bg-[hsl(var(--editor-input))] px-3 text-sm"
          />
          <div className="flex items-center gap-1 border border-border rounded-[5px] bg-background p-1">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`h-7 w-8 rounded-[3px] inline-flex items-center justify-center ${viewMode === 'grid' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-orange-600'}`}
              title="Grid view"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`h-7 w-8 rounded-[3px] inline-flex items-center justify-center ${viewMode === 'list' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-orange-600'}`}
              title="List view"
            >
              <List size={16} />
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-[5px] border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-200">
            {error}
          </div>
        )}

        {contents.length === 0 ? (
          <div className="border border-dashed border-border rounded-[5px] bg-card p-8 text-center">
            <FileText size={34} className="mx-auto text-slate-400 mb-3" />
            <h3 className="font-bold text-slate-800 dark:text-white">No content yet</h3>
            <p className="text-sm text-muted-foreground mt-1">Create the first content after you have at least one project.</p>
            <button
              type="button"
              onClick={startCreate}
              className="mt-5 h-9 px-4 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-[5px] inline-flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <Plus size={16} />
              New Content
            </button>
          </div>
        ) : filteredContents.length === 0 ? (
          <div className="border border-dashed border-border rounded-[5px] bg-card p-8 text-center text-sm text-muted-foreground">
            No content matches the current filters.
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredContents.map(renderContentCard)}
          </div>
        ) : (
          <div className="space-y-3 overflow-x-auto">
            <div className="min-w-[920px] space-y-3">
              {filteredContents.map(renderContentRow)}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderSharedDialogs = () => (
    <>
      <ConfirmDialog
        open={Boolean(contentToDelete)}
        title="Delete content"
        description="This content will be removed permanently if it has not started deliverable creation."
        confirmLabel="Delete"
        onCancel={() => setContentToDelete(null)}
        onConfirm={() => void confirmDeleteContent()}
      />
      {contentToRename ? (
        <div className="fixed inset-0 z-[121] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => {
              setContentToRename(null);
              setRenameTitle('');
            }}
          />
          <div className="relative z-10 w-full max-w-md rounded-[5px] bg-background border border-border shadow-xl p-5 space-y-4">
            <div className="space-y-1">
              <h4 className="text-base font-bold">Edit title</h4>
            </div>
            <input
              autoFocus
              value={renameTitle}
              onChange={(event) => setRenameTitle(event.target.value)}
              className="w-full border rounded-[5px] h-10 px-3 bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-foreground"
              placeholder="Title"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setContentToRename(null);
                  setRenameTitle('');
                }}
                className="h-9 px-3 rounded-[5px] border border-border text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void renameContentTitle()}
                className="h-9 px-3 rounded-[5px] bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );

  if (screen === 'list') {
    return (
      <>
        {renderList()}
        {renderSharedDialogs()}
      </>
    );
  }

  return (
    <>
      <div className="h-full overflow-y-auto custom-scrollbar bg-background text-foreground">
        <div className="p-8 max-w-[1600px] mx-auto pb-24">
          <div className="flex items-center justify-between mb-8">
            <button
              type="button"
              onClick={() => setScreen('list')}
              className="flex items-center gap-2 text-slate-500 hover:text-orange-600 font-bold text-xs uppercase tracking-widest transition-colors h-9"
            >
              <ArrowLeft size={16} />
              Back to list
            </button>
            {editingContent ? (
              <button
                type="button"
                onClick={() => requestDeleteContent(editingContent)}
                className="h-9 px-4 rounded-[5px] border border-border text-sm font-semibold text-red-500 hover:bg-red-500/10 inline-flex items-center justify-center gap-2 transition-colors"
              >
                <Trash2 size={14} />
                Delete content
              </button>
            ) : null}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void saveContent();
            }}
            className="space-y-6"
          >
          <section className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white">
                {editingContent ? 'Edit Content' : 'Create Content'}
              </h2>
            </div>

            {error && (
              <div className="border border-destructive/30 bg-destructive/10 text-destructive rounded-[5px] px-4 py-3 text-sm">
                {error}
              </div>
            )}
            {status !== 'Ready' && <div className="text-xs text-muted-foreground">{status}</div>}

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Title</label>
              <input
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={Boolean(editingContent && hasStartedDeliverableProduction(editingContent))}
                className="w-full border rounded-[5px] h-10 px-3 bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-foreground"
                placeholder="Ex.: Como planejar uma campanha"
              />
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)_340px]">
          <section className="rounded-[6px] border border-border bg-card p-4 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-white">Sources</h2>
              <p className="mt-1 text-sm text-muted-foreground">Adicione uma ou muitas fontes para este conteúdo.</p>
            </div>

            <div className="grid gap-2">
              {SOURCE_TYPE_OPTIONS.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setActiveSourceType(value)}
                  className={`rounded-[6px] border px-3 py-3 text-left transition-colors ${
                    activeSourceType === value
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-background hover:border-primary/40'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon size={16} className="text-orange-500" />
                    <span className="font-semibold">{label}</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="border-t border-border pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">Sources <span className="text-muted-foreground">({draftSources.length})</span></h3>
              </div>
              {draftSources.length > 0 ? (
                <div
                  className={`space-y-2 ${
                    draftSources.length > VISIBLE_LIST_ITEM_LIMIT ? `${VISIBLE_LIST_MAX_HEIGHT_CLASS} overflow-y-auto pr-1 custom-scrollbar` : ''
                  }`}
                >
                  {draftSources.map((source) => (
                    <article key={source.id} className="rounded-[6px] border border-border px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold truncate">{source.label}</span>
                            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                              {source.type === 'youtube_url' ? 'YouTube' : source.type === 'pdf' ? 'PDF' : 'Text'}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                            {source.type === 'pdf'
                              ? (source.fileNames ?? []).join(', ')
                              : source.value}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeDraftSource(source.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-[5px] border border-border text-muted-foreground hover:text-destructive"
                          title="Remove source"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-xs font-semibold">
                        {source.status === 'raw_text_ready' ? (
                          <>
                            <CheckCircle2 size={14} className="text-emerald-400" />
                            <span className="text-emerald-300">Ready</span>
                          </>
                        ) : (
                          <>
                            <Clock3 size={14} className="text-amber-400" />
                            <span className="text-amber-300">Preparing</span>
                          </>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="px-3 py-10 text-center text-sm text-muted-foreground">
                  <FileText size={28} className="mx-auto mb-3 text-muted-foreground/70" />
                  <div className="font-semibold text-foreground/80">As fontes salvas vão aparecer aqui</div>
                  <p className="mt-2 max-w-[240px] mx-auto leading-relaxed">
                    Adicione texto, links do YouTube ou arquivos PDF para montar este conteúdo.
                  </p>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-[6px] border border-border bg-card p-6">
            <div className="space-y-6">
                <div>
                  <h3 className="font-semibold">
                    {SOURCE_TYPE_OPTIONS.find((option) => option.value === activeSourceType)?.label}
                  </h3>
                </div>

                {activeSourceType === 'text' ? (
                    <textarea
                      value={pendingSourceText}
                      onChange={(event) => setPendingSourceText(event.target.value)}
                      rows={10}
                      className="w-full border rounded-[5px] px-3 py-2 bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-foreground"
                      placeholder={editingContent ? TEXT_SOURCE_PLACEHOLDER : 'Cole o texto bruto que deve virar fonte deste conteúdo.'}
                    />
                ) : null}

                {activeSourceType === 'youtube_url' ? (
                  <div className="space-y-3">
                    <textarea
                      value={pendingSourceLinks}
                      onChange={(event) => setPendingSourceLinks(event.target.value)}
                      rows={8}
                      className="w-full border rounded-[5px] px-3 py-2 bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-foreground"
                      placeholder="Cole um ou muitos links do YouTube."
                    />
                    {pendingSourceLinks.trim().length > 0 ? (
                      <div className="rounded-[6px] border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                        {parsedYouTubeEntries.length} link{parsedYouTubeEntries.length === 1 ? '' : 's'} inserido{parsedYouTubeEntries.length === 1 ? '' : 's'} • {uniqueYouTubeEntries.length} único{uniqueYouTubeEntries.length === 1 ? '' : 's'}
                        {duplicateYouTubeCount > 0 ? ` • ${duplicateYouTubeCount} duplicado${duplicateYouTubeCount === 1 ? '' : 's'}` : ''}
                      </div>
                    ) : null}
                    {pendingSourceLinks.trim().length > 0 && invalidYouTubeLinks.length > 0 ? (
                      <div className="rounded-[6px] border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        Há link inválido. O botão só habilita com URLs válidas do YouTube.
                      </div>
                    ) : null}
                    {pendingSourceLinks.trim().length > 0 && invalidYouTubeLinks.length === 0 && uniqueYouTubeEntries.length > 0 && uniqueYouTubeEntries.every((entry) => entry.videoId && existingYouTubeVideoIds.has(entry.videoId)) ? (
                      <div className="rounded-[6px] border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                        Todos os links únicos colados já foram adicionados a este conteúdo.
                      </div>
                    ) : null}
                    <div className="rounded-[6px] border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
                      <ul className="space-y-1.5">
                        <li>Para adicionar vários URLs, separe cada um com um espaço ou uma nova linha.</li>
                        <li>No momento, apenas a transcrição de texto do YouTube será importada.</li>
                        <li>Somente vídeos públicos do YouTube são aceitos.</li>
                        <li>Vídeos enviados recentemente podem não estar disponíveis para importação.</li>
                      </ul>
                    </div>
                  </div>
                ) : null}

                {activeSourceType === 'pdf' ? (
                  <div className="space-y-3">
                    <input
                      ref={pdfInputRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      multiple
                      onChange={(event) => setPendingPdfFiles(Array.from(event.target.files ?? []))}
                      className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-[5px] file:border-0 file:bg-orange-600 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white hover:file:bg-orange-700"
                    />
                    <div className="rounded-[6px] border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                      {pendingPdfFiles.length > 0
                        ? `${pendingPdfFiles.length} PDF file(s) selected.`
                        : 'Selecione um ou muitos PDFs para registrar como fontes deste conteúdo.'}
                    </div>
                  </div>
                ) : null}

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={addDraftSource}
                    disabled={!canAddSource}
                    className="h-9 shrink-0 whitespace-nowrap px-4 bg-orange-600 hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50 text-white font-bold rounded-[5px] inline-flex items-center justify-center gap-2 transition-all active:scale-95"
                  >
                    <Plus size={16} />
                    Add source
                  </button>
                </div>
            </div>
          </section>

          <section className="rounded-[6px] border border-border bg-card p-4 space-y-4 h-fit">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">Projects</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Associe este conteúdo aos projetos que poderão usá-lo.
                </p>
              </div>
              <button
                type="button"
                onClick={() => loadProjects()}
                title="Refresh projects"
                className="h-8 w-8 rounded-[5px] border border-[hsl(var(--editor-input-border))] bg-[hsl(var(--editor-input))] text-slate-400 hover:text-orange-600 inline-flex items-center justify-center transition-colors"
              >
                <RefreshCw size={14} />
              </button>
            </div>

            <div className="rounded-[6px] border border-border px-3 py-3 text-sm">
              <span className="font-semibold text-foreground">{selectedProjectIds.length}</span>{' '}
              <span className="text-muted-foreground">selected</span>
            </div>

            <div
              className={`space-y-2 ${
                projects.length > VISIBLE_LIST_ITEM_LIMIT ? `${VISIBLE_LIST_MAX_HEIGHT_CLASS} overflow-y-auto pr-1 custom-scrollbar` : ''
              }`}
            >
              {projects.map((project) => (
                <label
                  key={project.id}
                  className="min-h-10 rounded-[5px] border border-[hsl(var(--editor-input-border))] bg-[hsl(var(--editor-input))] px-3 py-2 text-sm text-foreground flex items-center gap-2"
                >
                  <input
                    type="checkbox"
                    checked={selectedProjectIds.includes(project.id)}
                    onChange={() => toggleSelectedProject(project.id)}
                    className="h-4 w-4 accent-orange-600"
                  />
                  <span className="min-w-0 truncate">{project.name}</span>
                </label>
              ))}
              {projects.length === 0 && (
                <p className="text-xs text-slate-500">No projects yet.</p>
              )}
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={busy}
                className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white font-bold rounded-[5px] flex items-center justify-center gap-3 transition-all active:scale-95 h-10"
              >
                <Plus size={18} />
                Save Content
              </button>
            </div>
          </section>

          </div>
          </form>
        </div>
      </div>
      {renderSharedDialogs()}
    </>
  );
}
