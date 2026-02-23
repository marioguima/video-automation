import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, Mic2, Search, UploadCloud } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Button } from '../ui/button';
import { parseCourseScriptMarkdown, ParsedCourseScript } from '../../lib/courseScriptMarkdown';
import { IMPORT_CANCELED, ImportAutomationOptions, ImportCourseScriptPlan, importCourseScript } from '../../lib/courseScriptImport';
import { apiGet, apiPost } from '../../lib/api';
import ScriptStructurePreview from './script-import/ScriptStructurePreview';
import ImportTargetPicker, { CourseLite, ImportConfigState, ModuleLite } from './script-import/ImportTargetPicker';
import VoiceSelectorModal from '../VoiceSelectorModal';
import { Voice } from '../../types';

type ImportedCourse = {
  id: string;
  name: string;
};

type TtsVoiceOption = {
  id: string;
  label: string;
  description?: string | null;
  preview_url?: string | null;
};

type SlideTemplateOption = {
  id: string;
  label: string;
  kind?: string | null;
};

type TemplateViewOption = {
  id: string;
  name: string;
  kind: string | null;
  previewColor: string;
  layout: 'centered' | 'split' | 'overlay';
};

interface ScriptImportCardProps {
  onImportSuccess?: (course: ImportedCourse) => void;
  onAbortRollbackComplete?: () => void;
}

const defaultConfig = (parsed: ParsedCourseScript | null): ImportConfigState => ({
  courseMode: parsed?.courseTitle ? 'create' : 'existing',
  newCourseName: parsed?.courseTitle ?? '',
  selectedCourseId: '',
  moduleStartOrder: 1,
  standaloneTargetModuleId: ''
});

const templateColors = [
  'bg-rose-500/80',
  'bg-orange-500/80',
  'bg-emerald-500/80',
  'bg-cyan-500/80',
  'bg-indigo-500/80',
  'bg-fuchsia-500/80'
];

const resolveTemplateLayout = (kind?: string | null): TemplateViewOption['layout'] => {
  if (kind === 'text') return 'centered';
  if (kind === 'image') return 'split';
  return 'overlay';
};

const ScriptImportCard: React.FC<ScriptImportCardProps> = ({
  onImportSuccess,
  onAbortRollbackComplete
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isLoadingCourses, setIsLoadingCourses] = useState(false);
  const [isLoadingModules, setIsLoadingModules] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedCourseScript | null>(null);
  const [config, setConfig] = useState<ImportConfigState>(defaultConfig(null));
  const [courses, setCourses] = useState<CourseLite[]>([]);
  const [courseSearch, setCourseSearch] = useState('');
  const [modules, setModules] = useState<ModuleLite[]>([]);
  const [moduleSearch, setModuleSearch] = useState('');
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [automationOptions, setAutomationOptions] = useState<ImportAutomationOptions>({
    generateAudio: false,
    generateImage: false,
    voiceId: null,
    templateId: null
  });
  const [ttsVoices, setTtsVoices] = useState<TtsVoiceOption[]>([]);
  const [slideTemplates, setSlideTemplates] = useState<SlideTemplateOption[]>([]);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const rollbackCreatedCourseIdRef = useRef<string | null>(null);
  const rollbackModuleIdsRef = useRef<Set<string>>(new Set());
  const rollbackLessonIdsRef = useRef<Set<string>>(new Set());
  const rollbackVersionIdsRef = useRef<Set<string>>(new Set());

  const hasParsedData = Boolean(parsed);
  const availableVoices = useMemo<Voice[]>(
    () =>
      ttsVoices.map((voice) => ({
        name: voice.label,
        voice_id: voice.id,
        preview_url: voice.preview_url ?? ''
      })),
    [ttsVoices]
  );
  const selectedVoice = useMemo(
    () => ttsVoices.find((voice) => voice.id === automationOptions.voiceId) ?? null,
    [ttsVoices, automationOptions.voiceId]
  );
  const templateOptions = useMemo<TemplateViewOption[]>(
    () =>
      slideTemplates.map((template, index) => ({
        id: template.id,
        name: template.label,
        kind: template.kind ?? null,
        previewColor: templateColors[index % templateColors.length],
        layout: resolveTemplateLayout(template.kind)
      })),
    [slideTemplates]
  );
  const selectedTemplate = useMemo(
    () => templateOptions.find((template) => template.id === automationOptions.templateId) ?? null,
    [templateOptions, automationOptions.templateId]
  );

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === config.selectedCourseId) ?? null,
    [courses, config.selectedCourseId]
  );
  const hasStandaloneLessons = Boolean(parsed && parsed.standaloneLessons.length > 0);
  const hasModulesToCreate = Boolean(parsed && parsed.modules.length > 0);
  const hasOnlyCourseHeading = Boolean(
    parsed &&
      parsed.detected.hasCourseHeading &&
      parsed.modules.length === 0 &&
      parsed.standaloneLessons.length === 0
  );

  const readinessError = useMemo(() => {
    if (!parsed) return 'Upload a markdown file first.';
    if (hasOnlyCourseHeading) {
      return config.newCourseName.trim() ? null : 'Course name is required.';
    }
    if (config.courseMode === 'create' && !config.newCourseName.trim()) {
      return 'Course name is required.';
    }
    if (config.courseMode === 'existing' && !config.selectedCourseId) {
      return 'Select a target course.';
    }
    if (hasStandaloneLessons && !config.standaloneTargetModuleId) {
      return 'Select a target module for standalone lessons.';
    }
    if (config.courseMode === 'create' && hasStandaloneLessons) {
      return 'Standalone lessons require an existing module.';
    }
    return null;
  }, [
    config.courseMode,
    config.newCourseName,
    config.selectedCourseId,
    config.standaloneTargetModuleId,
    hasOnlyCourseHeading,
    hasStandaloneLessons,
    parsed
  ]);

  useEffect(() => {
    if (!hasParsedData) return;
    setIsLoadingCourses(true);
    apiGet<Array<{ id: string; name: string }>>('/channels')
      .then((items) => {
        const next = items.map((item) => ({ id: item.id, name: item.name }));
        setCourses(next);
        if (!config.selectedCourseId && next.length > 0) {
          setConfig((prev) => ({ ...prev, selectedCourseId: next[0].id }));
        }
      })
      .catch((err) => {
        console.error(err);
        setCourses([]);
      })
      .finally(() => setIsLoadingCourses(false));
  }, [hasParsedData]);

  useEffect(() => {
    if (!config.selectedCourseId || !hasParsedData) {
      setModules([]);
      return;
    }
    setIsLoadingModules(true);
    apiGet<Array<{ id: string; name: string; order: number }>>(`/channels/${config.selectedCourseId}/sections`)
      .then((items) => {
        const next = [...items]
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((item) => ({ id: item.id, name: item.name, order: item.order ?? 0 }));
        setModules(next);
        if (next.length > 0) {
          setConfig((prev) => ({
            ...prev,
            standaloneTargetModuleId:
              prev.standaloneTargetModuleId && next.some((m) => m.id === prev.standaloneTargetModuleId)
                ? prev.standaloneTargetModuleId
                : next[0].id,
            moduleStartOrder:
              hasModulesToCreate ? Math.max(1, (next[next.length - 1]?.order ?? 0) + 1) : prev.moduleStartOrder
          }));
        } else {
          setConfig((prev) => ({ ...prev, standaloneTargetModuleId: '', moduleStartOrder: 1 }));
        }
      })
      .catch((err) => {
        console.error(err);
        setModules([]);
      })
      .finally(() => setIsLoadingModules(false));
  }, [config.selectedCourseId, hasParsedData, hasModulesToCreate]);

  const handleFile = async (file: File) => {
    const isMarkdown =
      file.name.toLowerCase().endsWith('.md') || file.type === 'text/markdown' || file.type === 'text/plain';
    if (!isMarkdown) {
      setErrorText('Invalid file. Please upload a .md file.');
      setStatusText(null);
      return;
    }

    setIsImporting(false);
    setStatusText('Reading file...');
    setErrorText(null);

    try {
      const raw = await file.text();
      const result = parseCourseScriptMarkdown(raw);
      if (!result.ok) {
        const topIssues = result.issues
          .slice(0, 4)
          .map((issue) => `Line ${issue.line}: ${issue.message}`)
          .join(' ');
        throw new Error(topIssues || 'Could not parse the markdown file.');
      }

      setParsed(result.data);
      setConfig(defaultConfig(result.data));
      setAutomationOptions((prev) => ({
        ...prev,
        generateAudio: false,
        generateImage: false
      }));
      setIsConfigOpen(true);
      setStatusText(null);
    } catch (err) {
      setParsed(null);
      setStatusText(null);
      setErrorText((err as Error).message || 'Failed to parse script.');
    }
  };

  const buildPlan = (): ImportCourseScriptPlan => {
    if (!parsed) {
      throw new Error('No parsed structure available.');
    }

    if (hasOnlyCourseHeading) {
      const name = config.newCourseName.trim();
      if (!name) throw new Error('Course name is required.');
      return {
        courseTarget: { mode: 'create', name },
        moduleStartOrder: 1,
        standaloneLessonsTargetModuleId: null
      };
    }

    if (config.courseMode === 'existing') {
      if (!config.selectedCourseId) {
        throw new Error('Select a course to continue.');
      }
      if (hasStandaloneLessons && !config.standaloneTargetModuleId) {
        throw new Error('Select a target module for standalone lessons.');
      }
      return {
        courseTarget: { mode: 'existing', courseId: config.selectedCourseId },
        moduleStartOrder: Math.max(1, Math.trunc(config.moduleStartOrder || 1)),
        standaloneLessonsTargetModuleId: hasStandaloneLessons ? config.standaloneTargetModuleId : null
      };
    }

    const courseName = config.newCourseName.trim();
    if (!courseName) {
      throw new Error('Course name is required.');
    }

    if (hasStandaloneLessons) {
      throw new Error('Standalone lessons require an existing target module.');
    }

    return {
      courseTarget: { mode: 'create', name: courseName },
      moduleStartOrder: 1,
      standaloneLessonsTargetModuleId: null
    };
  };

  useEffect(() => {
    if (!hasParsedData) return;
    apiGet<{ voices?: TtsVoiceOption[]; items?: TtsVoiceOption[] }>('/tts/voices')
      .then((response) => {
        const list = response.items ?? response.voices ?? [];
        setTtsVoices(list);
        setAutomationOptions((prev) => {
          if (prev.voiceId && list.some((voice) => voice.id === prev.voiceId)) {
            return prev;
          }
          return {
            ...prev,
            voiceId: list[0]?.id ?? null
          };
        });
      })
      .catch((err) => {
        console.error(err);
        setTtsVoices([]);
      });

    apiGet<SlideTemplateOption[]>('/slide-templates')
      .then((items) => {
        setSlideTemplates(items);
        setAutomationOptions((prev) => {
          if (prev.templateId && items.some((item) => item.id === prev.templateId)) {
            return prev;
          }
          const defaultImageTemplate = items.find((item) => item.kind === 'image') ?? items[0] ?? null;
          return {
            ...prev,
            templateId: defaultImageTemplate?.id ?? null
          };
        });
      })
      .catch((err) => {
        console.error(err);
        setSlideTemplates([]);
      });
  }, [hasParsedData]);

  const runImport = async () => {
    if (!parsed) return;
    setErrorText(null);
    setIsImporting(true);
    rollbackCreatedCourseIdRef.current = null;
    rollbackModuleIdsRef.current = new Set();
    rollbackLessonIdsRef.current = new Set();
    rollbackVersionIdsRef.current = new Set();
    setStatusText(null);
    try {
      setStatusText('Preparing AI engines (hard cleanup)...');
      const cleanup = await apiPost<{
        ok: boolean;
        skipped?: boolean;
        reason?: string;
        activeJobs?: { pending?: number; running?: number };
      }>('/system/hard-cleanup', {
        reason: 'import_start'
      });
      if (cleanup?.skipped) {
        setStatusText(
          `Active jobs detected (${cleanup.activeJobs?.running ?? 0} running, ${cleanup.activeJobs?.pending ?? 0} queued). Skipping hard cleanup and queuing this import.`
        );
      }
      setStatusText('Starting import...');
      const plan = buildPlan();
      const result = await importCourseScript(
        parsed,
        plan,
        automationOptions,
        () => undefined,
        {
          shouldCancel: () => false,
          onResourceCreated: (type, id) => {
            if (type === 'course') rollbackCreatedCourseIdRef.current = id;
            if (type === 'module') rollbackModuleIdsRef.current.add(id);
            if (type === 'lesson') rollbackLessonIdsRef.current.add(id);
            if (type === 'version') rollbackVersionIdsRef.current.add(id);
          }
        }
      );
      const queuedSummary =
        result.queuedAudioJobs > 0 || result.queuedImageJobs > 0
          ? ` Queued: ${result.queuedAudioJobs} audio and ${result.queuedImageJobs} image job(s).`
          : '';
      const warningSummary = result.warnings.length > 0 ? ` ${result.warnings.length} warning(s).` : '';
      setStatusText(
        `Import complete: ${result.moduleCount} modules and ${result.lessonCount} lessons created.${queuedSummary}${warningSummary}`
      );
      if (result.warnings.length > 0) {
        setErrorText(result.warnings.slice(0, 2).join(' '));
      }

      const resolveNavigationCourse = (): ImportedCourse | null => {
        const target = plan.courseTarget;
        if (result.createdCourse) {
          return result.createdCourse;
        }
        if (result.courseId) {
          const existing = courses.find((item) => item.id === result.courseId);
          if (existing) return { id: existing.id, name: existing.name };
          if (target.mode === 'existing' && target.courseId === result.courseId) {
            return { id: result.courseId, name: selectedCourse?.name ?? 'Course' };
          }
          return { id: result.courseId, name: parsed.courseTitle || 'Course' };
        }
        if (rollbackCreatedCourseIdRef.current) {
          return {
            id: rollbackCreatedCourseIdRef.current,
            name: config.newCourseName.trim() || parsed.courseTitle || 'Imported course'
          };
        }
        if (target.mode === 'existing') {
          const existing = courses.find((item) => item.id === target.courseId);
          if (existing) return { id: existing.id, name: existing.name };
          return { id: target.courseId, name: selectedCourse?.name ?? 'Course' };
        }
        return null;
      };

      const courseForNavigation = resolveNavigationCourse();
      if (courseForNavigation) {
        setIsConfigOpen(false);
        onImportSuccess?.(courseForNavigation);
      }
    } catch (err) {
      const message = (err as Error).message || 'Failed to import script.';
      if (message === IMPORT_CANCELED) {
        setStatusText('Import canceled. Rolling back generated content...');
        try {
          await apiPost('/imports/rollback', {
            createdCourseId: rollbackCreatedCourseIdRef.current,
            createdModuleIds: Array.from(rollbackModuleIdsRef.current),
            createdLessonIds: Array.from(rollbackLessonIdsRef.current),
            createdVersionIds: Array.from(rollbackVersionIdsRef.current)
          });
          setStatusText('Import canceled and rolled back successfully.');
        } catch (rollbackErr) {
          const rollbackMessage = (rollbackErr as Error).message || 'Rollback failed.';
          setErrorText(rollbackMessage);
          setStatusText('Import canceled, but rollback was partial.');
        }
        setIsConfigOpen(false);
        onAbortRollbackComplete?.();
        window.setTimeout(() => {
          window.location.reload();
        }, 120);
      } else {
        setStatusText(null);
        setErrorText(message);
      }
    } finally {
      setIsImporting(false);
    }
  };

  const openFileDialog = () => {
    if (isImporting) return;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const onDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (isImporting) return;
    const file = event.dataTransfer.files?.[0];
    if (file) {
      await handleFile(file);
    }
  };

  return (
    <>
      <div
        className={`border-2 border-dashed flex flex-col items-center justify-center text-center transition-all p-6 rounded-[5px] ${
          isDragging ? 'border-primary bg-muted/60' : 'hover:border-primary/50 hover:bg-muted/50'
        } ${isImporting ? 'cursor-wait' : 'cursor-pointer'}`}
        onClick={() => {
          openFileDialog();
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!isImporting) setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragging(false);
        }}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openFileDialog();
          }
        }}
        aria-disabled={isImporting}
        aria-label="Import markdown script"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,text/markdown,text/plain"
          className="hidden"
          onChange={(event) => {
            const input = event.currentTarget;
            const file = input.files?.[0] ?? null;
            input.value = '';
            if (file) {
              void handleFile(file);
            }
          }}
        />

        <div className="w-12 h-12 bg-muted rounded-[5px] flex items-center justify-center mb-3 self-center">
          {isImporting ? (
            <Loader2 size={24} className="animate-spin text-primary" />
          ) : (
            <UploadCloud size={24} className="text-muted-foreground" />
          )}
        </div>

        <h4 className="font-bold mb-1">Import Script</h4>
        <p className="text-xs text-muted-foreground mb-3 max-w-[200px] self-center">
          Drag and drop your script here.
        </p>

        <Button
          variant="outline"
          size="sm"
          disabled={isImporting}
          className="self-center min-w-[128px]"
          onClick={(event) => {
            event.stopPropagation();
            openFileDialog();
          }}
        >
          {isImporting ? 'Importing...' : 'Choose File'}
        </Button>

        {statusText && !isConfigOpen && <p className="text-xs mt-4 text-emerald-600">{statusText}</p>}
        {errorText && !isConfigOpen && <p className="text-xs mt-4 text-red-600">{errorText}</p>}
      </div>

      <ScriptImportModal
        open={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        parsed={parsed}
        config={config}
        setConfig={setConfig}
        courses={courses}
        courseSearch={courseSearch}
        setCourseSearch={setCourseSearch}
        modules={modules}
        moduleSearch={moduleSearch}
        setModuleSearch={setModuleSearch}
        isImporting={isImporting}
        isLoadingCourses={isLoadingCourses}
        isLoadingModules={isLoadingModules}
        selectedCourseName={selectedCourse?.name ?? null}
        readinessError={readinessError}
        statusText={statusText}
        errorText={errorText}
        onImport={runImport}
        automationOptions={automationOptions}
        setAutomationOptions={setAutomationOptions}
        availableVoices={availableVoices}
        selectedVoiceName={selectedVoice?.label ?? null}
        selectedTemplate={selectedTemplate}
        templateOptions={templateOptions}
        onOpenVoiceSelector={() => setIsVoiceModalOpen(true)}
      />
      <VoiceSelectorModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        currentVoiceId={automationOptions.voiceId ?? undefined}
        voices={availableVoices}
        onSelect={(voice) => {
          setAutomationOptions((prev) => ({ ...prev, voiceId: voice.voice_id }));
          setIsVoiceModalOpen(false);
        }}
      />
    </>
  );
};

const ScriptImportModal: React.FC<{
  open: boolean;
  onClose: () => void;
  parsed: ParsedCourseScript | null;
  config: ImportConfigState;
  setConfig: React.Dispatch<React.SetStateAction<ImportConfigState>>;
  courses: CourseLite[];
  courseSearch: string;
  setCourseSearch: (value: string) => void;
  modules: ModuleLite[];
  moduleSearch: string;
  setModuleSearch: (value: string) => void;
  isImporting: boolean;
  isLoadingCourses: boolean;
  isLoadingModules: boolean;
  selectedCourseName: string | null;
  readinessError: string | null;
  statusText: string | null;
  errorText: string | null;
  onImport: () => Promise<void>;
  automationOptions: ImportAutomationOptions;
  setAutomationOptions: React.Dispatch<React.SetStateAction<ImportAutomationOptions>>;
  availableVoices: Voice[];
  selectedVoiceName: string | null;
  selectedTemplate: TemplateViewOption | null;
  templateOptions: TemplateViewOption[];
  onOpenVoiceSelector: () => void;
}> = ({
  open,
  onClose,
  parsed,
  config,
  setConfig,
  courses,
  courseSearch,
  setCourseSearch,
  modules,
  moduleSearch,
  setModuleSearch,
  isImporting,
  isLoadingCourses,
  isLoadingModules,
  selectedCourseName,
  readinessError,
  statusText,
  errorText,
  onImport,
  automationOptions,
  setAutomationOptions,
  availableVoices,
  selectedVoiceName,
  selectedTemplate,
  templateOptions,
  onOpenVoiceSelector
}) => {
  const templateButtonRef = useRef<HTMLButtonElement | null>(null);
  const templateMenuRef = useRef<HTMLDivElement | null>(null);
  const [isTemplateMenuOpen, setIsTemplateMenuOpen] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateMenuStyle, setTemplateMenuStyle] = useState<{ bottom: number; left: number; width: number } | null>(null);
  const filteredTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    if (!q) return templateOptions;
    return templateOptions.filter((template) => template.name.toLowerCase().includes(q));
  }, [templateOptions, templateSearch]);

  useEffect(() => {
    if (!isTemplateMenuOpen) return;
    const button = templateButtonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const width = Math.max(rect.width, 300);
    const maxLeft = Math.max(8, window.innerWidth - width - 8);
    const left = Math.max(8, Math.min(rect.left, maxLeft));
    setTemplateMenuStyle({
      // Open upward to avoid modal overflow in short viewports.
      bottom: window.innerHeight - rect.top + 8,
      left,
      width
    });
  }, [isTemplateMenuOpen]);

  useEffect(() => {
    if (!isTemplateMenuOpen) return;
    const close = () => setIsTemplateMenuOpen(false);
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (templateButtonRef.current?.contains(target)) return;
      if (templateMenuRef.current?.contains(target)) return;
      close();
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [isTemplateMenuOpen]);

  if (!open || !parsed) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => {
          if (!isImporting) onClose();
        }}
      />
      <div className="relative z-10 w-full max-w-4xl max-h-[85vh] overflow-y-auto custom-scrollbar rounded-[5px] bg-background p-5 md:p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold">Import Structure</h3>
            <p className="text-xs text-muted-foreground">Review detected content and select destination before importing.</p>
          </div>
        </div>

        <div className="space-y-4">
          <ScriptStructurePreview parsed={parsed} />
          <ImportTargetPicker
            parsed={parsed}
            config={config}
            setConfig={setConfig}
            courses={courses}
            courseSearch={courseSearch}
            setCourseSearch={setCourseSearch}
            modules={modules}
            moduleSearch={moduleSearch}
            setModuleSearch={setModuleSearch}
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              {isLoadingCourses && 'Loading courses...'}
              {!isLoadingCourses && isLoadingModules && selectedCourseName && `Loading modules for ${selectedCourseName}...`}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={isImporting}
                className="text-slate-400 dark:text-slate-300 hover:text-slate-500 dark:hover:text-slate-200"
                onClick={onClose}
              >
                Close
              </Button>
              <Button
                size="sm"
                disabled={isImporting || Boolean(readinessError)}
                onClick={() => { void onImport(); }}
              >
                {isImporting ? 'Importing...' : 'Import Structure'}
              </Button>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <p className="text-xs font-semibold">After import</p>
            <div className="space-y-2.5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={automationOptions.generateAudio}
                    disabled={isImporting}
                    onChange={(event) =>
                      setAutomationOptions((prev) => ({ ...prev, generateAudio: event.target.checked }))
                    }
                  />
                  Generate audio automatically
                </label>
                {automationOptions.generateAudio ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isImporting || availableVoices.length === 0}
                    className="h-9 text-xs justify-start w-full sm:w-[300px]"
                    onClick={onOpenVoiceSelector}
                  >
                    <Mic2 size={14} className="mr-1.5 shrink-0" />
                    <span className="text-muted-foreground mr-2">Select voice:</span>
                    <span className="truncate">{selectedVoiceName ?? 'No voices available'}</span>
                  </Button>
                ) : (
                  <div className="hidden sm:block sm:w-[300px]" />
                )}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={automationOptions.generateImage}
                    disabled={isImporting}
                    onChange={(event) =>
                      setAutomationOptions((prev) => ({ ...prev, generateImage: event.target.checked }))
                    }
                  />
                  Generate images automatically
                </label>
                {automationOptions.generateImage ? (
                  <div className="relative w-full sm:w-[300px]">
                    <button
                      ref={templateButtonRef}
                      type="button"
                      disabled={isImporting || templateOptions.length === 0}
                      className="w-full h-9 px-3 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-[5px] text-xs text-foreground flex items-center gap-2 disabled:opacity-60"
                      onClick={() => {
                        setTemplateSearch('');
                        setIsTemplateMenuOpen((prev) => !prev);
                      }}
                    >
                      <div
                        className={`w-10 h-6 rounded-[4px] border border-[hsl(var(--editor-input-border))] overflow-hidden flex-shrink-0 relative shadow-sm ${selectedTemplate?.previewColor ?? 'bg-muted'}`}
                      >
                        {selectedTemplate?.layout === 'split' && (
                          <div className="absolute inset-0 flex">
                            <div className="w-1/2 h-full bg-black/12" />
                          </div>
                        )}
                        {selectedTemplate?.layout === 'centered' && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-1/2 h-1/2 bg-black/12 rounded-sm" />
                          </div>
                        )}
                      </div>
                      <span className="text-muted-foreground">Template:</span>
                      <span className="truncate flex-1 text-left">{selectedTemplate?.name ?? 'Select template'}</span>
                      <ChevronDown size={14} className={`shrink-0 transition-transform ${isTemplateMenuOpen ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                ) : (
                  <div className="hidden sm:block sm:w-[300px]" />
                )}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              If enabled, each imported lesson is segmented first, then audio/image jobs are queued.
            </p>
          </div>

          {readinessError && (
            <p className="text-xs text-amber-600">{readinessError}</p>
          )}
          {statusText && <p className="text-xs text-emerald-600">{statusText}</p>}
          {errorText && <p className="text-xs text-red-600">{errorText}</p>}
        </div>
      </div>
      {isTemplateMenuOpen && templateMenuStyle &&
        createPortal(
          <div
            ref={templateMenuRef}
            className="fixed rounded-[8px] border border-[hsl(var(--editor-input-border))] bg-background shadow-2xl z-[120] overflow-hidden"
            style={{
              bottom: `${templateMenuStyle.bottom}px`,
              left: `${templateMenuStyle.left}px`,
              width: `${templateMenuStyle.width}px`
            }}
          >
            <div className="p-2 border-b border-[hsl(var(--editor-input-border))]">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  value={templateSearch}
                  onChange={(event) => setTemplateSearch(event.target.value)}
                  placeholder="Search template..."
                  className="h-8 w-full rounded-[5px] border border-[hsl(var(--editor-input-border))] bg-[hsl(var(--editor-input))] pl-8 pr-2 text-xs outline-none focus:border-primary/40"
                />
              </div>
            </div>
            <div className="max-h-60 overflow-y-auto custom-scrollbar p-1.5 space-y-1">
              {filteredTemplates.map((template) => {
                const selected = automationOptions.templateId === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    className={`w-full px-2.5 py-2 rounded-[5px] border text-left text-xs flex items-center gap-2 ${
                      selected
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border text-foreground hover:bg-muted/50'
                    }`}
                    onClick={() => {
                      setAutomationOptions((prev) => ({ ...prev, templateId: template.id }));
                      setIsTemplateMenuOpen(false);
                    }}
                  >
                    <div
                      className={`w-14 h-9 rounded-[4px] border border-[hsl(var(--editor-input-border))] overflow-hidden flex-shrink-0 relative shadow-sm ${template.previewColor}`}
                    >
                      {template.layout === 'split' && (
                        <div className="absolute inset-0 flex">
                          <div className="w-1/2 h-full bg-black/12" />
                        </div>
                      )}
                      {template.layout === 'centered' && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-1/2 h-1/2 bg-black/12 rounded-sm" />
                        </div>
                      )}
                    </div>
                    <span className="truncate flex-1">{template.name}</span>
                    {selected && <Check size={14} className="shrink-0" />}
                  </button>
                );
              })}
              {filteredTemplates.length === 0 && (
                <p className="text-xs text-muted-foreground px-2 py-3">No template found.</p>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default ScriptImportCard;
