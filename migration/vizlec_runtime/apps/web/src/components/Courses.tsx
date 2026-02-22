import React, { useMemo, useState } from 'react';
import {
  Star,
  Eye,
  PlayCircle,
  Filter,
  ArrowUpDown,
  Pencil,
  LayoutGrid,
  List,
  Smartphone,
  Maximize2,
  MoreHorizontal,
  Loader2
} from 'lucide-react';
import { ViewType, Course } from '../types';
import { Card } from './ui/card';
import { Button } from './ui/button';

interface CoursesProps {
  courses: Course[];
  error?: string | null;
  setView: (view: ViewType) => void;
  onSelectCourse: (course: Course) => void;
  onEditCourse: (course: Course) => void;
  onAddCourse: () => void;
  onImageClick?: (url: string) => void;
}

const Courses: React.FC<CoursesProps> = ({ courses, error, setView, onSelectCourse, onEditCourse, onImageClick }) => {
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'stream'>('grid');

  const getBuildActivityState = (course: Course): 'idle' | 'queued' | 'running' => {
    const jobs = course.build?.jobs;
    if (!jobs) return 'idle';
    const running =
      jobs.blocks.running +
      jobs.audio.running +
      jobs.images.running +
      jobs.video.running;
    if (running > 0) return 'running';
    const pending =
      jobs.blocks.pending +
      jobs.audio.pending +
      jobs.images.pending +
      jobs.video.pending;
    if (pending > 0) return 'queued';
    return 'idle';
  };

  const hasBuildActivity = (course: Course) => {
    return getBuildActivityState(course) !== 'idle';
  };

  const getCourseThumb = (course: Course, mode: 'landscape' | 'portrait') => {
    if (mode === 'portrait') {
      return course.thumbPortrait || course.thumbLandscape || course.thumbnail || '/course-placeholder-portrait.svg';
    }
    return course.thumbLandscape || course.thumbnail || '/course-placeholder.svg';
  };

  const formatLastUpdated = (value?: string) => {
    if (!value) return 'Updated -';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Updated -';
    return `Updated ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  };

  const courseRecencyTag = useMemo(() => {
    const now = Date.now();
    const seventyTwoHoursMs = 72 * 60 * 60 * 1000;
    return courses.reduce<Record<string, 'new' | 'updated'>>((acc, course) => {
      if (!course.lastUpdated) return acc;
      const updatedAtMs = new Date(course.lastUpdated).getTime();
      if (!Number.isFinite(updatedAtMs)) return acc;
      acc[course.id] = now - updatedAtMs <= seventyTwoHoursMs ? 'new' : 'updated';
      return acc;
    }, {});
  }, [courses]);

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="p-8 max-w-7xl mx-auto pb-24">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">My Courses</h2>
            <p className="text-sm text-muted-foreground mt-1 font-medium">Manage your curriculum and student engagement.</p>
          </div>

          <div className="flex items-center gap-3 bg-card p-1.5 rounded-[5px] border border-border shadow-sm">
            <div className="flex items-center gap-1 mr-2 border-r border-border pr-2">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-[3px] transition-all ${viewMode === 'grid' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-orange-600'}`}
                title="Grid View"
              >
                <LayoutGrid size={18} strokeWidth={2} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-[3px] transition-all ${viewMode === 'list' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-orange-600'}`}
                title="List View"
              >
                <List size={18} strokeWidth={2} />
              </button>
              <button
                onClick={() => setViewMode('stream')}
                className={`p-1.5 rounded-[3px] transition-all ${viewMode === 'stream' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-orange-600'}`}
                title="9:16 Stream View"
              >
                <Smartphone size={18} strokeWidth={2} />
              </button>
            </div>

            <button className="p-1.5 text-slate-400 hover:text-orange-600 transition-all h-9">
              <Filter size={18} strokeWidth={1.5} />
            </button>
            <button className="p-1.5 text-slate-400 hover:text-orange-600 transition-all h-9">
              <ArrowUpDown size={18} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-[5px] border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-200">
            Failed to load courses: {error}
          </div>
        )}

        {viewMode === 'stream' ? (
          <div className="flex gap-6 overflow-x-auto pb-4 pr-4">
            {courses.map((course) => (
              <div
                key={course.id}
                className="min-w-[190px] max-w-[190px] flex-shrink-0 cursor-pointer group"
                onClick={() => onSelectCourse(course)}
              >
                <div className="relative aspect-[9/16] overflow-hidden rounded-[6px] border border-border/70 bg-slate-100 dark:bg-slate-800 shadow-[0_2px_8px_-4px_rgba(15,23,42,0.18)] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-[0_10px_22px_-12px_rgba(15,23,42,0.34)]">
                  <img
                    src={getCourseThumb(course, 'portrait')}
                    alt={course.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-90 transition-opacity group-hover:opacity-100" />
                  {courseRecencyTag[course.id] ? (
                    <div
                      className={`absolute left-2.5 top-2.5 inline-flex items-center justify-center rounded-[5px] px-2.5 py-1 text-center text-[9px] font-black uppercase leading-none tracking-[0.16em] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${
                        courseRecencyTag[course.id] === 'new'
                          ? 'bg-orange-500/80'
                          : 'bg-[#3d2a1f]/80 border border-orange-500/40'
                      }`}
                    >
                      {courseRecencyTag[course.id] === 'new' ? 'NEW' : 'UPDATED'}
                    </div>
                  ) : null}
                  <div className="absolute right-2 top-2 z-20 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onImageClick?.(getCourseThumb(course, 'portrait'));
                      }}
                      className="h-8 w-8 rounded-[5px] bg-white/90 text-slate-600 shadow-sm transition-colors hover:text-primary dark:bg-slate-900/90 dark:text-slate-300"
                      aria-label="Expand image"
                      title="Expand image"
                    >
                      <Maximize2 size={14} className="mx-auto" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditCourse(course);
                      }}
                      className="h-8 w-8 rounded-[5px] bg-white/90 text-slate-600 shadow-sm transition-colors hover:text-primary dark:bg-slate-900/90 dark:text-slate-300"
                      aria-label="Edit course"
                      title="Edit course"
                    >
                      <Pencil size={14} className="mx-auto" />
                    </button>
                  </div>
                  <div className="absolute inset-x-2 bottom-2 z-20 flex items-center justify-between">
                    <span className="inline-flex items-center justify-center rounded-[5px] bg-black/80 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                      {hasBuildActivity(course)
                        ? getBuildActivityState(course) === 'running'
                          ? 'Processing'
                          : 'Queued'
                        : 'Ready'}
                    </span>
                    <span className="inline-flex items-center justify-center rounded-[5px] bg-black/80 px-2 py-0.5 text-xs font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                      {course.price}
                    </span>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 p-3 min-h-[108px] flex flex-col justify-end">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-orange-300/95 mb-1">
                      {course.category || 'Course'}
                    </p>
                    <h3 className="text-sm font-bold text-white leading-[1.15] line-clamp-3 min-h-[3.45rem]">
                      {course.title}
                    </h3>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-semibold">{course.lessons} lessons</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 font-semibold">{course.build?.progressPercent ?? 0}% built</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold uppercase tracking-tight">
                  <span className="inline-flex items-center gap-1 text-cyan-500">
                    <Star size={11} fill="currentColor" strokeWidth={0} />
                    {course.rating} ({course.reviews})
                  </span>
                  <span className="inline-flex items-center gap-1 text-slate-400">
                    <Eye size={11} strokeWidth={2} />
                    {course.views}
                  </span>
                  <span className="text-slate-400">{course.moduleCount ?? 0} modules</span>
                  <span className="inline-flex items-center gap-1 text-amber-500">
                    <PlayCircle size={11} strokeWidth={2} />
                    {course.lessons} lessons
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-orange-600 transition-all duration-500"
                    style={{ width: `${Math.max(0, Math.min(100, course.build?.progressPercent ?? 0))}%` }}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <img
                      src={course.instructor.avatar || '/avatar-placeholder.svg'}
                      alt={course.instructor.name}
                      className="w-7 h-7 rounded-full border border-slate-200 dark:border-slate-700 object-cover"
                    />
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold truncate">{course.instructor.name}</p>
                      <p className="text-[10px] font-medium text-amber-500 truncate">{course.instructor.role}</p>
                    </div>
                  </div>
                  <div className="text-right text-[11px] text-muted-foreground">
                    <p>{course.students} students</p>
                    <p>{course.moduleCount ?? 0} modules</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {courses.map((course) => (
              <Card
                key={course.id}
                className="overflow-hidden transition-all group flex flex-col rounded-[6px] border-border/70 shadow-[0_2px_8px_-4px_rgba(15,23,42,0.18)] hover:-translate-y-0.5 hover:shadow-[0_12px_26px_-14px_rgba(15,23,42,0.36)]"
              >
                <div className="relative aspect-video overflow-hidden cursor-pointer" onClick={() => onSelectCourse(course)}>
                  <img
                    src={getCourseThumb(course, 'landscape')}
                    alt={course.title}
                    className="w-full h-full object-cover group-hover:scale-[1.06] transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent opacity-80" />
                  {courseRecencyTag[course.id] ? (
                    <div
                      className={`absolute left-3 top-3 inline-flex items-center justify-center rounded-[5px] px-2.5 py-1 text-center text-[9px] font-black uppercase leading-none tracking-[0.16em] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${
                        courseRecencyTag[course.id] === 'new'
                          ? 'bg-orange-500/80'
                          : 'bg-[#3d2a1f]/80 border border-orange-500/40'
                      }`}
                    >
                      {courseRecencyTag[course.id] === 'new' ? 'NEW' : 'UPDATED'}
                    </div>
                  ) : null}
                  <div className="absolute right-3 top-3 z-20 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onImageClick?.(getCourseThumb(course, 'landscape'));
                      }}
                      className="h-8 w-8 rounded-[5px] bg-white/90 text-slate-600 shadow-sm transition-colors hover:text-primary dark:bg-slate-900/90 dark:text-slate-300"
                      aria-label="Expand image"
                      title="Expand image"
                    >
                      <Maximize2 size={14} className="mx-auto" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditCourse(course);
                      }}
                      className="h-8 w-8 rounded-[5px] bg-white/90 text-slate-600 shadow-sm transition-colors hover:text-primary dark:bg-slate-900/90 dark:text-slate-300"
                      aria-label="Edit course"
                      title="Edit course"
                    >
                      <Pencil size={14} className="mx-auto" />
                    </button>
                  </div>
                  <div className="absolute inset-x-3 bottom-3 z-20 flex items-center justify-between">
                    <span className="inline-flex items-center justify-center rounded-[5px] bg-black/80 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                      {hasBuildActivity(course)
                        ? getBuildActivityState(course) === 'running'
                          ? 'Processing'
                          : 'Queued'
                        : 'Ready'}
                    </span>
                    <span className="inline-flex items-center justify-center rounded-[5px] bg-black/80 px-2 py-0.5 text-xs font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                      {course.price}
                    </span>
                  </div>
                </div>

                <div className="p-4 flex-1 cursor-pointer" onClick={() => onSelectCourse(course)}>
                  <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold uppercase tracking-tight">
                    <span className="inline-flex items-center gap-1 text-cyan-500">
                      <Star size={12} fill="currentColor" strokeWidth={0} />
                      {course.rating} ({course.reviews})
                    </span>
                    <span className="inline-flex items-center gap-1 text-slate-400">
                      <Eye size={12} strokeWidth={2} />
                      {course.views}
                    </span>
                    <span className="text-slate-400">{course.moduleCount ?? 0} modules</span>
                    <span className="inline-flex items-center gap-1 text-amber-500">
                      <PlayCircle size={12} strokeWidth={2} />
                      {course.lessons} lessons
                    </span>
                  </div>

                  <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-orange-600">
                    {course.category || 'Course'}
                  </p>

                  <h3 className="min-h-[2.5rem] overflow-hidden text-base font-bold leading-tight line-clamp-2 break-words">
                    {course.title}
                  </h3>

                  <p className="mt-2 text-xs text-muted-foreground font-medium">
                    {course.lessons} Lessons • {course.build?.progressPercent ?? 0}% built
                  </p>

                  <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-orange-600 transition-all duration-500"
                      style={{ width: `${Math.max(0, Math.min(100, course.build?.progressPercent ?? 0))}%` }}
                    />
                  </div>

                  <div className="mt-3 flex items-center justify-between pt-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={course.instructor.avatar || '/avatar-placeholder.svg'}
                        alt={course.instructor.name}
                        className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 object-cover cursor-zoom-in"
                        onClick={(e) => { e.stopPropagation(); onImageClick?.(course.instructor.avatar); }}
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate">{course.instructor.name}</p>
                        <p className="text-[10px] font-medium text-amber-500 truncate">{course.instructor.role}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground">
                        {course.students} students
                      </p>
                      <p className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground">
                        {course.moduleCount ?? 0} modules
                      </p>
                    </div>
                  </div>

                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {courses.map((course) => (
              <Card
                key={course.id}
                className="overflow-hidden border-border rounded-[6px] transition-all hover:shadow-md"
              >
                <div className="flex flex-col md:flex-row">
                  <div
                    className="relative md:w-56 lg:w-64 aspect-video md:aspect-auto md:h-auto overflow-hidden cursor-pointer"
                    onClick={() => onSelectCourse(course)}
                  >
                    <img
                      src={getCourseThumb(course, 'landscape')}
                      alt={course.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                    {courseRecencyTag[course.id] ? (
                      <div
                        className={`absolute left-3 top-3 inline-flex items-center justify-center rounded-[5px] px-2.5 py-1 text-center text-[9px] font-black uppercase leading-none tracking-[0.16em] text-white ${
                          courseRecencyTag[course.id] === 'new'
                            ? 'bg-orange-500/80'
                            : 'bg-[#3d2a1f]/80 border border-orange-500/40'
                        }`}
                      >
                        {courseRecencyTag[course.id] === 'new' ? 'NEW' : 'UPDATED'}
                      </div>
                    ) : null}
                    <div className="absolute inset-x-3 bottom-3 flex items-center justify-between">
                      <span className="inline-flex items-center justify-center rounded-[5px] bg-black/80 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                        {hasBuildActivity(course)
                          ? getBuildActivityState(course) === 'running'
                            ? 'Processing'
                            : 'Queued'
                          : 'Ready'}
                      </span>
                      <span className="inline-flex items-center justify-center rounded-[5px] bg-black/80 px-2 py-0.5 text-xs font-bold text-white">
                        {course.price}
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 p-4 md:p-5 cursor-pointer" onClick={() => onSelectCourse(course)}>
                    <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold uppercase tracking-tight">
                      <span className="inline-flex items-center gap-1 text-cyan-500">
                        <Star size={12} fill="currentColor" strokeWidth={0} />
                        {course.rating} ({course.reviews})
                      </span>
                      <span className="inline-flex items-center gap-1 text-slate-400">
                        <Eye size={12} strokeWidth={2} />
                        {course.views}
                      </span>
                      <span className="text-slate-400">{course.moduleCount ?? 0} modules</span>
                      <span className="inline-flex items-center gap-1 text-amber-500">
                        <PlayCircle size={12} strokeWidth={2} />
                        {course.lessons} lessons
                      </span>
                    </div>

                    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-orange-600">
                      {course.category || 'Course'}
                    </p>

                    <h3 className="text-lg font-bold leading-tight mb-2">
                      {course.title}
                    </h3>

                    <p className="text-xs text-muted-foreground font-medium">
                      {course.lessons} Lessons • {course.build?.progressPercent ?? 0}% built
                    </p>

                    <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-orange-600 transition-all duration-500"
                        style={{ width: `${Math.max(0, Math.min(100, course.build?.progressPercent ?? 0))}%` }}
                      />
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={course.instructor.avatar || '/avatar-placeholder.svg'}
                          alt={course.instructor.name}
                          className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 object-cover"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate">{course.instructor.name}</p>
                          <p className="text-[10px] font-medium text-amber-500 truncate">{course.instructor.role}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground">
                          {course.students} students
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground">
                          {course.moduleCount ?? 0} modules
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="border-t md:border-t-0 md:border-l border-border px-4 py-3 md:w-48 flex md:block items-center justify-between gap-4">
                    <div className="text-center md:text-left">
                      {courseRecencyTag[course.id] ? (
                        <p className={`text-[10px] font-black uppercase tracking-[0.16em] ${courseRecencyTag[course.id] === 'new' ? 'text-orange-600' : 'text-muted-foreground'}`}>
                          {courseRecencyTag[course.id] === 'new' ? 'NEW' : 'UPDATED'}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">{formatLastUpdated(course.lastUpdated)}</p>
                      )}
                      <p className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-foreground">
                        {hasBuildActivity(course)
                          ? getBuildActivityState(course) === 'running'
                            ? 'PROCESSING'
                            : 'QUEUED'
                          : 'READY'}
                      </p>
                      <p className="mt-1 text-sm font-bold text-foreground">{course.price}</p>
                    </div>
                    <div className="flex items-center gap-2 md:mt-3 md:justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-orange-600"
                        onClick={(e) => { e.stopPropagation(); onEditCourse(course); }}
                      >
                        <Pencil size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-slate-900 dark:hover:text-white"
                      >
                        <MoreHorizontal size={16} />
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Courses;
