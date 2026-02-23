export type LegacyDomainEntity =
  | "course"
  | "module"
  | "lesson"
  | "lesson_version"
  | "course_structure";

export type CanonicalDomainEntity =
  | "channel"
  | "section"
  | "video"
  | "video_version"
  | "channel_structure";

export type LegacyDomainIds = {
  courseId?: string | null;
  moduleId?: string | null;
  lessonId?: string | null;
  lessonVersionId?: string | null;
  relatedLessonId?: string | null;
};

export type CanonicalDomainIds = {
  channelId?: string | null;
  sectionId?: string | null;
  videoId?: string | null;
  videoVersionId?: string | null;
  relatedVideoId?: string | null;
};

export type DomainAliasIds = LegacyDomainIds & CanonicalDomainIds;

export type LegacyScopedIds = {
  courseId: string;
  moduleId: string;
  lessonId: string;
  lessonVersionId: string;
};

export type CanonicalScopedIds = {
  channelId: string;
  sectionId: string;
  videoId: string;
  videoVersionId: string;
};

export type ScopedIdsWithAliases =
  | (LegacyScopedIds & Partial<CanonicalScopedIds>)
  | (CanonicalScopedIds & Partial<LegacyScopedIds>);

export function mapLegacyDomainEntityToCanonical(entity: string): string {
  if (entity === "course") return "channel";
  if (entity === "module") return "section";
  if (entity === "lesson") return "video";
  if (entity === "lesson_version") return "video_version";
  if (entity === "course_structure") return "channel_structure";
  return entity;
}

export function withCanonicalScopedIdAliases<T extends ScopedIdsWithAliases & Record<string, unknown>>(
  value: T
): T & CanonicalScopedIds & LegacyScopedIds {
  const courseId = (value as Partial<LegacyScopedIds>).courseId ?? (value as Partial<CanonicalScopedIds>).channelId;
  const moduleId = (value as Partial<LegacyScopedIds>).moduleId ?? (value as Partial<CanonicalScopedIds>).sectionId;
  const lessonId = (value as Partial<LegacyScopedIds>).lessonId ?? (value as Partial<CanonicalScopedIds>).videoId;
  const lessonVersionId =
    (value as Partial<LegacyScopedIds>).lessonVersionId ??
    (value as Partial<CanonicalScopedIds>).videoVersionId;
  return {
    ...value,
    courseId: courseId ?? "",
    moduleId: moduleId ?? "",
    lessonId: lessonId ?? "",
    lessonVersionId: lessonVersionId ?? "",
    channelId: (value as Partial<CanonicalScopedIds>).channelId ?? courseId ?? "",
    sectionId: (value as Partial<CanonicalScopedIds>).sectionId ?? moduleId ?? "",
    videoId: (value as Partial<CanonicalScopedIds>).videoId ?? lessonId ?? "",
    videoVersionId: (value as Partial<CanonicalScopedIds>).videoVersionId ?? lessonVersionId ?? ""
  } as T & CanonicalScopedIds & LegacyScopedIds;
}
