export type CourseScriptIssue = {
  line: number;
  message: string;
};

export type CourseScriptLesson = {
  title: string;
  scriptText: string;
};

export type CourseScriptModule = {
  title: string;
  lessons: CourseScriptLesson[];
};

export type ParsedCourseScript = {
  courseTitle: string | null;
  modules: CourseScriptModule[];
  standaloneLessons: CourseScriptLesson[];
  detected: {
    hasCourseHeading: boolean;
    hasModuleHeadings: boolean;
    hasLessonHeadings: boolean;
  };
  stats: {
    moduleCount: number;
    lessonCount: number;
  };
  warnings: CourseScriptIssue[];
};

export type ParseCourseScriptResult =
  | { ok: true; data: ParsedCourseScript }
  | { ok: false; issues: CourseScriptIssue[] };

const COURSE_HEADING_RE = /^#\s+(.+)\s*$/;
const MODULE_HEADING_RE = /^##\s+(.+)\s*$/;
const LESSON_HEADING_RE = /^###\s+(.+)\s*$/;
const normalizeEscapedDash = (value: string) => value.replace(/\\-/g, '-');

export function parseCourseScriptMarkdown(raw: string): ParseCourseScriptResult {
  const issues: CourseScriptIssue[] = [];
  const warnings: CourseScriptIssue[] = [];
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  let courseTitle: string | null = null;
  const modules: CourseScriptModule[] = [];
  const standaloneLessons: CourseScriptLesson[] = [];
  let currentModule: CourseScriptModule | null = null;
  let currentLesson: CourseScriptLesson | null = null;
  let currentLessonInStandalone = false;
  let lessonBuffer: string[] = [];
  let hasCourseHeading = false;
  let hasModuleHeadings = false;
  let hasLessonHeadings = false;

  const finalizeLesson = (lineNumber: number) => {
    if (!currentLesson) return;
    const scriptText = lessonBuffer.join('\n').trim();
    if (!scriptText) {
      warnings.push({
        line: lineNumber,
        message: `Lesson "${currentLesson.title}" has no script content.`
      });
    }
    currentLesson.scriptText = scriptText;
    if (currentLessonInStandalone) {
      standaloneLessons.push(currentLesson);
    } else {
      currentModule?.lessons.push(currentLesson);
    }
    currentLesson = null;
    currentLessonInStandalone = false;
    lessonBuffer = [];
  };

  const finalizeModule = (lineNumber: number) => {
    if (!currentModule) return;
    if (currentModule.lessons.length === 0) {
      issues.push({
        line: lineNumber,
        message: `Module "${currentModule.title}" has no lessons.`
      });
    }
    modules.push(currentModule);
    currentModule = null;
  };

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const normalizedLine = normalizeEscapedDash(line);

    const courseMatch = normalizedLine.match(COURSE_HEADING_RE);
    if (courseMatch) {
      hasCourseHeading = true;
      courseTitle = courseMatch[1].trim();
      return;
    }

    const moduleMatch = normalizedLine.match(MODULE_HEADING_RE);
    if (moduleMatch) {
      hasModuleHeadings = true;
      finalizeLesson(lineNumber);
      finalizeModule(lineNumber);
      const title = moduleMatch[1].trim();
      if (!title) {
        issues.push({
          line: lineNumber,
          message: 'Module title is empty.'
        });
      }
      currentModule = { title, lessons: [] };
      return;
    }

    const lessonMatch = normalizedLine.match(LESSON_HEADING_RE);
    if (lessonMatch) {
      hasLessonHeadings = true;
      finalizeLesson(lineNumber);
      const title = lessonMatch[1].trim();
      if (!title) {
        issues.push({
          line: lineNumber,
          message: 'Lesson title is empty.'
        });
      }
      currentLesson = { title, scriptText: '' };
      currentLessonInStandalone = !currentModule;
      return;
    }

    if (currentLesson) {
      lessonBuffer.push(normalizedLine);
    }
  });

  finalizeLesson(lines.length);
  finalizeModule(lines.length);

  if (!hasCourseHeading && !hasModuleHeadings && !hasLessonHeadings) {
    issues.push({
      line: 1,
      message: 'No supported heading found. Use #, ##, or ### headings.'
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    data: {
      courseTitle,
      modules,
      standaloneLessons,
      detected: {
        hasCourseHeading,
        hasModuleHeadings,
        hasLessonHeadings
      },
      stats: {
        moduleCount: modules.length,
        lessonCount:
          standaloneLessons.length +
          modules.reduce((sum, moduleItem) => sum + moduleItem.lessons.length, 0)
      },
      warnings
    }
  };
}
