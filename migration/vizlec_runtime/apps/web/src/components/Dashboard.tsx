
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  PlayCircle, 
  Clock, 
  Database, 
  Filter, 
  ArrowUpDown, 
  MoreHorizontal, 
  LayoutGrid,
  List as ListIcon,
  Smartphone,
  Maximize2,
  Pencil,
  BookOpen,
  PieChart as PieChartIcon,
  ArrowRight,
  Loader2,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Pie, PieChart, Label, Cell } from "recharts";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "./ui/chart";
import { ViewType, Course } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { apiGet } from '../lib/api';
import { WS_EVENT, readVizlecWsDetail } from '../lib/events';
import { resolveCourseCategoryLabel } from '../lib/courseCategories';
import ScriptImportCard from './dashboard/ScriptImportCard';

interface DashboardProps {
  setView: (view: ViewType) => void;
  onSelectCourse: (course: Course) => void;
  onEditCourse: (course: Course) => void;
  onAddCourse: () => void;
  onImageClick?: (url: string) => void;
  coursesSnapshot?: Course[];
}

type DashboardRangeKey = '7d' | '30d' | '90d';

type DashboardMetrics = {
  range: {
    key: DashboardRangeKey;
    label: string;
    since: string;
    until: string;
  };
  totals: {
    courses: number;
    lessons: number;
    contentSeconds: number;
    storageUsedBytes: number;
  };
  growth: {
    courses: number;
    lessons: number;
    contentSeconds: number;
    storageUsedBytes: number;
  };
  disk: {
    totalBytes: number | null;
    freeBytes: number | null;
    usedPercentOfDisk: number | null;
    storageUsedPercentOfFree: number | null;
  };
};

const COURSE_TOPIC_COLORS = [
  "hsl(24.6 95% 53.1%)",
  "hsl(24.6 95% 43.1%)",
  "hsl(24.6 95% 63.1%)",
  "hsl(24.6 95% 73.1%)",
  "hsl(219 32% 54%)",
  "hsl(255 20% 60%)"
];

const progressConfig = {
  completed: { label: "Completed", color: "hsl(var(--primary))" },
  remaining: { label: "Remaining", color: "hsl(var(--muted))" },
} satisfies ChartConfig

const DASHBOARD_RANGE_OPTIONS: Array<{ key: DashboardRangeKey; label: string }> = [
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' }
];
const DASHBOARD_RANGE_LABEL_BY_KEY: Record<DashboardRangeKey, string> = {
  '7d': 'last 7 days',
  '30d': 'last 30 days',
  '90d': 'last 90 days'
};

const Dashboard: React.FC<DashboardProps> = ({ setView, onSelectCourse, onEditCourse, onAddCourse, onImageClick, coursesSnapshot = [] }) => {
  const [recentCourses, setRecentCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'stream'>('grid');
  const [metricsRange, setMetricsRange] = useState<DashboardRangeKey>('30d');
  const [recentCoursesRange, setRecentCoursesRange] = useState<DashboardRangeKey>('30d');
  const [courseTopicRange, setCourseTopicRange] = useState<DashboardRangeKey>('30d');
  const [continueCreatingRange, setContinueCreatingRange] = useState<DashboardRangeKey>('30d');
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [isRangeMenuOpen, setIsRangeMenuOpen] = useState(false);
  const [isRecentCoursesMenuOpen, setIsRecentCoursesMenuOpen] = useState(false);
  const [isCourseTopicMenuOpen, setIsCourseTopicMenuOpen] = useState(false);
  const [isContinueCreatingMenuOpen, setIsContinueCreatingMenuOpen] = useState(false);
  const rangeMenuRef = useRef<HTMLDivElement | null>(null);
  const recentCoursesMenuRef = useRef<HTMLDivElement | null>(null);
  const courseTopicMenuRef = useRef<HTMLDivElement | null>(null);
  const continueCreatingMenuRef = useRef<HTMLDivElement | null>(null);
  const [courseLatestAtById, setCourseLatestAtById] = useState<Record<string, number>>({});
  const landscapeScrollRef = useRef<HTMLDivElement | null>(null);
  const portraitScrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLandscapeLeft, setCanScrollLandscapeLeft] = useState(false);
  const [canScrollLandscapeRight, setCanScrollLandscapeRight] = useState(false);
  const [canScrollPortraitLeft, setCanScrollPortraitLeft] = useState(false);
  const [canScrollPortraitRight, setCanScrollPortraitRight] = useState(false);
  const inventoryRefreshTimerRef = useRef<number | null>(null);
  const [courseRecencyTag, setCourseRecencyTag] = useState<Record<string, 'new' | 'updated'>>({});
  const continueScrollRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    portrait: { active: boolean; pointerId: number | null; startX: number; startScrollLeft: number; moved: boolean; suppressClickUntil: number };
    landscape: { active: boolean; pointerId: number | null; startX: number; startScrollLeft: number; moved: boolean; suppressClickUntil: number };
  }>({
    portrait: { active: false, pointerId: null, startX: 0, startScrollLeft: 0, moved: false, suppressClickUntil: 0 },
    landscape: { active: false, pointerId: null, startX: 0, startScrollLeft: 0, moved: false, suppressClickUntil: 0 }
  });
  const [isDraggingPortrait, setIsDraggingPortrait] = useState(false);
  const [isDraggingLandscape, setIsDraggingLandscape] = useState(false);
  const [isDraggingContinue, setIsDraggingContinue] = useState(false);
  const [continueSortOrder, setContinueSortOrder] = useState<'desc' | 'asc'>('desc');
  const continueDragRef = useRef<{
    active: boolean;
    pointerId: number | null;
    startY: number;
    startScrollTop: number;
    moved: boolean;
    suppressClickUntil: number;
  }>({
    active: false,
    pointerId: null,
    startY: 0,
    startScrollTop: 0,
    moved: false,
    suppressClickUntil: 0
  });

  const mapCourse = (course: { id: string; name: string; category?: string; categoryId?: string; build?: { progressPercent?: number; jobs?: { blocks?: { pending?: number; running?: number }; audio?: { pending?: number; running?: number }; images?: { pending?: number; running?: number }; video?: { pending?: number; running?: number } } } }) => ({
    id: course.id,
    title: course.name,
    thumbnail: '/course-placeholder.svg',
    thumbLandscape: '/course-placeholder.svg',
    thumbPortrait: '/course-placeholder-portrait.svg',
    rating: 0,
    reviews: 0,
    views: '0',
    lessons: 0,
    instructor: {
      name: 'Instructor',
      role: 'Creator',
      avatar: '/avatar-placeholder.svg'
    },
    students: '0',
    price: '$0',
    category: resolveCourseCategoryLabel(course.categoryId, course.category),
    duration: '',
    lastUpdated: '',
    build: {
      progressPercent: course.build?.progressPercent ?? 0,
      jobs: {
        blocks: {
          pending: course.build?.jobs?.blocks?.pending ?? 0,
          running: course.build?.jobs?.blocks?.running ?? 0
        },
        audio: {
          pending: course.build?.jobs?.audio?.pending ?? 0,
          running: course.build?.jobs?.audio?.running ?? 0
        },
        images: {
          pending: course.build?.jobs?.images?.pending ?? 0,
          running: course.build?.jobs?.images?.running ?? 0
        },
        video: {
          pending: course.build?.jobs?.video?.pending ?? 0,
          running: course.build?.jobs?.video?.running ?? 0
        }
      }
    }
  } as Course);

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

  const getUpdatedAt = (item: any) => {
    const raw = item?.updatedAt ?? item?.updated_at ?? item?.modifiedAt ?? item?.lastModified ?? item?.createdAt ?? item?.created_at;
    const ts = raw ? new Date(raw).getTime() : 0;
    return Number.isFinite(ts) ? ts : 0;
  };

  const getCreatedAt = (item: any) => {
    const raw = item?.createdAt ?? item?.created_at ?? item?.updatedAt ?? item?.updated_at;
    const ts = raw ? new Date(raw).getTime() : 0;
    return Number.isFinite(ts) ? ts : 0;
  };

  const getCourseThumb = (course: Course, mode: 'landscape' | 'portrait') => {
    if (mode === 'portrait') {
      return course.thumbPortrait || course.thumbLandscape || course.thumbnail || '/course-placeholder-portrait.svg';
    }
    return course.thumbLandscape || course.thumbnail || '/course-placeholder.svg';
  };

  const formatLastUpdated = (value?: string) => {
    if (!value) return 'Updated —';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Updated —';
    return `Updated ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  };

  const formatDurationHms = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return '00:00:00';
    const totalSeconds = Math.max(0, Math.round(seconds));
    const hours = Math.floor(totalSeconds / 3600)
      .toString()
      .padStart(2, '0');
    const minutes = Math.floor((totalSeconds % 3600) / 60)
      .toString()
      .padStart(2, '0');
    const secs = (totalSeconds % 60).toString().padStart(2, '0');
    return `${hours}:${minutes}:${secs}`;
  };

  const formatBytes = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let idx = 0;
    while (value >= 1024 && idx < units.length - 1) {
      value /= 1024;
      idx += 1;
    }
    const decimals = value >= 10 || idx === 0 ? 0 : 1;
    return `${value.toFixed(decimals)} ${units[idx]}`;
  };

  useEffect(() => {
    const fetchRecent = async () => {
      setIsLoading(true);
      try {
        const legacyCourses = await apiGet<any[]>('/channels');
        const mappedCourses = legacyCourses.map(mapCourse);
        const ranked = await Promise.all(
          legacyCourses.map(async (course, idx) => {
            const courseCreatedAt = getCreatedAt(course);
            let latest = getUpdatedAt(course);
            try {
              const modules = await apiGet<any[]>(`/channels/${course.id}/sections`);
              modules.forEach((module) => {
                latest = Math.max(latest, getUpdatedAt(module));
              });
              const lessonsByModule = await Promise.all(
                modules.map((module) => apiGet<any[]>(`/sections/${module.id}/videos`))
              );
              lessonsByModule.forEach((lessons) => {
                lessons.forEach((lesson) => {
                  latest = Math.max(latest, getUpdatedAt(lesson));
                });
              });
            } catch (err) {
              console.warn('Failed to load sections/videos for recent channels.', err);
            }
            const nextCourse = { ...mappedCourses[idx], lastUpdated: latest > 0 ? new Date(latest).toISOString() : '' };
            return { course: nextCourse, latest, courseCreatedAt };
          })
        );
        const rankedSorted = ranked.sort((a, b) => b.latest - a.latest);
        setRecentCourses(rankedSorted.map((item) => item.course));
        const latestById: Record<string, number> = {};
        rankedSorted.forEach((item) => {
          latestById[item.course.id] = item.latest;
        });
        setCourseLatestAtById(latestById);
        const recencyTags: Record<string, 'new' | 'updated'> = {};
        rankedSorted.forEach((item) => {
          if (item.courseCreatedAt <= 0) return;
          const seventyTwoHoursMs = 72 * 60 * 60 * 1000;
          const hasUpdateAfterNewWindow = item.latest > item.courseCreatedAt + seventyTwoHoursMs;
          recencyTags[item.course.id] = hasUpdateAfterNewWindow ? 'updated' : 'new';
        });
        setCourseRecencyTag(recencyTags);
      } catch (err) {
        console.error(err);
        setRecentCourses([]);
        setCourseRecencyTag({});
        setCourseLatestAtById({});
      } finally {
        setIsLoading(false);
      }
    };

    fetchRecent();
  }, []);

  const fetchMetrics = useCallback(async () => {
    setIsLoadingMetrics(true);
    try {
      const data = await apiGet<DashboardMetrics>(`/dashboard/metrics?range=${metricsRange}`, {
        cacheMs: 0,
        dedupe: false
      });
      setMetrics(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingMetrics(false);
    }
  }, [metricsRange]);

  useEffect(() => {
    void fetchMetrics();
  }, [fetchMetrics]);

  const coursesSnapshotSignal = useMemo(
    () =>
      coursesSnapshot
        .map((course) => {
          const jobs = course.build?.jobs;
          return [
            course.id,
            course.build?.progressPercent ?? 0,
            jobs?.blocks.pending ?? 0,
            jobs?.blocks.running ?? 0,
            jobs?.audio.pending ?? 0,
            jobs?.audio.running ?? 0,
            jobs?.images.pending ?? 0,
            jobs?.images.running ?? 0,
            jobs?.video.pending ?? 0,
            jobs?.video.running ?? 0
          ].join(':');
        })
        .join('|'),
    [coursesSnapshot]
  );

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        await fetchMetrics();
      } catch (err) {
        console.error(err);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [coursesSnapshotSignal, fetchMetrics]);

  useEffect(() => {
    const onWs = (event: Event) => {
      const detail = readVizlecWsDetail<{ workspaceId?: string }>(event);
      if (!detail || detail.event !== WS_EVENT.INVENTORY_RECONCILED) return;
      if (inventoryRefreshTimerRef.current) {
        window.clearTimeout(inventoryRefreshTimerRef.current);
      }
      inventoryRefreshTimerRef.current = window.setTimeout(() => {
        void fetchMetrics();
      }, 180);
    };
    window.addEventListener('vizlec:ws', onWs as EventListener);
    return () => {
      if (inventoryRefreshTimerRef.current) {
        window.clearTimeout(inventoryRefreshTimerRef.current);
      }
      window.removeEventListener('vizlec:ws', onWs as EventListener);
    };
  }, [fetchMetrics]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (isRangeMenuOpen) {
        const node = rangeMenuRef.current;
        if (node && !node.contains(target)) setIsRangeMenuOpen(false);
      }
      if (isRecentCoursesMenuOpen) {
        const node = recentCoursesMenuRef.current;
        if (node && !node.contains(target)) setIsRecentCoursesMenuOpen(false);
      }
      if (isCourseTopicMenuOpen) {
        const node = courseTopicMenuRef.current;
        if (node && !node.contains(target)) setIsCourseTopicMenuOpen(false);
      }
      if (isContinueCreatingMenuOpen) {
        const node = continueCreatingMenuRef.current;
        if (node && !node.contains(target)) setIsContinueCreatingMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [isRangeMenuOpen, isRecentCoursesMenuOpen, isCourseTopicMenuOpen, isContinueCreatingMenuOpen]);

  useEffect(() => {
    const byId = new Map(coursesSnapshot.map((course) => [course.id, course]));
    if (coursesSnapshot.length === 0) {
      setRecentCourses([]);
      setCourseRecencyTag({});
      setCourseLatestAtById({});
      return;
    }
    setCourseLatestAtById((prev) => {
      const next: Record<string, number> = {};
      coursesSnapshot.forEach((course) => {
        const fromCourse = course.lastUpdated ? new Date(course.lastUpdated).getTime() : 0;
        next[course.id] = Number.isFinite(fromCourse) && fromCourse > 0 ? fromCourse : prev[course.id] ?? 0;
      });
      return next;
    });
    setRecentCourses((prev) => {
      const keptAndUpdated = prev
        .filter((course) => byId.has(course.id))
        .map((course) => {
          const latest = byId.get(course.id)!;
          return {
            ...course,
            lessons: latest.lessons ?? course.lessons,
            moduleCount: latest.moduleCount ?? course.moduleCount,
            build: latest.build ?? course.build
          };
        });
      const existingIds = new Set(keptAndUpdated.map((course) => course.id));
      const appended = coursesSnapshot
        .filter((course) => !existingIds.has(course.id))
        .map((course) => ({
          ...course,
          lastUpdated: course.lastUpdated ?? ''
        }));
      return [...keptAndUpdated, ...appended];
    });
    setCourseRecencyTag((prev) => {
      const next: Record<string, 'new' | 'updated'> = {};
      coursesSnapshot.forEach((course) => {
        next[course.id] = prev[course.id] ?? 'new';
      });
      return next;
    });
  }, [coursesSnapshot]);

  const updateScrollState = useCallback(
    (
      ref: React.RefObject<HTMLDivElement | null>,
      setCanLeft: React.Dispatch<React.SetStateAction<boolean>>,
      setCanRight: React.Dispatch<React.SetStateAction<boolean>>
    ) => {
      const node = ref.current;
      if (!node) {
        setCanLeft(false);
        setCanRight(false);
        return;
      }
      const maxScrollLeft = node.scrollWidth - node.clientWidth;
      setCanLeft(node.scrollLeft > 2);
      setCanRight(maxScrollLeft - node.scrollLeft > 2);
    },
    []
  );

  useEffect(() => {
    updateScrollState(landscapeScrollRef, setCanScrollLandscapeLeft, setCanScrollLandscapeRight);
    updateScrollState(portraitScrollRef, setCanScrollPortraitLeft, setCanScrollPortraitRight);
    const onResize = () => {
      updateScrollState(landscapeScrollRef, setCanScrollLandscapeLeft, setCanScrollLandscapeRight);
      updateScrollState(portraitScrollRef, setCanScrollPortraitLeft, setCanScrollPortraitRight);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [recentCourses, viewMode, updateScrollState]);

  const scrollByAmount = (
    ref: React.RefObject<HTMLDivElement | null>,
    direction: 'left' | 'right',
    mode: 'landscape' | 'portrait'
  ) => {
    const node = ref.current;
    if (!node) return;
    const amount = Math.max(Math.floor(node.clientWidth * 0.75), mode === 'portrait' ? 180 : 300);
    node.scrollBy({
      left: direction === 'right' ? amount : -amount,
      behavior: 'smooth'
    });
  };

  const handleDragPointerDown = (
    mode: 'landscape' | 'portrait',
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const node = mode === 'portrait' ? portraitScrollRef.current : landscapeScrollRef.current;
    if (!node) return;
    const state = dragStateRef.current[mode];
    state.active = true;
    state.pointerId = event.pointerId;
    state.startX = event.clientX;
    state.startScrollLeft = node.scrollLeft;
    state.moved = false;
  };

  const handleDragPointerMove = (
    mode: 'landscape' | 'portrait',
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    const node = mode === 'portrait' ? portraitScrollRef.current : landscapeScrollRef.current;
    if (!node) return;
    const state = dragStateRef.current[mode];
    if (!state.active || state.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - state.startX;
    if (!state.moved && Math.abs(deltaX) > 2) {
      state.moved = true;
      if (mode === 'portrait') setIsDraggingPortrait(true);
      if (mode === 'landscape') setIsDraggingLandscape(true);
    }
    if (state.moved) {
      node.scrollLeft = state.startScrollLeft - deltaX;
      event.preventDefault();
    }
  };

  const handleDragPointerEnd = (
    mode: 'landscape' | 'portrait',
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    const node = mode === 'portrait' ? portraitScrollRef.current : landscapeScrollRef.current;
    const state = dragStateRef.current[mode];
    if (!state.active || state.pointerId !== event.pointerId) return;
    if (state.moved) {
      state.suppressClickUntil = Date.now() + 180;
    }
    state.active = false;
    state.pointerId = null;
    if (mode === 'portrait') setIsDraggingPortrait(false);
    if (mode === 'landscape') setIsDraggingLandscape(false);
  };

  const handleCourseCardClick = (mode: 'landscape' | 'portrait', course: Course) => {
    const state = dragStateRef.current[mode];
    if (state.moved || Date.now() < state.suppressClickUntil) {
      state.moved = false;
      return;
    }
    onSelectCourse(course);
  };

  const handleContinuePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const node = continueScrollRef.current;
    if (!node) return;
    const state = continueDragRef.current;
    state.active = true;
    state.pointerId = event.pointerId;
    state.startY = event.clientY;
    state.startScrollTop = node.scrollTop;
    state.moved = false;
  };

  const handleContinuePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const node = continueScrollRef.current;
    if (!node) return;
    const state = continueDragRef.current;
    if (!state.active || state.pointerId !== event.pointerId) return;
    const deltaY = event.clientY - state.startY;
    if (!state.moved && Math.abs(deltaY) > 2) {
      state.moved = true;
      setIsDraggingContinue(true);
    }
    if (state.moved) {
      node.scrollTop = state.startScrollTop - deltaY;
      event.preventDefault();
    }
  };

  const handleContinuePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const node = continueScrollRef.current;
    const state = continueDragRef.current;
    if (!state.active || state.pointerId !== event.pointerId) return;
    if (state.moved) {
      state.suppressClickUntil = Date.now() + 180;
    }
    state.active = false;
    state.pointerId = null;
    setIsDraggingContinue(false);
  };

  const handleContinueCardClick = (course: Course) => {
    const state = continueDragRef.current;
    if (state.moved || Date.now() < state.suppressClickUntil) {
      state.moved = false;
      return;
    }
    onSelectCourse(course);
  };

  const getRangeStartMs = (range: DashboardRangeKey) => {
    const now = Date.now();
    if (range === '7d') return now - 7 * 24 * 60 * 60 * 1000;
    if (range === '90d') return now - 90 * 24 * 60 * 60 * 1000;
    return now - 30 * 24 * 60 * 60 * 1000;
  };

  const getCourseLastEventMs = useCallback(
    (course: Course) => {
      const fromMap = courseLatestAtById[course.id];
      if (Number.isFinite(fromMap) && fromMap > 0) return fromMap;
      const fromCourse = course.lastUpdated ? new Date(course.lastUpdated).getTime() : 0;
      if (Number.isFinite(fromCourse) && fromCourse > 0) return fromCourse;
      return 0;
    },
    [courseLatestAtById]
  );

  const filterCoursesByRange = useCallback(
    (list: Course[], range: DashboardRangeKey) => {
      const start = getRangeStartMs(range);
      return list.filter((course) => {
        const ts = getCourseLastEventMs(course);
        return ts >= start;
      });
    },
    [getCourseLastEventMs]
  );

  const recentCoursesFiltered = useMemo(
    () => filterCoursesByRange(recentCourses, recentCoursesRange),
    [recentCourses, recentCoursesRange, filterCoursesByRange]
  );
  const recentCoursesLimited = recentCoursesFiltered.slice(0, 10);

  const continueSourceCourses = useMemo(
    () => filterCoursesByRange(recentCourses, continueCreatingRange),
    [recentCourses, continueCreatingRange, filterCoursesByRange]
  );
  const continueCoursesSorted = useMemo(() => {
    const sorted = [...continueSourceCourses].sort((a, b) => {
      const aProgress = a.build?.progressPercent ?? 0;
      const bProgress = b.build?.progressPercent ?? 0;
      if (continueSortOrder === 'desc') return bProgress - aProgress;
      return aProgress - bProgress;
    });
    return sorted;
  }, [continueSourceCourses, continueSortOrder]);

  const getCategoryColor = (category: string) => {
     const cat = category?.toLowerCase();
     switch(cat) {
        case 'design': return "hsl(24.6 95% 53.1%)";
        case 'code': return "hsl(24.6 95% 43.1%)";
        case 'business': return "hsl(24.6 95% 63.1%)";
        case 'data': return "hsl(24.6 95% 73.1%)";
        case 'science': return "hsl(24.6 95% 33.1%)";
        default: return "hsl(var(--primary))";
     }
  };

  const getRangeLabel = (range: DashboardRangeKey) => DASHBOARD_RANGE_LABEL_BY_KEY[range];
  const selectedRangeLabel = getRangeLabel(metrics?.range?.key ?? metricsRange);
  const recentCoursesRangeLabel = getRangeLabel(recentCoursesRange);
  const courseTopicRangeLabel = getRangeLabel(courseTopicRange);
  const continueCreatingRangeLabel = getRangeLabel(continueCreatingRange);
  const totalCoursesValue = metrics?.totals.courses ?? 0;
  const totalLessonsValue = metrics?.totals.lessons ?? 0;
  const totalContentValue = metrics?.totals.contentSeconds ?? 0;
  const totalStorageValue = metrics?.totals.storageUsedBytes ?? 0;
  const growthCoursesValue = metrics?.growth.courses ?? 0;
  const growthLessonsValue = metrics?.growth.lessons ?? 0;
  const growthContentValue = metrics?.growth.contentSeconds ?? 0;
  const growthStorageValue = metrics?.growth.storageUsedBytes ?? 0;
  const storageProgress =
    metrics?.disk.storageUsedPercentOfFree ?? metrics?.disk.usedPercentOfDisk ?? 0;
  const topicBaseCourses = coursesSnapshot.length > 0 ? coursesSnapshot : recentCourses;
  const topicSourceCourses = useMemo(
    () => filterCoursesByRange(topicBaseCourses, courseTopicRange),
    [topicBaseCourses, courseTopicRange, filterCoursesByRange]
  );
  const courseTopicBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    topicSourceCourses.forEach((course) => {
      const label = (course.category?.trim() || 'General');
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, count], index, arr) => ({
        topic: `topic_${index + 1}`,
        label,
        count,
        percent: arr.length > 0 ? Math.round((count / topicSourceCourses.length) * 100) : 0,
        fill: COURSE_TOPIC_COLORS[index % COURSE_TOPIC_COLORS.length]
      }));
  }, [topicSourceCourses]);
  const courseTopicTotal = topicSourceCourses.length;
  const courseTopicChartData =
    courseTopicBreakdown.length > 0
      ? courseTopicBreakdown
      : [{ topic: 'empty', label: 'No channels', count: 1, percent: 0, fill: 'hsl(var(--muted))' }];
  const courseTopicConfig = useMemo<ChartConfig>(() => {
    const base: ChartConfig = { count: { label: 'Channels' } };
    courseTopicChartData.forEach((item) => {
      base[item.topic] = {
        label: item.label,
        color: item.fill
      };
    });
    return base;
  }, [courseTopicChartData]);

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-background p-5 lg:p-6">
      <div className="max-w-[1600px] mx-auto">
        
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          
          {/* LEFT COLUMN */}
          <div className="xl:col-span-3 space-y-6">
            
            {/* Top Stats Row */}
            <div>
              <div className="flex items-center justify-between mb-1 px-1">
                <h3 className="text-lg font-bold">
                  Totals{' '}
                  <span className="text-xs font-normal text-muted-foreground">({selectedRangeLabel})</span>
                </h3>
                <div ref={rangeMenuRef} className="relative">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => setIsRangeMenuOpen((prev) => !prev)}
                    aria-label="Filter range"
                  >
                    <Filter size={16} />
                  </Button>
                  {isRangeMenuOpen ? (
                    <div className="absolute right-0 z-30 mt-2 min-w-[160px] rounded-[5px] border bg-card p-1.5 shadow-lg">
                      {DASHBOARD_RANGE_OPTIONS.map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => {
                            setMetricsRange(option.key);
                            setIsRangeMenuOpen(false);
                          }}
                          className={`w-full rounded-[5px] px-2.5 py-2 text-left text-xs font-semibold transition-colors ${
                            option.key === metricsRange
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
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard
                  title="Total Channels"
                  value={String(totalCoursesValue)}
                  trend={isLoadingMetrics ? '...' : `+${growthCoursesValue}`}
                  icon={BookOpen}
                  color="indigo"
                />
                <StatCard
                  title="Total Videos"
                  value={String(totalLessonsValue)}
                  trend={isLoadingMetrics ? '...' : `+${growthLessonsValue}`}
                  icon={PlayCircle}
                  color="blue"
                />
                <StatCard
                  title="Content Time"
                  value={formatDurationHms(totalContentValue)}
                  trend={isLoadingMetrics ? '...' : `+${formatDurationHms(growthContentValue)}`}
                  icon={Clock}
                  color="amber"
                />
                <StatCard
                  title="Storage Space"
                  value={formatBytes(totalStorageValue)}
                  trend={isLoadingMetrics ? '...' : `+${formatBytes(growthStorageValue)}`}
                  icon={Database}
                  color="orange"
                  showProgress
                  progressValue={storageProgress}
                />
              </div>
            </div>

            {/* Recent Channels Section */}
            <div>
              <div className="flex min-h-9 items-center justify-between mb-1">
                <h2 className="text-lg font-bold tracking-tight">
                  Recent Channels{' '}
                  <span className="text-xs font-normal text-muted-foreground">({recentCoursesRangeLabel})</span>
                </h2>
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-muted p-1 rounded-[5px] mr-2">
                    <Button 
                      variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                      size="icon"
                      onClick={() => setViewMode('grid')}
                      className="h-7 w-7"
                    >
                      <LayoutGrid size={16} />
                    </Button>
                    <Button 
                      variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                      size="icon"
                      onClick={() => setViewMode('list')}
                      className="h-7 w-7"
                    >
                      <ListIcon size={16} />
                    </Button>
                    <Button 
                      variant={viewMode === 'stream' ? 'secondary' : 'ghost'}
                      size="icon"
                      onClick={() => setViewMode('stream')}
                      className="h-7 w-7"
                    >
                      <Smartphone size={16} />
                    </Button>
                  </div>
                  <div ref={recentCoursesMenuRef} className="relative">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => setIsRecentCoursesMenuOpen((prev) => !prev)}
                      aria-label="Filter recent channels range"
                    >
                      <Filter size={16} />
                    </Button>
                    {isRecentCoursesMenuOpen ? (
                      <div className="absolute left-0 z-30 mt-2 min-w-[160px] rounded-[5px] border bg-card p-1.5 shadow-lg">
                        {DASHBOARD_RANGE_OPTIONS.map((option) => (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => {
                              setRecentCoursesRange(option.key);
                              setIsRecentCoursesMenuOpen(false);
                            }}
                            className={`w-full rounded-[5px] px-2.5 py-2 text-left text-xs font-semibold transition-colors ${
                              option.key === recentCoursesRange
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
                  <Button variant="outline" size="icon" className="h-9 w-9">
                    <ArrowUpDown size={16} />
                  </Button>
                  <Button variant="ghost" className="hidden sm:flex text-xs font-bold text-primary" onClick={() => setView('courses')}>
                    VIEW ALL
                  </Button>
                </div>
              </div>

              <div className="min-h-[250px]">
                {isLoading ? (
                  <div className="flex items-center justify-center h-64 border border-dashed rounded-[5px]">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : viewMode === 'stream' ? (
                  <div className="relative">
                    <div
                      ref={portraitScrollRef}
                      onScroll={() => updateScrollState(portraitScrollRef, setCanScrollPortraitLeft, setCanScrollPortraitRight)}
                      onPointerDown={(event) => handleDragPointerDown('portrait', event)}
                      onPointerMove={(event) => handleDragPointerMove('portrait', event)}
                      onPointerUp={(event) => handleDragPointerEnd('portrait', event)}
                      onPointerCancel={(event) => handleDragPointerEnd('portrait', event)}
                      className={`hide-scrollbar flex gap-4 overflow-x-auto pb-3 pr-3 select-none ${
                        isDraggingPortrait ? 'cursor-grabbing' : 'cursor-grab scroll-smooth'
                      }`}
                    >
                      {recentCoursesLimited.map((course) => {
                        const recency = courseRecencyTag[course.id];
                        return (
                        <div
                          key={course.id}
                          className="min-w-[180px] max-w-[180px] flex-shrink-0 cursor-pointer group snap-start"
                          onClick={() => handleCourseCardClick('portrait', course)}
                        >
                          <div className="relative aspect-[9/16] overflow-hidden rounded-[6px] border border-border/70 bg-slate-100 dark:bg-slate-800 shadow-[0_2px_8px_-4px_rgba(15,23,42,0.18)] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-[0_10px_22px_-12px_rgba(15,23,42,0.34)]">
                            <img 
                              src={getCourseThumb(course, 'portrait')}
                              alt={course.title}
                              draggable={false}
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-90 transition-opacity group-hover:opacity-100" />
                            {recency ? (
                              <div
                                className={`absolute left-2.5 top-2.5 inline-flex items-center justify-center rounded-[5px] px-2.5 py-1 text-center text-[9px] font-black uppercase leading-none tracking-[0.16em] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${
                                  recency === 'new'
                                    ? 'bg-orange-500/80'
                                    : 'bg-[#3d2a1f]/80 border border-orange-500/40'
                                }`}
                              >
                                {recency === 'new' ? 'NEW' : 'UPDATED'}
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
                                aria-label="Edit channel"
                                title="Edit channel"
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
                                {course.category || 'Channel'}
                              </p>
                              <h3 className="text-sm font-bold text-white leading-[1.15] line-clamp-3 min-h-[3.45rem]">
                                {course.title}
                              </h3>
                            </div>
                          </div>
                          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                            <span className="font-semibold">{course.lessons} videos</span>
                            <span className="rounded-full bg-muted px-2 py-0.5 font-semibold">{course.build?.progressPercent ?? 0}% built</span>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                    {canScrollPortraitLeft ? (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute left-1 top-1/2 h-20 w-9 -translate-y-1/2 rounded-[8px] border border-white/10 bg-black/70 text-white shadow-lg hover:bg-black/85 hover:text-white"
                          onClick={() => scrollByAmount(portraitScrollRef, 'left', 'portrait')}
                          aria-label="Scroll left"
                        >
                          <ChevronLeft size={18} />
                        </Button>
                      </>
                    ) : null}
                    {canScrollPortraitRight ? (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 h-20 w-9 -translate-y-1/2 rounded-[8px] border border-white/10 bg-black/70 text-white shadow-lg hover:bg-black/85 hover:text-white"
                          onClick={() => scrollByAmount(portraitScrollRef, 'right', 'portrait')}
                          aria-label="Scroll right"
                        >
                          <ChevronRight size={18} />
                        </Button>
                      </>
                    ) : null}
                  </div>
                ) : viewMode === 'list' ? (
                  <Card className="rounded-[5px]">
                    <div className="max-h-[286px] overflow-auto custom-scrollbar">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-muted/50">
                          <tr className="border-b">
                            <th className="px-6 py-4 font-bold text-muted-foreground uppercase text-[10px]">Channel Name</th>
                            <th className="px-6 py-4 font-bold text-muted-foreground uppercase text-[10px]">Category</th>
                            <th className="px-6 py-4 font-bold text-muted-foreground uppercase text-[10px] text-center">Videos</th>
                            <th className="px-6 py-4 font-bold text-muted-foreground uppercase text-[10px] text-center">Completion</th>
                            <th className="px-6 py-4 font-bold text-muted-foreground uppercase text-[10px] text-center">Recency</th>
                            <th className="px-6 py-4 font-bold text-muted-foreground uppercase text-[10px] text-center">Runtime</th>
                            <th className="px-6 py-4 font-bold text-muted-foreground uppercase text-[10px] text-center">Value</th>
                            <th className="px-6 py-4 font-bold text-muted-foreground uppercase text-[10px] text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {recentCoursesFiltered.map((course) => {
                            const recency = courseRecencyTag[course.id];
                            return (
                            <tr 
                              key={course.id} 
                              className="hover:bg-muted/50 transition-colors cursor-pointer group"
                              onClick={() => onSelectCourse(course)}
                            >
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-4">
                                  <div className="w-10 h-10 rounded-[5px] overflow-hidden bg-muted">
                                    <img src={getCourseThumb(course, 'landscape')} alt={course.title} className="w-full h-full object-cover" />
                                  </div>
                                  <div>
                                    <p className="font-semibold">{course.title}</p>
                                    <p className="text-[11px] text-muted-foreground mt-1">{course.build?.progressPercent ?? 0}% built</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <Badge variant="secondary" className="text-[10px]">
                                  {course.category || 'General'}
                                </Badge>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className="font-semibold text-muted-foreground">{course.lessons}</span>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                                  {course.build?.progressPercent ?? 0}% complete
                                </span>
                              </td>
                              <td className="px-6 py-4 text-center">
                                {recency ? (
                                  <span
                                    className={`inline-flex items-center justify-center text-center text-[9px] font-black uppercase leading-none tracking-[0.16em] ${
                                      recency === 'new' ? 'text-orange-600' : 'text-muted-foreground'
                                    }`}
                                  >
                                    {recency === 'new' ? 'NEW' : 'UPDATED'}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground text-xs">{formatLastUpdated(course.lastUpdated)}</span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className="inline-flex items-center justify-center text-center text-[9px] font-black uppercase leading-none tracking-[0.16em] text-foreground">
                                  {hasBuildActivity(course)
                                    ? getBuildActivityState(course) === 'running'
                                      ? 'PROCESSING'
                                      : 'QUEUED'
                                    : 'READY'}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className="inline-flex items-center justify-center text-xs font-bold text-foreground">
                                  {course.price}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal size={16} />
                                </Button>
                              </td>
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                ) : (
                  <div className="relative">
                    <div
                      ref={landscapeScrollRef}
                      onScroll={() => updateScrollState(landscapeScrollRef, setCanScrollLandscapeLeft, setCanScrollLandscapeRight)}
                      onPointerDown={(event) => handleDragPointerDown('landscape', event)}
                      onPointerMove={(event) => handleDragPointerMove('landscape', event)}
                      onPointerUp={(event) => handleDragPointerEnd('landscape', event)}
                      onPointerCancel={(event) => handleDragPointerEnd('landscape', event)}
                      className={`hide-scrollbar flex gap-4 overflow-x-auto pb-3 pr-3 select-none ${
                        isDraggingLandscape ? 'cursor-grabbing' : 'cursor-grab scroll-smooth'
                      }`}
                    >
                      {recentCoursesLimited.map((course) => {
                        const recency = courseRecencyTag[course.id];
                        return (
                        <Card 
                          key={course.id}
                          className="min-w-[292px] max-w-[292px] flex-shrink-0 overflow-hidden cursor-pointer transition-all group flex flex-col rounded-[6px] snap-start border-border/70 shadow-[0_2px_8px_-4px_rgba(15,23,42,0.18)] hover:-translate-y-0.5 hover:shadow-[0_12px_26px_-14px_rgba(15,23,42,0.36)]"
                          onClick={() => handleCourseCardClick('landscape', course)}
                        >
                          <div className="relative aspect-video overflow-hidden">
                            <img 
                              src={getCourseThumb(course, 'landscape')} 
                              alt={course.title} 
                              draggable={false}
                              className="w-full h-full object-cover group-hover:scale-[1.06] transition-transform duration-500"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent opacity-80" />
                            {recency ? (
                              <div
                                className={`absolute left-3 top-3 inline-flex items-center justify-center rounded-[5px] px-2.5 py-1 text-center text-[9px] font-black uppercase leading-none tracking-[0.16em] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${
                                  recency === 'new'
                                    ? 'bg-orange-500/80'
                                    : 'bg-[#3d2a1f]/80 border border-orange-500/40'
                                }`}
                              >
                                {recency === 'new' ? 'NEW' : 'UPDATED'}
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
                                aria-label="Edit channel"
                                title="Edit channel"
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

                          <CardContent className="relative p-3.5 flex-1">
                            <div className="h-full">
                              <div className="pr-20 flex h-full min-w-0 flex-col">
                                <div className="mb-2">
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-orange-600">
                                    {course.category || 'Channel'}
                                  </p>
                                </div>
                                <h3 className="min-h-[2.5rem] overflow-hidden text-base font-bold leading-tight line-clamp-2 break-words">
                                  {course.title}
                                </h3>
                                <p className="mt-auto text-xs text-muted-foreground font-medium">
                                  {course.lessons} Videos • {course.build?.progressPercent ?? 0}% built
                                </p>
                              </div>
                            </div>
                            {hasBuildActivity(course) ? (
                              <span className="absolute bottom-3.5 right-3.5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-orange-600">
                                <Loader2 size={12} className={getBuildActivityState(course) === 'running' ? 'animate-spin' : ''} />
                                {getBuildActivityState(course) === 'running' ? 'Processing' : 'Queued'}
                              </span>
                            ) : null}
                          </CardContent>
                        </Card>
                        );
                      })}
                    </div>
                    {canScrollLandscapeLeft ? (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute left-1 top-1/2 h-24 w-10 -translate-y-1/2 rounded-[8px] border border-white/10 bg-black/70 text-white shadow-lg hover:bg-black/85 hover:text-white"
                          onClick={() => scrollByAmount(landscapeScrollRef, 'left', 'landscape')}
                          aria-label="Scroll left"
                        >
                          <ChevronLeft size={18} />
                        </Button>
                      </>
                    ) : null}
                    {canScrollLandscapeRight ? (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 h-24 w-10 -translate-y-1/2 rounded-[8px] border border-white/10 bg-black/70 text-white shadow-lg hover:bg-black/85 hover:text-white"
                          onClick={() => scrollByAmount(landscapeScrollRef, 'right', 'landscape')}
                          aria-label="Scroll right"
                        >
                          <ChevronRight size={18} />
                        </Button>
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Actions Area */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* New Channel Card */}
              <Card className="bg-primary text-primary-foreground border-none relative overflow-hidden group flex flex-col justify-end min-h-[190px] transition-all hover:-translate-y-1 rounded-[5px]">
                <div className="relative z-10 p-6">
                  <h4 className="text-lg font-bold mb-2">Create New Channel</h4>
                  <p className="text-primary-foreground/90 text-sm font-medium leading-relaxed max-w-sm mb-5">
                    Start a new channel from scratch and organize videos, assets, and generation workflows in one place.
                  </p>
                  <Button
                    onClick={onAddCourse}
                    className="bg-white text-orange-600 hover:bg-white/90 font-bold border-none shadow-md"
                  >
                    Create Channel
                  </Button>
                </div>
              </Card>
              
              <ScriptImportCard
                onImportSuccess={(createdCourse) => {
                  onSelectCourse(mapCourse(createdCourse));
                }}
                onAbortRollbackComplete={() => {
                  setView('dashboard');
                }}
              />
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="xl:col-span-1 space-y-6">
            
            {/* Channel Topic Donut Chart */}
            <div>
              <div className="flex min-h-9 items-center justify-between mb-1 px-1">
                 <h3 className="text-lg font-bold">
                   Channel Topic{' '}
                   <span className="text-xs font-normal text-muted-foreground">({courseTopicRangeLabel})</span>
                 </h3>
                 <div ref={courseTopicMenuRef} className="relative">
                   <Button
                     variant="outline"
                     size="icon"
                     className="h-9 w-9"
                     onClick={() => setIsCourseTopicMenuOpen((prev) => !prev)}
                     aria-label="Filter channel topics range"
                   >
                      <Filter size={16} />
                   </Button>
                   {isCourseTopicMenuOpen ? (
                     <div className="absolute right-0 z-30 mt-2 min-w-[160px] rounded-[5px] border bg-card p-1.5 shadow-lg">
                       {DASHBOARD_RANGE_OPTIONS.map((option) => (
                         <button
                           key={option.key}
                           type="button"
                           onClick={() => {
                             setCourseTopicRange(option.key);
                             setIsCourseTopicMenuOpen(false);
                           }}
                           className={`w-full rounded-[5px] px-2.5 py-2 text-left text-xs font-semibold transition-colors ${
                             option.key === courseTopicRange
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
              </div>
              <Card className="pt-3 pb-4 px-5 rounded-[5px]">
                 <div className="flex flex-col items-center justify-center mb-4 relative">
                   <ChartContainer config={courseTopicConfig} className="mx-auto aspect-square w-full max-h-[160px]">
                      <PieChart>
                        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                        <Pie
                          data={courseTopicChartData}
                          dataKey="count"
                          nameKey="label"
                          innerRadius={48}
                          outerRadius={64}
                          strokeWidth={5}
                        >
                          {courseTopicChartData.map((entry) => (
                            <Cell key={entry.topic} fill={entry.fill} />
                          ))}
                          <Label
                            content={({ viewBox }) => {
                              if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                                return (
                                  <text
                                    x={viewBox.cx}
                                    y={viewBox.cy}
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                  >
                                    <tspan
                                      x={viewBox.cx}
                                      y={viewBox.cy}
                                      className="fill-foreground text-[30px] font-bold"
                                    >
                                      {courseTopicTotal}
                                    </tspan>
                                    <tspan
                                      x={viewBox.cx}
                                      y={(viewBox.cy || 0) + 18}
                                      className="fill-muted-foreground text-[10px] font-bold uppercase tracking-wide"
                                    >
                                      Total
                                    </tspan>
                                    <tspan
                                      x={viewBox.cx}
                                      y={(viewBox.cy || 0) + 30}
                                      className="fill-muted-foreground text-[10px] font-bold uppercase tracking-wide"
                                    >
                                      Channels
                                    </tspan>
                                  </text>
                                )
                              }
                            }}
                          />
                        </Pie>
                      </PieChart>
                    </ChartContainer>
                 </div>

                 <div className="grid grid-cols-2 gap-2.5">
                   {courseTopicBreakdown.length > 0 ? (
                     courseTopicBreakdown.map((topic) => (
                       <div key={topic.topic} className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-[3px]" style={{ backgroundColor: topic.fill }} />
                          <span className="text-xs font-bold text-muted-foreground">
                            {topic.label}{' '}
                            <span className="text-muted-foreground/60 font-normal">({topic.percent}%)</span>
                          </span>
                       </div>
                     ))
                   ) : (
                     <div className="col-span-2 text-xs font-medium text-muted-foreground">
                       No channels yet.
                     </div>
                   )}
                 </div>
              </Card>
            </div>

            {/* Continue Creating */}
            <div>
              <div className="flex min-h-9 items-center justify-between mb-1 px-1 gap-2">
                 <h3 className="text-lg font-bold leading-tight">
                   Continue Creating{' '}
                   <span className="text-xs font-normal text-muted-foreground">({continueCreatingRangeLabel})</span>
                 </h3>
                 <div className="flex items-center gap-2 shrink-0 pt-0.5">
                   <div ref={continueCreatingMenuRef} className="relative">
                     <Button
                       variant="outline"
                       size="icon"
                       className="h-9 w-9"
                       onClick={() => setIsContinueCreatingMenuOpen((prev) => !prev)}
                       aria-label="Filter continue creating range"
                     >
                       <Filter size={16} />
                     </Button>
                     {isContinueCreatingMenuOpen ? (
                       <div className="absolute right-0 z-30 mt-2 min-w-[160px] rounded-[5px] border bg-card p-1.5 shadow-lg">
                         {DASHBOARD_RANGE_OPTIONS.map((option) => (
                           <button
                             key={option.key}
                             type="button"
                             onClick={() => {
                               setContinueCreatingRange(option.key);
                               setIsContinueCreatingMenuOpen(false);
                             }}
                             className={`w-full rounded-[5px] px-2.5 py-2 text-left text-xs font-semibold transition-colors ${
                               option.key === continueCreatingRange
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
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9"
                      aria-label={
                        continueSortOrder === 'desc'
                          ? 'Sort low to high'
                         : 'Sort high to low'
                     }
                     title={
                       continueSortOrder === 'desc'
                         ? 'Sort low to high'
                         : 'Sort high to low'
                     }
                     onClick={() =>
                       setContinueSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))
                     }
                    >
                      <ArrowUpDown size={16} />
                    </Button>
                  </div>
               </div>

              <div
                ref={continueScrollRef}
                onPointerDown={handleContinuePointerDown}
                onPointerMove={handleContinuePointerMove}
                onPointerUp={handleContinuePointerEnd}
                onPointerCancel={handleContinuePointerEnd}
                className={`max-h-[280px] overflow-y-auto custom-scrollbar select-none ${
                  isDraggingContinue ? 'cursor-grabbing' : 'cursor-grab'
                }`}
              >
                 <div className="space-y-3 pr-1">
                 {continueCoursesSorted.map((course) => {
                    const progress = course.build?.progressPercent ?? 0;
                    const ringData = [
                      { name: "completed", value: progress, fill: getCategoryColor(course.category || '') },
                      { name: "remaining", value: 100 - progress, fill: "hsl(var(--muted))" },
                    ];

                    return (
                       <Card key={course.id} onClick={() => handleContinueCardClick(course)} className="p-2.5 flex items-start gap-3 transition-all cursor-pointer group rounded-[5px]">
                          <div className="w-14 h-14 rounded-[5px] bg-muted flex-shrink-0 overflow-hidden">
                             <img src={getCourseThumb(course, 'landscape')} alt={course.title} draggable={false} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                          </div>

                          <div className="flex-1 min-w-0">
                             <p className="text-[10px] font-bold uppercase tracking-wider mb-1 text-orange-600">
                                {course.category || 'General'}
                             </p>
                             <h4 className="text-sm font-bold truncate group-hover:text-primary transition-colors">
                                {course.title}
                             </h4>
                             <p className="text-[10px] font-medium text-muted-foreground mt-1">
                                {hasBuildActivity(course)
                                  ? getBuildActivityState(course) === 'running'
                                    ? 'Processing...'
                                    : 'Queued...'
                                  : 'Ready to continue'}{' '}
                                • {progress}%
                              </p>
                          </div>

                          <div className="relative w-12 h-12 flex-shrink-0 flex items-center justify-center">
                             <ChartContainer config={progressConfig} className="aspect-square w-full h-full">
                                <PieChart>
                                  <Pie
                                    data={ringData}
                                    dataKey="value"
                                    nameKey="name"
                                    innerRadius={15}
                                    outerRadius={21}
                                    startAngle={90}
                                    endAngle={-270}
                                    strokeWidth={0}
                                  >
                                    <Label
                                      content={({ viewBox }) => {
                                        if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                                          return (
                                            <text
                                              x={viewBox.cx}
                                              y={viewBox.cy}
                                              textAnchor="middle"
                                              dominantBaseline="middle"
                                            >
                                              <tspan
                                                x={viewBox.cx}
                                                y={(viewBox.cy || 0) + 1}
                                                className="fill-muted-foreground text-[10px] font-bold"
                                              >
                                                {progress}%
                                              </tspan>
                                            </text>
                                          )
                                        }
                                      }}
                                    />
                                  </Pie>
                                </PieChart>
                             </ChartContainer>
                          </div>
                       </Card>
                    );
                 })}
                 </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{
  title: string;
  value: string;
  trend: string;
  icon: any;
  color: string;
  showProgress?: boolean;
  progressValue?: number;
}> = ({ title, value, trend, icon: Icon, color, showProgress, progressValue = 0 }) => {
  const colorMap: any = {
    blue: 'bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400',
    amber: 'bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400',
    orange: 'bg-orange-100 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400',
    indigo: 'bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  };
  return (
    <Card className="flex flex-col justify-between hover:shadow-md transition-all rounded-[5px]">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className={`w-12 h-12 ${colorMap[color]} rounded-[5px] flex items-center justify-center`}>
            <Icon size={24} strokeWidth={1.5} />
          </div>
          <Badge variant="secondary" className={`${trend.includes('+') ? 'text-green-600 bg-green-100 dark:bg-green-500/10' : ''}`}>
            {trend}
          </Badge>
        </div>
        <div>
          <p className="text-muted-foreground text-xs font-bold uppercase tracking-widest">{title}</p>
          <h3 className="text-3xl font-bold mt-1 tracking-tight">{value}</h3>
        </div>
        {showProgress && (
          <div className="w-full h-1.5 bg-muted rounded-full mt-5 overflow-hidden">
            <div
              className="h-full bg-primary"
              style={{ width: `${Math.max(0, Math.min(100, progressValue))}%` }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default Dashboard;
