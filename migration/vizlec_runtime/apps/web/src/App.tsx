
import React, { useState, useEffect, useLayoutEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import Editor from './components/Editor';
import Courses from './components/Courses';
import CourseModules from './components/CourseModules';
import CourseEditor from './components/CourseEditor';
import ModuleEditor from './components/ModuleEditor';
import ModuleContainerEditor from './components/ModuleContainerEditor';
import Library from './components/Library';
import UserProfile from './components/UserProfile';
import Billing from './components/Billing';
import Settings from './components/Settings';
import Security from './components/Security';
import HelpCenter from './components/HelpCenter';
import Team from './components/Team';
import Auth from './components/Auth';
import ImageModal from './components/ImageModal';
import { ViewType, Course, LessonBlock, Module, Theme, Ticket, Notification } from './types';
import { apiDelete, apiGet, apiPatch, apiPost, API_BASE, UNAUTHORIZED_EVENT } from './lib/api';
import { resolveCourseCategoryLabel } from './lib/courseCategories';

type LegacyCourse = {
  id: string;
  name: string;
  description?: string | null;
  categoryId?: string | null;
  productLanguage?: string | null;
  emailLanguage?: string | null;
  primarySalesCountry?: string | null;
  salesPageUrl?: string | null;
  imageAssetId?: string | null;
  status?: 'draft' | 'active' | 'archived' | null;
  modulesCount?: number;
  lessonsCount?: number;
  build?: {
    progressPercent: number;
    jobs?: {
      blocks?: { pending?: number; running?: number };
      audio?: { pending?: number; running?: number };
      images?: { pending?: number; running?: number };
      video?: { pending?: number; running?: number };
    };
  };
};
type LegacyModule = { id: string; name: string; order: number; courseId: string };
type LegacyLesson = { id: string; title: string; moduleId: string; order: number };
type SessionUser = { id: string; name: string; email: string; role: string };
type SessionAgent = { id: string; label: string | null; status: string; lastSeenAt: string | null };
type LessonCreationAutoQueue = {
  requestId: string;
  generateAudio: boolean;
  generateImage: boolean;
};

type CourseBuildStatusPayload = {
  courseId: string;
  progressPercent: number;
  jobs: {
    blocks: { pending: number; running: number };
    audio: { pending: number; running: number };
    images: { pending: number; running: number };
    video: { pending: number; running: number };
  };
  modules: Array<{
    moduleId: string;
    progressPercent: number;
    jobs: {
      blocks: { pending: number; running: number };
      audio: { pending: number; running: number };
      images: { pending: number; running: number };
      video: { pending: number; running: number };
    };
    lessons: Array<{
      lessonId: string;
      lessonVersionId: string | null;
      blocks: { total: number; ready: number };
      audio: { ready: number; durationS: number | null };
      images: { ready: number };
      finalVideoReady: boolean;
      progressPercent: number;
      jobs: {
        blocks: { pending: number; running: number };
        audio: { pending: number; running: number };
        images: { pending: number; running: number };
        video: { pending: number; running: number };
      };
    }>;
  }>;
};

type EntityChangedPayload = {
  entity?: string;
  action?: string;
  occurredAt?: string;
  courseId?: string | null;
  moduleId?: string | null;
  lessonId?: string | null;
  lessonVersionId?: string | null;
  blockId?: string | null;
  course?: LegacyCourse;
  module?: LegacyModule;
  lesson?: LegacyLesson;
  modules?: Array<{
    moduleId?: string;
    lessonIds?: string[];
  }>;
};

const createEmptyBuildJobs = () => ({
  blocks: { pending: 0, running: 0 },
  audio: { pending: 0, running: 0 },
  images: { pending: 0, running: 0 },
  video: { pending: 0, running: 0 }
});

const formatAudioDurationLabel = (durationSeconds: number | null | undefined): string => {
  if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
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

const applyBuildStatusToModules = (
  modules: Module[],
  buildStatus: CourseBuildStatusPayload
): Module[] => {
  const moduleBuildMap = new Map(
    buildStatus.modules.map((moduleItem) => [moduleItem.moduleId, moduleItem])
  );
  return modules.map((moduleItem) => {
    const moduleBuild = moduleBuildMap.get(moduleItem.id);
    const lessonBuildMap = new Map(
      (moduleBuild?.lessons ?? []).map((lessonItem) => [lessonItem.lessonId, lessonItem])
    );
    return {
      ...moduleItem,
      build: {
        progressPercent: moduleBuild?.progressPercent ?? 0,
        jobs: moduleBuild?.jobs ?? createEmptyBuildJobs()
      },
      lessons: moduleItem.lessons.map((lessonItem) => {
        const build = lessonBuildMap.get(lessonItem.id);
        if (!build) {
          return {
            ...lessonItem,
            build: {
              ...(lessonItem.build ?? {
                lessonVersionId: null,
                blocksTotal: 0,
                blocksReady: 0,
                audioReady: 0,
                imagesReady: 0,
                finalVideoReady: false,
                progressPercent: 0,
                jobs: createEmptyBuildJobs()
              }),
              jobs: createEmptyBuildJobs()
            }
          };
        }
        return {
          ...lessonItem,
          duration: formatAudioDurationLabel(build.audio.durationS),
          audioDurationSeconds: build.audio.durationS,
          build: {
            lessonVersionId: build.lessonVersionId,
            blocksTotal: build.blocks.total,
            blocksReady: build.blocks.ready,
            audioReady: build.audio.ready,
            imagesReady: build.images.ready,
            finalVideoReady: build.finalVideoReady,
            progressPercent: build.progressPercent,
            jobs: build.jobs
          }
        };
      })
    };
  });
};

const randomRequestId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const App: React.FC = () => {
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthResolved, setIsAuthResolved] = useState(false);
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [dispatchAgentId, setDispatchAgentId] = useState<string | null>(null);

  // App State
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesError, setCoursesError] = useState<string | null>(null);
  const [courseModules, setCourseModules] = useState<Module[]>([]);
  const [modulesError, setModulesError] = useState<string | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<LessonBlock | null>(null);
  const [selectedModuleIdForLesson, setSelectedModuleIdForLesson] = useState<string | null>(null);
  const [pendingLessonAutoQueue, setPendingLessonAutoQueue] = useState<LessonCreationAutoQueue | null>(null);
  const [modulesNavigationTarget, setModulesNavigationTarget] = useState<
    { type: 'top' | 'module'; moduleId?: string; nonce: number } | null
  >(null);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [editingLesson, setEditingLesson] = useState<LessonBlock | null>(null);
  const [editingModuleContainer, setEditingModuleContainer] = useState<Module | null>(null);
  
  // Theme State - Defaulting to Premium Dark
  const [currentTheme, setCurrentTheme] = useState<Theme>('premium-dark');
  const [isThemeReady, setIsThemeReady] = useState(false);
  const [activeImageUrl, setActiveImageUrl] = useState<string | null>(null);

  // Support & Notification State
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);

  const getLessonStub = (lessonId: string, title: string): LessonBlock => ({
    id: lessonId,
    number: '',
    title,
    duration: '',
    audioDurationSeconds: null,
    status: 'Empty',
    thumbnail: '/lesson-placeholder.svg',
    thumbLandscape: '/lesson-placeholder.svg',
    thumbPortrait: '/lesson-placeholder-portrait.svg',
    originalText: '',
    narratedText: '',
    onScreenText: { title: '', bullets: [] },
    imagePrompt: { prompt: '', avoid: '', seedText: '', seedNumber: 0 }
  });

  const normalizeModuleLessonsOrder = (modules: Module[]): Module[] =>
    modules.map((moduleItem, moduleIndex) => ({
      ...moduleItem,
      lessons: moduleItem.lessons.map((lessonItem, lessonIndex) => ({
        ...lessonItem,
        number: `${moduleIndex + 1}.${lessonIndex + 1}`
      }))
    }));

  useEffect(() => {
    apiGet<{ user: SessionUser }>('/auth/me', { cacheMs: 0, dedupe: false })
      .then((session) => {
        setIsAuthenticated(true);
        setCurrentUser(session.user);
      })
      .catch(() => {
        setIsAuthenticated(false);
        setCurrentUser(null);
        setDispatchAgentId(null);
      })
      .finally(() => {
        setIsAuthResolved(true);
      });
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      setIsAuthenticated(false);
      setCurrentUser(null);
      setDispatchAgentId(null);
    };
    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => {
      window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setDispatchAgentId(null);
      return;
    }
    apiGet<{ agents: SessionAgent[] }>('/auth/context', { cacheMs: 0, dedupe: false })
      .then((context) => {
        const agents = Array.isArray(context?.agents) ? context.agents : [];
        const online = agents.find((agent) => agent.status === 'online');
        setDispatchAgentId((online ?? agents[0])?.id ?? null);
      })
      .catch(() => {
        setDispatchAgentId(null);
      });
  }, [isAuthenticated]);

  const mapCourse = (course: LegacyCourse): Course => ({
    id: course.id,
    title: course.name,
    description: course.description ?? '',
    categoryId: course.categoryId ?? '',
    productLanguage: course.productLanguage ?? '',
    emailLanguage: course.emailLanguage ?? '',
    primarySalesCountry: course.primarySalesCountry ?? '',
    salesPageUrl: course.salesPageUrl ?? '',
    imageAssetId: course.imageAssetId ?? '',
    status: course.status ?? 'draft',
    thumbnail: '/course-placeholder.svg',
    thumbLandscape: '/course-placeholder.svg',
    thumbPortrait: '/course-placeholder-portrait.svg',
    rating: 0,
    reviews: 0,
    views: '0',
    lessons: course.lessonsCount ?? 0,
    moduleCount: course.modulesCount ?? 0,
    instructor: {
      name: 'Instructor',
      role: 'Creator',
      avatar: '/avatar-placeholder.svg'
    },
    students: '0',
    price: '$0',
    category: resolveCourseCategoryLabel(course.categoryId),
    duration: '',
    build: course.build
      ? {
          progressPercent: course.build.progressPercent ?? 0,
          jobs: {
            blocks: {
              pending: course.build.jobs?.blocks?.pending ?? 0,
              running: course.build.jobs?.blocks?.running ?? 0
            },
            audio: {
              pending: course.build.jobs?.audio?.pending ?? 0,
              running: course.build.jobs?.audio?.running ?? 0
            },
            images: {
              pending: course.build.jobs?.images?.pending ?? 0,
              running: course.build.jobs?.images?.running ?? 0
            },
            video: {
              pending: course.build.jobs?.video?.pending ?? 0,
              running: course.build.jobs?.video?.running ?? 0
            }
          }
        }
      : {
          progressPercent: 0,
          jobs: createEmptyBuildJobs()
        }
  });

  useEffect(() => {
    if (!isAuthenticated) return;
    apiGet<LegacyCourse[]>('/courses')
      .then((items) => {
        setCourses(items.map(mapCourse));
        setCoursesError(null);
      })
      .catch((err) => {
        console.error(err);
        setCourses([]);
        setCoursesError(err.message ?? 'Failed to load courses.');
      });
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    apiGet<{ items: Notification[] }>('/notifications')
      .then((response) => setNotifications(response.items ?? []))
      .catch((err) => {
        console.error(err);
      });
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let closed = false;
    let attempt = 0;

    const connect = () => {
      const wsUrl = API_BASE.replace(/^http/i, 'ws') + '/ws';
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        attempt = 0;
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as {
            event?: string;
            payload?: {
              jobId?: string;
              status?: string;
              type?: string;
              courseId?: string | null;
              moduleId?: string | null;
              lessonId?: string | null;
              lessonVersionId?: string | null;
              buildStatus?: CourseBuildStatusPayload | null;
              id?: string;
              title?: string;
              message?: string;
              time?: string;
              read?: boolean;
              relatedLessonId?: string | null;
              jobType?: string;
              jobStatus?: string;
            } & EntityChangedPayload;
          };
          window.dispatchEvent(new CustomEvent('vizlec:ws', { detail: data }));
          if (data.event === 'job_update') {
            const payload = data.payload;
            const buildStatus = payload?.buildStatus;
            const impactedCourseId = payload?.courseId ?? null;
            if (buildStatus && impactedCourseId) {
              if (selectedCourse?.id === impactedCourseId) {
                setSelectedCourse((prev) =>
                  prev && prev.id === impactedCourseId
                    ? {
                        ...prev,
                        build: {
                          progressPercent: buildStatus.progressPercent,
                          jobs: buildStatus.jobs
                        }
                      }
                    : prev
                );
                setCourseModules((prev) => applyBuildStatusToModules(prev, buildStatus));
              }
              setCourses((prev) =>
                prev.map((courseItem) =>
                  courseItem.id === impactedCourseId
                    ? {
                        ...courseItem,
                        build: {
                          progressPercent: buildStatus.progressPercent,
                          jobs: buildStatus.jobs
                        }
                      }
                    : courseItem
                )
              );
            }
            return;
          }
          if (data.event === 'entity_changed') {
            const payload = data.payload;
            const entity = payload?.entity;
            const action = payload?.action;

            if (entity === 'course') {
              if (action === 'deleted' && payload?.courseId) {
                setCourses((prev) => prev.filter((courseItem) => courseItem.id !== payload.courseId));
                setSelectedCourse((prev) => (prev?.id === payload.courseId ? null : prev));
                setSelectedLesson((prev) => (selectedCourse?.id === payload.courseId ? null : prev));
                if (selectedCourse?.id === payload.courseId) {
                  setCourseModules([]);
                  setCurrentView('courses');
                }
                return;
              }
              if (payload?.course) {
                const mapped = mapCourse(payload.course);
                setCourses((prev) => {
                  const index = prev.findIndex((courseItem) => courseItem.id === mapped.id);
                  if (index === -1) return [mapped, ...prev];
                  const next = [...prev];
                  next[index] = {
                    ...next[index],
                    ...mapped
                  };
                  return next;
                });
                setSelectedCourse((prev) =>
                  prev?.id === mapped.id
                    ? {
                        ...prev,
                        ...mapped
                      }
                    : prev
                );
              }
              return;
            }

            if (payload?.courseId && selectedCourse?.id !== payload.courseId) {
              return;
            }

            if (entity === 'module' && payload?.moduleId) {
              if (action === 'deleted') {
                setCourseModules((prev) =>
                  normalizeModuleLessonsOrder(
                    prev.filter((moduleItem) => moduleItem.id !== payload.moduleId)
                  )
                );
                return;
              }
              if (payload.module) {
                setCourseModules((prev) => {
                  const existingIndex = prev.findIndex((moduleItem) => moduleItem.id === payload.moduleId);
                  const nextModule: Module = {
                    id: payload.module!.id,
                    title: payload.module!.name,
                    thumbLandscape: '/module-placeholder.svg',
                    thumbPortrait: '/module-placeholder-portrait.svg',
                    lessons: existingIndex >= 0 ? prev[existingIndex].lessons : [],
                    build:
                      existingIndex >= 0
                        ? prev[existingIndex].build
                        : {
                            progressPercent: 0,
                            jobs: createEmptyBuildJobs()
                          }
                  };
                  if (existingIndex === -1) {
                    return normalizeModuleLessonsOrder([...prev, nextModule]);
                  }
                  const next = [...prev];
                  next[existingIndex] = {
                    ...next[existingIndex],
                    ...nextModule
                  };
                  return normalizeModuleLessonsOrder(next);
                });
              }
              return;
            }

            if (entity === 'lesson' && payload?.lessonId) {
              if (action === 'deleted') {
                setCourseModules((prev) =>
                  normalizeModuleLessonsOrder(
                    prev.map((moduleItem) => ({
                      ...moduleItem,
                      lessons: moduleItem.lessons.filter((lessonItem) => lessonItem.id !== payload.lessonId)
                    }))
                  )
                );
                setSelectedLesson((prev) => (prev?.id === payload.lessonId ? null : prev));
                return;
              }
              const lessonPayload = payload.lesson;
              if (lessonPayload) {
                setCourseModules((prev) => {
                  const next = prev.map((moduleItem) => ({
                    ...moduleItem,
                    lessons: moduleItem.lessons.filter((lessonItem) => lessonItem.id !== payload.lessonId)
                  }));
                  const targetModuleIndex = next.findIndex((moduleItem) => moduleItem.id === lessonPayload.moduleId);
                  if (targetModuleIndex === -1) return normalizeModuleLessonsOrder(next);
                  const moduleItem = next[targetModuleIndex];
                  const lessonStub = getLessonStub(lessonPayload.id, lessonPayload.title);
                  const existing = prev
                    .flatMap((item) => item.lessons)
                    .find((lessonItem) => lessonItem.id === payload.lessonId);
                  const lessonNext: LessonBlock = {
                    ...lessonStub,
                    ...(existing ?? {}),
                    id: lessonPayload.id,
                    title: lessonPayload.title
                  };
                  moduleItem.lessons = [...moduleItem.lessons, lessonNext];
                  return normalizeModuleLessonsOrder(next);
                });
                setSelectedLesson((prev) =>
                  prev?.id === lessonPayload.id
                    ? {
                        ...prev,
                        title: lessonPayload.title
                      }
                    : prev
                );
              }
              return;
            }

            if (entity === 'course_structure' && action === 'reordered' && Array.isArray(payload?.modules)) {
              setCourseModules((prev) => {
                const moduleById = new Map(prev.map((moduleItem) => [moduleItem.id, moduleItem]));
                const ordered = payload.modules!
                  .map((item) => {
                    const existingModule = item.moduleId ? moduleById.get(item.moduleId) : null;
                    if (!existingModule || !item.moduleId) return null;
                    const lessonsById = new Map(
                      existingModule.lessons.map((lessonItem) => [lessonItem.id, lessonItem])
                    );
                    const orderedLessons = (item.lessonIds ?? [])
                      .map((lessonId) => lessonsById.get(lessonId))
                      .filter((lessonItem): lessonItem is LessonBlock => Boolean(lessonItem));
                    return {
                      ...existingModule,
                      lessons: orderedLessons
                    };
                  })
                  .filter((item): item is Module => Boolean(item));
                return normalizeModuleLessonsOrder(ordered);
              });
            }
            return;
          }
          if (data.event !== 'notification' || !data.payload?.id) return;
          const payload = data.payload;
          const notificationId = payload.id;
          if (!notificationId) return;
          setNotifications((prev) => {
            if (prev.some((item) => item.id === notificationId)) return prev;
            const next: Notification = {
              id: notificationId,
              title: payload.title ?? 'Notification',
              message: payload.message ?? '',
              time: payload.time ?? new Date().toISOString(),
              read: Boolean(payload.read),
              type: 'job',
              relatedLessonId: payload.relatedLessonId ?? undefined,
              jobType: payload.jobType ?? undefined,
              jobStatus: payload.jobStatus ?? undefined
            };
            return [next, ...prev];
          });
        } catch (err) {
          console.error(err);
        }
      };

      socket.onclose = () => {
        if (closed) return;
        attempt += 1;
        const delay = Math.min(10000, 1000 * attempt);
        reconnectTimer = window.setTimeout(connect, delay);
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      socket?.close();
    };
  }, [isAuthenticated, currentView, selectedCourse?.id]);

  useEffect(() => {
    apiGet<{ theme?: { family?: string; mode?: string } }>('/settings')
      .then((data) => {
        const family = data.theme?.family;
        const mode = data.theme?.mode;
        if (family && mode) {
          setCurrentTheme(`${family}-${mode}` as Theme);
        }
      })
      .catch(() => {
        // keep defaults
      })
      .finally(() => {
        setIsThemeReady(true);
      });
  }, []);

  const loadCourseModulesByCourseId = React.useCallback(async (courseId: string) => {
    const mapLesson = (lesson: LegacyLesson, moduleOrder: number): LessonBlock => ({
      id: lesson.id,
      number: `${moduleOrder}.${lesson.order}`,
      title: lesson.title,
      duration: '',
      audioDurationSeconds: null,
      status: 'Empty',
      thumbnail: '/lesson-placeholder.svg',
      thumbLandscape: '/lesson-placeholder.svg',
      thumbPortrait: '/lesson-placeholder-portrait.svg',
      originalText: '',
      narratedText: '',
      onScreenText: { title: '', bullets: [] },
      imagePrompt: { prompt: '', avoid: '', seedText: '', seedNumber: 0 },
      build: {
        lessonVersionId: null,
        blocksTotal: 0,
        blocksReady: 0,
        audioReady: 0,
        imagesReady: 0,
        finalVideoReady: false,
        progressPercent: 0,
        jobs: createEmptyBuildJobs()
      }
    });

    const mapModule = (module: LegacyModule, lessons: LegacyLesson[], moduleIndex: number): Module => ({
      id: module.id,
      title: module.name,
      thumbLandscape: '/module-placeholder.svg',
      thumbPortrait: '/module-placeholder-portrait.svg',
      lessons: lessons.map((lesson) =>
        mapLesson(lesson, module.order ?? moduleIndex + 1)
      ),
      build: {
        progressPercent: 0,
        jobs: createEmptyBuildJobs()
      }
    });

    try {
      const modules = await apiGet<LegacyModule[]>(`/courses/${courseId}/modules`, {
        cacheMs: 0,
        dedupe: false
      });
        const ordered = [...modules].sort((a, b) => a.order - b.order);
        const lessonsByModule = await Promise.all(
          ordered.map((module) =>
            apiGet<LegacyLesson[]>(`/modules/${module.id}/lessons`, {
              cacheMs: 0,
              dedupe: false
            })
          )
        );
        const mappedBase = ordered.map((module, index) =>
          mapModule(module, lessonsByModule[index] || [], index)
        );
        let mapped = mappedBase;
        try {
          const buildStatus = await apiGet<CourseBuildStatusPayload>(`/courses/${courseId}/build-status`, {
            cacheMs: 0,
            dedupe: false
          });
          mapped = applyBuildStatusToModules(mappedBase, buildStatus);
          setSelectedCourse((prev) =>
            prev && prev.id === courseId
              ? {
                  ...prev,
                  build: {
                    progressPercent: buildStatus.progressPercent,
                    jobs: buildStatus.jobs
                  }
                }
              : prev
          );
        } catch (err) {
          console.warn('Failed to load detailed build status for selected course.', err);
        }
        setCourseModules(mapped);
        setModulesError(null);
      } catch (err) {
      console.error(err);
      setCourseModules([]);
      setModulesError((err as Error).message ?? 'Failed to load modules.');
    }
  }, []);

  useEffect(() => {
    if (!selectedCourse) {
      setCourseModules([]);
      setModulesError(null);
      return;
    }

    loadCourseModulesByCourseId(selectedCourse.id);
  }, [selectedCourse?.id, loadCourseModulesByCourseId]);

  useLayoutEffect(() => {
    const root = window.document.documentElement;
    
    // Reset all classes first
    root.classList.remove('dark', 'theme-navy', 'theme-minimal', 'theme-classic');

    const [family, mode] = currentTheme.split('-') as ['classic' | 'premium' | 'minimal', 'light' | 'dark'];

    if (mode === 'dark') {
      root.classList.add('dark');
    }
    if (family === 'premium') {
      root.classList.add('theme-navy');
    } else if (family === 'minimal') {
      root.classList.add('theme-minimal');
    } else {
      root.classList.add('theme-classic');
    }
  }, [currentTheme]);

  // Helper boolean for legacy components that just check isDarkMode
  const isDarkMode = currentTheme.endsWith('dark');

  // Cycling theme function for Header toggle
  const toggleTheme = () => {
    const [family, mode] = currentTheme.split('-') as ['classic' | 'premium' | 'minimal', 'light' | 'dark'];
    const nextMode = mode === 'light' ? 'dark' : 'light';
    const nextTheme = `${family}-${nextMode}` as Theme;
    setCurrentTheme(nextTheme);
    apiPatch('/settings', { theme: { family, mode: nextMode } }).catch(() => {
      // ignore save errors for toggle
    });
  };

  // Auth Handlers
  const handleLogin = (user: SessionUser) => {
    setCurrentUser(user);
    setIsAuthenticated(true);
  };
  const handleLogout = () => {
    apiPost('/auth/logout', {}).catch((err) => {
      console.error(err);
    }).finally(() => {
      setIsAuthenticated(false);
      setCurrentUser(null);
    });
  };

  // Ticket & Notification Handlers
  const handleCreateTicket = (newTicket: Ticket) => {
    setTickets([newTicket, ...tickets]);
    
    // Simulate Support Response after 5 seconds
    setTimeout(() => {
      const responseMsg = {
        id: Math.random().toString(36).substr(2, 9),
        senderId: 'support-agent-1',
        senderName: 'Sarah form Support',
        senderRole: 'support' as const,
        content: `Hello! Thanks for reaching out. We have received your ticket #${newTicket.number} regarding "${newTicket.subject}". An agent will review it shortly.`,
        timestamp: new Date().toISOString()
      };
      
      setTickets(prevTickets => prevTickets.map(t => {
        if (t.id === newTicket.id) {
          return {
            ...t,
            status: 'In Progress',
            lastUpdated: new Date().toISOString(),
            messages: [...t.messages, responseMsg]
          };
        }
        return t;
      }));

      // Add Notification
      const newNotification: Notification = {
        id: Math.random().toString(36).substr(2, 9),
        title: 'New Reply on Ticket',
        message: `Sarah from Support replied to ticket #${newTicket.number}`,
        time: 'Just now',
        read: false,
        type: 'ticket_reply',
        relatedTicketId: newTicket.id
      };
      setNotifications(prev => [newNotification, ...prev]);

    }, 5000);
  };

  const handleUpdateTicket = (ticketId: string, newMessageContent: string) => {
    const userMsg = {
      id: Math.random().toString(36).substr(2, 9),
      senderId: 'user-1',
      senderName: currentUser?.name ?? 'User',
      senderRole: 'user' as const,
      content: newMessageContent,
      timestamp: new Date().toISOString()
    };

    setTickets(prev => prev.map(t => 
      t.id === ticketId 
        ? { ...t, messages: [...t.messages, userMsg], lastUpdated: new Date().toISOString(), status: 'Waiting for Reply' }
        : t
    ));

    // Simulate Another Reply
    setTimeout(() => {
        const supportMsg = {
            id: Math.random().toString(36).substr(2, 9),
            senderId: 'support-agent-1',
            senderName: 'Sarah form Support',
            senderRole: 'support' as const,
            content: "Thank you for the additional information. I'm looking into this right now.",
            timestamp: new Date().toISOString()
        };

        setTickets(prev => prev.map(t => 
            t.id === ticketId 
            ? { ...t, messages: [...t.messages, supportMsg], lastUpdated: new Date().toISOString(), status: 'In Progress' }
            : t
        ));

        const ticket = tickets.find(t => t.id === ticketId);
        const newNotification: Notification = {
            id: Math.random().toString(36).substr(2, 9),
            title: 'Support Update',
            message: `New message on ticket #${ticket?.number || 'Unknown'}`,
            time: 'Just now',
            read: false,
            type: 'ticket_reply',
            relatedTicketId: ticketId
        };
        setNotifications(prev => [newNotification, ...prev]);
    }, 4000);
  };

  const handleNotificationClick = (notification: Notification) => {
    // Mark as read
    setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, read: true } : n));
    
    // Navigate to ticket
    if (notification.type === 'job') {
      apiPost(`/notifications/${notification.id}/read`, {}).catch((err) => {
        console.error(err);
      });
      if (notification.relatedLessonId) {
        apiGet<LegacyLesson>(`/lessons/${notification.relatedLessonId}`)
          .then((lesson) => {
            setSelectedLesson(getLessonStub(lesson.id, lesson.title));
            setSelectedModuleIdForLesson(lesson.moduleId ?? null);
            setPendingLessonAutoQueue(null);
            setCurrentView('editor');
          })
          .catch((err) => {
            console.error(err);
          });
      }
      return;
    }
    if (notification.relatedTicketId) {
      setActiveTicketId(notification.relatedTicketId);
      setCurrentView('help');
    }
  };

  const handleMarkAllNotificationsRead = () => {
    setNotifications(prev => prev.map(n => (n.read ? n : { ...n, read: true })));
    apiPost('/notifications/read-all', {}).catch((err) => {
      console.error(err);
    });
  };

  const handleCourseSelect = (course: Course) => {
    setCourses((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === course.id);
      if (existingIndex === -1) {
        return [course, ...prev];
      }
      const next = [...prev];
      next[existingIndex] = {
        ...next[existingIndex],
        ...course
      };
      return next;
    });
    setSelectedCourse(course);
    loadCourseModulesByCourseId(course.id);
    setCurrentView('modules');
  };

  const handleAddCourse = () => {
    setEditingCourse(null);
    setCurrentView('course-editor');
  };

  const handleEditCourse = (course: Course) => {
    setEditingCourse(course);
    setCurrentView('course-editor');
  };

  const handleSaveCourse = async (courseData: Course) => {
    const title = courseData.title.trim();
    if (!title) return;
    const payload = {
      name: title,
      description: courseData.description?.trim() || undefined,
      categoryId: courseData.categoryId?.trim() || undefined,
      productLanguage: courseData.productLanguage?.trim() || undefined,
      emailLanguage: courseData.emailLanguage?.trim() || undefined,
      primarySalesCountry: courseData.primarySalesCountry?.trim() || undefined,
      salesPageUrl: courseData.salesPageUrl?.trim() || undefined,
      imageAssetId: courseData.imageAssetId?.trim() || undefined,
      status: courseData.status ?? 'draft'
    };
    try {
      if (editingCourse) {
        const updated = await apiPatch<LegacyCourse>(`/courses/${editingCourse.id}`, payload);
        setCourses((prev) =>
          prev.map((courseItem) =>
            courseItem.id === updated.id
              ? {
                  ...courseItem,
                  ...courseData,
                  id: updated.id,
                  title: updated.name
                }
              : courseItem
          )
        );
        setSelectedCourse((prev) =>
          prev && prev.id === updated.id
            ? {
                ...prev,
                ...courseData,
                id: updated.id,
                title: updated.name
              }
            : prev
        );
      } else {
        const created = await apiPost<LegacyCourse>('/courses', payload);
        const mapped = mapCourse(created);
        const nextCourse = {
          ...mapped,
          ...courseData,
          id: created.id,
          title: created.name
        };
        setCourses((prev) => {
          const existingIndex = prev.findIndex((courseItem) => courseItem.id === created.id);
          if (existingIndex >= 0) {
            const next = [...prev];
            next[existingIndex] = {
              ...next[existingIndex],
              ...nextCourse
            };
            return next;
          }
          return [nextCourse, ...prev];
        });
      }
      setCurrentView('courses');
    } catch (err) {
      console.error(err);
      setCoursesError((err as Error).message ?? 'Failed to save course.');
    }
  };

  const handleDeleteCourse = async (id: string) => {
    try {
      await apiDelete<{ ok: boolean }>(`/courses/${id}`);
      setCourses((prev) => prev.filter((course) => course.id !== id));
      if (selectedCourse?.id === id) {
        setSelectedCourse(null);
        setCourseModules([]);
        setCurrentView('courses');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddLesson = () => {
    setEditingLesson(null);
    setPendingLessonAutoQueue(null);
    setSelectedModuleIdForLesson(courseModules[0]?.id ?? null);
    setCurrentView('module-editor');
  };

  const handleAddLessonToModule = (moduleId: string) => {
    setEditingLesson(null);
    setPendingLessonAutoQueue(null);
    setSelectedModuleIdForLesson(moduleId);
    setCurrentView('module-editor');
  };

  const handleEditLesson = (lesson: LessonBlock) => {
    setEditingLesson(lesson);
    setPendingLessonAutoQueue(null);
    const sourceModule = courseModules.find((module) => module.lessons.some((item) => item.id === lesson.id));
    setSelectedModuleIdForLesson(sourceModule?.id ?? null);
    setCurrentView('module-editor');
  };

  const handleSelectLesson = (lesson: LessonBlock) => {
    setSelectedLesson(lesson);
    const sourceModule = courseModules.find((module) => module.lessons.some((item) => item.id === lesson.id));
    setSelectedModuleIdForLesson(sourceModule?.id ?? null);
    setPendingLessonAutoQueue(null);
    setCurrentView('editor');
  };

  const handleAddModuleContainer = () => {
    setEditingModuleContainer(null);
    setCurrentView('module-container-editor');
  };

  const handleEditModuleContainer = (module: Module) => {
    setEditingModuleContainer(module);
    setCurrentView('module-container-editor');
  };

  const handleSaveModuleContainer = async (moduleData: Module) => {
    if (!selectedCourse) return;
    const title = moduleData.title.trim();
    if (!title) return;
    try {
      const existing = courseModules.find((m) => m.id === moduleData.id);
      if (existing) {
        const updated = await apiPatch<LegacyModule>(`/modules/${moduleData.id}`, { name: title });
        setCourseModules((prev) =>
          prev.map((moduleItem) =>
            moduleItem.id === moduleData.id ? { ...moduleItem, title: updated.name } : moduleItem
          )
        );
      } else {
        const created = await apiPost<LegacyModule>(`/courses/${selectedCourse.id}/modules`, { name: title });
        const nextModule: Module = {
          id: created.id,
          title: created.name,
          thumbLandscape: moduleData.thumbLandscape || '/module-placeholder.svg',
          thumbPortrait: moduleData.thumbPortrait || '/module-placeholder-portrait.svg',
          lessons: [],
          build: {
            progressPercent: 0,
            jobs: createEmptyBuildJobs()
          }
        };
        setCourseModules((prev) => {
          const existingIndex = prev.findIndex((moduleItem) => moduleItem.id === created.id);
          if (existingIndex >= 0) {
            const next = [...prev];
            next[existingIndex] = {
              ...next[existingIndex],
              ...nextModule,
              lessons: next[existingIndex].lessons
            };
            return normalizeModuleLessonsOrder(next);
          }
          return normalizeModuleLessonsOrder([...prev, nextModule]);
        });
      }
      setCurrentView('modules');
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteModuleContainer = async (id: string) => {
    try {
      await apiDelete<{ ok: boolean }>(`/modules/${id}`);
      setCourseModules((prev) => prev.filter((moduleItem) => moduleItem.id !== id));
      setCurrentView('modules');
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteLesson = async (lessonId: string) => {
    try {
      await apiDelete<{ ok: boolean }>(`/lessons/${lessonId}`);
      setCourseModules((prev) =>
        prev.map((moduleItem) => ({
          ...moduleItem,
          lessons: moduleItem.lessons.filter((lessonItem) => lessonItem.id !== lessonId)
        }))
      );
      setCurrentView('modules');
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveLesson = (lessonData: LessonBlock, targetModuleId?: string | null) => {
    setCourseModules((prev) => {
      const existingModuleId =
        prev.find((moduleItem) => moduleItem.lessons.some((lessonItem) => lessonItem.id === lessonData.id))?.id ??
        null;
      const destinationModuleId = targetModuleId ?? existingModuleId ?? selectedModuleIdForLesson;
      if (!destinationModuleId) return prev;

      const baseLesson: LessonBlock = {
        ...lessonData,
        build: lessonData.build ?? {
          lessonVersionId: null,
          blocksTotal: 0,
          blocksReady: 0,
          audioReady: 0,
          imagesReady: 0,
          finalVideoReady: false,
          progressPercent: 0,
          jobs: createEmptyBuildJobs()
        }
      };

      return prev.map((moduleItem, moduleIndex) => {
        const moduleOrder = moduleIndex + 1;
        const withoutLesson = moduleItem.lessons.filter((lessonItem) => lessonItem.id !== lessonData.id);
        if (moduleItem.id !== destinationModuleId) {
          return {
            ...moduleItem,
            lessons: withoutLesson
          };
        }
        const existingLesson = moduleItem.lessons.find((lessonItem) => lessonItem.id === lessonData.id);
        const targetOrder = existingLesson
          ? parseInt(existingLesson.number?.split('.').pop() || '', 10) || withoutLesson.length + 1
          : withoutLesson.length + 1;
        const normalizedLesson: LessonBlock = {
          ...baseLesson,
          number: baseLesson.number || `${moduleOrder}.${targetOrder}`
        };
        return {
          ...moduleItem,
          lessons: [...withoutLesson, normalizedLesson]
        };
      });
    });
    setCurrentView('modules');
  };

  const handlePersistModulesReorder = async (modules: Module[]) => {
    if (!selectedCourse) return;
    await apiPatch(`/courses/${selectedCourse.id}/structure/reorder`, {
      modules: modules.map((moduleItem) => ({
        moduleId: moduleItem.id,
        lessonIds: moduleItem.lessons.map((lessonItem) => lessonItem.id)
      }))
    });
  };

  const handleStartAIGen = (
    lessonData: LessonBlock,
    options?: { generateAudio: boolean; generateImage: boolean }
  ) => {
    setSelectedLesson(lessonData);
    setPendingLessonAutoQueue({
      requestId: crypto.randomUUID(),
      generateAudio: Boolean(options?.generateAudio),
      generateImage: Boolean(options?.generateImage)
    });
    setCurrentView('editor');
  };

  const resolveLessonVersion = async (
    lessonId: string
  ): Promise<{ id: string; preferredVoiceId?: string | null; preferredTemplateId?: string | null } | null> => {
    const versions = await apiGet<
      Array<{ id: string; preferredVoiceId?: string | null; preferredTemplateId?: string | null }>
    >(`/lessons/${lessonId}/versions`, {
      cacheMs: 0,
      dedupe: false
    });
    return versions[0] ?? null;
  };

  const startLessonGeneration = async (
    lessonId: string,
    action: 'blocks' | 'audio' | 'images'
  ) => {
    const version = await resolveLessonVersion(lessonId);
    const versionId = version?.id ?? null;
    if (!versionId) return;
    if (action === 'blocks') {
      await apiPost(`/lesson-versions/${versionId}/segment`, {
        requestId: randomRequestId(),
        purge: true
      });
      return;
    }
    if (action === 'audio') {
      await apiPost(`/lesson-versions/${versionId}/tts`, {
        requestId: randomRequestId(),
        ...(version?.preferredVoiceId ? { voiceId: version.preferredVoiceId } : {})
      });
      return;
    }
    await apiPost(`/lesson-versions/${versionId}/images`, {
      requestId: randomRequestId(),
      ...(version?.preferredTemplateId ? { templateId: version.preferredTemplateId } : {})
    });
  };

  const handleStartLessonGeneration = async (
    lessonId: string,
    action: 'blocks' | 'audio' | 'images'
  ) => {
    try {
      await startLessonGeneration(lessonId, action);
    } catch (err) {
      console.error(err);
    }
  };

  const handleStartModuleGeneration = async (
    moduleId: string,
    action: 'blocks' | 'audio' | 'images'
  ) => {
    try {
      const moduleItem = courseModules.find((item) => item.id === moduleId);
      if (!moduleItem) return;
      for (const lesson of moduleItem.lessons) {
        await startLessonGeneration(lesson.id, action);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleStartCourseGeneration = async (action: 'blocks' | 'audio' | 'images') => {
    try {
      for (const moduleItem of courseModules) {
        for (const lesson of moduleItem.lessons) {
          await startLessonGeneration(lesson.id, action);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCancelLessonGeneration = async (
    lessonId: string,
    action: 'blocks' | 'audio' | 'images'
  ) => {
    try {
      await apiPost(`/lessons/${lessonId}/generation/${action}/cancel`, {});
    } catch (err) {
      console.error(err);
    }
  };

  const handleCancelModuleGeneration = async (
    moduleId: string,
    action: 'blocks' | 'audio' | 'images'
  ) => {
    try {
      await apiPost(`/modules/${moduleId}/generation/${action}/cancel`, {});
    } catch (err) {
      console.error(err);
    }
  };

  const handleCancelCourseGeneration = async (action: 'blocks' | 'audio' | 'images') => {
    try {
      if (!selectedCourse?.id) return;
      await apiPost(`/courses/${selectedCourse.id}/generation/${action}/cancel`, {});
    } catch (err) {
      console.error(err);
    }
  };

  const renderContent = () => {
    switch (currentView) {
      case 'dashboard':
        return (
          <Dashboard
            setView={setCurrentView}
            onSelectCourse={handleCourseSelect}
            onEditCourse={handleEditCourse}
            onAddCourse={handleAddCourse}
            onImageClick={setActiveImageUrl}
            coursesSnapshot={courses}
          />
        );
      case 'courses':
        return (
          <Courses 
            courses={courses}
            error={coursesError}
            setView={setCurrentView} 
            onSelectCourse={handleCourseSelect}
            onEditCourse={handleEditCourse}
            onAddCourse={handleAddCourse}
            onImageClick={setActiveImageUrl}
          />
        );
      case 'course-editor':
        return (
          <CourseEditor 
            course={editingCourse} 
            onSave={handleSaveCourse} 
            onCancel={() => setCurrentView('courses')}
            onDelete={handleDeleteCourse}
          />
        );
      case 'modules':
        return (
          <CourseModules 
            course={selectedCourse} 
            modules={courseModules}
            error={modulesError}
            setModules={setCourseModules}
            onPersistReorder={handlePersistModulesReorder}
            setView={setCurrentView} 
            onEditLesson={handleEditLesson}
            onSelectLesson={handleSelectLesson}
            onAddLesson={handleAddLessonToModule}
            onEditModule={handleEditModuleContainer}
            onAddModuleContainer={handleAddModuleContainer}
            onImageClick={setActiveImageUrl}
            onEditCourse={handleEditCourse}
            onDeleteCourse={handleDeleteCourse}
            onDeleteModule={handleDeleteModuleContainer}
            onDeleteLesson={handleDeleteLesson}
            onStartCourseGeneration={handleStartCourseGeneration}
            onCancelCourseGeneration={handleCancelCourseGeneration}
            onStartModuleGeneration={handleStartModuleGeneration}
            onCancelModuleGeneration={handleCancelModuleGeneration}
            onStartLessonGeneration={handleStartLessonGeneration}
            onCancelLessonGeneration={handleCancelLessonGeneration}
            navigationTarget={modulesNavigationTarget}
          />
        );
      case 'editor':
        {
          const moduleFromSelectedModuleId = courseModules.find((module) => module.id === selectedModuleIdForLesson);
          const moduleFromLesson = selectedLesson
            ? courseModules.find((module) => module.lessons.some((item) => item.id === selectedLesson.id))
            : undefined;
          const resolvedModuleTitle = moduleFromSelectedModuleId?.title ?? moduleFromLesson?.title ?? '';
        return (
          <Editor
            lessonId={selectedLesson?.id ?? null}
            dispatchAgentId={dispatchAgentId}
            lessonTitle={selectedLesson?.title ?? ''}
            moduleTitle={resolvedModuleTitle}
            courseTitle={selectedCourse?.title ?? ''}
            autoQueuePlan={pendingLessonAutoQueue}
            onImageClick={setActiveImageUrl}
            onGoCourse={() => {
              setCurrentView('modules');
              setModulesNavigationTarget({ type: 'top', nonce: Date.now() });
            }}
            onGoModule={() => {
              const moduleId = moduleFromSelectedModuleId?.id ?? moduleFromLesson?.id;
              setCurrentView('modules');
              setModulesNavigationTarget(
                moduleId
                  ? { type: 'module', moduleId, nonce: Date.now() }
                  : { type: 'top', nonce: Date.now() }
              );
            }}
          />
        );
        }
      case 'module-editor':
        return (
          <ModuleEditor 
            module={editingLesson}
            moduleId={selectedModuleIdForLesson}
            dispatchAgentId={dispatchAgentId}
            onSave={handleSaveLesson}
            onCancel={() => setCurrentView('modules')}
            onStartAIGen={handleStartAIGen}
          />
        );
      case 'module-container-editor':
        return (
          <ModuleContainerEditor 
            module={editingModuleContainer}
            onSave={handleSaveModuleContainer}
            onCancel={() => setCurrentView('modules')}
            onDelete={handleDeleteModuleContainer}
          />
        );
      case 'library':
        return <Library onImageClick={setActiveImageUrl} />;
      case 'team':
        return <Team currentUser={currentUser} />;
      case 'profile':
        return <UserProfile />;
      case 'billing':
        return <Billing />;
      case 'settings':
        return (
          <Settings 
            currentTheme={currentTheme}
            setTheme={setCurrentTheme}
          />
        );
      case 'security':
        return <Security currentUser={currentUser} />;
      case 'help':
        return (
          <HelpCenter 
            tickets={tickets}
            onCreateTicket={handleCreateTicket}
            onUpdateTicket={handleUpdateTicket}
            initialActiveTicketId={activeTicketId}
            clearActiveTicket={() => setActiveTicketId(null)}
          />
        );
      default:
        return (
          <Dashboard
            setView={setCurrentView}
            onSelectCourse={handleCourseSelect}
            onEditCourse={handleEditCourse}
            onAddCourse={handleAddCourse}
            onImageClick={setActiveImageUrl}
            coursesSnapshot={courses}
          />
        );
    }
  };

  if (!isThemeReady || !isAuthResolved) {
    return null;
  }

  // Auth Flow
  if (!isAuthenticated) {
    return <Auth onLogin={handleLogin} isDarkMode={isDarkMode} />;
  }

  // Main App Flow
  return (
    <div className={`h-screen flex transition-colors duration-300 ${isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      <Sidebar 
        currentView={currentView} 
        setView={setCurrentView} 
        currentUser={currentUser}
        onLogout={handleLogout}
      />
      <div className="flex-1 flex flex-col min-w-0 h-full">
        <Header 
          toggleTheme={toggleTheme} 
          isDarkMode={isDarkMode} 
          currentView={currentView} 
          onAddCourse={handleAddCourse}
          onAddModule={handleAddModuleContainer}
          onAddLesson={handleAddLesson}
          notifications={notifications}
          onNotificationClick={handleNotificationClick}
          onMarkAllRead={handleMarkAllNotificationsRead}
        />
        <main className="flex-1 min-h-0 overflow-hidden">
          {renderContent()}
        </main>
      </div>

      <ImageModal url={activeImageUrl} onClose={() => setActiveImageUrl(null)} />
    </div>
  );
};

export default App;
