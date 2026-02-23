import type { LegacyScopedIds, CanonicalScopedIds } from "./domain-contracts.js";

export type InternalInventoryDelta = {
  audioCountDelta: number;
  durationSecondsDelta: number;
  diskUsageBytesDelta: number;
  updatedAt?: string;
};

export type InternalInventoryDeltaEventPayload = {
  workspaceId: string;
  agentId: string;
  delta: Partial<InternalInventoryDelta>;
};

export type InternalInventoryAssetRef = Partial<LegacyScopedIds> &
  Partial<CanonicalScopedIds> & {
    assetId?: string;
    blockId: string;
    kind: string;
    path: string;
    sizeBytes?: number;
    durationSeconds?: number;
  };

export type InternalInventorySnapshot = {
  audioCount: number;
  durationSeconds: number;
  diskUsageBytes: number;
  updatedAt?: string;
  assetRefs?: InternalInventoryAssetRef[];
};

export type InternalInventorySnapshotEventPayload = {
  workspaceId: string;
  agentId: string;
  snapshot: Partial<InternalInventorySnapshot>;
};

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function normalizeInternalInventoryDelta(
  value: Partial<InternalInventoryDelta> | null | undefined
): InternalInventoryDelta {
  return {
    audioCountDelta: Math.trunc(toFiniteNumber(value?.audioCountDelta) ?? 0),
    durationSecondsDelta: toFiniteNumber(value?.durationSecondsDelta) ?? 0,
    diskUsageBytesDelta: Math.trunc(toFiniteNumber(value?.diskUsageBytesDelta) ?? 0),
    updatedAt:
      typeof value?.updatedAt === "string" && value.updatedAt.trim()
        ? value.updatedAt.trim()
        : undefined
  };
}

export function normalizeInternalInventoryAssetRef(
  value: Partial<InternalInventoryAssetRef> | null | undefined
): InternalInventoryAssetRef | null {
  const blockId = toTrimmedString(value?.blockId);
  const kind = toTrimmedString(value?.kind);
  const path = toTrimmedString(value?.path);
  if (!blockId || !kind || !path) return null;
  return {
    assetId: toTrimmedString(value?.assetId),
    courseId: toTrimmedString(value?.courseId),
    moduleId: toTrimmedString(value?.moduleId),
    lessonId: toTrimmedString(value?.lessonId),
    lessonVersionId: toTrimmedString(value?.lessonVersionId),
    channelId: toTrimmedString(value?.channelId),
    sectionId: toTrimmedString(value?.sectionId),
    videoId: toTrimmedString(value?.videoId),
    videoVersionId: toTrimmedString(value?.videoVersionId),
    blockId,
    kind,
    path,
    sizeBytes:
      typeof value?.sizeBytes === "number" && Number.isFinite(value.sizeBytes)
        ? Math.max(0, Math.trunc(value.sizeBytes))
        : undefined,
    durationSeconds:
      typeof value?.durationSeconds === "number" && Number.isFinite(value.durationSeconds)
        ? Math.max(0, value.durationSeconds)
        : undefined
  };
}

export function normalizeInternalInventorySnapshot(
  value: Partial<InternalInventorySnapshot> | null | undefined
): InternalInventorySnapshot {
  const rawRefs = Array.isArray(value?.assetRefs) ? value.assetRefs : [];
  const assetRefs = rawRefs
    .map((item) => normalizeInternalInventoryAssetRef(item))
    .filter((item): item is InternalInventoryAssetRef => Boolean(item));
  return {
    audioCount: Math.max(0, Math.trunc(toFiniteNumber(value?.audioCount) ?? 0)),
    durationSeconds: Math.max(0, toFiniteNumber(value?.durationSeconds) ?? 0),
    diskUsageBytes: Math.max(0, Math.trunc(toFiniteNumber(value?.diskUsageBytes) ?? 0)),
    updatedAt: toTrimmedString(value?.updatedAt),
    assetRefs
  };
}
