
import React, { useState, useEffect } from 'react';
import { 
  ChevronLeft, 
  Layers,
  AudioLines,
  ImageIcon,
  CirclePlay,
  Clock, 
  CheckCircle2, 
  MoreVertical, 
  Pencil, 
  Plus,
  Trash2,
  ChevronDown,
  GripVertical,
  Maximize2,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { ViewType, Course, LessonBlock, Module } from '../types';
import { API_BASE } from '../lib/api';
import ConfirmDialog from './ui/confirm-dialog';

interface CourseModulesProps {
  course: Course | null;
  modules: Module[];
  error?: string | null;
  setModules: (modules: Module[]) => void;
  onPersistReorder?: (modules: Module[]) => Promise<void>;
  setView: (view: ViewType) => void;
  onEditLesson: (lesson: LessonBlock) => void;
  onSelectLesson: (lesson: LessonBlock) => void;
  onAddLesson?: (moduleId: string) => void;
  onEditModule?: (module: Module) => void;
  onAddModuleContainer?: () => void;
  onImageClick?: (url: string) => void;
  onEditCourse?: (course: Course) => void;
  onDeleteCourse?: (courseId: string) => void;
  onDeleteModule?: (moduleId: string) => void;
  onDeleteLesson?: (lessonId: string) => void;
  onStartCourseGeneration?: (action: 'blocks' | 'audio' | 'images') => void;
  onCancelCourseGeneration?: (action: 'blocks' | 'audio' | 'images') => void;
  onStartModuleGeneration?: (moduleId: string, action: 'blocks' | 'audio' | 'images') => void;
  onCancelModuleGeneration?: (moduleId: string, action: 'blocks' | 'audio' | 'images') => void;
  onStartLessonGeneration?: (lessonId: string, action: 'blocks' | 'audio' | 'images') => void;
  onCancelLessonGeneration?: (lessonId: string, action: 'blocks' | 'audio' | 'images') => void;
  navigationTarget?: { type: 'top' | 'module'; moduleId?: string; nonce: number } | null;
}

const CourseModules: React.FC<CourseModulesProps> = ({ 
  course, 
  modules, 
  error,
  setModules, 
  onPersistReorder,
  setView, 
  onEditLesson, 
  onSelectLesson,
  onAddLesson,
  onEditModule,
  onAddModuleContainer,
  onImageClick,
  onEditCourse,
  onDeleteCourse,
  onDeleteModule,
  onDeleteLesson,
  onStartCourseGeneration,
  onCancelCourseGeneration,
  onStartModuleGeneration,
  onCancelModuleGeneration,
  onStartLessonGeneration,
  onCancelLessonGeneration,
  navigationTarget
}) => {
  const formatDurationLabel = (durationSeconds: number): string => {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return '--:--:--';
    }
    const totalSeconds = Math.max(0, Math.round(durationSeconds));
    const hours = Math.floor(totalSeconds / 3600)
      .toString()
      .padStart(2, '0');
    const minutes = Math.floor((totalSeconds % 3600) / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };

  const emptyJobs = React.useMemo(
    () => ({
      blocks: { pending: 0, running: 0 },
      audio: { pending: 0, running: 0 },
      images: { pending: 0, running: 0 },
      video: { pending: 0, running: 0 }
    }),
    []
  );
  const hasAnyRunningOrPending = (jobs?: typeof emptyJobs) =>
    Boolean(
      (jobs?.blocks.pending ?? 0) + (jobs?.blocks.running ?? 0) +
        (jobs?.audio.pending ?? 0) + (jobs?.audio.running ?? 0) +
        (jobs?.images.pending ?? 0) + (jobs?.images.running ?? 0) +
        (jobs?.video.pending ?? 0) + (jobs?.video.running ?? 0) >
        0
    );
  const hasAnyRunning = (jobs?: typeof emptyJobs) =>
    Boolean(
      (jobs?.blocks.running ?? 0) +
        (jobs?.audio.running ?? 0) +
        (jobs?.images.running ?? 0) +
        (jobs?.video.running ?? 0) >
        0
    );
  const hasInvalidatingGeneration = (jobs?: typeof emptyJobs) =>
    Boolean(
      (jobs?.blocks.pending ?? 0) + (jobs?.blocks.running ?? 0) +
        (jobs?.audio.pending ?? 0) + (jobs?.audio.running ?? 0) +
        (jobs?.images.pending ?? 0) + (jobs?.images.running ?? 0) >
        0
    );
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
  const [draggedLesson, setDraggedLesson] = useState<{ moduleId: string, lessonIndex: number } | null>(null);
  const [draggedModuleIndex, setDraggedModuleIndex] = useState<number | null>(null);
  const [isSavingReorder, setIsSavingReorder] = useState(false);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [openContextMenu, setOpenContextMenu] = useState<{ scope: 'module' | 'lesson'; id: string } | null>(null);
  const [isDeleteCourseConfirmOpen, setIsDeleteCourseConfirmOpen] = useState(false);
  const [pendingCancelAction, setPendingCancelAction] = useState<{
    scope: 'course';
    id: string;
    action: 'blocks' | 'audio' | 'images';
  } | null>(null);
  const [pendingDeleteAction, setPendingDeleteAction] = useState<{
    scope: 'module' | 'lesson';
    id: string;
  } | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const moduleRefs = React.useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (modules.length === 0) return;
    setExpandedModules(
      modules.reduce<Record<string, boolean>>((acc, module) => {
        acc[module.id] = true;
        return acc;
      }, {})
    );
  }, [modules]);

  useEffect(() => {
    if (!navigationTarget) return;
    if (navigationTarget.type === 'top') {
      rootRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const moduleId = navigationTarget.moduleId;
    if (!moduleId) return;
    setExpandedModules((prev) => ({ ...prev, [moduleId]: true }));
    const el = moduleRefs.current[moduleId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [navigationTarget]);

  if (!course) return null;

  const totalLessons = modules.reduce((acc, m) => acc + m.lessons.length, 0);
  const totalModules = modules.length;
  const totalBlocks = modules.reduce(
    (acc, moduleItem) => acc + moduleItem.lessons.reduce((sum, lesson) => sum + (lesson.build?.blocksTotal ?? 0), 0),
    0
  );
  const blocksReady = modules.reduce(
    (acc, moduleItem) => acc + moduleItem.lessons.reduce((sum, lesson) => sum + (lesson.build?.blocksReady ?? 0), 0),
    0
  );
  const audioReady = modules.reduce(
    (acc, moduleItem) => acc + moduleItem.lessons.reduce((sum, lesson) => sum + (lesson.build?.audioReady ?? 0), 0),
    0
  );
  const imagesReady = modules.reduce(
    (acc, moduleItem) => acc + moduleItem.lessons.reduce((sum, lesson) => sum + (lesson.build?.imagesReady ?? 0), 0),
    0
  );
  const totalAudioDurationSeconds = modules.reduce(
    (acc, moduleItem) =>
      acc +
      moduleItem.lessons.reduce(
        (sum, lesson) => sum + (typeof lesson.audioDurationSeconds === 'number' ? lesson.audioDurationSeconds : 0),
        0
      ),
    0
  );

  const computeGenerationState = (
    step: 'blocks' | 'audio' | 'images',
    ready: number,
    total: number
  ): 'idle' | 'waiting' | 'running' | 'done' => {
    const courseJobs = course.build?.jobs ?? emptyJobs;
    const running = courseJobs[step].running ?? 0;
    const pending = courseJobs[step].pending ?? 0;
    if (running > 0) return 'running';
    if (pending > 0) return 'waiting';
    if (total <= 0) return 'idle';
    if (ready >= total) return 'done';
    return 'idle';
  };

  const blocksState = computeGenerationState('blocks', blocksReady, totalBlocks);
  const audioState = computeGenerationState('audio', audioReady, totalBlocks);
  const imagesState = computeGenerationState('images', imagesReady, totalBlocks);

  const displayCurrent = (ready: number, total: number, state: 'idle' | 'waiting' | 'running' | 'done') => {
    if (total <= 0) return 0;
    if (state === 'done') return total;
    if (state === 'running' || state === 'waiting') return Math.min(total, Math.max(1, ready + 1));
    return Math.min(total, Math.max(0, ready));
  };

  const toggleModule = (id: string) => {
    setExpandedModules(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const cloneModules = (source: Module[]) =>
    source.map((module) => ({
      ...module,
      lessons: [...module.lessons]
    }));

  const onModuleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedModuleIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onModuleDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedModuleIndex === null || draggedModuleIndex === targetIndex) return;

    const previousModules = cloneModules(modules);
    const newModules = cloneModules(modules);
    const [removed] = newModules.splice(draggedModuleIndex, 1);
    newModules.splice(targetIndex, 0, removed);
    
    setModules(newModules);
    setDraggedModuleIndex(null);
    setReorderError(null);

    if (!onPersistReorder) return;

    try {
      setIsSavingReorder(true);
      await onPersistReorder(newModules);
    } catch (err) {
      console.error(err);
      setModules(previousModules);
      setReorderError('Could not save the new section order. Changes were reverted.');
    } finally {
      setIsSavingReorder(false);
    }
  };

  const onLessonDragStart = (e: React.DragEvent, moduleId: string, lessonIndex: number) => {
    e.stopPropagation();
    setDraggedLesson({ moduleId, lessonIndex });
    e.dataTransfer.effectAllowed = 'move';
  };

  const onLessonDrop = async (e: React.DragEvent, targetModuleId: string, targetLessonIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedLesson) return;

    const previousModules = cloneModules(modules);
    const newModules = cloneModules(modules);
    const sourceModuleIndex = newModules.findIndex(m => m.id === draggedLesson.moduleId);
    const targetModuleIndex = newModules.findIndex(m => m.id === targetModuleId);
    
    if (draggedLesson.moduleId === targetModuleId && draggedLesson.lessonIndex === targetLessonIndex) {
      setDraggedLesson(null);
      return;
    }

    const [removedLesson] = newModules[sourceModuleIndex].lessons.splice(draggedLesson.lessonIndex, 1);
    newModules[targetModuleIndex].lessons.splice(targetLessonIndex, 0, removedLesson);
    
    setModules(newModules);
    setDraggedLesson(null);
    setReorderError(null);

    if (!onPersistReorder) return;

    try {
      setIsSavingReorder(true);
      await onPersistReorder(newModules);
    } catch (err) {
      console.error(err);
      setModules(previousModules);
      setReorderError('Could not save the new video order. Changes were reverted.');
    } finally {
      setIsSavingReorder(false);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const courseActions = [
    {
      key: 'blocks',
      label: 'Generate Blocks',
      runningLabel: 'Generating blocks...',
      waitingLabel: 'Queued blocks...',
      icon: Layers,
      state: blocksState,
      current: displayCurrent(blocksReady, totalBlocks, blocksState),
      total: totalBlocks
    },
    {
      key: 'audio',
      label: 'Generate Audios',
      runningLabel: 'Generating audios...',
      waitingLabel: 'Queued audios...',
      icon: AudioLines,
      state: audioState,
      current: displayCurrent(audioReady, totalBlocks, audioState),
      total: totalBlocks
    },
    {
      key: 'images',
      label: 'Generate Images',
      runningLabel: 'Generating images...',
      waitingLabel: 'Queued images...',
      icon: ImageIcon,
      state: imagesState,
      current: displayCurrent(imagesReady, totalBlocks, imagesState),
      total: totalBlocks
    }
  ] as const;

  const renderContextMenu = (scope: 'module' | 'lesson', id: string) => {
    if (openContextMenu?.scope !== scope || openContextMenu?.id !== id) return null;
    const actionItems = [
      { id: 'blocks', icon: Layers, idleLabel: 'Generate blocks', waitingLabel: 'Preparing blocks...', runningLabel: 'Stop blocks' },
      { id: 'audio', icon: AudioLines, idleLabel: 'Generate audio', waitingLabel: 'Preparing audio...', runningLabel: 'Stop audio' },
      { id: 'images', icon: ImageIcon, idleLabel: 'Generate images', waitingLabel: 'Preparing images...', runningLabel: 'Stop images' }
    ] as const;
    const stepForAction: Record<'blocks' | 'audio' | 'images', 'blocks' | 'audio' | 'images'> = {
      blocks: 'blocks',
      audio: 'audio',
      images: 'images'
    };

    const resolveActionState = (action: 'blocks' | 'audio' | 'images'): 'idle' | 'waiting' | 'running' => {
      const stepKey = stepForAction[action];
      if (scope === 'lesson') {
        const lesson = modules.flatMap((moduleItem) => moduleItem.lessons).find((item) => item.id === id);
        const jobs = lesson?.build?.jobs ?? emptyJobs;
        if ((jobs[stepKey]?.running ?? 0) > 0) return 'running';
        if ((jobs[stepKey]?.pending ?? 0) > 0) return 'waiting';
        return 'idle';
      }
      const moduleItem = modules.find((item) => item.id === id);
      const jobs = moduleItem?.build?.jobs ?? emptyJobs;
      if ((jobs[stepKey]?.running ?? 0) > 0) return 'running';
      if ((jobs[stepKey]?.pending ?? 0) > 0) return 'waiting';
      return 'idle';
    };

    return (
      <div
        className="absolute right-0 top-[44px] z-30 w-[200px] rounded-[5px] border border-border bg-card shadow-2xl p-1.5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-0.5">
          {actionItems.map((item) => {
            const state = resolveActionState(item.id);
            const label =
              state === 'running' ? item.runningLabel : state === 'waiting' ? item.waitingLabel : item.idleLabel;
            const isDisabled = state === 'waiting';
            return (
              <button
                key={item.id}
                type="button"
                disabled={isDisabled}
                className={`w-full text-left px-2.5 py-2 rounded-[5px] transition-colors inline-flex items-center gap-2 ${
                  isDisabled ? 'opacity-70 cursor-default' : 'hover:bg-accent'
                }`}
                onClick={() => {
                  setOpenContextMenu(null);
                  if (state === 'running') {
                    if (scope === 'module') {
                      onCancelModuleGeneration?.(id, item.id);
                    } else {
                      onCancelLessonGeneration?.(id, item.id);
                    }
                    return;
                  }
                  if (state === 'idle') {
                    if (scope === 'module') {
                      onStartModuleGeneration?.(id, item.id);
                    } else {
                      onStartLessonGeneration?.(id, item.id);
                    }
                  }
                }}
              >
                {state === 'waiting' ? (
                  <Loader2 size={14} className="text-muted-foreground shrink-0 animate-spin" />
                ) : (
                  <item.icon size={14} className="text-muted-foreground shrink-0" />
                )}
                <span className="text-xs font-semibold text-foreground">{label}</span>
              </button>
            );
          })}
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            className="w-full text-left px-2.5 py-2 rounded-[5px] transition-colors hover:bg-accent inline-flex items-center gap-2"
            onClick={() => {
              setOpenContextMenu(null);
              setPendingDeleteAction({ scope, id });
            }}
          >
            <Trash2 size={14} className="text-muted-foreground shrink-0" />
            <span className="text-xs font-semibold text-foreground">Delete</span>
          </button>
        </div>
      </div>
    );
  };

  const confirmActionTitle = (() => {
    if (!pendingCancelAction) return '';
    const phase =
      pendingCancelAction.action === 'blocks'
        ? 'block generation'
        : pendingCancelAction.action === 'audio'
          ? 'audio generation'
          : 'image generation';
    return `Stop ${phase}?`;
  })();

  const confirmActionDescription = (() => {
    if (!pendingCancelAction) return '';
    return `This will stop ${pendingCancelAction.action} generation for all videos in this channel.`;
  })();

  const deleteActionTitle = pendingDeleteAction
    ? pendingDeleteAction.scope === 'module'
      ? 'Delete section?'
      : 'Delete video?'
    : '';

  const deleteActionDescription = (() => {
    if (!pendingDeleteAction) return '';
    if (pendingDeleteAction.scope === 'module') {
      const moduleItem = modules.find((item) => item.id === pendingDeleteAction.id);
      const moduleName = moduleItem?.title || 'this section';
      return `This will permanently delete "${moduleName}" in cascade, including all videos inside it, generated assets, generated files, and empty folders left after cleanup. This cannot be undone.`;
    }
    const lessonName =
      modules.flatMap((moduleItem) => moduleItem.lessons).find((lesson) => lesson.id === pendingDeleteAction.id)?.title ||
      'this video';
    return `This will permanently delete "${lessonName}" in cascade, including generated assets, generated files, and empty folders left after cleanup. This cannot be undone.`;
  })();

  return (
    <div ref={rootRef} className="h-full overflow-y-auto custom-scrollbar bg-background" onClick={() => setOpenContextMenu(null)}>
      <div className="p-6 max-w-5xl mx-auto pb-24">
        <div className="mb-8 flex items-center justify-between gap-3">
          <button
            onClick={() => setView('courses')}
            className="flex items-center gap-2 text-slate-500 hover:text-primary font-bold text-xs uppercase tracking-widest transition-colors"
          >
            <ChevronLeft size={16} />
            Back to Channels
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onEditCourse?.(course)}
              className="inline-flex items-center gap-2 h-9 px-3 rounded-[5px] border border-border text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/10 transition-colors text-[11px] font-semibold tracking-wide"
            >
              <Pencil size={14} />
              Edit channel
            </button>
            <button
              type="button"
              onClick={() => setIsDeleteCourseConfirmOpen(true)}
              className="inline-flex items-center gap-2 h-9 px-3 rounded-[5px] border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/10 transition-colors text-[11px] font-semibold tracking-wide"
            >
              <Trash2 size={14} />
              Delete channel
            </button>
          </div>
        </div>

        {/* Course Header Info */}
        <div className="flex flex-col md:flex-row gap-6 mb-10">
          <div className="relative group/course w-full md:w-60 h-44 rounded-[5px] overflow-hidden border border-border flex-shrink-0 shadow-sm bg-card">
            <img 
              src={course.thumbLandscape || course.thumbnail || '/course-placeholder.svg'} 
              alt={course.title} 
              className="w-full h-full object-cover cursor-zoom-in" 
              onClick={() => onImageClick?.(course.thumbLandscape || course.thumbnail || '/course-placeholder.svg')}
            />
            <div 
              className="absolute inset-0 bg-black/40 opacity-0 group-hover/course:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
              onClick={() => onImageClick?.(course.thumbLandscape || course.thumbnail || '/course-placeholder.svg')}
            >
              <Maximize2 className="text-white" size={24} />
            </div>
          </div>
          <div className="flex-1">
            <h2 className="text-3xl font-bold text-slate-800 dark:text-white mb-3 leading-tight">{course.title}</h2>
            <div className="flex flex-wrap gap-3 items-center mb-4">
              <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-[10px] font-bold uppercase tracking-wider border border-primary/20">
                {course.category || 'General'}
              </span>
              <span className="px-3 py-1 bg-slate-500/10 text-slate-600 dark:text-slate-300 rounded-full text-[10px] font-bold uppercase tracking-wider border border-slate-400/20">
                {totalModules} Sections
              </span>
              <span className="px-3 py-1 bg-orange-600/10 text-orange-600 rounded-full text-[10px] font-bold uppercase tracking-wider border border-orange-600/20">
                {totalLessons} Videos
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground text-xs font-semibold">
                <Clock size={14} />
                Total duration: {formatDurationLabel(totalAudioDurationSeconds)}
              </span>
            </div>
            <div className="w-full h-[7px] bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mb-1.5">
              <div
                className="h-full bg-green-500 transition-all duration-500"
                style={{ width: `${Math.max(0, Math.min(100, course.build?.progressPercent ?? 0))}%` }}
              ></div>
            </div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              {course.build?.progressPercent ?? 0}% Completed
              {hasAnyRunningOrPending(course.build?.jobs ?? emptyJobs) ? (
                <span className="ml-2 inline-flex items-center gap-1 text-orange-600">
                  <RefreshCw size={11} className={hasAnyRunning(course.build?.jobs ?? emptyJobs) ? 'animate-spin' : ''} />
                  {hasAnyRunning(course.build?.jobs ?? emptyJobs) ? 'Processing' : 'Queued'}
                </span>
              ) : null}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-[5px] border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-200">
            Failed to load channel content: {error}
          </div>
        )}
        {reorderError && (
          <div className="mb-6 rounded-[5px] border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-200">
            {reorderError}
          </div>
        )}

        <div className="space-y-10">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-xl font-bold text-slate-800 dark:text-white">Channel Content</h3>
            <div className="flex flex-wrap items-center justify-end gap-2.5">
              {courseActions.map((action) => {
                const ActionIcon = action.icon;
                const isBusy = action.state === 'running' || action.state === 'waiting';
                const busyLabel = action.state === 'waiting' ? action.waitingLabel : action.runningLabel;
                const progressWidth =
                  action.total > 0 ? Math.max(0, Math.min(100, (action.current / action.total) * 100)) : 0;
                return isBusy ? (
                  <div
                    key={action.key}
                    className="flex items-center h-9 rounded-[5px] border border-primary/30 bg-transparent shadow-sm overflow-hidden"
                  >
                    <div className="relative overflow-hidden flex items-center gap-2 px-3 h-9 text-[11px] font-bold text-primary">
                      <div
                        className="absolute inset-y-0 left-0 bg-primary/12 transition-all duration-300"
                        style={{ width: `${progressWidth}%` }}
                      />
                      <span className="relative z-10 inline-flex items-center gap-1.5 leading-none whitespace-nowrap">
                        <RefreshCw size={14} className={action.state === 'running' ? 'animate-spin' : ''} />
                        <span className="leading-none">{busyLabel}</span>
                        <span className="inline-flex items-center rounded-[5px] bg-primary/20 px-1.5 py-0.5 text-[9px] leading-none text-primary tabular-nums shrink-0">
                          {action.current}/{action.total}
                        </span>
                      </span>
                    </div>
                    <button
                      type="button"
                      className="h-9 px-3 text-[11px] font-bold rounded-r-[5px] border-l border-primary/30 bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                      onClick={() =>
                        setPendingCancelAction({
                          scope: 'course',
                          id: course.id,
                          action: action.key
                        })
                      }
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    key={action.key}
                    type="button"
                    className="flex items-center gap-2 px-3 h-9 bg-transparent border border-[hsl(var(--editor-input-border))] rounded-[5px] text-[11px] font-bold text-muted-foreground hover:text-foreground hover:bg-accent hover:border-primary/20 transition-all shadow-sm min-w-[162px] leading-none"
                    onClick={() => onStartCourseGeneration?.(action.key)}
                  >
                    <ActionIcon size={14} className="text-current shrink-0" />
                    <span className="truncate leading-none">{action.label}</span>
                    {action.total > 0 ? (
                      <span className="ml-auto inline-flex items-center rounded-[5px] bg-muted px-1.5 py-0.5 text-[9px] leading-none tabular-nums shrink-0">
                        {action.current}/{action.total}
                      </span>
                    ) : null}
                  </button>
                );
              })}
              {isSavingReorder ? (
                <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-orange-600 ml-1">
                  <Loader2 size={12} className="animate-spin" />
                  Saving order...
                </span>
              ) : null}
            </div>
          </div>
          
          <div className="space-y-8">
            {modules.map((module, mIdx) => {
              const moduleProcessing = hasAnyRunningOrPending(module.build?.jobs ?? emptyJobs);
              const moduleRunning = hasAnyRunning(module.build?.jobs ?? emptyJobs);
              return (
              <div 
                key={module.id} 
                ref={(el) => {
                  moduleRefs.current[module.id] = el;
                }}
                className="relative"
                onDragOver={onDragOver}
                onDrop={(e) => onModuleDrop(e, mIdx)}
              >
                {/* Module Header Card */}
                <div 
                  draggable
                  onDragStart={(e) => onModuleDragStart(e, mIdx)}
                  className={`bg-card border border-border rounded-[5px] p-3 flex items-center justify-between cursor-pointer hover:border-primary/20 hover:bg-accent/40 transition-all group/header shadow-sm z-10 relative ${draggedModuleIndex === mIdx ? 'opacity-50 ring-2 ring-primary/20' : ''}`}
                >
                  <div className="flex items-center gap-1.5 flex-1">
                    {/* Drag handle for section */}
                    <div className="p-1 -ml-1 text-slate-300 dark:text-slate-700 cursor-grab active:cursor-grabbing hover:text-primary transition-colors">
                      <GripVertical size={16} />
                    </div>

                    <div 
                      onClick={() => toggleModule(module.id)}
                      className="flex items-center gap-1.5 flex-1"
                    >
                      <div className="w-7 h-7 bg-slate-100 dark:bg-slate-800 rounded-[5px] flex items-center justify-center text-slate-500 font-bold text-[11px]">
                        {mIdx + 1}
                      </div>
                      <div
                        className="relative w-12 h-[30px] rounded-[5px] overflow-hidden bg-slate-100 dark:bg-slate-800 flex-shrink-0 shadow-sm border border-border cursor-zoom-in"
                        onClick={(event) => {
                          event.stopPropagation();
                          onImageClick?.(module.thumbLandscape || module.thumbPortrait || '/course-placeholder.svg');
                        }}
                      >
                        <img
                          src={module.thumbLandscape || module.thumbPortrait || '/course-placeholder.svg'}
                          className="w-full h-full object-cover"
                          alt={module.title}
                        />
                      </div>
                      <div className="py-0.5">
                        <h4 className="text-[17px] font-bold leading-[1.2] text-slate-800 dark:text-white group-hover/header:text-primary transition-colors">
                          {module.title}
                        </h4>
                        <p className="mt-0.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                          {module.lessons.length} Videos • {module.build?.progressPercent ?? 0}% Built
                          {moduleProcessing ? ' • Processing' : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {moduleProcessing ? (
                      <span className="inline-flex items-center gap-1.5 mr-2 text-[10px] font-bold uppercase tracking-wider text-orange-600">
                        <RefreshCw size={12} className={moduleRunning ? 'animate-spin' : ''} />
                        {moduleRunning ? 'Processing' : 'Queued'}
                      </span>
                    ) : null}
                    <div className="flex items-center gap-0.5 mr-1 relative">
                      <button 
                        onClick={(e) => { e.stopPropagation(); if(onEditModule) onEditModule(module); }}
                        className="p-1 text-slate-400 hover:text-foreground transition-colors rounded-[5px] hover:bg-accent"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenContextMenu((prev) =>
                            prev?.scope === 'module' && prev.id === module.id ? null : { scope: 'module', id: module.id }
                          );
                        }}
                        className="p-1 text-slate-400 hover:text-foreground transition-colors rounded-[5px] hover:bg-accent h-7"
                      >
                        <MoreVertical size={16} />
                      </button>
                      {renderContextMenu('module', module.id)}
                    </div>
                    <ChevronDown 
                      onClick={(e) => { e.stopPropagation(); toggleModule(module.id); }}
                      size={20} 
                      className={`text-slate-400 transition-transform duration-300 ${expandedModules[module.id] ? 'rotate-180' : ''}`} 
                    />
                  </div>
                </div>

                {/* Videos Container */}
                <div className={`transition-all duration-300 ${expandedModules[module.id] ? 'overflow-visible max-h-[2000px] mt-2.5' : 'overflow-hidden max-h-0'}`}>
                  {/* Espinha Vertical Tracejada - Alinhada exatamente abaixo do ícone GripVertical */}
                  <div className="absolute left-[30px] top-[60px] bottom-6 w-[2px] border-l-2 border-dashed border-border -z-0"></div>

                  <div className="pl-[30px] space-y-2.5 pt-3.5">
                    {module.lessons.map((lesson, idx) => {
                      const finalVideoAvailable =
                        Boolean(lesson.build?.finalVideoReady) &&
                        !hasInvalidatingGeneration(lesson.build?.jobs ?? emptyJobs) &&
                        Boolean(lesson.build?.lessonVersionId);
                      const finalVideoUrl =
                        finalVideoAvailable && lesson.build?.lessonVersionId
                          ? `${API_BASE}/video-versions/${lesson.build.lessonVersionId}/final-video`
                          : null;
                      return (
                      <div 
                        key={lesson.id}
                        draggable
                        onDragStart={(e) => onLessonDragStart(e, module.id, idx)}
                        onDragOver={onDragOver}
                        onDrop={(e) => onLessonDrop(e, module.id, idx)}
                        className={`group/lesson flex items-center gap-2 p-2.5 ml-6 bg-card border border-border rounded-[5px] hover:border-primary/20 hover:bg-accent/30 transition-all shadow-sm relative ${draggedLesson?.moduleId === module.id && draggedLesson?.lessonIndex === idx ? 'opacity-40' : ''}`}
                      >
                        {/* Conector Horizontal */}
                        <div className="absolute -left-[24px] top-1/2 -translate-y-1/2 w-[24px] h-[2px] border-t-2 border-dashed border-border"></div>

                        {/* Grip Handle para Lição */}
                        <div className="cursor-grab active:cursor-grabbing text-slate-300 dark:text-slate-700 group-hover/lesson:text-primary transition-colors">
                          <GripVertical size={14} />
                        </div>

                        <div 
                          onClick={() => onSelectLesson(lesson)}
                          className="w-6 h-6 rounded-[5px] bg-background flex items-center justify-center text-[10px] font-bold text-slate-400 group-hover/lesson:text-primary cursor-pointer"
                        >
                          {mIdx + 1}.{idx + 1}
                        </div>

                        <div 
                          className="relative w-11 h-7 rounded-[5px] overflow-hidden bg-slate-100 dark:bg-slate-800 flex-shrink-0 shadow-sm border border-border cursor-zoom-in"
                          onClick={() => onImageClick?.(lesson.thumbLandscape || lesson.thumbnail || '/lesson-placeholder.svg')}
                        >
                          <img
                            src={lesson.thumbLandscape || lesson.thumbnail || '/lesson-placeholder.svg'}
                            className="w-full h-full object-cover"
                            alt={lesson.title}
                          />
                        </div>

                        <div onClick={() => onSelectLesson(lesson)} className="flex-1 min-w-0 cursor-pointer">
                          <h5 className="text-sm font-bold leading-[1.25] text-slate-700 dark:text-slate-300 truncate group-hover/lesson:text-primary transition-colors">
                            {lesson.title}
                          </h5>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-semibold text-slate-500">
                            <span className="inline-flex items-center rounded-[4px] bg-slate-100/80 dark:bg-slate-800/80 px-1.5 py-0.5 leading-none">
                              Duration {lesson.duration || '--:--:--'}
                            </span>
                            <span className="inline-flex items-center rounded-[4px] bg-slate-100/80 dark:bg-slate-800/80 px-1.5 py-0.5 leading-none">
                              Blocks {lesson.build?.blocksReady ?? 0}/{lesson.build?.blocksTotal ?? 0}
                            </span>
                            <span className="inline-flex items-center rounded-[4px] bg-slate-100/80 dark:bg-slate-800/80 px-1.5 py-0.5 leading-none">
                              Audio {lesson.build?.audioReady ?? 0}
                            </span>
                            <span className="inline-flex items-center rounded-[4px] bg-slate-100/80 dark:bg-slate-800/80 px-1.5 py-0.5 leading-none">
                              Images {lesson.build?.imagesReady ?? 0}
                            </span>
                            <span className="inline-flex items-center rounded-[4px] bg-slate-100/80 dark:bg-slate-800/80 px-1.5 py-0.5 leading-none">
                              Video {finalVideoAvailable ? 'Yes' : 'No'}
                            </span>
                            <span className="inline-flex items-center rounded-[4px] bg-slate-100/80 dark:bg-slate-800/80 px-1.5 py-0.5 leading-none">
                              {lesson.build?.progressPercent ?? 0}%
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {finalVideoUrl && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(finalVideoUrl, '_blank', 'noopener,noreferrer');
                              }}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-[5px] border border-emerald-300/70 dark:border-emerald-700/70 bg-emerald-50/80 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100/90 dark:hover:bg-emerald-900/35 transition-colors"
                              title="Open final video"
                              aria-label="Open final video"
                            >
                              <CirclePlay size={14} />
                            </button>
                          )}
                          {hasAnyRunningOrPending(lesson.build?.jobs ?? emptyJobs) ? (
                            <span className="flex items-center gap-1.5 text-orange-600 text-[10px] font-bold uppercase tracking-wider">
                              <RefreshCw size={14} className={hasAnyRunning(lesson.build?.jobs ?? emptyJobs) ? 'animate-spin' : ''} />
                              {hasAnyRunning(lesson.build?.jobs ?? emptyJobs) ? 'Processing' : 'Queued'}
                            </span>
                          ) : lesson.status === 'Ready' ? (
                            <span className="flex items-center gap-1.5 text-green-500 text-[10px] font-bold uppercase tracking-wider">
                              <CheckCircle2 size={16} />
                              Ready
                            </span>
                          ) : null}

                          <div className="flex items-center gap-0.5 relative">
                            <button 
                              onClick={(e) => { e.stopPropagation(); onEditLesson(lesson); }}
                              className="p-1.5 text-slate-400 hover:text-foreground transition-colors rounded-[5px] hover:bg-accent"
                            >
                              <Pencil size={18} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenContextMenu((prev) =>
                                  prev?.scope === 'lesson' && prev.id === lesson.id ? null : { scope: 'lesson', id: lesson.id }
                                );
                              }}
                              className="p-1.5 text-slate-400 hover:text-foreground transition-colors rounded-[5px] h-8 hover:bg-accent"
                            >
                              <MoreVertical size={18} />
                            </button>
                            {renderContextMenu('lesson', lesson.id)}
                          </div>
                        </div>
                      </div>
                      );
                    })}

                    {/* Add video button */}
                    <div className="relative ml-6">
                      <div className="absolute -left-[24px] top-1/2 -translate-y-1/2 w-[24px] h-[2px] border-t-2 border-dashed border-border"></div>
                      <button 
                        onClick={() => {
                          if (onAddLesson) {
                            onAddLesson(module.id);
                            return;
                          }
                          setView('module-editor');
                        }}
                        className="w-full py-3 border-2 border-dashed border-border rounded-[5px] flex items-center justify-center gap-3 text-[11px] font-bold text-slate-400 hover:text-primary hover:border-primary/30 hover:bg-accent transition-all group"
                      >
                        <Plus size={16} className="group-hover:scale-110 transition-transform" />
                        ADD NEW VIDEO TO THIS SECTION
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )})}
          </div>

          {/* Adicionar Novo Módulo */}
          <button 
            onClick={onAddModuleContainer}
            className="w-full border-2 border-dashed border-border rounded-[5px] p-10 flex flex-col items-center justify-center gap-3 text-slate-400 hover:border-primary/40 hover:bg-accent transition-all group mt-8 shadow-sm"
          >
            <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-900 border border-border flex items-center justify-center group-hover:scale-110 group-hover:border-primary/25 transition-all">
              <Plus size={28} className="group-hover:text-primary" />
            </div>
            <div className="text-center">
              <span className="block text-[12px] font-bold uppercase tracking-[0.2em] text-muted-foreground group-hover:text-primary transition-colors">Add New Section</span>
              <span className="block text-[9px] font-medium text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-wider">Optional grouping for videos by theme or topic</span>
            </div>
          </button>
        </div>
      </div>
      <ConfirmDialog
        open={Boolean(pendingCancelAction)}
        title={confirmActionTitle}
        description={confirmActionDescription}
        confirmLabel="Stop"
        confirmClassName="bg-red-600 hover:bg-red-700 text-white"
        onCancel={() => setPendingCancelAction(null)}
        onConfirm={() => {
          if (!pendingCancelAction) return;
          onCancelCourseGeneration?.(pendingCancelAction.action);
          setPendingCancelAction(null);
        }}
      />
      <ConfirmDialog
        open={isDeleteCourseConfirmOpen}
        title="Delete channel?"
        description="This will permanently delete this channel in cascade, including all sections, all videos, generated assets, generated files, and empty folders left after cleanup. This cannot be undone."
        confirmLabel="Delete"
        confirmClassName="bg-red-600 hover:bg-red-700 text-white"
        onCancel={() => setIsDeleteCourseConfirmOpen(false)}
        onConfirm={() => {
          setIsDeleteCourseConfirmOpen(false);
          if (course?.id) {
            onDeleteCourse?.(course.id);
          }
        }}
      />
      <ConfirmDialog
        open={Boolean(pendingDeleteAction)}
        title={deleteActionTitle}
        description={deleteActionDescription}
        confirmLabel="Delete"
        confirmClassName="bg-red-600 hover:bg-red-700 text-white"
        onCancel={() => setPendingDeleteAction(null)}
        onConfirm={() => {
          if (!pendingDeleteAction) return;
          if (pendingDeleteAction.scope === 'module') {
            onDeleteModule?.(pendingDeleteAction.id);
          } else {
            onDeleteLesson?.(pendingDeleteAction.id);
          }
          setPendingDeleteAction(null);
        }}
      />
    </div>
  );
};

export default CourseModules;
