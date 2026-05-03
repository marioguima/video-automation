import React, { useEffect, useState } from 'react';
import { ArrowLeft, FileText, LayoutGrid, List, Pencil, Plus, RefreshCw } from 'lucide-react';
import { apiGet, apiPatch, apiPost } from '../lib/api';
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
    aiPrompt?: string;
    destinations?: string[];
    aspectRatios?: string[];
    productionStage?: string;
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

const DEFAULT_TEXT =
  'Cole uma ideia, pauta, briefing, pesquisa ou rascunho.';

const PRE_PRODUCTION_STAGES = new Set(['idea', 'script', 'draft']);
const DEFAULT_PROJECT_ASPECT_RATIOS = ['16:9', '9:16'];

function getContentStage(item: ContentItem): string {
  return item.metadata?.productionStage ?? item.status ?? 'script';
}

function hasStartedDeliverableProduction(item: ContentItem): boolean {
  return !PRE_PRODUCTION_STAGES.has(getContentStage(item));
}

function canEditContent(item: ContentItem): boolean {
  return !hasStartedDeliverableProduction(item);
}

function formatDate(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
}

function getUsageLabel(item: ContentItem): string {
  const count = item.projectIds.length;
  if (count === 0) return 'No project';
  return count === 1 ? 'Used in 1 project' : `Used in ${count} projects`;
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

export default function ContentQuickStart({ initialDraft, onInitialDraftConsumed }: ContentQuickStartProps) {
  const [screen, setScreen] = useState<'list' | 'form'>('list');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [projects, setProjects] = useState<Project[]>([]);
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [editingContent, setEditingContent] = useState<ContentItem | null>(null);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [title, setTitle] = useState('Novo conteúdo');
  const [sourceText, setSourceText] = useState(DEFAULT_TEXT);
  const [aiPrompt, setAiPrompt] = useState('');
  const [nameFilter, setNameFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [destinationFilter, setDestinationFilter] = useState('');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Ready');

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
    if (!initialDraft) return;
    setEditingContent(null);
    setTitle(initialDraft.title?.trim() || 'Novo conteúdo');
    setSourceText(initialDraft.sourceText);
    setAiPrompt('');
    setError(null);
    setStatus('Ready');
    setScreen('form');
    onInitialDraftConsumed?.();
  }, [initialDraft?.nonce]);

  const toggleSelectedProject = (projectId: string) => {
    setSelectedProjectIds((current) =>
      current.includes(projectId) ? current.filter((id) => id !== projectId) : [...current, projectId]
    );
  };

  const saveContent = async () => {
    if (!title.trim()) {
      setError('Content title is required.');
      return;
    }
    if (!sourceText.trim()) {
      setError('Content text is required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (editingContent) {
        const editable = canEditContent(editingContent);
        await apiPatch<ContentItem>(
          `/content-items/${editingContent.id}`,
          editable
            ? {
                title,
                sourceText,
                projectIds: selectedProjectIds,
                metadata: {
                  aiPrompt: aiPrompt.trim() || undefined
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
          status: 'script',
          metadata: {
            source: 'content_production',
            productionStage: 'script',
            destinations: destinations.length > 0 ? destinations : undefined,
            aspectRatios: aspectRatios.length > 0 ? aspectRatios : undefined,
            aiPrompt: aiPrompt.trim() || undefined
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
    setSourceText(DEFAULT_TEXT);
    setAiPrompt('');
    setSelectedProjectIds([]);
    setError(null);
    setStatus('Ready');
    setScreen('form');
  };

  const startEdit = (item: ContentItem) => {
    setEditingContent(item);
    setTitle(item.title);
    setSourceText(item.sourceText ?? '');
    setAiPrompt(typeof item.metadata?.aiPrompt === 'string' ? item.metadata.aiPrompt : '');
    setSelectedProjectIds(getItemProjectIds(item));
    setError(null);
    setStatus('Ready');
    setScreen('form');
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

  const renderContentCard = (item: ContentItem) => {
    const stage = getContentStage(item);
    const editable = canEditContent(item);
    return (
      <article
        key={item.id}
        className="overflow-hidden transition-all group flex flex-col rounded-[6px] border border-border/70 bg-card shadow-[0_2px_8px_-4px_rgba(15,23,42,0.18)] hover:-translate-y-0.5 hover:shadow-[0_12px_26px_-14px_rgba(15,23,42,0.36)]"
      >
        <div className="relative aspect-video overflow-hidden text-left bg-slate-100 dark:bg-slate-800">
          <div className="absolute inset-0 flex items-center justify-center">
            <FileText size={42} className="text-slate-400" />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
          <span className="absolute left-3 top-3 inline-flex items-center justify-center rounded-[5px] bg-black/80 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
            {stage}
          </span>
        </div>

        <div className="p-4 flex-1">
          <h3 className="min-h-[2.5rem] overflow-hidden text-base font-bold leading-tight line-clamp-2 break-words">
            {item.title}
          </h3>
          <p className="mt-2 text-xs text-muted-foreground line-clamp-3">
            {item.sourceText || 'No source text.'}
          </p>
          <div className="mt-3 flex min-h-6 flex-wrap gap-1.5">
            {renderDestinationBadges(item)}
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="min-w-0 text-[10px] font-bold uppercase tracking-tight text-muted-foreground">
              <span>{formatDate(item.createdAt)}</span>
              <span className="mx-2">•</span>
              <span title={(item.projectNames ?? []).join(', ') || undefined}>{getUsageLabel(item)}</span>
            </div>
            <button
              type="button"
              onClick={() => startEdit(item)}
              className="h-8 px-3 rounded-[5px] border border-border text-xs font-bold text-muted-foreground hover:text-orange-600 inline-flex items-center gap-2"
            >
              <Pencil size={14} />
              {editable ? 'Edit' : 'View'}
            </button>
          </div>
        </div>
      </article>
    );
  };

  const renderContentRow = (item: ContentItem) => {
    const stage = getContentStage(item);
    const editable = canEditContent(item);
    return (
      <div key={item.id} className="grid grid-cols-[minmax(220px,1fr)_130px_170px_100px_120px_90px] gap-4 items-center border border-border rounded-[5px] bg-card px-4 py-3">
        <div className="min-w-0">
          <h3 className="font-bold truncate">{item.title}</h3>
          <p className="text-xs text-muted-foreground truncate mt-1">{item.sourceText || 'No source text.'}</p>
        </div>
        <div className="text-xs text-muted-foreground truncate" title={(item.projectNames ?? []).join(', ') || undefined}>{getUsageLabel(item)}</div>
        <div className="flex min-w-0 flex-wrap gap-1.5">{renderDestinationBadges(item)}</div>
        <div className="text-xs font-bold uppercase text-muted-foreground">{stage}</div>
        <div className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</div>
        <button
          type="button"
          onClick={() => startEdit(item)}
          className="h-8 rounded-[5px] border border-border text-xs font-bold text-muted-foreground hover:text-orange-600 inline-flex items-center justify-center gap-2"
        >
          <Pencil size={14} />
          {editable ? 'Edit' : 'View'}
        </button>
      </div>
    );
  };

  const renderList = () => (
    <div className="h-full overflow-y-auto custom-scrollbar">
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

  if (screen === 'list') return renderList();

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="p-8 max-w-4xl mx-auto pb-24">
        <div className="flex items-center justify-between mb-8">
          <button
            type="button"
            onClick={() => setScreen('list')}
            className="flex items-center gap-2 text-slate-500 hover:text-orange-600 font-bold text-xs uppercase tracking-widest transition-colors h-9"
          >
            <ArrowLeft size={16} />
            Back to list
          </button>
        </div>

        <div className="bg-card rounded-[5px] border border-border overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-[hsl(var(--secondary))]/60">
            <h2 className="text-xl font-bold text-slate-800 dark:text-white">{editingContent ? 'Edit Content' : 'Create Content'}</h2>
            <p className="text-sm text-slate-500 mt-1">
              {editingContent && !canEditContent(editingContent)
                ? 'This content already started deliverable production and source editing is locked in V1.'
                : 'Draft reusable source content.'}
            </p>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void saveContent();
            }}
            className="p-8 grid grid-cols-1 md:grid-cols-2 gap-5"
          >
            {error && (
              <div className="md:col-span-2 border border-destructive/30 bg-destructive/10 text-destructive rounded-[5px] px-4 py-3 text-sm">
                {error}
              </div>
            )}
            {status !== 'Ready' && <div className="md:col-span-2 text-xs text-muted-foreground">{status}</div>}

            <div className="space-y-2 md:col-span-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Content Title</label>
              <input
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={Boolean(editingContent && !canEditContent(editingContent))}
                className="w-full border rounded-[5px] h-9 px-3 bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-foreground"
                placeholder="Ex.: Como planejar uma campanha"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Content</label>
              <textarea
                required
                value={sourceText}
                onChange={(event) => setSourceText(event.target.value)}
                disabled={Boolean(editingContent && !canEditContent(editingContent))}
                rows={10}
                className="w-full border rounded-[5px] px-3 py-2 bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-foreground"
                placeholder="Idea, notes, source text or script."
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">AI Prompt</label>
              <textarea
                value={aiPrompt}
                onChange={(event) => setAiPrompt(event.target.value)}
                disabled={Boolean(editingContent && !canEditContent(editingContent))}
                rows={3}
                className="w-full border rounded-[5px] px-3 py-2 bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-foreground"
                placeholder="Optional instruction for the selected LLM."
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Projects</label>
                <button
                  type="button"
                  onClick={() => loadProjects()}
                  title="Refresh projects"
                  className="h-8 w-8 rounded-[5px] border border-[hsl(var(--editor-input-border))] bg-[hsl(var(--editor-input))] text-slate-400 hover:text-orange-600 inline-flex items-center justify-center transition-colors"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {projects.map((project) => (
                  <label
                    key={project.id}
                    className="min-h-9 rounded-[5px] border border-[hsl(var(--editor-input-border))] bg-[hsl(var(--editor-input))] px-3 py-2 text-sm text-foreground flex items-center gap-2"
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
              </div>
              {projects.length === 0 && (
                <p className="text-xs text-slate-500">No projects yet.</p>
              )}
            </div>

            <div className="md:col-span-2 pt-3 flex flex-col sm:flex-row gap-4">
              <button
                type="submit"
                disabled={busy}
                className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white font-bold rounded-[5px] flex items-center justify-center gap-3 transition-all active:scale-95 h-9"
              >
                <Plus size={18} />
                Save Content
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
