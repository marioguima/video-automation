import { mapLegacyDomainEntityToCanonical } from "./domain-contracts.js";

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function enrichDomainAliasPayload<T extends Record<string, unknown>>(payload: T): T {
  const next: Record<string, unknown> = { ...payload };

  const courseId = normalizeString(payload.courseId);
  const moduleId = normalizeString(payload.moduleId);
  const lessonId = normalizeString(payload.lessonId);
  const lessonVersionId = normalizeString(payload.lessonVersionId);
  const relatedLessonId = normalizeString(payload.relatedLessonId);

  if (courseId && next.channelId === undefined) next.channelId = courseId;
  if (moduleId && next.sectionId === undefined) next.sectionId = moduleId;
  if (lessonId && next.videoId === undefined) next.videoId = lessonId;
  if (lessonVersionId && next.videoVersionId === undefined) next.videoVersionId = lessonVersionId;
  if (relatedLessonId && next.relatedVideoId === undefined) next.relatedVideoId = relatedLessonId;

  if (payload.course && next.channel === undefined) next.channel = payload.course;
  if (payload.module && next.section === undefined) next.section = payload.module;
  if (payload.lesson && next.video === undefined) next.video = payload.lesson;

  if (Array.isArray(payload.courses) && next.channels === undefined) next.channels = payload.courses;
  if (Array.isArray(payload.modules) && next.sections === undefined) next.sections = payload.modules;
  if (Array.isArray(payload.lessons) && next.videos === undefined) next.videos = payload.lessons;
  if (Array.isArray((payload as Record<string, unknown>)["lessonVersions"]) && next.videoVersions === undefined) {
    next.videoVersions = (payload as Record<string, unknown>)["lessonVersions"];
  }

  const entity = normalizeString(payload.entity);
  if (entity && next.domainEntity === undefined) {
    next.domainEntity = mapLegacyDomainEntityToCanonical(entity);
  }

  return next as T;
}

export function rewriteLegacyDomainUrlPath(value: string): string {
  if (!value.startsWith("/")) return value;
  return value
    .replace(/^\/courses(?=\/|$)/, "/channels")
    .replace(/^\/modules(?=\/|$)/, "/sections")
    .replace(/^\/lessons(?=\/|$)/, "/videos")
    .replace(/^\/lesson-versions(?=\/|$)/, "/video-versions");
}

export function enrichDomainAliasJsonValue(value: unknown, keyHint?: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => enrichDomainAliasJsonValue(item, keyHint));
  }
  if (typeof value === "string") {
    const key = (keyHint ?? "").toLowerCase();
    if (key === "url" || key.endsWith("url") || key === "path" || key.endsWith("path")) {
      return rewriteLegacyDomainUrlPath(value);
    }
    return value;
  }
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const enriched = enrichDomainAliasPayload(record);
  for (const [key, nested] of Object.entries(enriched)) {
    if (nested && typeof nested === "object") {
      (enriched as Record<string, unknown>)[key] = enrichDomainAliasJsonValue(nested, key);
    } else if (typeof nested === "string") {
      (enriched as Record<string, unknown>)[key] = enrichDomainAliasJsonValue(nested, key);
    }
  }
  return enriched;
}
