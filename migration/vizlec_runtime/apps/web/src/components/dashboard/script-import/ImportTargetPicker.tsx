import React, { useMemo } from 'react';
import { ParsedCourseScript } from '../../../lib/courseScriptMarkdown';

export type CourseLite = {
  id: string;
  name: string;
};

export type ModuleLite = {
  id: string;
  name: string;
  order: number;
};

export type ImportConfigState = {
  courseMode: 'create' | 'existing';
  newCourseName: string;
  selectedCourseId: string;
  moduleStartOrder: number;
  standaloneTargetModuleId: string;
};

interface ImportTargetPickerProps {
  parsed: ParsedCourseScript;
  config: ImportConfigState;
  setConfig: React.Dispatch<React.SetStateAction<ImportConfigState>>;
  courses: CourseLite[];
  courseSearch: string;
  setCourseSearch: (value: string) => void;
  modules: ModuleLite[];
  moduleSearch: string;
  setModuleSearch: (value: string) => void;
}

const ImportTargetPicker: React.FC<ImportTargetPickerProps> = ({
  parsed,
  config,
  setConfig,
  courses,
  courseSearch,
  setCourseSearch,
  modules,
  moduleSearch,
  setModuleSearch
}) => {
  const hasCourseInFile = Boolean(parsed.courseTitle?.trim());
  const hasModulesToCreate = parsed.modules.length > 0;
  const hasStandaloneLessons = parsed.standaloneLessons.length > 0;
  const hasOnlyCourseHeading =
    parsed.detected.hasCourseHeading && !hasModulesToCreate && !hasStandaloneLessons;

  const filteredCourses = useMemo(() => {
    const q = courseSearch.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter((course) => course.name.toLowerCase().includes(q));
  }, [courseSearch, courses]);

  const filteredModules = useMemo(() => {
    const q = moduleSearch.trim().toLowerCase();
    if (!q) return modules;
    return modules.filter((moduleItem) => moduleItem.name.toLowerCase().includes(q));
  }, [moduleSearch, modules]);

  return (
    <div className="space-y-5 p-1 text-left">
      <div className="border-t border-dashed border-border/70" />

      {!hasOnlyCourseHeading && (
        <div className="space-y-2">
          <p className="text-xs font-semibold">Course target</p>
          <div className="relative inline-grid w-full grid-cols-2 h-9 rounded-[7px] bg-[hsl(var(--editor-input))] p-0.5">
            <span
              className={`absolute left-0.5 top-0.5 bottom-0.5 w-[calc(50%-3px)] rounded-[5px] bg-[hsl(var(--editor-surface))] shadow-sm transition-transform duration-200 ease-out ${
                config.courseMode === 'existing' ? 'translate-x-[calc(100%+2px)]' : 'translate-x-0'
              }`}
            />
            <button
              type="button"
              onClick={() => setConfig((prev) => ({ ...prev, courseMode: 'create' }))}
              className={`relative z-10 h-8 rounded-[5px] text-[10px] font-bold uppercase tracking-wide transition-colors ${
                config.courseMode === 'create'
                  ? 'text-muted-foreground'
                  : 'text-muted-foreground/80 hover:text-muted-foreground'
              }`}
            >
              Create new course
            </button>
            <button
              type="button"
              onClick={() => setConfig((prev) => ({ ...prev, courseMode: 'existing' }))}
              className={`relative z-10 h-8 rounded-[5px] text-[10px] font-bold uppercase tracking-wide transition-colors ${
                config.courseMode === 'existing'
                  ? 'text-muted-foreground'
                  : 'text-muted-foreground/80 hover:text-muted-foreground'
              }`}
            >
              Use existing course
            </button>
          </div>
        </div>
      )}

      {(config.courseMode === 'create' || hasOnlyCourseHeading) && (
        <div className="space-y-2">
          <label className="text-xs font-semibold">New course name</label>
          <input
            className="h-9 w-full rounded-[5px] border border-[hsl(var(--editor-input-border))] bg-[hsl(var(--editor-input))] px-3 text-sm outline-none focus:border-primary/40"
            value={config.newCourseName}
            onChange={(event) => setConfig((prev) => ({ ...prev, newCourseName: event.target.value }))}
            placeholder="Type course name"
          />
          {hasCourseInFile && (
            <p className="text-[11px] text-muted-foreground">Detected from file: {parsed.courseTitle}</p>
          )}
        </div>
      )}

      {config.courseMode === 'existing' && (
        <div className="space-y-2">
          <label className="text-xs font-semibold">Find course</label>
          <input
            className="h-9 w-full rounded-[5px] border border-[hsl(var(--editor-input-border))] bg-[hsl(var(--editor-input))] px-3 text-sm outline-none focus:border-primary/40"
            value={courseSearch}
            onChange={(event) => setCourseSearch(event.target.value)}
            placeholder="Search by course name"
          />
          <div className="max-h-36 overflow-auto custom-scrollbar space-y-1 pr-1">
            {filteredCourses.map((course) => (
              <button
                key={course.id}
                type="button"
                className={`w-full rounded-[5px] border px-2 py-2 text-left text-sm transition-colors ${
                  config.selectedCourseId === course.id
                    ? 'border-primary text-primary'
                    : 'border-border text-foreground'
                }`}
                onClick={() => setConfig((prev) => ({ ...prev, selectedCourseId: course.id }))}
              >
                {course.name}
              </button>
            ))}
            {filteredCourses.length === 0 && (
              <p className="rounded-[5px] border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                No courses found.
              </p>
            )}
          </div>
        </div>
      )}

      {hasModulesToCreate && config.courseMode === 'existing' && (
        <div className="space-y-2">
          <label className="text-xs font-semibold">Starting module order</label>
          <input
            type="number"
            min={1}
            step={1}
            className="h-9 w-full rounded-[5px] border border-[hsl(var(--editor-input-border))] bg-[hsl(var(--editor-input))] px-3 text-sm outline-none focus:border-primary/40"
            value={config.moduleStartOrder}
            onChange={(event) => {
              const next = Math.max(1, Number(event.target.value || 1));
              setConfig((prev) => ({ ...prev, moduleStartOrder: next }));
            }}
          />
          <p className="text-[11px] text-muted-foreground">
            New modules will be appended from this order and incremented sequentially.
          </p>
        </div>
      )}

      {hasStandaloneLessons && (
        <div className="space-y-2">
          <label className="text-xs font-semibold">Target module for standalone lessons</label>
          <input
            className="h-9 w-full rounded-[5px] border border-[hsl(var(--editor-input-border))] bg-[hsl(var(--editor-input))] px-3 text-sm outline-none focus:border-primary/40"
            value={moduleSearch}
            onChange={(event) => setModuleSearch(event.target.value)}
            placeholder="Search module"
          />
          <div className="max-h-36 overflow-auto custom-scrollbar space-y-1 pr-1">
            {filteredModules.map((moduleItem) => (
              <button
                key={moduleItem.id}
                type="button"
                className={`w-full rounded-[5px] border px-2 py-2 text-left text-sm transition-colors ${
                  config.standaloneTargetModuleId === moduleItem.id
                    ? 'border-primary text-primary'
                    : 'border-border text-foreground'
                }`}
                onClick={() => setConfig((prev) => ({ ...prev, standaloneTargetModuleId: moduleItem.id }))}
              >
                <span className="font-semibold">{moduleItem.order}. {moduleItem.name}</span>
              </button>
            ))}
            {filteredModules.length === 0 && (
              <p className="rounded-[5px] border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                No modules found for the selected course.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ImportTargetPicker;
