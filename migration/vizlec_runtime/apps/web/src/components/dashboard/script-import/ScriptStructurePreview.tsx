import React from 'react';
import { ParsedCourseScript } from '../../../lib/courseScriptMarkdown';

interface ScriptStructurePreviewProps {
  parsed: ParsedCourseScript;
}

const ScriptStructurePreview: React.FC<ScriptStructurePreviewProps> = ({ parsed }) => {
  const totalModuleLessons = parsed.modules.reduce((sum, moduleItem) => sum + moduleItem.lessons.length, 0);

  return (
    <div className="space-y-4 p-1 text-left">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-[5px] px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${parsed.detected.hasCourseHeading ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>H1 Course</span>
        <span className={`rounded-[5px] px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${parsed.detected.hasModuleHeadings ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>H2 Modules</span>
        <span className={`rounded-[5px] px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${parsed.detected.hasLessonHeadings ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>H3 Lessons</span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="px-1 py-1">
          <p className="text-muted-foreground uppercase tracking-wide text-[10px] font-bold">Course</p>
          <p className="font-semibold mt-1">{parsed.courseTitle ?? 'Not defined in file'}</p>
        </div>
        <div className="px-1 py-1">
          <p className="text-muted-foreground uppercase tracking-wide text-[10px] font-bold">Detected</p>
          <p className="font-semibold mt-1">{parsed.stats.moduleCount} modules, {parsed.stats.lessonCount} lessons</p>
        </div>
      </div>

      {parsed.modules.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Modules in file</p>
          <div className="max-h-40 overflow-auto custom-scrollbar space-y-1 pr-1">
            {parsed.modules.map((moduleItem, index) => (
              <div key={`${moduleItem.title}-${index}`} className="px-1 py-2">
                <p className="text-sm font-semibold">{moduleItem.title || `Untitled Module ${index + 1}`}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {moduleItem.lessons.length} lessons
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {parsed.standaloneLessons.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Standalone lessons (no H2 module)</p>
          <div className="max-h-40 overflow-auto custom-scrollbar space-y-1 pr-1">
            {parsed.standaloneLessons.map((lesson, index) => (
              <div key={`${lesson.title}-${index}`} className="px-1 py-2">
                <p className="text-sm font-semibold">{lesson.title || `Untitled Lesson ${index + 1}`}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {lesson.scriptText ? `${lesson.scriptText.length} chars` : 'No script content'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {totalModuleLessons === 0 && parsed.standaloneLessons.length === 0 && parsed.detected.hasCourseHeading && (
        <p className="text-xs text-muted-foreground">Only a course heading was found. You can create the course from this file.</p>
      )}

      {parsed.warnings.length > 0 && (
        <div className="space-y-1 px-1 py-1 text-amber-800 dark:text-amber-300">
          <p className="text-[11px] font-bold uppercase tracking-wide">Warnings</p>
          {parsed.warnings.slice(0, 4).map((warning, idx) => (
            <p key={`${warning.line}-${idx}`} className="text-xs">Line {warning.line}: {warning.message}</p>
          ))}
          {parsed.warnings.length > 4 && (
            <p className="text-xs">+{parsed.warnings.length - 4} more warning(s)</p>
          )}
        </div>
      )}
    </div>
  );
};

export default ScriptStructurePreview;
