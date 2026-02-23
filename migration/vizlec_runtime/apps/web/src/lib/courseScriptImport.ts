import { apiPost } from './api';
import { ParsedCourseScript } from './courseScriptMarkdown';

type CreatedCourse = {
  id: string;
  name: string;
};

type CreatedModule = {
  id: string;
};

type CreatedLesson = {
  id: string;
};

type CreatedVersion = {
  id: string;
};

export type ImportCourseScriptProgress = {
  step: string;
  current: number;
  total: number;
  stage?: 'structure' | 'generation' | 'completed';
  kind?:
    | 'course'
    | 'module'
    | 'lesson'
    | 'script'
    | 'segment'
    | 'segment_wait'
    | 'queue_audio'
    | 'queue_image'
    | 'done';
  moduleTitle?: string;
  lessonTitle?: string;
  phaseCurrent?: number;
  phaseTotal?: number;
};

export type ImportCourseScriptResult = {
  courseId: string | null;
  createdCourse: CreatedCourse | null;
  moduleCount: number;
  lessonCount: number;
  queuedAudioJobs: number;
  queuedImageJobs: number;
  warnings: string[];
};

export type ImportCourseScriptPlan = {
  courseTarget:
    | {
        mode: 'create';
        name: string;
      }
    | {
        mode: 'existing';
        courseId: string;
      };
  moduleStartOrder: number;
  standaloneLessonsTargetModuleId: string | null;
};

export type ImportAutomationOptions = {
  generateAudio: boolean;
  generateImage: boolean;
  voiceId?: string | null;
  templateId?: string | null;
};

export type ImportExecutionControl = {
  shouldCancel?: () => boolean;
  onSegmentJobChange?: (jobId: string | null) => void;
  onResourceCreated?: (
    type: 'course' | 'module' | 'lesson' | 'version',
    id: string
  ) => void;
};

const IMPORT_CANCELED = '__IMPORT_CANCELED__';

const assertNotCanceled = (control?: ImportExecutionControl) => {
  if (control?.shouldCancel?.()) {
    throw new Error(IMPORT_CANCELED);
  }
};

const trimRequired = (value: string, label: string) => {
  const next = value.trim();
  if (!next) {
    throw new Error(`${label} is required.`);
  }
  return next;
};

const makeRequestId = () => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // ignore and fallback
  }
  return `import-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const queueSegmentationForVersion = async (
  versionId: string,
  lessonTitle: string,
  moduleTitle: string | undefined,
  notify: (
    step: string,
    meta?: Omit<ImportCourseScriptProgress, 'step' | 'current' | 'total'>,
    advance?: boolean
  ) => void,
  control?: ImportExecutionControl
) => {
  assertNotCanceled(control);
  const segmentJob = await apiPost<{ id: string }>(`/video-versions/${versionId}/segment`, {
    requestId: makeRequestId(),
    purge: true
  });
  control?.onSegmentJobChange?.(segmentJob.id);
  notify('Segmentation queued.', {
    kind: 'segment',
    moduleTitle,
    lessonTitle,
    phaseCurrent: 1,
    phaseTotal: 1
  });
  control?.onSegmentJobChange?.(null);
};

const queueAudioForVersion = async (
  versionId: string,
  lessonTitle: string,
  moduleTitle: string | undefined,
  voiceId: string | null | undefined,
  notify: (
    step: string,
    meta?: Omit<ImportCourseScriptProgress, 'step' | 'current' | 'total'>,
    advance?: boolean
  ) => void,
  control?: ImportExecutionControl
) => {
  assertNotCanceled(control);
  await apiPost<{ id: string }>(`/video-versions/${versionId}/tts`, {
    requestId: makeRequestId(),
    ...(voiceId ? { voiceId } : {})
  });
  notify('Audio generation queued.', {
    kind: 'queue_audio',
    moduleTitle,
    lessonTitle,
    phaseCurrent: 1,
    phaseTotal: 1
  });
};

const queueImageForVersion = async (
  versionId: string,
  lessonTitle: string,
  moduleTitle: string | undefined,
  templateId: string | null | undefined,
  notify: (
    step: string,
    meta?: Omit<ImportCourseScriptProgress, 'step' | 'current' | 'total'>,
    advance?: boolean
  ) => void,
  control?: ImportExecutionControl
) => {
  assertNotCanceled(control);
  await apiPost<{ id: string }>(`/video-versions/${versionId}/images`, {
    requestId: makeRequestId(),
    ...(templateId ? { templateId } : {})
  });
  notify('Image generation queued.', {
    kind: 'queue_image',
    moduleTitle,
    lessonTitle,
    phaseCurrent: 1,
    phaseTotal: 1
  });
};

export async function importCourseScript(
  parsed: ParsedCourseScript,
  plan: ImportCourseScriptPlan,
  automation: ImportAutomationOptions,
  onProgress?: (progress: ImportCourseScriptProgress) => void,
  control?: ImportExecutionControl
): Promise<ImportCourseScriptResult> {
  assertNotCanceled(control);
  if (parsed.modules.length > 0 && plan.courseTarget.mode !== 'create' && plan.courseTarget.mode !== 'existing') {
    throw new Error('A target course is required to import modules.');
  }
  if (parsed.standaloneLessons.length > 0 && !plan.standaloneLessonsTargetModuleId) {
    throw new Error('A target module is required to import standalone lessons.');
  }

  const lessonTotal =
    parsed.modules.reduce((sum, moduleItem) => sum + moduleItem.lessons.length, 0) +
    parsed.standaloneLessons.length;
  const automationStepsPerLesson =
    automation.generateAudio || automation.generateImage
      ? 2 + (automation.generateAudio ? 1 : 0) + (automation.generateImage ? 1 : 0)
      : 0;
  const totalSteps =
    (plan.courseTarget.mode === 'create' ? 1 : 0) +
    parsed.modules.length +
    parsed.modules.reduce((sum, moduleItem) => sum + moduleItem.lessons.length * 2, 0) +
    parsed.standaloneLessons.length * 2 +
    lessonTotal * automationStepsPerLesson;
  let currentStep = 0;

  const notify = (
    step: string,
    meta?: Omit<ImportCourseScriptProgress, 'step' | 'current' | 'total'>,
    advance = true
  ) => {
    if (advance) currentStep += 1;
    onProgress?.({ step, current: currentStep, total: totalSteps, ...meta });
  };

  const stageFromKind = (
    kind?: ImportCourseScriptProgress['kind']
  ): ImportCourseScriptProgress['stage'] => {
    switch (kind) {
      case 'segment':
      case 'segment_wait':
      case 'queue_audio':
      case 'queue_image':
        return 'generation';
      case 'done':
        return 'completed';
      default:
        return 'structure';
    }
  };

  const notifyWithStage = (
    step: string,
    meta?: Omit<ImportCourseScriptProgress, 'step' | 'current' | 'total' | 'stage'>,
    advance = true
  ) => {
    notify(step, { ...meta, stage: stageFromKind(meta?.kind) }, advance);
  };

  let courseId: string | null = null;
  let createdCourse: CreatedCourse | null = null;
  let createdModuleCount = 0;
  let createdLessonCount = 0;
  let queuedAudioJobs = 0;
  let queuedImageJobs = 0;
  const warnings: string[] = [];
  let nextModuleOrder = Math.max(1, Math.trunc(plan.moduleStartOrder || 1));
  const versionsToAutomate: Array<{
    versionId: string;
    lessonTitle: string;
    moduleTitle?: string;
  }> = [];

  if (plan.courseTarget.mode === 'create') {
    assertNotCanceled(control);
    const name = trimRequired(plan.courseTarget.name, 'Course name');
    createdCourse = await apiPost<CreatedCourse>('/channels', { name });
    courseId = createdCourse.id;
    control?.onResourceCreated?.('course', createdCourse.id);
    notifyWithStage(`Course created: ${createdCourse.name}`, { kind: 'course' });
  } else {
    courseId = plan.courseTarget.courseId;
  }

  const createLessonAndVersion = async (moduleId: string, title: string, scriptText: string) => {
    assertNotCanceled(control);
    const lesson = await apiPost<CreatedLesson>(`/sections/${moduleId}/videos`, {
      title: trimRequired(title, 'Lesson title')
    });
    control?.onResourceCreated?.('lesson', lesson.id);
    notifyWithStage(`Lesson created: ${title}`, { kind: 'lesson', lessonTitle: title });
    const version = await apiPost<CreatedVersion>(`/videos/${lesson.id}/versions`, {
      scriptText,
      ...(automation.voiceId ? { preferredVoiceId: automation.voiceId } : {}),
      ...(automation.templateId ? { preferredTemplateId: automation.templateId } : {})
    });
    control?.onResourceCreated?.('version', version.id);
    notifyWithStage(`Script imported: ${title}`, { kind: 'script', lessonTitle: title });
    createdLessonCount += 1;
    return { lesson, version };
  };

  if (parsed.modules.length > 0) {
    if (!courseId) {
      throw new Error('Target course not resolved.');
    }
    for (const moduleInput of parsed.modules) {
      assertNotCanceled(control);
      const moduleRecord = await apiPost<CreatedModule>(`/channels/${courseId}/sections`, {
        name: trimRequired(moduleInput.title, 'Module title'),
        order: nextModuleOrder
      });
      control?.onResourceCreated?.('module', moduleRecord.id);
      notifyWithStage(`Module created: ${moduleInput.title}`, {
        kind: 'module',
        moduleTitle: moduleInput.title
      });
      createdModuleCount += 1;
      nextModuleOrder += 1;

      for (const lessonInput of moduleInput.lessons) {
        const { version } = await createLessonAndVersion(
          moduleRecord.id,
          lessonInput.title,
          lessonInput.scriptText
        );
        versionsToAutomate.push({
          versionId: version.id,
          lessonTitle: lessonInput.title,
          moduleTitle: moduleInput.title
        });
      }
    }
  }

  if (parsed.standaloneLessons.length > 0 && plan.standaloneLessonsTargetModuleId) {
    for (const lessonInput of parsed.standaloneLessons) {
      assertNotCanceled(control);
      const { version } = await createLessonAndVersion(
        plan.standaloneLessonsTargetModuleId,
        lessonInput.title,
        lessonInput.scriptText
      );
      versionsToAutomate.push({
        versionId: version.id,
        lessonTitle: lessonInput.title
      });
    }
  }

  for (const item of versionsToAutomate) {
    try {
      await queueSegmentationForVersion(
        item.versionId,
        item.lessonTitle,
        item.moduleTitle,
        notifyWithStage,
        control
      );
    } catch (err) {
      warnings.push(`Segmentation queue failed for lesson "${item.lessonTitle}": ${(err as Error).message || 'unknown error'}`);
    }
  }

  if (automation.generateAudio) {
    for (const item of versionsToAutomate) {
      try {
        await queueAudioForVersion(
          item.versionId,
          item.lessonTitle,
          item.moduleTitle,
          automation.voiceId ?? null,
          notifyWithStage,
          control
        );
        queuedAudioJobs += 1;
      } catch (err) {
        warnings.push(`Audio queue failed for lesson "${item.lessonTitle}": ${(err as Error).message || 'unknown error'}`);
      }
    }
  }

  if (automation.generateImage) {
    for (const item of versionsToAutomate) {
      try {
        await queueImageForVersion(
          item.versionId,
          item.lessonTitle,
          item.moduleTitle,
          automation.templateId ?? null,
          notifyWithStage,
          control
        );
        queuedImageJobs += 1;
      } catch (err) {
        warnings.push(`Image queue failed for lesson "${item.lessonTitle}": ${(err as Error).message || 'unknown error'}`);
      }
    }
  }

  return {
    courseId,
    createdCourse,
    moduleCount: createdModuleCount,
    lessonCount: createdLessonCount,
    queuedAudioJobs,
    queuedImageJobs,
    warnings
  };
}

export { IMPORT_CANCELED };
