import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import websocket from "@fastify/websocket";
import swagger from "@fastify/swagger";
import scalarReference from "@scalar/fastify-api-reference";
import argon2 from "argon2";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { EventEmitter } from "node:events";
import { AsyncLocalStorage } from "node:async_hooks";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { WebSocket } from "ws";

import {
  buildDeterministicBlocks,
  ensureDataDir,
  enrichDomainAliasJsonValue,
  enrichDomainAliasPayload,
  getConfig,
  JOB_STREAM_EVENT,
  loadRootEnv,
  normalizeJobEventLifecycle,
  normalizeJobEventPhase,
  normalizeProgressPercent,
  normalizeInternalInventoryDelta,
  normalizeInternalInventorySnapshot,
  sanitizeNarratedScriptText,
  rewriteLegacyDomainUrlPath,
  WS_EVENT,
  type AgentControlCommandName,
  type AgentControlIncomingMessage,
  type AgentControlOutgoingMessage,
  type AgentControlIntegrationProvider,
  type AgentIntegrationConfig,
  type WorkerAgentCommandName,
  type InternalInventoryDeltaEventPayload,
  type InternalInventoryAssetRef,
  type InternalInventorySnapshotEventPayload,
  type InternalJobEventPayload,
  loadVoiceIndex,
  findVoiceById,
  blockSlideDir
} from "@vizlec/shared";
import { createPrismaClient } from "@vizlec/db";
import { buildEndpointPurposeExplanation } from "./openapi-endpoint-explanations.js";

loadRootEnv();

const config = getConfig();
ensureDataDir(config.dataDir);

function ensureWorkingDir(dataDir: string): void {
  const cwd = path.resolve(process.cwd());
  const target = path.resolve(dataDir);
  if (cwd !== target) {
    process.chdir(target);
  }
}

ensureWorkingDir(config.dataDir);

const fastify = Fastify({ logger: true });
const prisma = createPrismaClient();
const AUTH_COOKIE_NAME = "vizlec_session";
const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const authJwtSecret = process.env.AUTH_JWT_SECRET?.trim() || "vizlec-dev-secret-change-in-production";
const internalJobsEventToken = process.env.INTERNAL_JOBS_EVENT_TOKEN?.trim() ?? "";
const authCookieSecure = (process.env.AUTH_COOKIE_SECURE ?? "false").trim().toLowerCase() === "true";
const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMFY_WORKFLOWS_DIR = path.resolve(API_ROOT, "..", "worker", "workflows");
const DEFAULT_COMFY_WORKFLOW_FILE = "vantage-z-image-turbo-api.json";

type AuthTokenPayload = {
  userId: string;
  email: string;
};

type UserScope = {
  workspaceId: string;
  membershipRole: string;
};

type DispatchClientResolution =
  | { ok: true; clientId: string | null }
  | { ok: false; statusCode: 403; error: string };

const USER_ROLES = ["owner", "admin", "member"] as const;
type UserRole = (typeof USER_ROLES)[number];

const wsClients = new Set<WebSocket>();
const jobStreamBus = new EventEmitter();
jobStreamBus.setMaxListeners(0);
const lastWsJobFingerprintByScope = new Map<string, string>();
const broadcastWsEvent = (event: string, payload: Record<string, unknown>): void => {
  if (wsClients.size === 0) return;
  const message = JSON.stringify({ event, payload });
  wsClients.forEach((client) => {
    if (client.readyState !== 1) return;
    try {
      client.send(message);
    } catch {
      // ignore individual socket errors
    }
  });
};

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value !== "boolean") return null;
  return value;
}

function stableJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableJson(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  Object.keys(record)
    .sort((a, b) => a.localeCompare(b))
    .forEach((key) => {
      out[key] = stableJson(record[key]);
    });
  return out;
}

function extractImpactedLessonSnapshot(
  buildStatus: Record<string, unknown> | null,
  videoId: string | null
): Record<string, unknown> | null {
  if (!buildStatus || !videoId) return null;
  const modules = Array.isArray(buildStatus.sections) ? buildStatus.sections : [];
  for (const moduleItem of modules) {
    if (!moduleItem || typeof moduleItem !== "object") continue;
    const lessons = Array.isArray((moduleItem as Record<string, unknown>).videos)
      ? ((moduleItem as Record<string, unknown>).videos as unknown[])
      : [];
    for (const lessonItem of lessons) {
      if (!lessonItem || typeof lessonItem !== "object") continue;
      const lesson = lessonItem as Record<string, unknown>;
      if (normalizeString(lesson.videoId) !== videoId) continue;
      const audio = lesson.audio as Record<string, unknown> | undefined;
      const images = lesson.images as Record<string, unknown> | undefined;
      return {
        videoId: normalizeString(lesson.videoId),
        videoVersionId: normalizeString(lesson.videoVersionId),
        progressPercent: normalizeNumber(lesson.progressPercent),
        audioReady: typeof audio?.ready === "number" ? audio.ready : null,
        audioDurationS: normalizeNumber(audio?.durationS),
        imagesReady: typeof images?.ready === "number" ? images.ready : null,
        finalVideoReady: normalizeBoolean(lesson.finalVideoReady),
        jobs: stableJson(lesson.jobs ?? null)
      };
    }
  }
  return null;
}

function buildRelevantJobUpdateFingerprintPayload(payload: Record<string, unknown>): {
  scopeKey: string;
  fingerprint: string;
} {
  const jobId = normalizeString(payload.jobId);
  const type = normalizeString(payload.type);
  const status = normalizeString(payload.status);
  const channelId = normalizeString(payload.channelId);
  const sectionId = normalizeString(payload.sectionId);
  const videoId = normalizeString(payload.videoId);
  const videoVersionId = normalizeString(payload.videoVersionId);
  const blockId = normalizeString(payload.blockId);
  const errorValue = payload.error;
  const error =
    errorValue === null ? null : typeof errorValue === "string" ? errorValue.trim() || null : String(errorValue);
  const lifecycleRaw = normalizeString(payload.lifecycle);
  const lifecycle =
    lifecycleRaw === "started" || lifecycleRaw === "running" || lifecycleRaw === "finished"
      ? lifecycleRaw
      : null;
  const phaseRaw = normalizeString(payload.phase);
  const phase =
    phaseRaw === "cleanup" || phaseRaw === "generation"
      ? phaseRaw
      : null;
  const progressPercent = normalizeNumber(payload.progressPercent);
  const buildStatusRaw =
    payload.buildStatus && typeof payload.buildStatus === "object"
      ? (payload.buildStatus as Record<string, unknown>)
      : null;
  const buildStatus = buildStatusRaw
    ? {
        progressPercent: normalizeNumber(buildStatusRaw.progressPercent),
        jobs: stableJson(buildStatusRaw.jobs ?? null),
        impactedLesson: extractImpactedLessonSnapshot(buildStatusRaw, videoId)
      }
    : null;

  const canonical = stableJson({
    jobId,
    type,
    status,
    channelId,
    sectionId,
    videoId,
    videoVersionId,
    blockId,
    lifecycle,
    phase,
    progressPercent,
    error,
    buildStatus
  });
  const scopeKey = jobId
    ? `job:${jobId}`
    : `agg:${type ?? "unknown"}|${channelId ?? "none"}|${sectionId ?? "none"}|${videoId ?? "none"}|${videoVersionId ?? "none"}|${blockId ?? "none"}|${status ?? "none"}`;
  return {
    scopeKey,
    fingerprint: JSON.stringify(canonical)
  };
}

function shouldBroadcastCanonicalJobUpdate(payload: Record<string, unknown>): boolean {
  const { scopeKey, fingerprint } = buildRelevantJobUpdateFingerprintPayload(payload);
  const previous = lastWsJobFingerprintByScope.get(scopeKey);
  if (previous === fingerprint) return false;
  lastWsJobFingerprintByScope.set(scopeKey, fingerprint);
  if (lastWsJobFingerprintByScope.size > 10000) {
    lastWsJobFingerprintByScope.clear();
  }
  return true;
}

const broadcastJobEvent = (payload: Record<string, unknown>): void => {
  const enriched = enrichDomainAliasPayload(payload);
  if (!shouldBroadcastCanonicalJobUpdate(enriched)) return;
  broadcastWsEvent(WS_EVENT.JOB_UPDATE, enriched);
};
const broadcastNotification = (payload: Record<string, unknown>): void => {
  broadcastWsEvent(WS_EVENT.NOTIFICATION, enrichDomainAliasPayload(payload));
};
const broadcastEntityChanged = (payload: Record<string, unknown>): void => {
  broadcastWsEvent(WS_EVENT.ENTITY_CHANGED, enrichDomainAliasPayload(payload));
};

type InventoryState = {
  workspaceId: string;
  agentId: string;
  audioCount: number;
  durationSeconds: number;
  diskUsageBytes: number;
  updatedAt: string;
};

type InventoryMetrics = {
  audioCount: number;
  durationSeconds: number;
  diskUsageBytes: number;
};

type WorkerInventoryAssetRef = InternalInventoryAssetRef;

type InventoryReconciliationSnapshot = {
  workspaceId: string;
  source: "worker_snapshot" | "database_baseline";
  mismatchDetected: boolean;
  inconsistencyEvents: number;
  lastDetectedAt: string | null;
  baseline: InventoryMetrics;
  reconciled: InventoryMetrics;
  workerSnapshot: InventoryMetrics | null;
  diff: {
    audioCount: number;
    durationSeconds: number;
    diskUsageBytes: number;
  };
  updatedAt: string;
};

const inventoryStateByAgent = new Map<string, InventoryState>();
const inventoryReconciliationByWorkspace = new Map<
  string,
  { fingerprint: string; inconsistencyEvents: number; lastDetectedAt: string | null }
>();
const inventorySnapshotStaleAfterMs = Math.max(
  1_000,
  Math.min(24 * 60 * 60 * 1000, Number(process.env.INVENTORY_SNAPSHOT_STALE_AFTER_MS ?? 60_000))
);
const pairingTokens = new Map<
  string,
  { workspaceId: string; createdByUserId: string; expiresAtMs: number; used: boolean }
>();

type AgentControlMessage = AgentControlIncomingMessage;
type AgentControlRequestMessage = AgentControlOutgoingMessage;

type AgentIntegrationConfigSnapshot = AgentIntegrationConfig & {
  llmBaseUrl: string;
  comfyuiBaseUrl: string;
  ttsBaseUrl: string;
};

type AgentSession = {
  socket: WebSocket;
  workspaceId: string;
  agentId: string;
  connectedAt: number;
  lastSeenAt: number;
};

const agentSessionsByAgentId = new Map<string, AgentSession>();
const pendingAgentReplies = new Map<
  string,
  {
    resolve: (value: { statusCode: number; data: Record<string, unknown> }) => void;
    reject: (reason?: unknown) => void;
    timeout: NodeJS.Timeout;
    meta?: {
      kind: "integration_health" | "worker_command";
      provider?: AgentControlIntegrationProvider;
      command?: WorkerAgentCommandName;
      workspaceId: string;
      agentId: string;
      startedAt: number;
      correlationId: string;
    };
  }
>();

const agentControlTokenSecret =
  process.env.AGENT_CONTROL_TOKEN_SECRET?.trim() ||
  process.env.AGENT_CONTROL_TOKEN?.trim() ||
  internalJobsEventToken ||
  authJwtSecret;
const pairingTokenTtlMs = Math.max(
  60_000,
  Math.min(3_600_000, Number(process.env.AGENT_PAIRING_TOKEN_TTL_MS ?? 600_000))
);
const agentControlRequestTimeoutMs = Math.max(
  5000,
  Math.min(120000, Number(process.env.AGENT_CONTROL_REQUEST_TIMEOUT_MS ?? 20000))
);
const CORRELATION_ID_HEADER = "x-correlation-id";
const correlationIdPattern = /^[a-zA-Z0-9._:-]{8,128}$/;
const requestCorrelationStore = new AsyncLocalStorage<{ correlationId: string }>();
const requestCorrelationByRef = new WeakMap<object, string>();
const requestStartedAtByRef = new WeakMap<object, number>();
const requestWorkspaceByRef = new WeakMap<object, string>();
const requestAgentByRef = new WeakMap<object, string>();

type AgentControlTokenClaims = {
  v: 1;
  agentId: string;
  workspaceId: string;
  exp: number;
};

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64");
}

function signAgentControlToken(claims: AgentControlTokenClaims): string {
  const payload = base64UrlEncode(JSON.stringify(claims));
  const signature = createHmac("sha256", agentControlTokenSecret).update(payload).digest();
  return `v1.${payload}.${base64UrlEncode(signature)}`;
}

function verifyAgentControlToken(token: string): AgentControlTokenClaims | null {
  const trimmed = token.trim();
  if (!trimmed.startsWith("v1.")) return null;
  const parts = trimmed.split(".");
  if (parts.length !== 3) return null;
  const payloadSegment = parts[1] ?? "";
  const signatureSegment = parts[2] ?? "";
  if (!payloadSegment || !signatureSegment) return null;

  const expectedSignature = createHmac("sha256", agentControlTokenSecret)
    .update(payloadSegment)
    .digest();
  let providedSignature: Buffer;
  try {
    providedSignature = base64UrlDecode(signatureSegment);
  } catch {
    return null;
  }
  if (providedSignature.length !== expectedSignature.length) return null;
  if (!timingSafeEqual(providedSignature, expectedSignature)) return null;

  let parsedClaims: unknown;
  try {
    parsedClaims = JSON.parse(base64UrlDecode(payloadSegment).toString("utf8"));
  } catch {
    return null;
  }
  if (!parsedClaims || typeof parsedClaims !== "object") return null;
  const claims = parsedClaims as Partial<AgentControlTokenClaims>;
  if (claims.v !== 1) return null;
  if (typeof claims.agentId !== "string" || !claims.agentId.trim()) return null;
  if (typeof claims.workspaceId !== "string" || !claims.workspaceId.trim()) return null;
  if (typeof claims.exp !== "number" || !Number.isFinite(claims.exp)) return null;
  if (Date.now() > claims.exp) return null;
  return {
    v: 1,
    agentId: claims.agentId.trim(),
    workspaceId: claims.workspaceId.trim(),
    exp: claims.exp
  };
}

function parseCorrelationId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || !correlationIdPattern.test(normalized)) return null;
  return normalized;
}

function resolveCorrelationIdFromHeaders(
  headerValue: unknown,
  fallback: string
): string {
  if (Array.isArray(headerValue)) {
    for (const value of headerValue) {
      const parsed = parseCorrelationId(value);
      if (parsed) return parsed;
    }
    return fallback;
  }
  return parseCorrelationId(headerValue) ?? fallback;
}

function setRequestCorrelation(
  request: FastifyRequest,
  reply: FastifyReply
): string {
  const correlationId = resolveCorrelationIdFromHeaders(
    request.headers[CORRELATION_ID_HEADER],
    request.id
  );
  requestCorrelationByRef.set(request, correlationId);
  requestStartedAtByRef.set(request, Date.now());
  requestCorrelationStore.enterWith({ correlationId });
  reply.header("X-Correlation-Id", correlationId);
  return correlationId;
}

function getRequestCorrelationId(request: FastifyRequest): string {
  return requestCorrelationByRef.get(request) ?? request.id;
}

function getActiveCorrelationId(): string | null {
  return requestCorrelationStore.getStore()?.correlationId ?? null;
}

function setRequestScopeMeta(
  request: unknown,
  params: { workspaceId?: string; agentId?: string }
): void {
  if (!request || typeof request !== "object") return;
  if (params.workspaceId?.trim()) {
    requestWorkspaceByRef.set(request, params.workspaceId.trim());
  }
  if (params.agentId?.trim()) {
    requestAgentByRef.set(request, params.agentId.trim());
  }
}

function normalizeNonNegativeNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value;
}

function applyInventoryDelta(
  base: InventoryState,
  delta: {
    audioCountDelta?: number;
    durationSecondsDelta?: number;
    diskUsageBytesDelta?: number;
    updatedAt?: string;
  }
): InventoryState {
  return {
    ...base,
    audioCount: Math.max(0, base.audioCount + Math.trunc(delta.audioCountDelta ?? 0)),
    durationSeconds: Math.max(0, base.durationSeconds + (delta.durationSecondsDelta ?? 0)),
    diskUsageBytes: Math.max(0, base.diskUsageBytes + Math.trunc(delta.diskUsageBytesDelta ?? 0)),
    updatedAt: delta.updatedAt?.trim() || new Date().toISOString()
  };
}

function buildAssetRefKey(params: { blockId: string; kind: string; path: string }): string {
  return `${params.blockId}::${params.kind}::${path.resolve(params.path)}`;
}

async function applyWorkerSnapshotAssetState(params: {
  workspaceId: string;
  agentId: string;
  assetRefs: WorkerInventoryAssetRef[];
}): Promise<{
  receivedRefs: number;
  upsertedAssets: number;
  deletedAssets: number;
  unresolvedRefs: number;
}> {
  const receivedRefs = params.assetRefs.length;
  const normalizedRefs: WorkerInventoryAssetRef[] = [];
  for (const item of params.assetRefs) {
    const blockId = item.blockId?.trim();
    const kind = item.kind?.trim();
    const rawPath = item.path?.trim();
    if (!blockId || !kind || !rawPath) continue;
    normalizedRefs.push({
      ...item,
      blockId,
      kind,
      path: path.resolve(rawPath),
      assetId: item.assetId?.trim() || undefined,
      channelId: item.channelId?.trim() || undefined,
      sectionId: item.sectionId?.trim() || undefined,
      videoId: item.videoId?.trim() || undefined,
      videoVersionId: item.videoVersionId?.trim() || undefined
    });
  }

  const existingAssets = await prisma.asset.findMany({
    where: { workspaceId: params.workspaceId },
    select: { id: true, blockId: true, kind: true, path: true }
  });
  const existingByKey = new Map(
    existingAssets.map((asset) => [
      buildAssetRefKey({ blockId: asset.blockId, kind: asset.kind, path: asset.path }),
      asset
    ])
  );
  const incomingKeys = new Set(
    normalizedRefs.map((asset) =>
      buildAssetRefKey({ blockId: asset.blockId, kind: asset.kind, path: asset.path })
    )
  );

  const incomingBlockIds = Array.from(new Set(normalizedRefs.map((item) => item.blockId)));
  const existingBlocks = incomingBlockIds.length
    ? await prisma.block.findMany({
        where: {
          workspaceId: params.workspaceId,
          id: { in: incomingBlockIds }
        },
        select: {
          id: true,
          videoVersionId: true,
          videoVersion: {
            select: {
              videoId: true,
              video: {
                select: {
                  sectionId: true,
                  section: {
                    select: {
                      channelId: true
                    }
                  }
                }
              }
            }
          }
        }
      })
    : [];
  const blockById = new Map(existingBlocks.map((block) => [block.id, block]));

  let unresolvedRefs = 0;
  const createData: Array<{
    workspaceId: string;
    blockId: string;
    kind: string;
    path: string;
    metaJson: string | null;
  }> = [];

  for (const assetRef of normalizedRefs) {
    const key = buildAssetRefKey(assetRef);
    if (existingByKey.has(key)) continue;
    const block = blockById.get(assetRef.blockId);
    if (!block) {
      unresolvedRefs += 1;
      continue;
    }
    const expected = {
      channelId: block.videoVersion.video.section.channelId,
      sectionId: block.videoVersion.video.sectionId,
      videoId: block.videoVersion.videoId,
      videoVersionId: block.videoVersionId
    };
    const hasHierarchyMismatch =
      (assetRef.channelId && assetRef.channelId !== expected.channelId) ||
      (assetRef.sectionId && assetRef.sectionId !== expected.sectionId) ||
      (assetRef.videoId && assetRef.videoId !== expected.videoId) ||
      (assetRef.videoVersionId && assetRef.videoVersionId !== expected.videoVersionId);
    if (hasHierarchyMismatch) {
      unresolvedRefs += 1;
      fastify.log.warn(
        {
          workspaceId: params.workspaceId,
          agentId: params.agentId,
          blockId: assetRef.blockId,
          kind: assetRef.kind,
          path: assetRef.path,
          provided: {
            channelId: assetRef.channelId ?? null,
            sectionId: assetRef.sectionId ?? null,
            videoId: assetRef.videoId ?? null,
            videoVersionId: assetRef.videoVersionId ?? null
          },
          expected
        },
        "inventory_snapshot_hierarchy_mismatch"
      );
      continue;
    }
    createData.push({
      workspaceId: params.workspaceId,
      blockId: assetRef.blockId,
      kind: assetRef.kind,
      path: assetRef.path,
      metaJson:
        assetRef.sizeBytes != null || assetRef.durationSeconds != null
          ? JSON.stringify({
              collectedBy: "worker_snapshot",
              sizeBytes: assetRef.sizeBytes ?? null,
              durationSeconds: assetRef.durationSeconds ?? null
            })
          : null
    });
  }

  const assetIdsToDelete = existingAssets
    .filter(
      (asset) =>
        !incomingKeys.has(
          buildAssetRefKey({ blockId: asset.blockId, kind: asset.kind, path: asset.path })
        )
    )
    .map((asset) => asset.id);

  let upsertedAssets = 0;
  let deletedAssets = 0;
  await prisma.$transaction(async (tx) => {
    for (const item of createData) {
      await tx.asset.create({ data: item });
      upsertedAssets += 1;
    }
    if (assetIdsToDelete.length > 0) {
      const deleted = await tx.asset.deleteMany({
        where: {
          workspaceId: params.workspaceId,
          id: { in: assetIdsToDelete }
        }
      });
      deletedAssets = deleted.count;
    }
  });

  return {
    receivedRefs,
    upsertedAssets,
    deletedAssets,
    unresolvedRefs
  };
}

function aggregateWorkspaceWorkerInventory(workspaceId: string): InventoryMetrics | null {
  let hasWorkerSnapshot = false;
  let audioCount = 0;
  let durationSeconds = 0;
  let diskUsageBytes = 0;
  const now = Date.now();
  inventoryStateByAgent.forEach((state) => {
    if (state.workspaceId !== workspaceId) return;
    const updatedAtMs = new Date(state.updatedAt).getTime();
    if (
      !Number.isFinite(updatedAtMs) ||
      now - updatedAtMs > inventorySnapshotStaleAfterMs
    ) {
      return;
    }
    hasWorkerSnapshot = true;
    audioCount += Math.max(0, Math.trunc(state.audioCount));
    durationSeconds += Math.max(0, state.durationSeconds);
    diskUsageBytes += Math.max(0, Math.trunc(state.diskUsageBytes));
  });
  if (!hasWorkerSnapshot) return null;
  return {
    audioCount: Math.max(0, Math.trunc(audioCount)),
    durationSeconds: Math.max(0, durationSeconds),
    diskUsageBytes: Math.max(0, Math.trunc(diskUsageBytes))
  };
}

function buildInventoryMetricsFingerprint(metrics: InventoryMetrics): string {
  return [
    Math.trunc(metrics.audioCount),
    Number(metrics.durationSeconds.toFixed(6)),
    Math.trunc(metrics.diskUsageBytes)
  ].join("|");
}

function reconcileWorkspaceInventory(
  workspaceId: string,
  baseline: InventoryMetrics
): { reconciled: InventoryMetrics; state: InventoryReconciliationSnapshot } {
  const workerSnapshot = aggregateWorkspaceWorkerInventory(workspaceId);
  const reconciled = workerSnapshot ?? baseline;
  const mismatchDetected =
    workerSnapshot != null &&
    (Math.trunc(workerSnapshot.audioCount) !== Math.trunc(baseline.audioCount) ||
      Math.abs(workerSnapshot.durationSeconds - baseline.durationSeconds) > 0.000001 ||
      Math.trunc(workerSnapshot.diskUsageBytes) !== Math.trunc(baseline.diskUsageBytes));
  const nowIso = new Date().toISOString();
  const fingerprint = [
    buildInventoryMetricsFingerprint(baseline),
    buildInventoryMetricsFingerprint(reconciled),
    mismatchDetected ? "mismatch" : "match"
  ].join("::");
  const previous = inventoryReconciliationByWorkspace.get(workspaceId);
  let inconsistencyEvents = previous?.inconsistencyEvents ?? 0;
  let lastDetectedAt = previous?.lastDetectedAt ?? null;
  if (mismatchDetected) {
    if (!previous || previous.fingerprint !== fingerprint) {
      inconsistencyEvents += 1;
      lastDetectedAt = nowIso;
    }
  }
  inventoryReconciliationByWorkspace.set(workspaceId, {
    fingerprint,
    inconsistencyEvents,
    lastDetectedAt
  });

  return {
    reconciled,
    state: {
      workspaceId,
      source: workerSnapshot ? "worker_snapshot" : "database_baseline",
      mismatchDetected,
      inconsistencyEvents,
      lastDetectedAt,
      baseline,
      reconciled,
      workerSnapshot,
      diff: {
        audioCount: Math.trunc(baseline.audioCount - reconciled.audioCount),
        durationSeconds: baseline.durationSeconds - reconciled.durationSeconds,
        diskUsageBytes: Math.trunc(baseline.diskUsageBytes - reconciled.diskUsageBytes)
      },
      updatedAt: nowIso
    }
  };
}

function asAgentControlMessage(raw: unknown): AgentControlMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.type !== "string") return null;
  if (typeof value.messageId !== "string" || !value.messageId.trim()) return null;
  return value as AgentControlMessage;
}

function generateControlMessageId(): string {
  return randomBytes(12).toString("hex");
}

async function setAgentOnline(params: {
  agentId: string;
  workspaceId: string;
  label?: string | null;
  machineFingerprint?: string | null;
}): Promise<boolean> {
  const existing = await prisma.agent.findUnique({
    where: { id: params.agentId },
    select: { id: true, workspaceId: true }
  });
  if (!existing || existing.workspaceId !== params.workspaceId) {
    return false;
  }
  await prisma.agent.update({
    where: { id: params.agentId },
    data: {
      status: "online",
      lastSeenAt: new Date(),
      label: params.label === undefined ? undefined : params.label,
      machineFingerprint:
        params.machineFingerprint === undefined ? undefined : params.machineFingerprint
    }
  });
  return true;
}

async function setAgentOffline(agentId: string): Promise<void> {
  try {
    await prisma.agent.update({
      where: { id: agentId },
      data: {
        status: "offline"
      }
    });
  } catch {
    // ignore update errors for disconnected sockets
  }
}

function sendAgentControlMessage(socket: WebSocket, message: AgentControlRequestMessage): void {
  socket.send(JSON.stringify(message));
}

function handleAgentReply(message: AgentControlMessage): void {
  if (!("inReplyTo" in message) || typeof message.inReplyTo !== "string") return;
  const pending = pendingAgentReplies.get(message.inReplyTo);
  if (!pending) return;
  clearTimeout(pending.timeout);
  pendingAgentReplies.delete(message.inReplyTo);
  if (message.type === "integration_health_response") {
    if (pending.meta?.kind === "integration_health") {
      fastify.log.info(
        {
          correlationId: pending.meta.correlationId,
          provider: pending.meta.provider,
          workspaceId: pending.meta.workspaceId,
          agentId: pending.meta.agentId,
          route: "integration_health_response",
          statusCode: message.payload.statusCode,
          elapsedMs: Date.now() - pending.meta.startedAt,
          upstream: message.payload.data
        },
        "agent_integration_health_response"
      );
    }
    pending.resolve({
      statusCode: message.payload.statusCode,
      data: message.payload.data
    });
    return;
  }
  if (message.type === "worker_command_response") {
    if (pending.meta?.kind === "worker_command") {
      fastify.log.info(
        {
          correlationId: pending.meta.correlationId,
          command: pending.meta.command,
          workspaceId: pending.meta.workspaceId,
          agentId: pending.meta.agentId,
          route: "worker_command_response",
          statusCode: message.payload.statusCode,
          elapsedMs: Date.now() - pending.meta.startedAt
        },
        "agent_worker_command_response"
      );
    }
    pending.resolve({
      statusCode: message.payload.statusCode,
      data: message.payload.data
    });
    return;
  }
  if (message.type === "agent_error") {
    fastify.log.warn(
      {
        correlationId: pending.meta?.correlationId ?? message.inReplyTo,
        workspaceId: pending.meta?.workspaceId ?? null,
        agentId: pending.meta?.agentId ?? null,
        route: pending.meta?.kind === "worker_command" ? pending.meta.command : pending.meta?.provider,
        statusCode: 503,
        errorCode: message.payload.code,
        errorMessage: message.payload.message
      },
      "agent_control_error"
    );
    pending.reject(new Error(`${message.payload.code}: ${message.payload.message}`));
  }
}

async function requestAgentIntegrationHealth(
  agentSession: AgentSession,
  provider: "ollama" | "xtts" | "comfyui",
  options?: Record<string, unknown>,
  correlationIdOverride?: string
): Promise<{ statusCode: number; data: Record<string, unknown> }> {
  const correlationId =
    parseCorrelationId(correlationIdOverride) ??
    parseCorrelationId(getActiveCorrelationId()) ??
    generateControlMessageId();
  const messageId = generateControlMessageId();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      fastify.log.warn(
        {
          correlationId,
          provider,
          workspaceId: agentSession.workspaceId,
          agentId: agentSession.agentId,
          route: "integration_health_request",
          statusCode: 503
        },
        "agent_integration_health_timeout"
      );
      pendingAgentReplies.delete(messageId);
      reject(new Error("agent_response_timeout"));
    }, agentControlRequestTimeoutMs);
    pendingAgentReplies.set(messageId, {
      resolve,
      reject,
      timeout,
      meta: {
        kind: "integration_health",
        provider,
        workspaceId: agentSession.workspaceId,
        agentId: agentSession.agentId,
        startedAt: Date.now(),
        correlationId
      }
    });
    fastify.log.info(
      {
        correlationId,
        provider,
        workspaceId: agentSession.workspaceId,
        agentId: agentSession.agentId,
        options: options ?? null
      },
      "agent_integration_health_request"
    );
    try {
      sendAgentControlMessage(agentSession.socket, {
        type: "integration_health_request",
        messageId,
        payload: { provider, options, correlationId }
      });
    } catch (err) {
      clearTimeout(timeout);
      pendingAgentReplies.delete(messageId);
      reject(err);
    }
  });
}

async function requestAgentWorkerCommand(
  agentSession: AgentSession,
  command:
    | "comfy_workflows_list"
    | "comfy_workflow_import"
    | "tts_voices_list"
    | "worker_queue_wake"
    | "system_hard_cleanup"
    | "system_free_space_plan"
    | "system_free_space_execute"
    | "block_image_raw_get"
    | "block_audio_raw_get"
    | "block_slide_get"
    | "lesson_version_final_video_get"
    | "lesson_version_final_video_post"
    | "lesson_version_images_post"
    | "lesson_version_slides_post"
    | "lesson_version_assets_post"
    | "lesson_version_assets_image_post"
    | "lesson_version_audios_list"
    | "lesson_version_images_list"
    | "lesson_version_slides_list"
    | "lesson_version_job_state",
  params?: Record<string, unknown>,
  correlationIdOverride?: string
): Promise<{ statusCode: number; data: Record<string, unknown> }> {
  const correlationId =
    parseCorrelationId(correlationIdOverride) ??
    parseCorrelationId(getActiveCorrelationId()) ??
    generateControlMessageId();
  const messageId = generateControlMessageId();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      fastify.log.warn(
        {
          correlationId,
          command,
          workspaceId: agentSession.workspaceId,
          agentId: agentSession.agentId,
          route: "worker_command_request",
          statusCode: 503
        },
        "agent_worker_command_timeout"
      );
      pendingAgentReplies.delete(messageId);
      reject(new Error("agent_response_timeout"));
    }, agentControlRequestTimeoutMs);
    pendingAgentReplies.set(messageId, {
      resolve,
      reject,
      timeout,
      meta: {
        kind: "worker_command",
        command,
        workspaceId: agentSession.workspaceId,
        agentId: agentSession.agentId,
        startedAt: Date.now(),
        correlationId
      }
    });
    fastify.log.info(
      {
        correlationId,
        command,
        workspaceId: agentSession.workspaceId,
        agentId: agentSession.agentId,
        params: params ?? null
      },
      "agent_worker_command_request"
    );
    try {
      sendAgentControlMessage(agentSession.socket, {
        type: "worker_command_request",
        messageId,
        payload: { command, params, correlationId }
      });
    } catch (err) {
      clearTimeout(timeout);
      pendingAgentReplies.delete(messageId);
      reject(err);
    }
  });
}

function getConnectedAgentForWorkspace(
  workspaceId: string,
  requestedAgentId?: string
): AgentSession | null {
  if (requestedAgentId) {
    const session = agentSessionsByAgentId.get(requestedAgentId);
    if (!session || session.workspaceId !== workspaceId) return null;
    return session;
  }
  const sessions = [...agentSessionsByAgentId.values()].filter(
    (session) => session.workspaceId === workspaceId
  );
  if (sessions.length === 0) return null;
  sessions.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  return sessions[0];
}

function getAgentIntegrationConfigSnapshot(): AgentIntegrationConfigSnapshot {
  const current = readAppSettings();
  return {
    llmBaseUrl: (current.llm?.baseUrl ?? config.ollamaBaseUrl).trim(),
    comfyuiBaseUrl: (current.comfy?.baseUrl ?? config.comfyuiBaseUrl).trim(),
    ttsBaseUrl: (current.tts?.baseUrl ?? config.xttsApiBaseUrl).trim()
  };
}

const notifyWorkerQueueChanged = async (
  reason: string,
  workspaceId: string,
  agentId?: string | null
): Promise<void> => {
  const agentSession = getConnectedAgentForWorkspace(workspaceId, agentId ?? undefined);
  if (!agentSession) {
    fastify.log.warn({ reason, workspaceId, agentId: agentId ?? null }, "Failed to notify worker queue change: agent offline");
    return;
  }
  try {
    const upstream = await requestAgentWorkerCommand(agentSession, "worker_queue_wake", { reason });
    if (upstream.statusCode >= 400) {
      fastify.log.warn(
        { reason, workspaceId, agentId: agentSession.agentId, statusCode: upstream.statusCode, data: upstream.data },
        "Failed to notify worker queue change: worker rejected queue wake"
      );
    }
  } catch (err) {
    fastify.log.warn({ err, reason, workspaceId, agentId: agentSession.agentId }, "Failed to notify worker queue change");
  }
};

const runWorkerHardCleanup = async (
  reason: string,
  workspaceId: string,
  agentId?: string | null
): Promise<void> => {
  const agentSession = getConnectedAgentForWorkspace(workspaceId, agentId ?? undefined);
  if (!agentSession) {
    throw new Error("agent_offline");
  }
  const upstream = await requestAgentWorkerCommand(agentSession, "system_hard_cleanup", { reason });
  if (upstream.statusCode >= 400) {
    throw new Error(
      typeof upstream.data.error === "string"
        ? upstream.data.error
        : `worker hard cleanup failed (${upstream.statusCode})`
    );
  }
};

const runWorkerFreeSpace = async (params: {
  mode: "plan" | "execute";
  reason: string;
  workspaceId: string;
  agentId?: string | null;
  maxItems?: number;
}): Promise<{ statusCode: number; data: Record<string, unknown> }> => {
  const agentSession = getConnectedAgentForWorkspace(params.workspaceId, params.agentId ?? undefined);
  if (!agentSession) {
    throw new Error("agent_offline");
  }
  const command =
    params.mode === "execute" ? "system_free_space_execute" : "system_free_space_plan";
  return requestAgentWorkerCommand(
    agentSession,
    command,
    {
      reason: params.reason,
      maxItems: params.maxItems
    },
    getActiveCorrelationId() ?? undefined
  );
};

if (!internalJobsEventToken) {
  throw new Error("Missing INTERNAL_JOBS_EVENT_TOKEN");
}

function collectVoiceIds(source: unknown, target: Set<string>): void {
  if (!Array.isArray(source)) return;
  for (const entry of source) {
    if (typeof entry === "string") {
      const value = entry.trim();
      if (value) target.add(value);
      continue;
    }
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const value = String(item.id ?? item.voice_id ?? item.name ?? "").trim();
    if (value) target.add(value);
  }
}

function extractWorkerVoiceIds(payload: Record<string, unknown>): Set<string> {
  const voiceIds = new Set<string>();
  collectVoiceIds(payload.voices, voiceIds);
  collectVoiceIds(payload.items, voiceIds);
  collectVoiceIds(payload.speakers, voiceIds);
  return voiceIds;
}

async function workerHasTtsVoice(workspaceId: string, voiceId: string): Promise<boolean> {
  const agentSession = getConnectedAgentForWorkspace(workspaceId);
  if (!agentSession) {
    throw new Error("agent_offline");
  }
  const upstream = await requestAgentWorkerCommand(agentSession, "tts_voices_list");
  if (upstream.statusCode !== 200) {
    throw new Error(
      typeof upstream.data.error === "string" ? upstream.data.error : "provider_unavailable"
    );
  }
  const voices = extractWorkerVoiceIds(upstream.data);
  return voices.has(voiceId);
}

const jobTargetLabel = (jobType?: string | null, singular = false): string => {
  switch (jobType) {
    case "segment":
    case "segment_block":
      return singular ? "block" : "blocks";
    case "tts":
      return singular ? "audio" : "audios";
    case "image":
    case "comfyui_image":
      return singular ? "image" : "images";
    case "render_slide":
      return singular ? "slide" : "slides";
    case "concat_video":
      return singular ? "final video" : "final videos";
    default:
      return singular ? "process" : "processes";
  }
};

const jobStatusLabelEn = (status: string): string => {
  switch (status) {
    case "running":
      return "started";
    case "succeeded":
      return "completed";
    case "failed":
      return "failed";
    case "canceled":
      return "canceled";
    default:
      return status;
  }
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function sanitizeUserName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
};

function toPublicUser(user: PublicUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function isValidRole(value: string): value is UserRole {
  return USER_ROLES.includes(value as UserRole);
}

function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function setAuthCookie(reply: FastifyReply, payload: AuthTokenPayload): void {
  const token = fastify.jwt.sign(payload, {
    expiresIn: `${AUTH_COOKIE_MAX_AGE_SECONDS}s`
  });
  reply.setCookie(AUTH_COOKIE_NAME, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: authCookieSecure,
    maxAge: AUTH_COOKIE_MAX_AGE_SECONDS
  });
}

function clearAuthCookie(reply: FastifyReply): void {
  reply.clearCookie(AUTH_COOKIE_NAME, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: authCookieSecure
  });
}

async function getCurrentUser(request: {
  jwtVerify: <T>() => Promise<T>;
}): Promise<{ id: string; email: string; name: string; role: string } | null> {
  try {
    const payload = await request.jwtVerify<AuthTokenPayload>();
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, name: true, role: true }
    });
    return user;
  } catch {
    return null;
  }
}

function workspaceNameForUser(user: { name: string; email: string }): string {
  const base = user.name?.trim() || user.email;
  return `${base} workspace`;
}

async function ensureDefaultWorkspaceForUser(user: {
  id: string;
  name: string;
  email: string;
  role: string;
}): Promise<UserScope> {
  const existingMembership = await prisma.workspaceMembership.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { workspaceId: true, role: true }
  });
  if (existingMembership) {
    return {
      workspaceId: existingMembership.workspaceId,
      membershipRole: existingMembership.role
    };
  }

  const workspace = await prisma.workspace.create({
    data: {
      name: workspaceNameForUser(user)
    },
    select: { id: true }
  });

  const membershipRole = user.role === "owner" || user.role === "admin" ? "admin" : "member";
  const membership = await prisma.workspaceMembership.create({
    data: {
      workspaceId: workspace.id,
      userId: user.id,
      role: membershipRole
    },
    select: { workspaceId: true, role: true }
  });

  return {
    workspaceId: membership.workspaceId,
    membershipRole: membership.role
  };
}

async function getAuthenticatedScope(
  request: {
    jwtVerify: <T>() => Promise<T>;
  },
  reply: FastifyReply
): Promise<{
  currentUser: { id: string; email: string; name: string; role: string };
  scope: UserScope;
} | null> {
  const currentUser = await getCurrentUser(request);
  if (!currentUser) {
    clearAuthCookie(reply);
    reply.code(401).send({ error: "Unauthorized" });
    return null;
  }
  const scope = await ensureDefaultWorkspaceForUser(currentUser);
  setRequestScopeMeta(request, { workspaceId: scope.workspaceId });
  return { currentUser, scope };
}

async function resolveDispatchClientForRequest(
  request: { jwtVerify: <T>() => Promise<T> },
  rawClientId?: string | null
): Promise<DispatchClientResolution> {
  const currentUser = await getCurrentUser(request);
  if (!currentUser) {
    return { ok: false, statusCode: 403, error: "agent_workspace_mismatch" };
  }
  const scope = await ensureDefaultWorkspaceForUser(currentUser);
  setRequestScopeMeta(request, { workspaceId: scope.workspaceId });
  const requestedClientId = rawClientId?.trim() ?? "";
  if (!requestedClientId) {
    // Legacy compatibility: without explicit clientId, keep current behavior.
    return { ok: true, clientId: null };
  }
  const agent = await prisma.agent.findUnique({
    where: { id: requestedClientId },
    select: { id: true, workspaceId: true }
  });
  if (!agent || agent.workspaceId !== scope.workspaceId) {
    return { ok: false, statusCode: 403, error: "agent_workspace_mismatch" };
  }
  return { ok: true, clientId: agent.id };
}

async function canAccessJobForRequest(
  request: { jwtVerify: <T>() => Promise<T> },
  jobClientId: string | null
): Promise<boolean> {
  if (!jobClientId) return true;
  const currentUser = await getCurrentUser(request);
  if (!currentUser) return false;
  const scope = await ensureDefaultWorkspaceForUser(currentUser);
  const agent = await prisma.agent.findUnique({
    where: { id: jobClientId },
    select: { workspaceId: true }
  });
  if (!agent) return false;
  return agent.workspaceId === scope.workspaceId;
}

const DEFAULT_INVITE_MESSAGE_TEMPLATE = [
  "Hi {{name}},",
  "",
  "You've been invited to join VizLec as {{role}}.",
  "",
  "Open this link to set your password and activate access:",
  "{{invite_link}}",
  "",
  "This invitation was created for {{email}} and expires at {{expires_at}}.",
  "",
  "If you were not expecting this invite, please ignore this message."
].join("\n");

function renderInviteMessageTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (full, key: string) => {
    const normalized = key.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(values, normalized)) {
      return values[normalized];
    }
    return full;
  });
}

function buildInviteMessage(params: {
inviteLink: string;
  role: string;
  inviteeName?: string;
  inviteeEmail: string;
  expiresAt: Date;
  messageTemplate?: string;
}): string {
  const template =
    typeof params.messageTemplate === "string" && params.messageTemplate.trim()
      ? params.messageTemplate
      : DEFAULT_INVITE_MESSAGE_TEMPLATE;
  const roleLabel = params.role === "admin" ? "Admin" : "Member";
  return renderInviteMessageTemplate(template, {
    name: params.inviteeName?.trim() || "there",
    email: params.inviteeEmail,
    role: roleLabel,
    invite_link: params.inviteLink,
    expires_at: params.expiresAt.toISOString()
  });
}

function getWebBaseUrl(): string {
  return process.env.WEB_APP_BASE_URL?.trim() || `http://127.0.0.1:${config.webPort}`;
}

function getApiBaseUrl(): string {
  return process.env.API_BASE_URL?.trim() || `http://127.0.0.1:${config.apiPort}`;
}

function buildInviteLink(token: string): string {
  return `${getWebBaseUrl().replace(/\/+$/, "")}/?invite=${encodeURIComponent(token)}`;
}

async function ensureSlideTemplates(): Promise<void> {
  const defaults = [
    {
      id: "slide-text-v0",
      label: "Texto (v0)",
      kind: "text",
      fileName: "slide_text_v0.png"
    },
    {
      id: "slide-image-v1",
      label: "Imagem (v1)",
      kind: "image",
      fileName: "slide_image_v1.png"
    }
  ];
  for (const template of defaults) {
    await prisma.slideTemplate.upsert({
      where: { id: template.id },
      update: {
        label: template.label,
        kind: template.kind,
        fileName: template.fileName,
        isActive: true
      },
      create: template
    });
  }
}

type AppSettings = {
  theme?: { family?: string; mode?: string };
  llm?: {
    provider?: string;
    baseUrl?: string;
    model?: string;
    timeoutMs?: number;
  };
  comfy?: {
    baseUrl?: string;
    promptTimeoutMs?: number;
    generationTimeoutMs?: number;
    viewTimeoutMs?: number;
    masterPrompt?: string;
    workflowFile?: string;
  };
  tts?: {
    baseUrl?: string;
    timeoutUs?: number;
    language?: string;
    defaultVoiceId?: string;
  };
  memory?: { idleUnloadMs?: number };
  auth?: { loginBackground?: string };
};

type ComfyWorkflowNode = {
  inputs?: Record<string, unknown>;
  class_type?: string;
};

type ComfyWorkflow = Record<string, ComfyWorkflowNode>;

function ensureComfyWorkflowsDir(): void {
  if (!fs.existsSync(COMFY_WORKFLOWS_DIR)) {
    fs.mkdirSync(COMFY_WORKFLOWS_DIR, { recursive: true });
  }
}

function isSafeWorkflowFileName(fileName: string): boolean {
  return /^[a-zA-Z0-9._-]+\.json$/.test(fileName);
}

function sanitizeWorkflowFileName(input: string): string {
  const baseName = path.basename(input || "").replace(/[^a-zA-Z0-9._-]/g, "-");
  const trimmed = baseName.replace(/^-+/, "").trim();
  const fallback = trimmed.length > 0 ? trimmed : "comfy-workflow";
  const withoutJson = fallback.replace(/\.json$/i, "");
  return `${withoutJson}.json`;
}

function resolveWorkflowFilePath(fileName: string): string {
  if (!isSafeWorkflowFileName(fileName)) {
    throw new Error("Invalid workflow file name");
  }
  return path.join(COMFY_WORKFLOWS_DIR, fileName);
}

function asComfyWorkflow(value: unknown): ComfyWorkflow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as ComfyWorkflow;
}

function hasComfyNode(
  workflow: ComfyWorkflow,
  predicate: (node: ComfyWorkflowNode) => boolean
): boolean {
  for (const node of Object.values(workflow)) {
    if (predicate(node)) return true;
  }
  return false;
}

function validateComfyWorkflowMinimum(workflow: unknown): { ok: true } | { ok: false; error: string } {
  const parsed = asComfyWorkflow(workflow);
  if (!parsed || Object.keys(parsed).length === 0) {
    return {
      ok: false,
      error: "Workflow must be a non-empty JSON object in ComfyUI API format."
    };
  }
  const hasPromptNode = hasComfyNode(
    parsed,
    (node) => node.class_type === "CLIPTextEncode" && typeof node.inputs?.text === "string"
  );
  if (!hasPromptNode) {
    return {
      ok: false,
      error: "Workflow missing CLIPTextEncode node with text input."
    };
  }
  const hasSeedNode = hasComfyNode(
    parsed,
    (node) => node.class_type === "KSampler" && Boolean(node.inputs && "seed" in node.inputs)
  );
  if (!hasSeedNode) {
    return {
      ok: false,
      error: "Workflow missing KSampler node with seed input."
    };
  }
  const hasSaveNode = hasComfyNode(parsed, (node) => node.class_type === "SaveImage");
  if (!hasSaveNode) {
    return { ok: false, error: "Workflow missing SaveImage node." };
  }
  return { ok: true };
}

function listComfyWorkflowFiles(): string[] {
  ensureComfyWorkflowsDir();
  return fs
    .readdirSync(COMFY_WORKFLOWS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "en"));
}

function readComfyWorkflowFile(fileName: string): ComfyWorkflow {
  const targetPath = resolveWorkflowFilePath(fileName);
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Workflow file not found: ${fileName}`);
  }
  const raw = fs.readFileSync(targetPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const validation = validateComfyWorkflowMinimum(parsed);
  if (!validation.ok) {
    throw new Error(validation.error);
  }
  return parsed as ComfyWorkflow;
}

function resolveConfiguredWorkflowFile(current: AppSettings): string {
  const configured = current.comfy?.workflowFile;
  if (configured && isSafeWorkflowFileName(configured) && fs.existsSync(resolveWorkflowFilePath(configured))) {
    return configured;
  }
  return DEFAULT_COMFY_WORKFLOW_FILE;
}
function readAppSettings(): AppSettings {
  try {
    if (fs.existsSync(config.appSettingsPath)) {
      const raw = fs.readFileSync(config.appSettingsPath, "utf8");
      const parsed = JSON.parse(raw) as AppSettings;
      return parsed ?? {};
    }
  } catch {
    // ignore
  }
  return {};
}

function writeAppSettings(next: AppSettings): void {
  fs.writeFileSync(config.appSettingsPath, JSON.stringify(next, null, 2), "utf8");
}

function migrateLegacySettings(): void {
  if (fs.existsSync(config.appSettingsPath)) return;

  const next: AppSettings = {};

  try {
    if (fs.existsSync(config.ttsSettingsPath)) {
      const raw = fs.readFileSync(config.ttsSettingsPath, "utf8");
      const parsed = JSON.parse(raw) as { voiceId?: string; language?: string };
      if (parsed?.voiceId || parsed?.language) {
        next.tts = {
          defaultVoiceId: typeof parsed.voiceId === "string" ? parsed.voiceId : undefined,
          language: typeof parsed.language === "string" ? parsed.language : undefined
        };
      }
    }
  } catch {
    // ignore
  }

  try {
    if (fs.existsSync(config.comfySettingsPath)) {
      const raw = fs.readFileSync(config.comfySettingsPath, "utf8");
      const parsed = JSON.parse(raw) as {
        baseUrl?: string;
        promptTimeoutMs?: number;
        generationTimeoutMs?: number;
        viewTimeoutMs?: number;
      };
      if (parsed && Object.keys(parsed).length > 0) {
        next.comfy = {
          baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl : undefined,
          promptTimeoutMs:
            typeof parsed.promptTimeoutMs === "number" && Number.isFinite(parsed.promptTimeoutMs)
              ? parsed.promptTimeoutMs
              : undefined,
          generationTimeoutMs:
            typeof parsed.generationTimeoutMs === "number" && Number.isFinite(parsed.generationTimeoutMs)
              ? parsed.generationTimeoutMs
              : undefined,
          viewTimeoutMs:
            typeof parsed.viewTimeoutMs === "number" && Number.isFinite(parsed.viewTimeoutMs)
              ? parsed.viewTimeoutMs
              : undefined
        };
      }
    }
  } catch {
    // ignore
  }

  if (Object.keys(next).length > 0) {
    writeAppSettings(next);
  }

  if (fs.existsSync(config.ttsSettingsPath)) {
    fs.unlinkSync(config.ttsSettingsPath);
  }
  if (fs.existsSync(config.comfySettingsPath)) {
    fs.unlinkSync(config.comfySettingsPath);
  }
}

await ensureSlideTemplates();
migrateLegacySettings();

await fastify.register(cors, {
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"]
});
await fastify.register(cookie);
await fastify.register(jwt, {
  secret: authJwtSecret,
  cookie: {
    cookieName: AUTH_COOKIE_NAME,
    signed: false
  }
});
await fastify.register(websocket);

// Swagger/OpenAPI + Scalar documentation
await fastify.register(swagger, {
  openapi: {
    info: {
      title: "VizLec API",
      description: "API para gerenciamento de canais, seções, vídeos e geração de conteúdo com IA",
      version: "0.0.1"
    },
    tags: [
      { name: "Auth", description: "Autenticação e autorização" },
      { name: "Team", description: "Gerenciamento de equipe e convites" },
      { name: "Channels", description: "Gerenciamento de canais" },
      { name: "Sections", description: "Gerenciamento de seções" },
      { name: "Videos", description: "Gerenciamento de vídeos" },
      { name: "Slides", description: "Gerenciamento de slides" },
      {
        name: "Jobs",
        description: "Jobs de processamento (TTS, imagens, vídeo)"
      },
      { name: "Voices", description: "Vozes disponíveis para TTS" },
      { name: "Settings", description: "Configurações do sistema" },
      { name: "Notifications", description: "Notificações do sistema" },
      {
        name: "Integrations",
        description: "Integrações externas (Ollama, XTTS, ComfyUI)"
      },
      { name: "Health", description: "Status e saúde do sistema" }
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "vizlec_session"
        }
      }
    }
  }
});

await fastify.register(scalarReference, {
  routePrefix: "/reference"
});

fastify.addHook("onRoute", (routeOptions) => {
  const methods = Array.isArray(routeOptions.method) ? routeOptions.method : [routeOptions.method];
  const primaryMethod = methods.find((method) => method.toUpperCase() !== "HEAD") ?? methods[0];
  const method = primaryMethod.toUpperCase();
  const path = routeOptions.url;

  const currentSchema =
    routeOptions.schema && typeof routeOptions.schema === "object"
      ? (routeOptions.schema as Record<string, unknown>)
      : {};

  const currentSummary =
    typeof currentSchema.summary === "string" ? (currentSchema.summary as string) : undefined;
  const currentDescription =
    typeof currentSchema.description === "string" ? (currentSchema.description as string) : undefined;
  const currentTags = Array.isArray(currentSchema.tags) ? (currentSchema.tags as unknown[]) : undefined;

  const normalizedTags = currentTags
    ?.filter((tag): tag is string => typeof tag === "string")
    .map((tag) => {
      if (tag === "Courses") return "Channels";
      if (tag === "Modules") return "Sections";
      if (tag === "Lessons") return "Videos";
      return tag;
    });

  if (currentDescription?.includes("**Inventario de execucao**")) {
    routeOptions.schema = {
      ...currentSchema,
      ...(normalizedTags ? { tags: normalizedTags } : {})
    };
    return;
  }

  const description = buildEndpointPurposeExplanation({
    method,
    path,
    summary: currentSummary,
    description: currentDescription
  });

  routeOptions.schema = {
    ...currentSchema,
    ...(normalizedTags ? { tags: normalizedTags } : {}),
    description
  };
});

fastify.get("/ws", { websocket: true }, (connection) => {
  const socket =
    (connection as unknown as { socket: WebSocket }).socket ??
    (connection as unknown as WebSocket);
  wsClients.add(socket);
  socket.on("close", () => {
    wsClients.delete(socket);
  });
});

fastify.get("/ws/agent-control", { websocket: true }, (connection, request) => {
  const socket =
    (connection as unknown as { socket: WebSocket }).socket ??
    (connection as unknown as WebSocket);
  const authorization = (request.headers["authorization"] ?? "").toString();
  const bearerToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  const tokenClaims = bearerToken ? verifyAgentControlToken(bearerToken) : null;
  if (!tokenClaims) {
    socket.close(1008, "unauthorized");
    return;
  }

  let boundAgentId: string | null = null;

  socket.on("message", async (rawData) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(
        typeof rawData === "string" ? rawData : rawData.toString("utf8")
      );
    } catch {
      socket.send(
        JSON.stringify({
          type: "agent_error",
          messageId: generateControlMessageId(),
          payload: { code: "invalid_json", message: "Invalid JSON message" }
        })
      );
      return;
    }
    const message = asAgentControlMessage(parsed);
    if (!message) {
      socket.send(
        JSON.stringify({
          type: "agent_error",
          messageId: generateControlMessageId(),
          payload: {
            code: "invalid_message",
            message: "Unsupported message format"
          }
        })
      );
      return;
    }

    if (
      message.type === "integration_health_response" ||
      message.type === "worker_command_response" ||
      message.type === "agent_error"
    ) {
      handleAgentReply(message);
      return;
    }

    if (message.type === "agent_hello") {
      if (
        message.payload.agentId !== tokenClaims.agentId ||
        message.payload.workspaceId !== tokenClaims.workspaceId
      ) {
        socket.send(
          JSON.stringify({
            type: "agent_error",
            messageId: generateControlMessageId(),
            inReplyTo: message.messageId,
            payload: {
              code: "agent_token_identity_mismatch",
              message: "Agent identity mismatch for provided token"
            }
          })
        );
        socket.close(1008, "unauthorized");
        return;
      }
      const isValid = await setAgentOnline({
        agentId: message.payload.agentId,
        workspaceId: message.payload.workspaceId,
        label: message.payload.label ?? undefined,
        machineFingerprint: message.payload.machineFingerprint ?? undefined
      });
      if (!isValid) {
        socket.send(
          JSON.stringify({
            type: "agent_error",
            messageId: generateControlMessageId(),
            inReplyTo: message.messageId,
            payload: {
              code: "agent_workspace_mismatch",
              message: "Agent is not bound to this workspace"
            }
          })
        );
        return;
      }

      boundAgentId = message.payload.agentId;
      agentSessionsByAgentId.set(message.payload.agentId, {
        socket,
        workspaceId: message.payload.workspaceId,
        agentId: message.payload.agentId,
        connectedAt: Date.now(),
        lastSeenAt: Date.now()
      });

      socket.send(
        JSON.stringify({
          type: "agent_hello_ack",
          messageId: generateControlMessageId(),
          inReplyTo: message.messageId,
          payload: {
            ok: true,
            agentId: message.payload.agentId,
            integrationConfig: getAgentIntegrationConfigSnapshot()
          }
        })
      );
      return;
    }

    if (message.type === "agent_heartbeat") {
      const existing = agentSessionsByAgentId.get(message.payload.agentId);
      if (existing) {
        existing.lastSeenAt = Date.now();
        agentSessionsByAgentId.set(message.payload.agentId, existing);
      }
      await prisma.agent.updateMany({
        where: {
          id: message.payload.agentId,
          workspaceId: message.payload.workspaceId
        },
        data: {
          status: "online",
          lastSeenAt: new Date()
        }
      });
      socket.send(
        JSON.stringify({
          type: "agent_heartbeat_ack",
          messageId: generateControlMessageId(),
          inReplyTo: message.messageId,
          payload: { ok: true }
        })
      );
    }
  });

  socket.on("close", () => {
    if (!boundAgentId) return;
    const session = agentSessionsByAgentId.get(boundAgentId);
    if (session?.socket === socket) {
      agentSessionsByAgentId.delete(boundAgentId);
      void setAgentOffline(boundAgentId);
    }
  });
});

fastify.post(
  "/internal/jobs/event",
  {
    schema: {
      tags: ["Jobs"],
      summary: "Evento interno de job",
      description: "Endpoint interno para o worker reportar eventos de jobs (não usar diretamente)"
    }
  },
  async (request, reply) => {
    const providedToken = request.headers["x-internal-token"];
    if (typeof providedToken !== "string" || providedToken !== internalJobsEventToken) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    const body = request.body as Partial<InternalJobEventPayload>;
    const jobId = body?.jobId?.trim();
    if (!jobId) {
      return reply.code(400).send({ error: "jobId is required" });
    }
    const lifecycle = normalizeJobEventLifecycle(body?.lifecycle) ?? null;
    const phase = normalizeJobEventPhase(body?.phase) ?? null;
    const progressPercent = normalizeProgressPercent(body?.progressPercent) ?? null;
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        videoVersion: {
          select: {
            videoId: true,
            video: {
              select: {
                title: true,
                section: {
                  select: {
                    id: true,
                    name: true,
                    channel: {
                      select: { id: true, name: true }
                    }
                  }
                }
              }
            }
          }
        },
        block: {
          select: {
            index: true,
            videoVersionId: true,
            videoVersion: {
              select: {
                videoId: true,
                video: {
                  select: {
                    title: true,
                    section: {
                      select: {
                        id: true,
                        name: true,
                        channel: {
                          select: { id: true, name: true }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!job) {
      return reply.code(404).send({ error: "job not found" });
    }
    setRequestScopeMeta(request, {
      workspaceId: job.workspaceId,
      agentId: job.clientId ?? undefined
    });
    const jobCorrelationId =
      parseCorrelationId(job.requestId) ??
      parseCorrelationId(request.headers[CORRELATION_ID_HEADER]) ??
      getRequestCorrelationId(request);
    const videoId =
      job.videoVersion?.videoId ?? job.block?.videoVersion?.videoId ?? null;
    const videoVersionId = job.videoVersionId ?? job.block?.videoVersionId ?? null;
    const lessonContext = job.videoVersion?.video ?? job.block?.videoVersion?.video ?? null;
    const channelId = lessonContext?.section?.channel?.id ?? null;
    const sectionId = lessonContext?.section?.id ?? null;
    const courseName = lessonContext?.section?.channel?.name?.trim();
    const moduleName = lessonContext?.section?.name?.trim();
    const lessonTitle = lessonContext?.title?.trim();
    const blockNumber = typeof job.block?.index === "number" ? job.block.index + 1 : null;
    let buildStatus: Awaited<ReturnType<typeof buildCourseDetailedStatus>> | null = null;
    if (channelId) {
      try {
        buildStatus = await buildCourseDetailedStatus(channelId);
      } catch (err) {
        fastify.log.warn({ err, channelId }, "Failed to build course status for job event");
      }
    }

    const jobPayload = {
      correlationId: jobCorrelationId,
      jobId: job.id,
      status: job.status,
      type: job.type,
      channelId,
      sectionId,
      videoId,
      videoVersionId,
      blockId: job.blockId,
      lifecycle,
      phase,
      progressPercent,
      error: job.error,
      updatedAt: job.updatedAt,
      buildStatus
    };
    fastify.log.info(
      {
        correlationId: jobCorrelationId,
        workspaceId: job.workspaceId,
        agentId: job.clientId ?? null,
        route: "/internal/jobs/event",
        statusCode: 200
      },
      "job_event_received"
    );
    broadcastJobEvent(jobPayload);
    jobStreamBus.emit(job.id);

    if (["running", "succeeded", "failed", "canceled"].includes(job.status)) {
      const existing = await prisma.notification.findFirst({
        where: {
          jobId: job.id,
          jobStatus: job.status
        }
      });
      if (!existing) {
        const isBlockScope = job.scope === "block" || Boolean(job.blockId);
        const target = jobTargetLabel(job.type, isBlockScope);
        const statusLabel = jobStatusLabelEn(job.status);
        const title = `Generation of ${target} ${statusLabel}`;
        const contextParts: string[] = [];
        if (courseName) contextParts.push(`Course: ${courseName}`);
        if (moduleName) contextParts.push(`Module: ${moduleName}`);
        if (lessonTitle) contextParts.push(`Lesson: ${lessonTitle}`);
        if (isBlockScope) {
          if (blockNumber) {
            contextParts.push(`Block: ${blockNumber}`);
          } else if (job.blockId) {
            contextParts.push(`Block: ${job.blockId}`);
          }
        }
        const message = contextParts.join(" | ");
        const notification = await prisma.notification.create({
          data: {
            workspaceId: job.workspaceId,
            title,
            message: message || title,
            type: "job",
            read: false,
            jobId: job.id,
            jobType: job.type,
            jobStatus: job.status,
            videoId: videoId ?? undefined,
            videoVersionId: videoVersionId ?? undefined
          }
        });
        broadcastNotification({
          id: notification.id,
          title: notification.title,
          message: notification.message,
          time: notification.createdAt.toISOString(),
          read: notification.read,
          type: notification.type,
          relatedLessonId: notification.videoId ?? undefined,
          jobType: notification.jobType ?? undefined,
          jobStatus: notification.jobStatus ?? undefined
        });
      }
    }
    return reply.code(200).send({ ok: true });
  }
);

fastify.post(
  "/internal/inventory/snapshot",
  {
    schema: {
      tags: ["Jobs"],
      summary: "Mensagem interna de inventory_snapshot",
      description: "Worker/agent publica snapshot de inventário real do cliente"
    }
  },
  async (request, reply) => {
    const providedToken = request.headers["x-internal-token"];
    if (typeof providedToken !== "string" || providedToken !== internalJobsEventToken) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    const body = request.body as Partial<InternalInventorySnapshotEventPayload>;
    const workspaceId = body?.workspaceId?.trim() ?? "";
    const agentId = body?.agentId?.trim() ?? "";
    if (!workspaceId || !agentId) {
      return reply.code(400).send({ error: "workspaceId and agentId are required" });
    }
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { id: true, workspaceId: true }
    });
    if (!agent) {
      return reply.code(404).send({ error: "agent not found" });
    }
    if (agent.workspaceId !== workspaceId) {
      return reply.code(403).send({ error: "agent_workspace_mismatch" });
    }

    const normalizedSnapshot = normalizeInternalInventorySnapshot(body?.snapshot);
    const next: InventoryState = {
      workspaceId,
      agentId,
      audioCount: Math.trunc(normalizeNonNegativeNumber(normalizedSnapshot.audioCount)),
      durationSeconds: normalizeNonNegativeNumber(normalizedSnapshot.durationSeconds),
      diskUsageBytes: Math.trunc(normalizeNonNegativeNumber(normalizedSnapshot.diskUsageBytes)),
      updatedAt: normalizedSnapshot.updatedAt?.trim() || new Date().toISOString()
    };
    const assetRefsRaw = normalizedSnapshot.assetRefs ?? null;
    let assetReconciliation: {
      receivedRefs: number;
      upsertedAssets: number;
      deletedAssets: number;
      unresolvedRefs: number;
    } | null = null;
    if (assetRefsRaw) {
      assetReconciliation = await applyWorkerSnapshotAssetState({
        workspaceId,
        agentId,
        assetRefs: assetRefsRaw
      });
    }
    inventoryStateByAgent.set(agentId, next);
    broadcastWsEvent(WS_EVENT.INVENTORY_RECONCILED, {
      workspaceId,
      agentId,
      updatedAt: next.updatedAt,
      source: "worker_snapshot",
      assetReconciliation
    });
    return reply.code(200).send({ ok: true, inventory: next, assetReconciliation });
  }
);

fastify.post(
  "/internal/inventory/delta",
  {
    schema: {
      tags: ["Jobs"],
      summary: "Mensagem interna de inventory_delta",
      description: "Worker/agent publica delta de inventário em relação ao último snapshot"
    }
  },
  async (request, reply) => {
    const providedToken = request.headers["x-internal-token"];
    if (typeof providedToken !== "string" || providedToken !== internalJobsEventToken) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    const body = request.body as Partial<InternalInventoryDeltaEventPayload>;
    const workspaceId = body?.workspaceId?.trim() ?? "";
    const agentId = body?.agentId?.trim() ?? "";
    if (!workspaceId || !agentId) {
      return reply.code(400).send({ error: "workspaceId and agentId are required" });
    }
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { id: true, workspaceId: true }
    });
    if (!agent) {
      return reply.code(404).send({ error: "agent not found" });
    }
    if (agent.workspaceId !== workspaceId) {
      return reply.code(403).send({ error: "agent_workspace_mismatch" });
    }
    const current = inventoryStateByAgent.get(agentId) ?? {
      workspaceId,
      agentId,
      audioCount: 0,
      durationSeconds: 0,
      diskUsageBytes: 0,
      updatedAt: new Date().toISOString()
    };
    const normalizedDelta = normalizeInternalInventoryDelta(body?.delta);
    const next = applyInventoryDelta(current, normalizedDelta);
    inventoryStateByAgent.set(agentId, next);
    broadcastWsEvent(WS_EVENT.INVENTORY_RECONCILED, {
      workspaceId,
      agentId,
      updatedAt: next.updatedAt,
      source: "worker_delta"
    });
    return reply.code(200).send({ ok: true, inventory: next });
  }
);

fastify.get(
  "/auth/bootstrap-status",
  {
    schema: {
      tags: ["Auth"],
      summary: "Verifica se precisa de bootstrap inicial",
      description: "Retorna se o sistema precisa criar o primeiro administrador",
      response: {
        200: {
          type: "object",
          properties: {
            requiresBootstrap: { type: "boolean" }
          }
        }
      }
    }
  },
  async () => {
    const admins = await prisma.user.count({
      where: { role: { in: ["owner", "admin"] } }
    });
    return {
      requiresBootstrap: admins === 0
    };
  }
);

fastify.post(
  "/auth/bootstrap-admin",
  {
    schema: {
      tags: ["Auth"],
      summary: "Cria o primeiro administrador",
      description: "Bootstrap inicial do sistema - cria o primeiro usuário admin (só funciona se não existir nenhum admin)",
      body: {
        type: "object",
        required: ["name", "email", "password"],
        properties: {
          name: {
            type: "string",
            minLength: 2,
            maxLength: 120,
            description: "Nome do administrador"
          },
          email: {
            type: "string",
            format: "email",
            maxLength: 200,
            description: "Email do administrador"
          },
          password: {
            type: "string",
            minLength: 8,
            maxLength: 200,
            description: "Senha (mínimo 8 caracteres)"
          }
        }
      },
      response: {
        201: {
          type: "object",
          description: "Administrador criado com sucesso",
          properties: {
            user: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                email: { type: "string" },
                role: { type: "string", enum: ["owner", "admin", "member"] }
              }
            }
          }
        },
        400: {
          type: "object",
          description: "Dados inválidos",
          properties: { error: { type: "string" } }
        },
        409: {
          type: "object",
          description: "Já existe um administrador ou email já cadastrado",
          properties: { error: { type: "string" } }
        }
      }
    }
  },
  async (request, reply) => {
    const admins = await prisma.user.count({
      where: { role: { in: ["owner", "admin"] } }
    });
    if (admins > 0) {
      return reply.code(409).send({ error: "Unable to complete access." });
    }

    const body = request.body as {
      name?: string;
      email?: string;
      password?: string;
    };
    const name = sanitizeUserName(body?.name ?? "");
    const email = normalizeEmail(body?.email ?? "");
    const password = body?.password ?? "";

    if (name.length < 2 || name.length > 120) {
      return reply.code(400).send({ error: "Unable to complete access." });
    }
    if (!email || !email.includes("@") || email.length > 200) {
      return reply.code(400).send({ error: "Unable to complete access." });
    }
    if (password.length < 8 || password.length > 200) {
      return reply.code(400).send({ error: "Unable to complete access." });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.code(409).send({ error: "Unable to complete access." });
    }

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: "owner"
      }
    });
    await ensureDefaultWorkspaceForUser(user);

    setAuthCookie(reply, { userId: user.id, email: user.email });
    return reply.code(201).send({ user: toPublicUser(user) });
  }
);

fastify.post(
  "/auth/register",
  {
    schema: {
      tags: ["Auth"],
      summary: "Registra novo usuário",
      description: "Endpoint de registro público (se habilitado nas configurações)"
    }
  },
  async (_request, reply) => {
    return reply.code(403).send({ error: "Unable to complete access." });
  }
);

fastify.post(
  "/auth/login",
  {
    schema: {
      tags: ["Auth"],
      summary: "Realiza login do usuário",
      description: "Autentica o usuário com email e senha, retorna cookie de sessão",
      body: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: {
            type: "string",
            format: "email",
            description: "Email do usuário"
          },
          password: {
            type: "string",
            minLength: 8,
            description: "Senha do usuário"
          }
        }
      },
      response: {
        200: {
          type: "object",
          description: "Login realizado com sucesso",
          properties: {
            user: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                email: { type: "string" },
                role: { type: "string", enum: ["owner", "admin", "member"] }
              }
            }
          }
        },
        400: {
          type: "object",
          description: "Email ou senha não fornecidos",
          properties: { error: { type: "string" } }
        },
        401: {
          type: "object",
          description: "Credenciais inválidas",
          properties: { error: { type: "string" } }
        }
      }
    }
  },
  async (request, reply) => {
    const body = request.body as { email?: string; password?: string };
    const email = normalizeEmail(body?.email ?? "");
    const password = body?.password ?? "";

    if (!email || !password) {
      return reply.code(400).send({ error: "Unable to complete access." });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return reply.code(401).send({ error: "Unable to complete access." });
    }
    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) {
      return reply.code(401).send({ error: "Unable to complete access." });
    }
    await ensureDefaultWorkspaceForUser(user);

    setAuthCookie(reply, { userId: user.id, email: user.email });
    return reply.code(200).send({ user: toPublicUser(user) });
  }
);

fastify.post(
  "/auth/logout",
  {
    schema: {
      tags: ["Auth"],
      summary: "Realiza logout do usuário",
      description: "Remove o cookie de sessão do usuário",
      response: {
        200: {
          type: "object",
          description: "Logout realizado com sucesso",
          properties: {
            ok: { type: "boolean" }
          }
        }
      }
    }
  },
  async (_request, reply) => {
    clearAuthCookie(reply);
    return reply.code(200).send({ ok: true });
  }
);

fastify.get(
  "/auth/me",
  {
    schema: {
      tags: ["Auth"],
      summary: "Retorna o usuário logado",
      description: "Retorna os dados do usuário autenticado na sessão atual",
      response: {
        200: {
          type: "object",
          description: "Usuário autenticado",
          properties: {
            user: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                email: { type: "string" },
                role: { type: "string", enum: ["owner", "admin", "member"] }
              }
            },
            scope: {
              type: "object",
              properties: {
                workspaceId: { type: "string" },
                membershipRole: { type: "string" }
              }
            }
          }
        },
        401: {
          type: "object",
          description: "Não autenticado",
          properties: { error: { type: "string" } }
        }
      }
    }
  },
  async (request, reply) => {
    try {
      const payload = await request.jwtVerify<AuthTokenPayload>();
      const user = await prisma.user.findUnique({
        where: { id: payload.userId }
      });
      if (!user) {
        clearAuthCookie(reply);
        return reply.code(401).send({ error: "Unauthorized" });
      }
      const scope = await ensureDefaultWorkspaceForUser(user);
      return reply.code(200).send({ user: toPublicUser(user), scope });
    } catch {
      clearAuthCookie(reply);
      return reply.code(401).send({ error: "Unauthorized" });
    }
  }
);

fastify.get(
  "/auth/invite/:token",
  {
    schema: {
      tags: ["Auth"],
      summary: "Valida token de convite",
      description: "Verifica se um token de convite é válido e retorna informações do convite",
      params: {
        type: "object",
        required: ["token"],
        properties: {
          token: { type: "string", description: "Token do convite" }
        }
      },
      response: {
        200: {
          type: "object",
          description: "Convite válido",
          properties: {
            email: { type: "string" },
            role: { type: "string", enum: ["admin", "member"] },
            expiresAt: { type: "string", format: "date-time" }
          }
        },
        404: {
          type: "object",
          description: "Convite não encontrado",
          properties: { error: { type: "string" } }
        },
        410: {
          type: "object",
          description: "Convite expirado ou revogado",
          properties: { error: { type: "string" } }
        }
      }
    }
  },
  async (request, reply) => {
    const { token } = request.params as { token: string };
    const tokenHash = hashInviteToken(token);
    const now = new Date();
    const invitation = await prisma.invitation.findUnique({
      where: { tokenHash }
    });
    if (!invitation) {
      return reply.code(404).send({ error: "Invite not found." });
    }
    if (invitation.revokedAt || invitation.acceptedAt || invitation.expiresAt <= now) {
      return reply.code(410).send({ error: "Invite is no longer valid." });
    }
    return reply.code(200).send({
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt
    });
  }
);

fastify.post(
  "/auth/invite/accept",
  {
    schema: {
      tags: ["Auth"],
      summary: "Aceita convite e cria conta",
      description: "Aceita um convite válido e cria a conta do usuário convidado",
      body: {
        type: "object",
        required: ["token", "name", "password"],
        properties: {
          token: { type: "string", description: "Token do convite recebido" },
          name: {
            type: "string",
            minLength: 2,
            maxLength: 120,
            description: "Nome do usuário"
          },
          password: {
            type: "string",
            minLength: 8,
            maxLength: 200,
            description: "Senha (mínimo 8 caracteres)"
          }
        }
      },
      response: {
        200: {
          type: "object",
          description: "Conta criada com sucesso",
          properties: {
            user: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                email: { type: "string" },
                role: { type: "string", enum: ["admin", "member"] }
              }
            }
          }
        },
        400: {
          type: "object",
          description: "Dados inválidos",
          properties: { error: { type: "string" } }
        },
        409: {
          type: "object",
          description: "Email já cadastrado",
          properties: { error: { type: "string" } }
        },
        410: {
          type: "object",
          description: "Convite expirado ou revogado",
          properties: { error: { type: "string" } }
        }
      }
    }
  },
  async (request, reply) => {
    const body = request.body as {
      token?: string;
      name?: string;
      password?: string;
    };
    const token = body?.token?.trim() ?? "";
    const name = sanitizeUserName(body?.name ?? "");
    const password = body?.password ?? "";
    if (!token || name.length < 2 || name.length > 120 || password.length < 8 || password.length > 200) {
      return reply.code(400).send({ error: "Unable to complete access." });
    }

    const tokenHash = hashInviteToken(token);
    const now = new Date();
    const invitation = await prisma.invitation.findUnique({
      where: { tokenHash }
    });
    if (!invitation || invitation.revokedAt || invitation.acceptedAt || invitation.expiresAt <= now) {
      return reply.code(410).send({ error: "Unable to complete access." });
    }
    const existing = await prisma.user.findUnique({
      where: { email: invitation.email }
    });
    if (existing) {
      return reply.code(409).send({ error: "Unable to complete access." });
    }

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email: invitation.email,
          passwordHash,
          role: isValidRole(invitation.role) ? invitation.role : "member"
        }
      });
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() }
      });
      await tx.workspaceMembership.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: invitation.workspaceId,
            userId: user.id
          }
        },
        create: {
          workspaceId: invitation.workspaceId,
          userId: user.id,
          role: isValidRole(invitation.role) ? invitation.role : "member"
        },
        update: {
          role: isValidRole(invitation.role) ? invitation.role : "member"
        }
      });
      return user;
    });

    setAuthCookie(reply, { userId: created.id, email: created.email });
    return reply.code(200).send({ user: toPublicUser(created) });
  }
);

fastify.get(
  "/auth/context",
  {
    schema: {
      tags: ["Auth"],
      summary: "Retorna contexto autenticado de escopo",
      description: "Retorna o vínculo user -> workspace e agentes associados ao workspace",
      response: {
        200: {
          type: "object",
          properties: {
            user: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                email: { type: "string" },
                role: { type: "string", enum: ["owner", "admin", "member"] }
              }
            },
            scope: {
              type: "object",
              properties: {
                workspaceId: { type: "string" },
                membershipRole: { type: "string" }
              }
            },
            agents: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  label: { type: "string", nullable: true },
                  status: { type: "string" },
                  lastSeenAt: {
                    type: "string",
                    format: "date-time",
                    nullable: true
                  }
                }
              }
            }
          }
        },
        401: {
          type: "object",
          properties: { error: { type: "string" } }
        }
      }
    }
  },
  async (request, reply) => {
    const currentUser = await getCurrentUser(request);
    if (!currentUser) {
      clearAuthCookie(reply);
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const scope = await ensureDefaultWorkspaceForUser(currentUser);
    const agents = await prisma.agent.findMany({
      where: { workspaceId: scope.workspaceId },
      orderBy: [{ status: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        label: true,
        status: true,
        lastSeenAt: true
      }
    });

    return reply.code(200).send({
      user: currentUser,
      scope,
      agents
    });
  }
);

fastify.post(
  "/agent-control/pairing-token",
  {
    schema: {
      tags: ["Agent Control"],
      summary: "Gera token de pareamento de uso único",
      security: [{ cookieAuth: [] }]
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;

    const pairingToken = `ptk_${randomBytes(24).toString("hex")}`;
    const expiresAtMs = Date.now() + pairingTokenTtlMs;
    pairingTokens.set(pairingToken, {
      workspaceId: auth.scope.workspaceId,
      createdByUserId: auth.currentUser.id,
      expiresAtMs,
      used: false
    });

    return reply.code(201).send({
      pairingToken,
      expiresAt: new Date(expiresAtMs).toISOString(),
      ttlMs: pairingTokenTtlMs
    });
  }
);

fastify.post(
  "/agent-control/validate-worker",
  {
    schema: {
      tags: ["Agent Control"],
      summary: "Valida pareamento e provisiona credenciais do worker"
    }
  },
  async (request, reply) => {
    const body = request.body as {
      pairingToken?: string;
      label?: string;
      machineFingerprint?: string;
    };
    const pairingToken = body?.pairingToken?.trim() ?? "";
    const machineFingerprint = body?.machineFingerprint?.trim() ?? "";
    const label = body?.label?.trim() ?? null;
    if (!pairingToken || !machineFingerprint) {
      return reply.code(400).send({ error: "pairingToken and machineFingerprint are required" });
    }

    const pairingState = pairingTokens.get(pairingToken);
    if (!pairingState) {
      return reply.code(401).send({ error: "pairing_token_invalid" });
    }
    if (pairingState.used) {
      return reply.code(409).send({ error: "pairing_token_already_used" });
    }
    if (Date.now() > pairingState.expiresAtMs) {
      pairingTokens.delete(pairingToken);
      return reply.code(410).send({ error: "pairing_token_expired" });
    }

    const existingAgent = await prisma.agent.findFirst({
      where: {
        workspaceId: pairingState.workspaceId,
        machineFingerprint
      },
      select: { id: true }
    });
    const agent =
      existingAgent ??
      (await prisma.agent.create({
        data: {
          workspaceId: pairingState.workspaceId,
          label: label || null,
          machineFingerprint,
          status: "offline"
        },
        select: { id: true }
      }));

    const claims: AgentControlTokenClaims = {
      v: 1,
      agentId: agent.id,
      workspaceId: pairingState.workspaceId,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 30
    };
    const agentControlToken = signAgentControlToken(claims);
    pairingState.used = true;
    pairingTokens.set(pairingToken, pairingState);

    return reply.code(200).send({
      AGENT_CONTROL_TOKEN: agentControlToken,
      WORKSPACE_ID: pairingState.workspaceId,
      AGENT_ID: agent.id,
      API_BASE_URL: getApiBaseUrl()
    });
  }
);

fastify.get(
  "/health",
  {
    schema: {
      tags: ["Health"],
      summary: "Verifica o status do servidor",
      description: "Retorna informações sobre a saúde do sistema e configurações básicas",
      response: {
        200: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            dataDir: { type: "string" },
            databaseUrl: { type: "string" },
            cwd: { type: "string" }
          }
        }
      }
    }
  },
  async () => {
    return {
      ok: true,
      dataDir: config.dataDir,
      databaseUrl: config.databaseUrl,
      cwd: process.cwd()
    };
  }
);

const publicRouteRules: Array<{
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: RegExp;
}> = [
  { method: "GET", path: /^\/health$/ },
  { method: "POST", path: /^\/internal\/jobs\/event$/ },
  { method: "POST", path: /^\/internal\/inventory\/snapshot$/ },
  { method: "POST", path: /^\/internal\/inventory\/delta$/ },
  { method: "GET", path: /^\/auth\/bootstrap-status$/ },
  { method: "POST", path: /^\/auth\/bootstrap-admin$/ },
  { method: "POST", path: /^\/auth\/register$/ },
  { method: "POST", path: /^\/auth\/login$/ },
  { method: "POST", path: /^\/auth\/logout$/ },
  { method: "GET", path: /^\/auth\/invite\/[^/]+$/ },
  { method: "POST", path: /^\/auth\/invite\/accept$/ },
  { method: "POST", path: /^\/agent-control\/validate-worker$/ },
  { method: "GET", path: /^\/settings$/ },
  { method: "GET", path: /^\/ws\/agent-control$/ },
  // Scalar serves static assets under /reference/*
  { method: "GET", path: /^\/reference(?:\/.*)?$/ }
];
fastify.addHook("onRequest", async (request, reply) => {
  setRequestCorrelation(request, reply);
  const requestPath = request.url.split("?")[0] ?? "";
  const requestMethod = request.method.toUpperCase();
  const isPublicRoute = publicRouteRules.some((rule) => rule.method === requestMethod && rule.path.test(requestPath));
  if (isPublicRoute) return;
  try {
    await request.jwtVerify<AuthTokenPayload>();
  } catch {
    clearAuthCookie(reply);
    return reply.code(401).send({ error: "Unauthorized" });
  }
});

fastify.addHook("onResponse", async (request, reply) => {
  const startedAt = requestStartedAtByRef.get(request) ?? Date.now();
  const elapsedMs = Math.max(0, Date.now() - startedAt);
  const route = request.url.split("?")[0] ?? request.url;
  fastify.log.info(
    {
      correlationId: getRequestCorrelationId(request),
      workspaceId: requestWorkspaceByRef.get(request) ?? null,
      agentId: requestAgentByRef.get(request) ?? null,
      route,
      statusCode: reply.statusCode,
      elapsedMs
    },
    "http_request_completed"
  );
});

fastify.get(
  "/team/invitations",
  {
    schema: {
      tags: ["Team"],
      summary: "Lista convites de equipe",
      description: "Retorna todos os convites enviados (requer role admin/owner)",
      response: {
        200: {
          type: "object",
          description: "Lista de convites",
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  inviteeName: { type: "string", nullable: true },
                  email: { type: "string" },
                  role: { type: "string", enum: ["admin", "member"] },
                  createdAt: { type: "string", format: "date-time" },
                  expiresAt: { type: "string", format: "date-time" },
                  status: {
                    type: "string",
                    enum: ["pending", "accepted", "revoked", "expired"]
                  }
                }
              }
            }
          }
        },
        403: {
          type: "object",
          description: "Sem permissão (requer admin/owner)",
          properties: { error: { type: "string" } }
        }
      }
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const { currentUser, scope } = auth;
    if (!["owner", "admin"].includes(currentUser.role)) {
      return reply.code(403).send({ error: "Forbidden" });
    }
    const items = await prisma.invitation.findMany({
      where: { workspaceId: scope.workspaceId },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    const now = Date.now();
    return reply.code(200).send({
      items: items.map((item) => ({
        id: item.id,
        inviteeName: item.inviteeName ?? null,
        email: item.email,
        role: item.role,
        createdAt: item.createdAt,
        expiresAt: item.expiresAt,
        status: item.acceptedAt
          ? "accepted"
          : item.revokedAt
            ? "revoked"
            : item.expiresAt.getTime() <= now
              ? "expired"
              : "pending"
        }))
    });
  }
);

fastify.post(
  "/team/invitations",
  {
    schema: {
      tags: ["Team"],
      summary: "Cria convite de equipe",
      description: "Cria um novo convite para adicionar um membro à equipe (requer role admin/owner)",
      body: {
        type: "object",
        required: ["email"],
        properties: {
          email: {
            type: "string",
            format: "email",
            description: "Email do convidado"
          },
          role: {
            type: "string",
            enum: ["admin", "member"],
            description: "Role do convidado (padrão: member)"
          },
          inviteeName: {
            type: "string",
            description: "Nome do convidado (opcional)"
          },
          expiresInHours: {
            type: "number",
            minimum: 1,
            maximum: 720,
            description: "Horas até expirar (padrão: 72)"
          },
          messageTemplate: {
            type: "string",
            description: "Template de mensagem com {{invite_link}}"
          }
        }
      },
      response: {
        201: {
          type: "object",
          description: "Convite criado com sucesso",
          properties: {
            invitation: {
              type: "object",
              properties: {
                id: { type: "string" },
                inviteeName: { type: "string", nullable: true },
                email: { type: "string" },
                role: { type: "string", enum: ["admin", "member"] },
                createdAt: { type: "string", format: "date-time" },
                expiresAt: { type: "string", format: "date-time" },
                status: { type: "string" }
              }
            },
            inviteLink: {
              type: "string",
              description: "Link do convite para enviar ao usuário"
            },
            inviteMessage: {
              type: "string",
              description: "Mensagem formatada para enviar"
            }
          }
        },
        400: {
          type: "object",
          description: "Dados inválidos",
          properties: { error: { type: "string" } }
        },
        403: {
          type: "object",
          description: "Sem permissão (requer admin/owner)",
          properties: { error: { type: "string" } }
        },
        409: {
          type: "object",
          description: "Email já cadastrado no sistema",
          properties: { error: { type: "string" } }
        }
      }
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const { currentUser, scope } = auth;
    if (!["owner", "admin"].includes(currentUser.role)) {
      return reply.code(403).send({ error: "Forbidden" });
    }

    const body = request.body as {
      email?: string;
      role?: string;
      expiresInHours?: number;
      inviteeName?: string;
      messageTemplate?: string;
    };
    const email = normalizeEmail(body?.email ?? "");
    const inviteeName = sanitizeUserName(body?.inviteeName ?? "");
    const messageTemplate =
      typeof body?.messageTemplate === "string" ? body.messageTemplate : undefined;
    const requestedRole = (body?.role ?? "member").trim().toLowerCase();
    const role = requestedRole === "admin" ? "admin" : "member";
    const expiresInHours = Number.isFinite(body?.expiresInHours) ? Number(body.expiresInHours) : 72;
    if (!email || !email.includes("@") || email.length > 200) {
      return reply.code(400).send({ error: "Unable to complete access." });
    }
    if (expiresInHours < 1 || expiresInHours > 720) {
      return reply.code(400).send({ error: "Unable to complete access." });
    }
    if (messageTemplate && !/\{\{\s*invite_link\s*\}\}/i.test(messageTemplate)) {
      return reply.code(400).send({ error: "Invite template must include {{invite_link}}." });
    }

    const userExists = await prisma.user.findUnique({ where: { email } });
    if (userExists) {
      return reply.code(409).send({ error: "Unable to complete access." });
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = hashInviteToken(token);
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
    const invitation = await prisma.invitation.create({
      data: {
        workspaceId: scope.workspaceId,
        inviteeName: inviteeName || null,
        email,
        role,
        tokenHash,
        expiresAt,
        invitedByUserId: currentUser.id
      }
    });

    const inviteLink = buildInviteLink(token);
    const inviteMessage = buildInviteMessage({
      inviteLink,
      role,
      inviteeName: inviteeName || undefined,
      inviteeEmail: email,
      expiresAt,
      messageTemplate
    });

    return reply.code(201).send({
      invitation: {
        id: invitation.id,
        inviteeName: invitation.inviteeName ?? null,
        email: invitation.email,
        role: invitation.role,
        createdAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
        status: "pending"
      },
      inviteLink,
      inviteMessage
    });
  }
);

fastify.post(
  "/team/invitations/:invitationId/regenerate-content",
  {
    schema: {
      tags: ["Team"],
      summary: "Regenera conteúdo do convite",
      description: "Regenera o link e conteúdo de um convite existente",
      params: {
        type: "object",
        required: ["invitationId"],
        properties: {
          invitationId: { type: "string", description: "ID do convite" }
        }
      },
      body: {
        type: "object",
        properties: {
          messageTemplate: {
            type: "string",
            description: "Template de mensagem com {{invite_link}}"
          }
        }
      },
      response: {
        200: {
          type: "object",
          description: "Conteúdo regenerado com sucesso",
          properties: {
            invitation: {
              type: "object",
              properties: {
                id: { type: "string" },
                inviteeName: { type: "string", nullable: true },
                email: { type: "string" },
                role: { type: "string", enum: ["admin", "member"] },
                createdAt: { type: "string", format: "date-time" },
                expiresAt: { type: "string", format: "date-time" },
                status: { type: "string", enum: ["pending"] }
              }
            },
            inviteLink: { type: "string" },
            inviteMessage: { type: "string" }
          }
        },
        403: {
          type: "object",
          description: "Sem permissão",
          properties: { error: { type: "string" } }
        },
        404: {
          type: "object",
          description: "Convite não encontrado",
          properties: { error: { type: "string" } }
        },
        409: {
          type: "object",
          description: "Convite não está mais ativo ou expirou",
          properties: { error: { type: "string" } }
        },
        400: {
          type: "object",
          description: "Template de mensagem inválido",
          properties: { error: { type: "string" } }
        }
      }
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const { currentUser, scope } = auth;
    if (!["owner", "admin"].includes(currentUser.role)) {
      return reply.code(403).send({ error: "Forbidden" });
    }
    const { invitationId } = request.params as { invitationId: string };
    const invitation = await prisma.invitation.findFirst({
      where: {
        id: invitationId,
        workspaceId: scope.workspaceId
      }
    });
    if (!invitation) {
      return reply.code(404).send({ error: "Invite not found." });
    }
    if (invitation.acceptedAt || invitation.revokedAt) {
      return reply.code(409).send({ error: "Invite is no longer active." });
    }
    if (invitation.expiresAt.getTime() <= Date.now()) {
      return reply.code(409).send({ error: "Invite is expired." });
    }

    const body = request.body as { messageTemplate?: string };
    const messageTemplate =
      typeof body?.messageTemplate === "string" ? body.messageTemplate : undefined;
    if (messageTemplate && !/\{\{\s*invite_link\s*\}\}/i.test(messageTemplate)) {
      return reply.code(400).send({ error: "Invite template must include {{invite_link}}." });
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = hashInviteToken(token);
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { tokenHash }
    });

    const inviteLink = buildInviteLink(token);
    const inviteMessage = buildInviteMessage({
      inviteLink,
      role: invitation.role,
      inviteeName: invitation.inviteeName ?? undefined,
      inviteeEmail: invitation.email,
      expiresAt: invitation.expiresAt,
      messageTemplate
    });
    return reply.code(200).send({
      invitation: {
        id: invitation.id,
        inviteeName: invitation.inviteeName ?? null,
        email: invitation.email,
        role: invitation.role,
        createdAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
        status: "pending"
      },
      inviteLink,
      inviteMessage
    });
  }
);

fastify.post(
  "/team/invitations/:invitationId/revoke",
  {
    schema: {
      tags: ["Team"],
      summary: "Revoga um convite",
      description: "Cancela um convite pendente, tornando-o inválido",
      params: {
        type: "object",
        required: ["invitationId"],
        properties: {
          invitationId: { type: "string", description: "ID do convite" }
        }
      },
      response: {
        200: {
          type: "object",
          description: "Convite revogado com sucesso",
          properties: {
            invitation: {
              type: "object",
              properties: {
                id: { type: "string" },
                inviteeName: { type: "string", nullable: true },
                email: { type: "string" },
                role: { type: "string", enum: ["admin", "member"] },
                createdAt: { type: "string", format: "date-time" },
                expiresAt: { type: "string", format: "date-time" },
                status: { type: "string", enum: ["revoked"] }
              }
            }
          }
        },
        403: {
          type: "object",
          description: "Sem permissão",
          properties: { error: { type: "string" } }
        },
        404: {
          type: "object",
          description: "Convite não encontrado",
          properties: { error: { type: "string" } }
        },
        409: {
          type: "object",
          description: "Convite já foi aceito ou revogado",
          properties: { error: { type: "string" } }
        }
      }
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const { currentUser, scope } = auth;
    if (!["owner", "admin"].includes(currentUser.role)) {
      return reply.code(403).send({ error: "Forbidden" });
    }
    const { invitationId } = request.params as { invitationId: string };
    const invitation = await prisma.invitation.findFirst({
      where: {
        id: invitationId,
        workspaceId: scope.workspaceId
      }
    });
    if (!invitation) {
      return reply.code(404).send({ error: "Invite not found." });
    }
    if (invitation.acceptedAt || invitation.revokedAt) {
      return reply.code(409).send({ error: "Invite is no longer active." });
    }
    const updated = await prisma.invitation.update({
      where: { id: invitationId },
      data: { revokedAt: new Date() }
    });
    return reply.code(200).send({
      invitation: {
        id: updated.id,
        inviteeName: updated.inviteeName ?? null,
        email: updated.email,
        role: updated.role,
        createdAt: updated.createdAt,
        expiresAt: updated.expiresAt,
        status: "revoked"
      }
    });
  }
);

fastify.get(
  "/integrations/ollama/health",
  {
    schema: {
      tags: ["Integrations"],
      summary: "Verifica status do Ollama",
      description: "Retorna o status de conexão com o servidor Ollama (LLM)",
      response: {
        200: {
          type: "object",
          description: "Status do Ollama",
          properties: {
            ok: { type: "boolean" },
            baseUrl: { type: "string" },
            models: { type: "array", items: { type: "string" } }
          }
        },
        503: {
          type: "object",
          description: "Ollama indisponível",
          properties: {
            ok: { type: "boolean" },
            error: { type: "string" }
          }
        }
      }
    }
  },
  async (request, reply) => {
    try {
      const auth = await getAuthenticatedScope(request, reply);
      if (!auth) return;
      const query = request.query as { agentId?: string } | undefined;
      const agentSession = getConnectedAgentForWorkspace(auth.scope.workspaceId, query?.agentId?.trim());
      if (!agentSession) {
        return reply.code(503).send({ ok: false, error: "agent_offline" });
      }
      const upstream = await requestAgentIntegrationHealth(agentSession, "ollama");
      return reply.code(upstream.statusCode === 200 ? 200 : 503).send(upstream.data);
    } catch (err) {
      return reply.code(503).send({ ok: false, error: (err as Error).message });
    }
  }
);

fastify.get(
  "/integrations/xtts/health",
  {
    schema: {
      tags: ["Integrations"],
      summary: "Verifica status do XTTS",
      description: "Retorna o status de conexão com o servidor XTTS (Text-to-Speech)",
      response: {
        200: {
          type: "object",
          description: "Status do XTTS",
          properties: {
            ok: { type: "boolean" },
            baseUrl: { type: "string" }
          }
        },
        503: {
          type: "object",
          description: "XTTS indisponível",
          properties: {
            ok: { type: "boolean" },
            error: { type: "string" }
          }
        }
      }
    }
  },
  async (request, reply) => {
    try {
      const auth = await getAuthenticatedScope(request, reply);
      if (!auth) return;
      const query = request.query as { agentId?: string } | undefined;
      const agentSession = getConnectedAgentForWorkspace(
        auth.scope.workspaceId,
        query?.agentId?.trim()
      );
      if (!agentSession) {
        return reply.code(503).send({ ok: false, error: "agent_offline" });
      }
      const upstream = await requestAgentIntegrationHealth(agentSession, "xtts");
      return reply.code(upstream.statusCode === 200 ? 200 : 503).send(upstream.data);
    } catch (err) {
      return reply.code(503).send({ ok: false, error: (err as Error).message });
    }
  }
);

fastify.get(
  "/tts/provider",
  {
    schema: {
      tags: ["Voices"],
      summary: "Retorna o provedor de TTS",
      description: "Retorna qual provedor de Text-to-Speech está configurado",
      response: {
        200: {
          type: "object",
          description: "Provedor de TTS atual",
          properties: {
            provider: {
              type: "string",
              enum: ["xtts", "chatterbox", "qwen"],
              description: "Nome do provedor"
            }
          }
        }
      }
    }
  },
  async () => {
    return { provider: config.ttsProvider };
  }
);

fastify.get(
  "/notifications",
  {
    schema: {
      tags: ["Notifications"],
      summary: "Lista notificações",
      description: "Retorna as últimas 100 notificações do sistema",
      response: {
        200: {
          type: "object",
          description: "Lista de notificações",
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  title: { type: "string" },
                  message: { type: "string" },
                  time: { type: "string", format: "date-time" },
                  read: { type: "boolean" },
                  type: { type: "string" },
                  relatedLessonId: { type: "string", nullable: true },
                  jobType: { type: "string", nullable: true },
                  jobStatus: { type: "string", nullable: true }
                }
              }
            }
          }
        }
      }
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const items = await prisma.notification.findMany({
      where: { workspaceId: auth.scope.workspaceId },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    return {
      items: items.map((item) => ({
        id: item.id,
        title: item.title,
        message: item.message,
        time: item.createdAt.toISOString(),
        read: item.read,
        type: item.type,
        relatedLessonId: item.videoId ?? undefined,
        jobType: item.jobType ?? undefined,
        jobStatus: item.jobStatus ?? undefined
      }))
    };
  }
);

fastify.post(
  "/notifications/read-all",
  {
    schema: {
      tags: ["Notifications"],
      summary: "Marca todas como lidas",
      description: "Marca todas as notificações como lidas",
      response: {
        200: {
          type: "object",
          description: "Operação realizada com sucesso",
          properties: {
            updated: {
              type: "integer",
              description: "Número de notificações marcadas"
            }
          }
        }
      }
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const updated = await prisma.notification.updateMany({
      where: { workspaceId: auth.scope.workspaceId, read: false },
      data: { read: true }
    });
    return { updated: updated.count };
  }
);

fastify.post(
  "/notifications/:notificationId/read",
  {
    schema: {
      tags: ["Notifications"],
      summary: "Marca notificação como lida",
      description: "Marca uma notificação específica como lida",
      params: {
        type: "object",
        required: ["notificationId"],
        properties: {
          notificationId: { type: "string", description: "ID da notificação" }
        }
      },
      response: {
        200: {
          type: "object",
          description: "Notificação marcada como lida",
          properties: {
            id: { type: "string" },
            read: { type: "boolean" }
          }
        },
        404: {
          type: "object",
          description: "Notificação não encontrada",
          properties: { error: { type: "string" } }
        }
      }
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const { notificationId } = request.params as { notificationId: string };
    const updated = await prisma.notification.updateMany({
      where: {
        id: notificationId,
        workspaceId: auth.scope.workspaceId
      },
      data: { read: true }
    });
    if (updated.count === 0) {
      return reply.code(404).send({ error: "notification not found" });
    }
    return reply.code(200).send({
      id: notificationId,
      read: true
    });
  }
);

fastify.post(
  "/integrations/comfyui/health",
  {
    schema: {
      tags: ["Integrations"],
      summary: "Verifica status do ComfyUI",
      description: "Retorna o status de conexão com o servidor ComfyUI (geração de imagens)",
      response: {
        200: {
          type: "object",
          description: "Status do ComfyUI",
          properties: {
            ok: { type: "boolean" },
            baseUrl: { type: "string" }
          }
        },
        503: {
          type: "object",
          description: "ComfyUI indisponível",
          properties: {
            ok: { type: "boolean" },
            error: { type: "string" }
          }
        },
        400: {
          type: "object",
          description: "Parâmetros inválidos",
          properties: {
            ok: { type: "boolean" },
            error: { type: "string" }
          }
        }
      }
    }
  },
  async (request, reply) => {
    try {
      const auth = await getAuthenticatedScope(request, reply);
      if (!auth) return;
      const body = request.body as { baseUrl?: string; agentId?: string } | undefined;
      const agentSession = getConnectedAgentForWorkspace(auth.scope.workspaceId, body?.agentId?.trim());
      if (!agentSession) {
        return reply.code(503).send({ ok: false, error: "agent_offline" });
      }
      const options: Record<string, unknown> = {};
      if (body?.baseUrl) {
        options.baseUrl = body.baseUrl;
      }
      const upstream = await requestAgentIntegrationHealth(agentSession, "comfyui", options);
      return reply.code(upstream.statusCode === 200 ? 200 : upstream.statusCode === 400 ? 400 : 503).send(upstream.data);
    } catch (err) {
      return reply.code(503).send({ ok: false, error: (err as Error).message });
    }
  }
);

fastify.get(
  "/integrations/comfyui/workflows",
  {
    schema: {
      tags: ["Integrations"],
      summary: "Lista workflows do ComfyUI",
      description: "Retorna todos os workflows de geração de imagem disponíveis",
      response: {
        200: {
          type: "object",
          description: "Workflow selecionado e lista de workflows disponíveis",
          properties: {
            workflowFile: { type: "string" },
            availableWorkflows: {
              type: "array",
              items: { type: "string" }
            }
          }
        },
        410: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        503: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  },
  async (request, reply) => {
    try {
      const auth = await getAuthenticatedScope(request, reply);
      if (!auth) return;
      const agentSession = getConnectedAgentForWorkspace(auth.scope.workspaceId);
      if (!agentSession) {
        return reply.code(503).send({ error: "agent_offline" });
      }
      const upstream = await requestAgentWorkerCommand(agentSession, "comfy_workflows_list");
      return reply.code(upstream.statusCode === 200 ? 200 : 503).send(upstream.data);
    } catch (err) {
      return reply.code(503).send({ error: (err as Error).message });
    }
  }
);

fastify.post(
  "/integrations/comfyui/workflows/import",
  {
    schema: {
      tags: ["Integrations"],
      summary: "Importa workflow do ComfyUI",
      description: "Importa um novo workflow JSON do ComfyUI para geração de imagens",
      body: {
        type: "object",
        required: ["workflow"],
        properties: {
          fileName: {
            type: "string",
            description: "Nome do arquivo workflow .json"
          },
          workflow: {
            type: "object",
            description: "JSON do workflow do ComfyUI"
          },
          overwrite: {
            type: "boolean",
            description: "Se true, sobrescreve um arquivo existente"
          }
        }
      },
      response: {
        200: {
          type: "object",
          description: "Workflow atualizado com sucesso",
          properties: {
            workflowFile: { type: "string" },
            availableWorkflows: {
              type: "array",
              items: { type: "string" }
            }
          }
        },
        201: {
          type: "object",
          description: "Workflow importado com sucesso",
          properties: {
            workflowFile: { type: "string" },
            availableWorkflows: {
              type: "array",
              items: { type: "string" }
            }
          }
        },
        400: {
          type: "object",
          description: "Dados inválidos",
          properties: { error: { type: "string" } }
        },
        409: {
          type: "object",
          description: "Workflow já existe",
          properties: { error: { type: "string" } }
        },
        503: {
          type: "object",
          description: "Agente offline ou erro no comando",
          properties: { error: { type: "string" } }
        }
      }
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const agentSession = getConnectedAgentForWorkspace(auth.scope.workspaceId);
    if (!agentSession) {
      return reply.code(503).send({ error: "agent_offline" });
    }
    type ImportBody = {
      fileName?: string;
      workflow?: unknown;
      overwrite?: boolean;
    };
    const body = request.body as ImportBody | undefined;
    if (!body || body.workflow === undefined) {
      return reply.code(400).send({ error: "workflow is required" });
    }
    if (body.overwrite !== undefined && typeof body.overwrite !== "boolean") {
      return reply.code(400).send({ error: "overwrite must be a boolean" });
    }
    try {
      const upstream = await requestAgentWorkerCommand(agentSession, "comfy_workflow_import", {
        fileName: body.fileName,
        workflow: body.workflow,
        overwrite: body.overwrite === true
      });
      const statusCode = upstream.statusCode === 200 || upstream.statusCode === 201 ? upstream.statusCode : upstream.statusCode === 400 || upstream.statusCode === 409 ? upstream.statusCode : 503;
      return reply.code(statusCode).send(upstream.data);
    } catch (err) {
      return reply.code(503).send({ error: (err as Error).message });
    }
  }
);

fastify.get(
  "/slide-templates",
  {
    schema: {
      tags: ["Slides"],
      summary: "Lista templates de slides",
      description: "Retorna todos os templates de slides ativos disponíveis"
    }
  },
  async () => {
    // Slides are disabled in the current MVP sandbox (image-only video pipeline).
    return [];
  }
);

fastify.get(
  "/tts/voices",
  {
    schema: {
      tags: ["Voices"],
      summary: "Lista vozes disponíveis",
      description: "Retorna todas as vozes disponíveis para Text-to-Speech",
      response: {
        200: {
          type: "object",
          description: "Lista de vozes",
          properties: {
            voices: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  label: { type: "string" },
                  description: { type: ["string", "null"] },
                  preview_url: { type: ["string", "null"] }
                }
              }
            },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  label: { type: "string" },
                  description: { type: ["string", "null"] },
                  preview_url: { type: ["string", "null"] }
                }
              }
            },
            speakers: {
              type: "array",
              items: { type: "string" }
            }
          }
        },
        503: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  },
  async (request, reply) => {
    try {
      const auth = await getAuthenticatedScope(request, reply);
      if (!auth) return;
      const query = request.query as { agentId?: string } | undefined;
      const agentSession = getConnectedAgentForWorkspace(
        auth.scope.workspaceId,
        query?.agentId?.trim()
      );
      if (!agentSession) {
        return reply.code(503).send({ error: "agent_offline" });
      }
      const upstream = await requestAgentWorkerCommand(agentSession, "tts_voices_list");
      return reply.code(upstream.statusCode === 200 ? 200 : 503).send(upstream.data);
    } catch (err) {
      return reply.code(503).send({ error: (err as Error).message });
    }
  }
);

fastify.get(
  "/settings",
  {
    schema: {
      tags: ["Settings"],
      summary: "Obtém configurações do sistema",
      description: "Retorna todas as configurações do sistema (LLM, TTS, ComfyUI, tema, etc.)"
    }
  },
  async () => {
    const current = readAppSettings();
    const workflows = listComfyWorkflowFiles();
    const selectedWorkflow =
      current.comfy?.workflowFile && workflows.includes(current.comfy.workflowFile)
        ? current.comfy.workflowFile
        : workflows.includes(DEFAULT_COMFY_WORKFLOW_FILE)
          ? DEFAULT_COMFY_WORKFLOW_FILE
          : (workflows[0] ?? DEFAULT_COMFY_WORKFLOW_FILE);
    return {
      theme: current.theme ?? null,
      llm: {
        provider: current.llm?.provider ?? "ollama",
        baseUrl: current.llm?.baseUrl ?? config.ollamaBaseUrl,
        model: current.llm?.model ?? config.ollamaModel,
        timeoutMs: current.llm?.timeoutMs ?? config.ollamaTimeoutMs
      },
      comfy: {
        baseUrl: current.comfy?.baseUrl ?? config.comfyuiBaseUrl,
        promptTimeoutMs: current.comfy?.promptTimeoutMs ?? config.comfyPromptTimeoutMs,
        generationTimeoutMs: current.comfy?.generationTimeoutMs ?? config.comfyGenerationTimeoutMs,
        viewTimeoutMs: current.comfy?.viewTimeoutMs ?? config.comfyViewTimeoutMs,
        masterPrompt: current.comfy?.masterPrompt ?? null,
        workflowFile: selectedWorkflow,
        availableWorkflows: workflows
      },
      tts: {
        baseUrl: current.tts?.baseUrl ?? config.xttsApiBaseUrl,
        timeoutUs: current.tts?.timeoutUs ?? Number(process.env.TTS_TIMEOUT_US ?? 5000000),
        language: current.tts?.language ?? null,
        defaultVoiceId: current.tts?.defaultVoiceId ?? null
      },
      memory: {
        idleUnloadMs: current.memory?.idleUnloadMs ?? 15 * 60 * 1000
      },
      auth: {
        loginBackground: current.auth?.loginBackground ?? null
      }
    };
  }
);

fastify.patch(
  "/settings",
  {
    schema: {
      tags: ["Settings"],
      summary: "Atualiza configurações do sistema",
      description: "Atualiza as configurações do sistema"
    }
  },
  async (request, reply) => {
    const body = request.body as AppSettings | undefined;
    if (!body) {
      return reply.code(400).send({ error: "missing request body" });
    }
    const current = readAppSettings();
    const next: AppSettings = { ...current };

    if (body.theme) {
      next.theme = {
        family: body.theme.family ?? current.theme?.family,
        mode: body.theme.mode ?? current.theme?.mode
      };
    }
    if (body.llm) {
      const timeout = body.llm.timeoutMs;
      if (timeout !== undefined && (!Number.isFinite(timeout) || timeout <= 0)) {
        return reply.code(400).send({ error: "llm.timeoutMs must be a positive number" });
      }
      next.llm = {
        provider: body.llm.provider ?? current.llm?.provider,
        baseUrl: body.llm.baseUrl ?? current.llm?.baseUrl,
        model: body.llm.model ?? current.llm?.model,
        timeoutMs: timeout !== undefined ? Math.trunc(timeout) : current.llm?.timeoutMs
      };
    }
    if (body.comfy) {
      const comfy = body.comfy;
      const validate = (value: number | undefined, field: string) => {
        if (value === undefined) return;
        if (!Number.isFinite(value) || value <= 0) {
          throw new Error(`${field} must be a positive number`);
        }
      };
      if (comfy.masterPrompt !== undefined && typeof comfy.masterPrompt !== "string") {
        return reply.code(400).send({ error: "comfy.masterPrompt must be a string" });
      }
      if (comfy.workflowFile !== undefined && typeof comfy.workflowFile !== "string") {
        return reply.code(400).send({ error: "comfy.workflowFile must be a string" });
      }
      try {
        validate(comfy.promptTimeoutMs, "comfy.promptTimeoutMs");
        validate(comfy.generationTimeoutMs, "comfy.generationTimeoutMs");
        validate(comfy.viewTimeoutMs, "comfy.viewTimeoutMs");
        if (comfy.workflowFile !== undefined) {
          if (!isSafeWorkflowFileName(comfy.workflowFile)) {
            throw new Error("comfy.workflowFile must be a valid .json file name");
          }
          readComfyWorkflowFile(comfy.workflowFile);
        }
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }
      next.comfy = {
        baseUrl: comfy.baseUrl ?? current.comfy?.baseUrl,
        promptTimeoutMs: comfy.promptTimeoutMs !== undefined ? Math.trunc(comfy.promptTimeoutMs) : current.comfy?.promptTimeoutMs,
        generationTimeoutMs: comfy.generationTimeoutMs !== undefined ? Math.trunc(comfy.generationTimeoutMs) : current.comfy?.generationTimeoutMs,
        viewTimeoutMs: comfy.viewTimeoutMs !== undefined ? Math.trunc(comfy.viewTimeoutMs) : current.comfy?.viewTimeoutMs,
        masterPrompt: comfy.masterPrompt !== undefined ? comfy.masterPrompt : current.comfy?.masterPrompt,
        workflowFile: comfy.workflowFile !== undefined ? comfy.workflowFile : current.comfy?.workflowFile
      };
    }
    if (body.tts) {
      const timeoutUs = body.tts.timeoutUs;
      if (timeoutUs !== undefined && (!Number.isFinite(timeoutUs) || timeoutUs <= 0)) {
        return reply.code(400).send({ error: "tts.timeoutUs must be a positive number" });
      }
      next.tts = {
        baseUrl: body.tts.baseUrl ?? current.tts?.baseUrl,
        timeoutUs: timeoutUs !== undefined ? Math.trunc(timeoutUs) : current.tts?.timeoutUs,
        language: body.tts.language ?? current.tts?.language,
        defaultVoiceId: body.tts.defaultVoiceId ?? current.tts?.defaultVoiceId
      };
    }
    if (body.memory) {
      const idleUnloadMs = body.memory.idleUnloadMs;
      if (idleUnloadMs !== undefined && (!Number.isFinite(idleUnloadMs) || idleUnloadMs < 0)) {
        return reply.code(400).send({ error: "memory.idleUnloadMs must be a non-negative number" });
      }
      next.memory = {
        idleUnloadMs: idleUnloadMs !== undefined ? Math.trunc(idleUnloadMs) : current.memory?.idleUnloadMs
      };
    }
    if (body.auth) {
      const loginBackground = body.auth.loginBackground;
      if (loginBackground !== undefined && typeof loginBackground !== "string") {
        return reply.code(400).send({ error: "auth.loginBackground must be a string" });
      }
      next.auth = {
        loginBackground: loginBackground ?? current.auth?.loginBackground
      };
    }

    writeAppSettings(next);
    return reply.code(200).send(next);
  }
);

type LessonBuildSnapshot = {
  videoId: string;
  sectionId: string;
  videoVersionId: string | null;
  blocksTotal: number;
  blocksReady: number;
  audioReady: number;
  audioDurationS: number | null;
  imagesReady: number;
  finalVideoReady: boolean;
  progressPercent: number;
  jobs: {
    blocks: { pending: number; running: number };
    audio: { pending: number; running: number };
    images: { pending: number; running: number };
    video: { pending: number; running: number };
  };
};

type BuildJobCounts = LessonBuildSnapshot["jobs"];

const createEmptyJobCounts = (): BuildJobCounts => ({
  blocks: { pending: 0, running: 0 },
  audio: { pending: 0, running: 0 },
  images: { pending: 0, running: 0 },
  video: { pending: 0, running: 0 }
});

const mergeJobCounts = (acc: BuildJobCounts, next: BuildJobCounts): BuildJobCounts => ({
  blocks: {
    pending: acc.blocks.pending + next.blocks.pending,
    running: acc.blocks.running + next.blocks.running
  },
  audio: {
    pending: acc.audio.pending + next.audio.pending,
    running: acc.audio.running + next.audio.running
  },
  images: {
    pending: acc.images.pending + next.images.pending,
    running: acc.images.running + next.images.running
  },
  video: {
    pending: acc.video.pending + next.video.pending,
    running: acc.video.running + next.video.running
  }
});

const progressFromParts = (blocksReady: number, audioReady: number, imagesReady: number, blocksTotal: number, finalVideoReady: boolean) => {
  if (finalVideoReady) return 100;
  if (blocksTotal <= 0) return 0;
  const blocks = Math.max(0, Math.min(1, blocksReady / blocksTotal));
  const audio = Math.max(0, Math.min(1, audioReady / blocksTotal));
  const images = Math.max(0, Math.min(1, imagesReady / blocksTotal));
  const video = finalVideoReady ? 1 : 0;
  return Math.round((blocks * 0.35 + audio * 0.2 + images * 0.2 + video * 0.25) * 100);
};

const mapJobTypeToStep = (type: string): "blocks" | "audio" | "images" | "video" | null => {
  if (type === "segment" || type === "segment_block") return "blocks";
  if (type === "tts") return "audio";
  if (type === "image" || type === "comfyui_image" || type === "render_slide") return "images";
  if (type === "concat_video") return "video";
  return null;
};

async function buildLessonSnapshotsByCourse(channelId: string): Promise<LessonBuildSnapshot[]> {
  const modules = await prisma.section.findMany({
    where: { channelId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true }
  });
  if (modules.length === 0) return [];
  const moduleIds = modules.map((item) => item.id);
  const lessons = await prisma.video.findMany({
    where: { sectionId: { in: moduleIds } },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, sectionId: true, title: true }
  });
  if (lessons.length === 0) return [];
  const lessonIds = lessons.map((item) => item.id);
  const versions = await prisma.videoVersion.findMany({
    where: { videoId: { in: lessonIds } },
    orderBy: [{ videoId: "asc" }, { createdAt: "desc" }],
    select: { id: true, videoId: true, createdAt: true }
  });
  const latestVersionByLesson = new Map<string, { id: string; createdAt: Date }>();
  for (const version of versions) {
    if (!latestVersionByLesson.has(version.videoId)) {
      latestVersionByLesson.set(version.videoId, {
        id: version.id,
        createdAt: version.createdAt
      });
    }
  }
  const versionIds = Array.from(latestVersionByLesson.values()).map((item) => item.id);
  const emptyMap = new Map<string, number>();
  const blocksTotalByVersion = new Map<string, number>();
  const blocksReadyByVersion = new Map<string, number>();
  const audioReadyByVersion = new Map<string, number>();
  const audioDurationByVersion = new Map<string, number>();
  const imagesReadyByVersion = new Map<string, number>();
  const finalVideoReadyByVersion = new Map<string, boolean>();
  const jobCountsByVersion = new Map<string, BuildJobCounts>();

  if (versionIds.length > 0) {
    const blockGroups = await prisma.block.groupBy({
      by: ["videoVersionId"],
      where: { videoVersionId: { in: versionIds } },
      _count: { _all: true }
    });
    blockGroups.forEach((row) => {
      const count = typeof row._count === "object" && row._count ? row._count._all ?? 0 : 0;
      blocksTotalByVersion.set(row.videoVersionId, count);
    });

    const blocksReadyGroups = await prisma.block.groupBy({
      by: ["videoVersionId"],
      where: {
        videoVersionId: { in: versionIds },
        imagePromptJson: { not: null }
      },
      _count: { _all: true }
    });
    blocksReadyGroups.forEach((row) => {
      const count = typeof row._count === "object" && row._count ? row._count._all ?? 0 : 0;
      blocksReadyByVersion.set(row.videoVersionId, count);
    });

    const audioAssets = await prisma.asset.findMany({
      where: {
        kind: "audio_raw",
        block: { videoVersionId: { in: versionIds } }
      },
      distinct: ["blockId"],
      select: {
        block: { select: { videoVersionId: true } }
      }
    });
    audioAssets.forEach((item) => {
      const versionId = item.block.videoVersionId;
      audioReadyByVersion.set(versionId, (audioReadyByVersion.get(versionId) ?? 0) + 1);
    });

    const audioDurationGroups = await prisma.block.groupBy({
      by: ["videoVersionId"],
      where: {
        videoVersionId: { in: versionIds },
        audioDurationS: { not: null }
      },
      _sum: { audioDurationS: true }
    });
    audioDurationGroups.forEach((row) => {
      const total = row._sum?.audioDurationS;
      if (typeof total === "number" && Number.isFinite(total) && total > 0) {
        audioDurationByVersion.set(row.videoVersionId, total);
      }
    });

    const imageAssets = await prisma.asset.findMany({
      where: {
        kind: { in: ["image_raw", "slide_png"] },
        block: { videoVersionId: { in: versionIds } }
      },
      distinct: ["blockId"],
      select: {
        block: { select: { videoVersionId: true } }
      }
    });
    imageAssets.forEach((item) => {
      const versionId = item.block.videoVersionId;
      imagesReadyByVersion.set(versionId, (imagesReadyByVersion.get(versionId) ?? 0) + 1);
    });

    const finalVideoAssets = await prisma.asset.findMany({
      where: {
        kind: "final_mp4",
        block: { videoVersionId: { in: versionIds } }
      },
      distinct: ["blockId"],
      select: {
        block: { select: { videoVersionId: true } }
      }
    });
    finalVideoAssets.forEach((item) => {
      finalVideoReadyByVersion.set(item.block.videoVersionId, true);
    });

    const activeJobs = await prisma.job.findMany({
      where: {
        videoVersionId: { in: versionIds },
        status: { in: ["pending", "running"] }
      },
      select: { videoVersionId: true, type: true, status: true }
    });
    activeJobs.forEach((job) => {
      if (!job.videoVersionId) return;
      const step = mapJobTypeToStep(job.type);
      if (!step) return;
      if (!jobCountsByVersion.has(job.videoVersionId)) {
        jobCountsByVersion.set(job.videoVersionId, createEmptyJobCounts());
      }
      const counts = jobCountsByVersion.get(job.videoVersionId)!;
      const bucket = counts[step];
      if (job.status === "running") {
        bucket.running += 1;
      } else {
        bucket.pending += 1;
      }
    });
  }

  return lessons.map((lesson) => {
    const latest = latestVersionByLesson.get(lesson.id);
    const versionId = latest?.id ?? null;
    if (!versionId) {
      return {
        videoId: lesson.id,
        sectionId: lesson.sectionId,
        videoVersionId: null,
        blocksTotal: 0,
        blocksReady: 0,
        audioReady: 0,
        audioDurationS: null,
        imagesReady: 0,
        finalVideoReady: false,
        progressPercent: 0,
        jobs: createEmptyJobCounts()
      };
    }
    const blocksTotal = blocksTotalByVersion.get(versionId) ?? 0;
    const blocksReady = blocksReadyByVersion.get(versionId) ?? 0;
    const audioReady = audioReadyByVersion.get(versionId) ?? 0;
    const audioDurationS = audioDurationByVersion.get(versionId) ?? null;
    const imagesReady = imagesReadyByVersion.get(versionId) ?? 0;
    const jobs = jobCountsByVersion.get(versionId) ?? createEmptyJobCounts();
    const hasInvalidatingGeneration = jobs.blocks.pending + jobs.blocks.running + jobs.audio.pending + jobs.audio.running + jobs.images.pending + jobs.images.running > 0;
    const finalVideoReady = (finalVideoReadyByVersion.get(versionId) ?? false) && !hasInvalidatingGeneration;
    return {
      videoId: lesson.id,
      sectionId: lesson.sectionId,
      videoVersionId: versionId,
      blocksTotal,
      blocksReady,
      audioReady,
      audioDurationS,
      imagesReady,
      finalVideoReady,
      progressPercent: progressFromParts(blocksReady, audioReady, imagesReady, blocksTotal, finalVideoReady),
      jobs
    };
  });
}

async function buildCourseDetailedStatus(channelId: string, workspaceId?: string) {
  if (workspaceId) {
    const course = await prisma.channel.findFirst({
      where: { id: channelId, workspaceId },
      select: { id: true }
    });
    if (!course) return null;
  }
  const modules = await prisma.section.findMany({
    where: { channelId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, order: true }
  });
  const lessons = await prisma.video.findMany({
    where: { sectionId: { in: modules.map((item) => item.id) } },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, sectionId: true, order: true, title: true }
  });
  const lessonSnapshots = await buildLessonSnapshotsByCourse(channelId);
  const lessonSnapshotMap = new Map(lessonSnapshots.map((item) => [item.videoId, item]));

  const modulesOut = modules.map((module) => {
    const moduleLessons = lessons
      .filter((lesson) => lesson.sectionId === module.id)
      .map((lesson) => {
        const snapshot = lessonSnapshotMap.get(lesson.id);
        return {
          videoId: lesson.id,
          title: lesson.title,
          order: lesson.order,
          videoVersionId: snapshot?.videoVersionId ?? null,
          blocks: {
            total: snapshot?.blocksTotal ?? 0,
            ready: snapshot?.blocksReady ?? 0
          },
          audio: {
            ready: snapshot?.audioReady ?? 0,
            durationS: snapshot?.audioDurationS ?? null
          },
          images: { ready: snapshot?.imagesReady ?? 0 },
          finalVideoReady: snapshot?.finalVideoReady ?? false,
          progressPercent: snapshot?.progressPercent ?? 0,
          jobs: snapshot?.jobs ?? createEmptyJobCounts()
        };
      });
    const progressPercent = moduleLessons.length > 0 ? Math.round(moduleLessons.reduce((sum, lesson) => sum + lesson.progressPercent, 0) / moduleLessons.length) : 0;
    const jobs = moduleLessons.reduce((acc, lesson) => mergeJobCounts(acc, lesson.jobs), createEmptyJobCounts());
    return {
      sectionId: module.id,
      name: module.name,
      order: module.order,
      progressPercent,
      jobs,
      videos: moduleLessons
    };
  });

  const courseProgressPercent = modulesOut.length > 0 ? Math.round(modulesOut.reduce((sum, module) => sum + module.progressPercent, 0) / modulesOut.length) : 0;
  const jobs = modulesOut.reduce((acc, module) => mergeJobCounts(acc, module.jobs), createEmptyJobCounts());
  return {
    channelId,
    progressPercent: courseProgressPercent,
    jobs,
    sections: modulesOut
  };
}

async function buildCourseBuildSummaries(courseIds: string[], workspaceId?: string) {
  const output: Record<string, { progressPercent: number; jobs: BuildJobCounts }> = {};
  await Promise.all(
    courseIds.map(async (channelId) => {
      const detailed = await buildCourseDetailedStatus(channelId, workspaceId);
      if (!detailed) return;
      output[channelId] = {
        progressPercent: detailed.progressPercent,
        jobs: detailed.jobs
      };
    })
  );
  return output;
}

type DashboardRangeKey = "7d" | "30d" | "90d";

const DASHBOARD_RANGE_DAYS: Record<DashboardRangeKey, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90
};

const resolveDashboardRange = (raw?: string): { key: DashboardRangeKey; label: string; since: Date } => {
  const normalized = (raw ?? "").trim().toLowerCase();
  const key: DashboardRangeKey = normalized === "7d" || normalized === "90d" || normalized === "30d" ? normalized : "30d";
  const days = DASHBOARD_RANGE_DAYS[key];
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return {
    key,
    label: `last ${days} days`,
    since
  };
};

const toFiniteNumber = (value: number | bigint | null | undefined): number => {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
};

const getDiskStats = (
  targetPath: string
): {
  totalBytes: number | null;
  freeBytes: number | null;
  usedPercentOfDisk: number | null;
} => {
  const statfsSync = (fs as typeof fs & { statfsSync?: (path: string) => unknown }).statfsSync;
  if (typeof statfsSync !== "function") {
    return { totalBytes: null, freeBytes: null, usedPercentOfDisk: null };
  }
  try {
    const raw = statfsSync(targetPath) as {
      bsize?: number | bigint;
      frsize?: number | bigint;
      blocks?: number | bigint;
      bfree?: number | bigint;
      bavail?: number | bigint;
    };
    const blockSize = toFiniteNumber(raw.frsize ?? raw.bsize);
    const blocks = toFiniteNumber(raw.blocks);
    const availableBlocks = toFiniteNumber(raw.bavail ?? raw.bfree);
    const totalBytes = blockSize > 0 && blocks > 0 ? blockSize * blocks : null;
    const freeBytes = blockSize > 0 ? blockSize * Math.max(0, availableBlocks) : null;
    const usedPercentOfDisk = totalBytes && totalBytes > 0 && freeBytes != null ? Math.max(0, Math.min(100, Math.round(((totalBytes - freeBytes) / totalBytes) * 100))) : null;
    return { totalBytes, freeBytes, usedPercentOfDisk };
  } catch {
    return { totalBytes: null, freeBytes: null, usedPercentOfDisk: null };
  }
};

async function buildDashboardMetrics(range: { key: DashboardRangeKey; label: string; since: Date }, workspaceId: string) {
  const [totalCourses, totalLessons, rangeCourses, rangeLessons, versions, assets] = await Promise.all([
    prisma.channel.count({ where: { workspaceId } }),
    prisma.video.count({ where: { section: { channel: { workspaceId } } } }),
    prisma.channel.count({
      where: { workspaceId, createdAt: { gte: range.since } }
    }),
    prisma.video.count({
      where: {
        createdAt: { gte: range.since },
        section: { channel: { workspaceId } }
      }
    }),
    prisma.videoVersion.findMany({
      where: { video: { section: { channel: { workspaceId } } } },
      orderBy: [{ videoId: "asc" }, { createdAt: "desc" }],
      select: { id: true, videoId: true, createdAt: true }
    }),
    prisma.asset.findMany({
      where: {
        block: {
          videoVersion: { video: { section: { channel: { workspaceId } } } }
        }
      },
      select: { path: true, createdAt: true }
    })
  ]);

  const latestVersionByLesson = new Map<string, { id: string; createdAt: Date }>();
  for (const version of versions) {
    if (!latestVersionByLesson.has(version.videoId)) {
      latestVersionByLesson.set(version.videoId, {
        id: version.id,
        createdAt: version.createdAt
      });
    }
  }
  const latestVersions = Array.from(latestVersionByLesson.values());
  const latestVersionIds = latestVersions.map((item) => item.id);

  const durationByVersionId = new Map<string, number>();
  const rangeDurationByVersionId = new Map<string, number>();
  let databaseAudioCount = 0;
  let databaseDurationSeconds = 0;
  if (latestVersionIds.length > 0) {
    const audioAssets = await prisma.asset.findMany({
      where: {
        kind: "audio_raw",
        block: { videoVersionId: { in: latestVersionIds } }
      },
      select: {
        blockId: true,
        createdAt: true,
        path: true,
        block: {
          select: {
            videoVersionId: true,
            audioDurationS: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    const latestAssetByBlock = new Map<
      string,
      {
        createdAt: Date;
        path: string;
        videoVersionId: string;
        audioDurationS: number | null;
      }
    >();
    for (const item of audioAssets) {
      if (latestAssetByBlock.has(item.blockId)) continue;
      latestAssetByBlock.set(item.blockId, {
        createdAt: item.createdAt,
        path: item.path,
        videoVersionId: item.block.videoVersionId,
        audioDurationS: item.block.audioDurationS
      });
    }

    latestAssetByBlock.forEach((item) => {
      const duration = item.audioDurationS;
      if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) return;
      databaseAudioCount += 1;
      databaseDurationSeconds += duration;
      const resolvedPath = path.resolve(item.path);
      if (!fs.existsSync(resolvedPath)) return;
      durationByVersionId.set(item.videoVersionId, (durationByVersionId.get(item.videoVersionId) ?? 0) + duration);
      if (item.createdAt >= range.since) {
        rangeDurationByVersionId.set(item.videoVersionId, (rangeDurationByVersionId.get(item.videoVersionId) ?? 0) + duration);
      }
    });
  }

  let totalContentSeconds = 0;
  let rangeContentSeconds = 0;
  latestVersions.forEach((item) => {
    totalContentSeconds += durationByVersionId.get(item.id) ?? 0;
    rangeContentSeconds += rangeDurationByVersionId.get(item.id) ?? 0;
  });

  const assetByPath = new Map<string, { size: number; latestCreatedAtMs: number }>();
  for (const asset of assets) {
    const rawPath = asset.path?.trim();
    if (!rawPath) continue;
    const resolvedPath = path.resolve(rawPath);
    if (!fs.existsSync(resolvedPath)) continue;
    let size = 0;
    try {
      size = fs.statSync(resolvedPath).size;
    } catch {
      continue;
    }
    const createdAtMs = asset.createdAt.getTime();
    const current = assetByPath.get(resolvedPath);
    if (!current) {
      assetByPath.set(resolvedPath, { size, latestCreatedAtMs: createdAtMs });
      continue;
    }
    current.latestCreatedAtMs = Math.max(current.latestCreatedAtMs, createdAtMs);
    current.size = size;
  }

  let storageUsedBytes = 0;
  let rangeStorageBytes = 0;
  const rangeStartMs = range.since.getTime();
  assetByPath.forEach((entry) => {
    storageUsedBytes += entry.size;
    if (entry.latestCreatedAtMs >= rangeStartMs) {
      rangeStorageBytes += entry.size;
    }
  });

  const baselineInventory: InventoryMetrics = {
    audioCount: Math.max(0, Math.trunc(databaseAudioCount)),
    durationSeconds: Math.max(0, databaseDurationSeconds),
    diskUsageBytes: Math.max(0, Math.trunc(storageUsedBytes))
  };
  const reconciliation = reconcileWorkspaceInventory(workspaceId, baselineInventory);
  const reconciledStorageUsedBytes = reconciliation.reconciled.diskUsageBytes;

  const diskStats = getDiskStats(config.dataDir);
  const storageUsedPercentOfFree = diskStats.freeBytes && diskStats.freeBytes > 0 ? Math.max(0, Math.min(100, Math.round((reconciledStorageUsedBytes / diskStats.freeBytes) * 100))) : null;

  return {
    range: {
      key: range.key,
      label: range.label,
      since: range.since.toISOString(),
      until: new Date().toISOString()
    },
    totals: {
      courses: totalCourses,
      videos: totalLessons,
      audioCount: reconciliation.reconciled.audioCount,
      contentSeconds: reconciliation.reconciled.durationSeconds,
      storageUsedBytes: reconciledStorageUsedBytes
    },
    growth: {
      courses: rangeCourses,
      videos: rangeLessons,
      contentSeconds: rangeContentSeconds,
      storageUsedBytes: rangeStorageBytes
    },
    disk: {
      totalBytes: diskStats.totalBytes,
      freeBytes: diskStats.freeBytes,
      usedPercentOfDisk: diskStats.usedPercentOfDisk,
      storageUsedPercentOfFree
    },
    inventoryReconciliation: reconciliation.state
  };
}

fastify.get(
  "/dashboard/metrics",
  {
    schema: {
      tags: ["Courses"],
      summary: "Métricas do dashboard",
      description: "Retorna métricas agregadas para o dashboard (cursos, lições, jobs)",
      response: {
        200: {
          type: "object",
          description: "Snapshot de métricas agregadas por período",
          required: ["range", "totals", "growth", "disk"],
          properties: {
            range: {
              type: "object",
              required: ["key", "label", "since", "until"],
              properties: {
                key: { type: "string", enum: ["7d", "30d", "90d"] },
                label: { type: "string" },
                since: { type: "string" },
                until: { type: "string" }
              }
            },
            totals: {
              type: "object",
              required: ["courses", "videos", "audioCount", "contentSeconds", "storageUsedBytes"],
              properties: {
                courses: { type: "number" },
                videos: { type: "number" },
                audioCount: { type: "number" },
                contentSeconds: { type: "number" },
                storageUsedBytes: { type: "number" }
              }
            },
            growth: {
              type: "object",
              required: ["courses", "videos", "contentSeconds", "storageUsedBytes"],
              properties: {
                courses: { type: "number" },
                videos: { type: "number" },
                contentSeconds: { type: "number" },
                storageUsedBytes: { type: "number" }
              }
            },
            disk: {
              type: "object",
              required: ["totalBytes", "freeBytes", "usedPercentOfDisk", "storageUsedPercentOfFree"],
              properties: {
                totalBytes: { type: ["number", "null"] },
                freeBytes: { type: ["number", "null"] },
                usedPercentOfDisk: { type: ["number", "null"] },
                storageUsedPercentOfFree: { type: ["number", "null"] }
              }
            },
            inventoryReconciliation: {
              type: "object",
              required: [
                "workspaceId",
                "source",
                "mismatchDetected",
                "inconsistencyEvents",
                "lastDetectedAt",
                "baseline",
                "reconciled",
                "workerSnapshot",
                "diff",
                "updatedAt"
              ],
              properties: {
                workspaceId: { type: "string" },
                source: { type: "string", enum: ["worker_snapshot", "database_baseline"] },
                mismatchDetected: { type: "boolean" },
                inconsistencyEvents: { type: "number" },
                lastDetectedAt: { type: ["string", "null"] },
                baseline: {
                  type: "object",
                  required: ["audioCount", "durationSeconds", "diskUsageBytes"],
                  properties: {
                    audioCount: { type: "number" },
                    durationSeconds: { type: "number" },
                    diskUsageBytes: { type: "number" }
                  }
                },
                reconciled: {
                  type: "object",
                  required: ["audioCount", "durationSeconds", "diskUsageBytes"],
                  properties: {
                    audioCount: { type: "number" },
                    durationSeconds: { type: "number" },
                    diskUsageBytes: { type: "number" }
                  }
                },
                workerSnapshot: {
                  anyOf: [
                    { type: "null" },
                    {
                      type: "object",
                      required: ["audioCount", "durationSeconds", "diskUsageBytes"],
                      properties: {
                        audioCount: { type: "number" },
                        durationSeconds: { type: "number" },
                        diskUsageBytes: { type: "number" }
                      }
                    }
                  ]
                },
                diff: {
                  type: "object",
                  required: ["audioCount", "durationSeconds", "diskUsageBytes"],
                  properties: {
                    audioCount: { type: "number" },
                    durationSeconds: { type: "number" },
                    diskUsageBytes: { type: "number" }
                  }
                },
                updatedAt: { type: "string" }
              }
            }
          }
        }
      }
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const query = request.query as { range?: string };
    const resolvedRange = resolveDashboardRange(query?.range);
    return buildDashboardMetrics(resolvedRange, auth.scope.workspaceId);
  }
);

fastify.get(
  "/courses",
  {
    schema: {
      tags: ["Courses"],
      summary: "Lista todos os cursos",
      description: "Retorna a lista de todos os cursos cadastrados"
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const courses = await prisma.channel.findMany({
      where: { workspaceId: auth.scope.workspaceId },
      orderBy: { createdAt: "desc" },
      include: {
        sections: {
          select: {
            _count: {
              select: {
                videos: true
              }
            }
          }
        }
      }
    });
    const summaryMap = await buildCourseBuildSummaries(
      courses.map((item) => item.id),
      auth.scope.workspaceId
    );
    return courses.map((course) => ({
      ...course,
      modulesCount: course.sections.length,
      lessonsCount: course.sections.reduce((total, moduleItem) => total + moduleItem._count.videos, 0),
      build: summaryMap[course.id] ?? {
        progressPercent: 0,
        jobs: createEmptyJobCounts()
      }
    }));
  }
);

fastify.get(
  "/courses/:channelId/build-status",
  {
    schema: {
      tags: ["Courses"],
      summary: "Status de build do curso",
      description: "Retorna o status detalhado de geração/build do curso",
      response: {
        200: {
          type: "object",
          description: "Status detalhado de geração do curso",
          additionalProperties: true
        },
        404: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const { channelId } = request.params as { channelId: string };
    const course = await prisma.channel.findFirst({
      where: { id: channelId, workspaceId: auth.scope.workspaceId }
    });
    if (!course) {
      return reply.code(404).send({ error: "course not found" });
    }
    const detailed = await buildCourseDetailedStatus(channelId, auth.scope.workspaceId);
    return reply.code(200).send(detailed);
  }
);

const COURSE_STATUS_VALUES = new Set(["draft", "active", "archived"]);
const HOTMART_PRODUCT_LANGUAGE_VALUES = new Set(["PT_BR", "ES", "EN", "FR", "PT_PT", "RU", "AR", "DE", "JA", "IT"]);
const KIWIFY_EMAIL_LANGUAGE_VALUES = new Set(["PT", "EN", "ES"]);
const MAX_MIX_GAIN = Math.pow(10, 6 / 20);
const COURSE_CATEGORY_VALUES = new Set([
  "HEALTH_SPORTS",
  "FINANCE_INVESTMENTS",
  "RELATIONSHIPS",
  "BUSINESS_CAREER",
  "SPIRITUALITY",
  "SEXUALITY",
  "ENTERTAINMENT",
  "COOKING_GASTRONOMY",
  "LANGUAGES",
  "LAW",
  "APPS_SOFTWARE",
  "LITERATURE",
  "HOME_CONSTRUCTION",
  "PERSONAL_DEVELOPMENT",
  "FASHION_BEAUTY",
  "ANIMALS_PLANTS",
  "EDUCATIONAL",
  "HOBBIES",
  "DESIGN",
  "INTERNET",
  "ECOLOGY_ENVIRONMENT",
  "MUSIC_ARTS",
  "INFORMATION_TECHNOLOGY",
  "DIGITAL_ENTREPRENEURSHIP",
  "OTHERS"
]);

const normalizeOptionalText = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeCourseWriteInput = (
  body: unknown
):
  | {
      name: string;
      description?: string;
      categoryId?: string;
      productLanguage?: string;
      emailLanguage?: string;
      primarySalesCountry?: string;
      salesPageUrl?: string;
      imageAssetId?: string;
      status: "draft" | "active" | "archived";
    }
  | { error: string } => {
  const payload = (body ?? {}) as Record<string, unknown>;
  const name = normalizeOptionalText(payload.name);
  if (!name) return { error: "name is required" };

  const statusInput = normalizeOptionalText(payload.status) ?? "draft";
  if (!COURSE_STATUS_VALUES.has(statusInput)) {
    return { error: "status must be one of: draft, active, archived" };
  }
  const productLanguage = normalizeOptionalText(payload.productLanguage);
  if (productLanguage && !HOTMART_PRODUCT_LANGUAGE_VALUES.has(productLanguage)) {
    return {
      error: "productLanguage must be one of: PT_BR, ES, EN, FR, PT_PT, RU, AR, DE, JA, IT"
    };
  }
  const emailLanguage = normalizeOptionalText(payload.emailLanguage);
  if (emailLanguage && !KIWIFY_EMAIL_LANGUAGE_VALUES.has(emailLanguage)) {
    return { error: "emailLanguage must be one of: PT, EN, ES" };
  }
  const categoryId = normalizeOptionalText(payload.categoryId);
  if (categoryId && !COURSE_CATEGORY_VALUES.has(categoryId)) {
    return { error: "categoryId is invalid" };
  }

  return {
    name,
    description: normalizeOptionalText(payload.description),
    categoryId,
    productLanguage,
    emailLanguage,
    primarySalesCountry: normalizeOptionalText(payload.primarySalesCountry),
    salesPageUrl: normalizeOptionalText(payload.salesPageUrl),
    imageAssetId: normalizeOptionalText(payload.imageAssetId),
    status: statusInput as "draft" | "active" | "archived"
  };
};

async function buildRealtimeCoursePayload(channelId: string, workspaceId?: string) {
  const course = await prisma.channel.findFirst({
    where: workspaceId ? { id: channelId, workspaceId } : { id: channelId },
    include: {
      sections: {
        select: {
          _count: {
            select: {
              videos: true
            }
          }
        }
      }
    }
  });
  if (!course) return null;
  const summaryMap = await buildCourseBuildSummaries([channelId], workspaceId);
  const summary = summaryMap[channelId] ?? {
    progressPercent: 0,
    jobs: createEmptyJobCounts()
  };
  return {
    id: course.id,
    name: course.name,
    description: course.description,
    categoryId: course.categoryId,
    productLanguage: course.productLanguage,
    emailLanguage: course.emailLanguage,
    primarySalesCountry: course.primarySalesCountry,
    salesPageUrl: course.salesPageUrl,
    imageAssetId: course.imageAssetId,
    status: course.status,
    modulesCount: course.sections.length,
    lessonsCount: course.sections.reduce((total, moduleItem) => total + moduleItem._count.videos, 0),
    build: summary
  };
}

fastify.post(
  "/courses",
  {
    schema: {
      tags: ["Courses"],
      summary: "Cria um novo curso",
      description: "Cria um novo curso com os dados fornecidos"
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const normalized = normalizeCourseWriteInput(request.body);
    if ("error" in normalized) {
      return reply.code(400).send({ error: normalized.error });
    }
    const course = await prisma.channel.create({
      data: {
        ...normalized,
        workspaceId: auth.scope.workspaceId
      }
    });
    const coursePayload = await buildRealtimeCoursePayload(course.id, auth.scope.workspaceId);
    if (coursePayload) {
      broadcastEntityChanged({
        entity: "course",
        action: "created",
        channelId: course.id,
        channel: coursePayload,
        occurredAt: new Date().toISOString()
      });
    }
    return reply.code(201).send(course);
  }
);

fastify.patch(
  "/courses/:courseId",
  {
    schema: {
      tags: ["Courses"],
      summary: "Atualiza um curso",
      description: "Atualiza os dados de um curso existente"
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const { courseId } = request.params as { courseId: string };
    const normalized = normalizeCourseWriteInput(request.body);
    if ("error" in normalized) {
      return reply.code(400).send({ error: normalized.error });
    }
    const existing = await prisma.channel.findFirst({
      where: { id: courseId, workspaceId: auth.scope.workspaceId }
    });
    if (!existing) {
      return reply.code(404).send({ error: "course not found" });
    }
    const course = await prisma.channel.update({
      where: { id: courseId },
      data: normalized
    });
    const coursePayload = await buildRealtimeCoursePayload(course.id, auth.scope.workspaceId);
    if (coursePayload) {
      broadcastEntityChanged({
        entity: "course",
        action: "updated",
        channelId: course.id,
        channel: coursePayload,
        occurredAt: new Date().toISOString()
      });
    }
    return reply.code(200).send(course);
  }
);

fastify.delete(
  "/courses/:courseId",
  {
    schema: {
      tags: ["Courses"],
      summary: "Remove um curso",
      description: "Remove um curso e todos os seus módulos e lições"
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const { courseId } = request.params as { courseId: string };
    const result = await deleteCourseCascade(courseId, auth.scope.workspaceId);
    if (!result.deletedCourse) {
      return reply.code(404).send({ error: "course not found" });
    }
    broadcastEntityChanged({
      entity: "course",
      action: "deleted",
      channelId: courseId,
      occurredAt: new Date().toISOString()
    });
    return reply.code(200).send({ ok: true });
  }
);

fastify.get(
  "/courses/:channelId/modules",
  {
    schema: {
      tags: ["Modules"],
      summary: "Lista módulos de um curso",
      description: "Retorna todos os módulos de um curso específico"
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const { channelId } = request.params as { channelId: string };
    const course = await prisma.channel.findFirst({
      where: { id: channelId, workspaceId: auth.scope.workspaceId },
      select: { id: true }
    });
    if (!course) {
      return reply.code(404).send({ error: "course not found" });
    }
    return prisma.section.findMany({
      where: {
        channelId,
        workspaceId: auth.scope.workspaceId
      },
      orderBy: { order: "asc" }
    });
  }
);

fastify.post(
  "/courses/:channelId/modules",
  {
    schema: {
      tags: ["Modules"],
      summary: "Cria um módulo",
      description: "Cria um novo módulo dentro de um curso"
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const { channelId } = request.params as { channelId: string };
    const course = await prisma.channel.findFirst({
      where: { id: channelId, workspaceId: auth.scope.workspaceId },
      select: { id: true }
    });
    if (!course) {
      return reply.code(404).send({ error: "course not found" });
    }
    const body = request.body as { name?: string; order?: number };
    const name = body?.name?.trim();
    if (!name) {
      return reply.code(400).send({ error: "name is required" });
    }
    let order = body?.order;
    if (order === undefined || Number.isNaN(order)) {
      const count = await prisma.section.count({ where: { channelId } });
      order = count + 1;
    }
    const moduleRecord = await prisma.section.create({
      data: {
        workspaceId: auth.scope.workspaceId,
        channelId,
        name,
        order
      }
    });
    broadcastEntityChanged({
      entity: "module",
      action: "created",
      channelId,
      sectionId: moduleRecord.id,
      section: moduleRecord,
      occurredAt: new Date().toISOString()
    });
    const coursePayload = await buildRealtimeCoursePayload(channelId, auth.scope.workspaceId);
    if (coursePayload) {
      broadcastEntityChanged({
        entity: "course",
        action: "updated",
        channelId,
        channel: coursePayload,
        occurredAt: new Date().toISOString()
      });
    }
    return reply.code(201).send(moduleRecord);
  }
);

fastify.patch(
  "/modules/:moduleId",
  {
    schema: {
      tags: ["Modules"],
      summary: "Atualiza um módulo",
      description: "Atualiza os dados de um módulo existente"
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const { moduleId } = request.params as { moduleId: string };
    const body = request.body as { name?: string };
    const name = body?.name?.trim();
    if (!name) {
      return reply.code(400).send({ error: "name is required" });
    }
    const existing = await prisma.section.findFirst({
      where: {
        id: moduleId,
        workspaceId: auth.scope.workspaceId
      }
    });
    if (!existing) {
      return reply.code(404).send({ error: "module not found" });
    }
    const moduleRecord = await prisma.section.update({
      where: { id: moduleId },
      data: { name }
    });
    broadcastEntityChanged({
      entity: "module",
      action: "updated",
      channelId: existing.channelId,
      sectionId: moduleRecord.id,
      section: moduleRecord,
      occurredAt: new Date().toISOString()
    });
    return reply.code(200).send(moduleRecord);
  }
);

fastify.delete(
  "/modules/:moduleId",
  {
    schema: {
      tags: ["Modules"],
      summary: "Remove um módulo",
      description: "Remove um módulo e todas as suas lições"
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const { moduleId } = request.params as { moduleId: string };
    const existing = await prisma.section.findFirst({
      where: {
        id: moduleId,
        workspaceId: auth.scope.workspaceId
      },
      select: { channelId: true }
    });
    const result = await deleteModuleCascade(moduleId, auth.scope.workspaceId);
    if (!result.deletedModule) {
      return reply.code(404).send({ error: "module not found" });
    }
    broadcastEntityChanged({
      entity: "module",
      action: "deleted",
      sectionId: moduleId,
      channelId: existing?.channelId ?? null,
      occurredAt: new Date().toISOString()
    });
    if (existing?.channelId) {
      const coursePayload = await buildRealtimeCoursePayload(existing.channelId);
      if (coursePayload) {
        broadcastEntityChanged({
          entity: "course",
          action: "updated",
          channelId: existing.channelId,
          channel: coursePayload,
          occurredAt: new Date().toISOString()
        });
      }
    }
    return reply.code(200).send({ ok: true });
  }
);

fastify.patch(
  "/courses/:channelId/structure/reorder",
  {
    schema: {
      tags: ["Courses"],
      summary: "Reordena estrutura do curso",
      description: "Reordena módulos e lições dentro de um curso",
      response: {
        200: {
          type: "object",
          properties: {
            ok: { type: "boolean" }
          }
        },
        400: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        404: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const { channelId } = request.params as { channelId: string };
    const course = await prisma.channel.findFirst({
      where: { id: channelId, workspaceId: auth.scope.workspaceId },
      select: { id: true }
    });
    if (!course) {
      return reply.code(404).send({ error: "course not found" });
    }
    const body = request.body as
      | {
          modules?: Array<{
            sectionId?: string;
            lessonIds?: string[];
          }>;
        }
      | undefined;

    const payloadModules = (body?.modules ?? [])
      .map((item) => ({
        sectionId: item?.sectionId?.trim() ?? "",
        lessonIds: (item?.lessonIds ?? []).map((videoId) => videoId.trim()).filter(Boolean)
      }))
      .filter((item) => item.sectionId.length > 0);

    const existingModules = await prisma.section.findMany({
      where: { channelId },
      include: {
        videos: {
          select: { id: true }
        }
      }
    });

    if (payloadModules.length !== existingModules.length) {
      return reply.code(400).send({ error: "invalid module order payload" });
    }

    const payloadModuleIds = payloadModules.map((item) => item.sectionId);
    const payloadModuleIdSet = new Set(payloadModuleIds);
    if (payloadModuleIdSet.size !== payloadModuleIds.length) {
      return reply.code(400).send({ error: "duplicate module ids in payload" });
    }

    const existingModuleIds = existingModules.map((item) => item.id);
    const existingModuleIdSet = new Set(existingModuleIds);
    if (payloadModuleIds.some((sectionId) => !existingModuleIdSet.has(sectionId)) || existingModuleIds.some((sectionId) => !payloadModuleIdSet.has(sectionId))) {
      return reply.code(400).send({ error: "payload modules do not match course modules" });
    }

    const existingLessonIds = existingModules.flatMap((moduleItem) => moduleItem.videos.map((lessonItem) => lessonItem.id));
    const existingLessonIdSet = new Set(existingLessonIds);
    const payloadLessonIds = payloadModules.flatMap((moduleItem) => moduleItem.lessonIds);
    const payloadLessonIdSet = new Set(payloadLessonIds);

    if (payloadLessonIdSet.size !== payloadLessonIds.length) {
      return reply.code(400).send({ error: "duplicate lesson ids in payload" });
    }
    if (payloadLessonIds.some((videoId) => !existingLessonIdSet.has(videoId)) || existingLessonIds.some((videoId) => !payloadLessonIdSet.has(videoId))) {
      return reply.code(400).send({ error: "payload lessons do not match course lessons" });
    }

    await prisma.$transaction(async (tx) => {
      await Promise.all(
        payloadModules.map((moduleItem, index) =>
          tx.section.update({
            where: { id: moduleItem.sectionId },
            data: { order: index + 1 }
          })
        )
      );

      if (payloadLessonIds.length > 0) {
        await tx.video.updateMany({
          where: { id: { in: payloadLessonIds } },
          data: { order: { increment: 1000000 } }
        });
      }

      for (const moduleItem of payloadModules) {
        for (let index = 0; index < moduleItem.lessonIds.length; index += 1) {
          const videoId = moduleItem.lessonIds[index];
          await tx.video.update({
            where: { id: videoId },
            data: {
              sectionId: moduleItem.sectionId,
              order: index + 1
            }
          });
        }
      }
    });

    broadcastEntityChanged({
      entity: "course_structure",
      action: "reordered",
      channelId,
      sections: payloadModules,
      occurredAt: new Date().toISOString()
    });

    return reply.code(200).send({ ok: true });
  }
);

fastify.get(
  "/modules/:sectionId/lessons",
  {
    schema: {
      tags: ["Lessons"],
      summary: "Lista lições de um módulo",
      description: "Retorna todas as lições de um módulo específico"
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const { sectionId } = request.params as { sectionId: string };
    return prisma.video.findMany({
      where: {
        sectionId,
        workspaceId: auth.scope.workspaceId
      },
      orderBy: { order: "asc" }
    });
  }
);

fastify.post(
  "/modules/:sectionId/lessons",
  {
    schema: {
      tags: ["Lessons"],
      summary: "Cria uma lição",
      description: "Cria uma nova lição dentro de um módulo"
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const { sectionId } = request.params as { sectionId: string };
    const moduleRecord = await prisma.section.findFirst({
      where: {
        id: sectionId,
        workspaceId: auth.scope.workspaceId
      },
      select: { id: true }
    });
    if (!moduleRecord) {
      return reply.code(404).send({ error: "module not found" });
    }
    const body = request.body as { title?: string };
    const title = body?.title?.trim();
    if (!title) {
      return reply.code(400).send({ error: "title is required" });
    }
    const lessonCount = await prisma.video.count({
      where: {
        sectionId,
        workspaceId: auth.scope.workspaceId
      }
    });
    const lesson = await prisma.video.create({
      data: {
        workspaceId: auth.scope.workspaceId,
        sectionId,
        title,
        order: lessonCount + 1
      }
    });
    const moduleWithCourse = await prisma.section.findUnique({
      where: { id: sectionId },
      select: { channelId: true }
    });
    broadcastEntityChanged({
      entity: "lesson",
      action: "created",
      channelId: moduleWithCourse?.channelId ?? null,
      sectionId,
      videoId: lesson.id,
      lesson,
      occurredAt: new Date().toISOString()
    });
    if (moduleWithCourse?.channelId) {
      const coursePayload = await buildRealtimeCoursePayload(moduleWithCourse.channelId);
      if (coursePayload) {
        broadcastEntityChanged({
          entity: "course",
          action: "updated",
          channelId: moduleWithCourse.channelId,
          channel: coursePayload,
          occurredAt: new Date().toISOString()
        });
      }
    }
    return reply.code(201).send(lesson);
  }
);

fastify.get(
  "/lessons/:lessonId",
  {
    schema: {
      tags: ["Lessons"],
      summary: "Obtém uma lição",
      description: "Retorna os dados de uma lição específica"
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const { lessonId } = request.params as { lessonId: string };
    const lesson = await prisma.video.findFirst({
      where: {
        id: lessonId,
        workspaceId: auth.scope.workspaceId
      }
    });
    if (!lesson) {
      return reply.code(404).send({ error: "lesson not found" });
    }
    return lesson;
  }
);

fastify.patch(
  "/lessons/:lessonId",
  {
    schema: {
      tags: ["Lessons"],
      summary: "Atualiza uma lição",
      description: "Atualiza os dados de uma lição existente"
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const { lessonId } = request.params as { lessonId: string };
    const body = request.body as { title?: string };
    const title = body?.title?.trim();
    if (!title) {
      return reply.code(400).send({ error: "title is required" });
    }
    const existing = await prisma.video.findFirst({
      where: {
        id: lessonId,
        workspaceId: auth.scope.workspaceId
      }
    });
    if (!existing) {
      return reply.code(404).send({ error: "lesson not found" });
    }
    const lesson = await prisma.video.update({
      where: { id: lessonId },
      data: { title }
    });
    const moduleWithCourse = await prisma.section.findUnique({
      where: { id: lesson.sectionId },
      select: { channelId: true }
    });
    broadcastEntityChanged({
      entity: "lesson",
      action: "updated",
      channelId: moduleWithCourse?.channelId ?? null,
      sectionId: lesson.sectionId,
      videoId: lesson.id,
      lesson,
      occurredAt: new Date().toISOString()
    });
    return reply.code(200).send(lesson);
  }
);

fastify.delete(
  "/lessons/:lessonId",
  {
    schema: {
      tags: ["Lessons"],
      summary: "Remove uma lição",
      description: "Remove uma lição e todos os seus dados"
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const { lessonId } = request.params as { lessonId: string };
    const existing = await prisma.video.findFirst({
      where: {
        id: lessonId,
        workspaceId: auth.scope.workspaceId
      },
      select: {
        sectionId: true,
        section: {
          select: {
            channelId: true
          }
        }
      }
    });
    const result = await deleteLessonCascade(lessonId, auth.scope.workspaceId);
    if (!result.deletedLesson) {
      return reply.code(404).send({ error: "lesson not found" });
    }
    broadcastEntityChanged({
      entity: "lesson",
      action: "deleted",
      channelId: existing?.section?.channelId ?? null,
      sectionId: existing?.sectionId ?? null,
      videoId: lessonId,
      occurredAt: new Date().toISOString()
    });
    if (existing?.section?.channelId) {
      const coursePayload = await buildRealtimeCoursePayload(existing.section.channelId);
      if (coursePayload) {
        broadcastEntityChanged({
          entity: "course",
          action: "updated",
          channelId: existing.section.channelId,
          channel: coursePayload,
          occurredAt: new Date().toISOString()
        });
      }
    }
    return reply.code(200).send({ ok: true });
  }
);

fastify.get(
  "/lessons/:videoId/versions",
  {
    schema: {
      tags: ["Lessons"],
      summary: "Lista versões de uma lição",
      description: "Retorna todas as versões de uma lição"
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const { videoId } = request.params as { videoId: string };
    return prisma.videoVersion.findMany({
      where: {
        videoId,
        workspaceId: auth.scope.workspaceId
      },
      orderBy: { createdAt: "desc" }
    });
  }
);

fastify.post(
  "/lessons/:videoId/versions",
  {
    schema: {
      tags: ["Lessons"],
      summary: "Cria uma versão de lição",
      description: "Cria uma nova versão para uma lição existente",
      params: {
        type: "object",
        required: ["videoId"],
        properties: {
          videoId: { type: "string" }
        }
      },
      body: {
        type: "object",
        required: ["scriptText"],
        properties: {
          scriptText: {
            type: "string",
            description: "Texto-base da lição para segmentação em blocos"
          },
          speechRateWps: {
            type: "number",
            description: "Velocidade de fala estimada (palavras por segundo)",
            default: 2.5
          },
          preferredVoiceId: {
            type: "string",
            description: "Voz preferida para geração de áudio desta versão",
            nullable: true
          },
          preferredTemplateId: {
            type: "string",
            description: "Template de slide preferido para esta versão",
            nullable: true
          }
        }
      },
      response: {
        201: {
          type: "object",
          properties: {
            id: { type: "string" },
            videoId: { type: "string" },
            scriptText: { type: "string" },
            speechRateWps: { type: "number" },
            preferredVoiceId: { type: ["string", "null"] },
            preferredTemplateId: { type: ["string", "null"] },
            createdAt: { type: "string", format: "date-time" }
          }
        },
        400: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        404: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const { videoId } = request.params as { videoId: string };
    const body = request.body as {
      scriptText?: string;
      speechRateWps?: number;
      preferredVoiceId?: string;
      preferredTemplateId?: string;
    };
    const scriptText = body?.scriptText?.trim();
    if (!scriptText) {
      return reply.code(400).send({ error: "scriptText is required" });
    }
    const lessonScope = await prisma.video.findFirst({
      where: {
        id: videoId,
        workspaceId: auth.scope.workspaceId
      },
      select: { id: true }
    });
    if (!lessonScope) {
      return reply.code(404).send({ error: "lesson not found" });
    }
    const speechRateWps = typeof body?.speechRateWps === "number" && !Number.isNaN(body.speechRateWps) ? body.speechRateWps : 2.5;
    const preferredVoiceId = body?.preferredVoiceId?.trim() || null;
    const preferredTemplateId = body?.preferredTemplateId?.trim() || null;
    if (preferredTemplateId) {
      const template = await prisma.slideTemplate.findUnique({
        where: { id: preferredTemplateId }
      });
      if (!template || !template.isActive) {
        return reply.code(404).send({ error: "preferred template not found" });
      }
    }
    const version = await prisma.videoVersion.create({
      data: {
        workspaceId: auth.scope.workspaceId,
        videoId,
        scriptText,
        speechRateWps,
        preferredVoiceId,
        preferredTemplateId
      }
    });
    const lesson = await prisma.video.findUnique({
      where: { id: videoId },
      include: {
        section: {
          select: {
            channelId: true
          }
        }
      }
    });
    broadcastEntityChanged({
      entity: "lesson_version",
      action: "created",
      channelId: lesson?.section?.channelId ?? null,
      sectionId: lesson?.sectionId ?? null,
      videoId,
      videoVersionId: version.id,
      videoVersion: version,
      occurredAt: new Date().toISOString()
    });
    return reply.code(201).send(version);
  }
);

fastify.get(
  "/lesson-versions/:versionId/blocks",
  {
    schema: {
      tags: ["Lessons"],
      summary: "Lista blocos de uma versão",
      description: "Retorna todos os blocos de uma versão de lição"
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const { versionId } = request.params as { versionId: string };
    return prisma.block.findMany({
      where: {
        videoVersionId: versionId,
        workspaceId: auth.scope.workspaceId
      },
      orderBy: { index: "asc" }
    });
  }
);

fastify.patch(
  "/lesson-versions/:versionId/preferences",
  {
    schema: {
      tags: ["Lessons"],
      summary: "Atualiza preferências da versão da lição",
      description: "Atualiza voz e template preferidos para geração de assets da versão",
      params: {
        type: "object",
        required: ["versionId"],
        properties: {
          versionId: { type: "string" }
        }
      },
      body: {
        type: "object",
        properties: {
          preferredVoiceId: {
            type: ["string", "null"],
            description: "Voz preferida para TTS"
          },
          preferredTemplateId: {
            type: ["string", "null"],
            description: "Template preferido para slides/imagens"
          },
          voiceVolume: {
            type: ["number", "null"],
            description: "Volume da voz/TTS no mix final (0.0 a 1.0)"
          },
          masterVolume: {
            type: ["number", "null"],
            description: "Volume master do mix final (0.0 a 1.0+)"
          },
          bgmPath: {
            type: ["string", "null"],
            description: "Arquivo de música de fundo (relativo à biblioteca local)"
          },
          bgmVolume: {
            type: ["number", "null"],
            description: "Volume da música de fundo (0.0 a 1.0)"
          }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            id: { type: "string" },
            videoId: { type: "string" },
            preferredVoiceId: { type: ["string", "null"] },
            preferredTemplateId: { type: ["string", "null"] },
            voiceVolume: { type: ["number", "null"] },
            masterVolume: { type: ["number", "null"] },
            bgmPath: { type: ["string", "null"] },
            bgmVolume: { type: ["number", "null"] }
          }
        },
        404: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        410: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        503: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  },
  async (request, reply) => {
    const { versionId } = request.params as { versionId: string };
    const body = request.body as
      | {
          preferredVoiceId?: string | null;
          preferredTemplateId?: string | null;
          voiceVolume?: number | null;
          masterVolume?: number | null;
          bgmPath?: string | null;
          bgmVolume?: number | null;
        }
      | undefined;

    const existing = await prisma.videoVersion.findUnique({
      where: { id: versionId }
    });
    if (!existing) {
      return reply.code(404).send({ error: "lesson version not found" });
    }

    const preferredVoiceIdRaw = body?.preferredVoiceId;
    const preferredTemplateIdRaw = body?.preferredTemplateId;
    const voiceVolumeRaw = body?.voiceVolume;
    const masterVolumeRaw = body?.masterVolume;
    const bgmPathRaw = body?.bgmPath;
    const bgmVolumeRaw = body?.bgmVolume;
    const preferredVoiceId = typeof preferredVoiceIdRaw === "string" ? preferredVoiceIdRaw.trim() || null : (preferredVoiceIdRaw ?? undefined);
    const preferredTemplateId = typeof preferredTemplateIdRaw === "string" ? preferredTemplateIdRaw.trim() || null : (preferredTemplateIdRaw ?? undefined);
    const voiceVolume =
      typeof voiceVolumeRaw === "number" && Number.isFinite(voiceVolumeRaw)
        ? Math.max(0, Math.min(MAX_MIX_GAIN, voiceVolumeRaw))
        : (voiceVolumeRaw === null ? null : undefined);
    const masterVolume =
      typeof masterVolumeRaw === "number" && Number.isFinite(masterVolumeRaw)
        ? Math.max(0, Math.min(MAX_MIX_GAIN, masterVolumeRaw))
        : (masterVolumeRaw === null ? null : undefined);
    const bgmPath = typeof bgmPathRaw === "string" ? bgmPathRaw.trim() || null : (bgmPathRaw ?? undefined);
    const bgmVolume =
      typeof bgmVolumeRaw === "number" && Number.isFinite(bgmVolumeRaw)
        ? Math.max(0, Math.min(MAX_MIX_GAIN, bgmVolumeRaw))
        : (bgmVolumeRaw === null ? null : undefined);

    if (preferredVoiceId) {
      const provider = config.ttsProvider.toLowerCase();
      let voiceExists = false;
      if (provider === "xtts" || provider === "xtts_api") {
        try {
          voiceExists = await workerHasTtsVoice(existing.workspaceId, preferredVoiceId);
        } catch (err) {
          return reply.code(503).send({ error: (err as Error).message });
        }
      } else {
        const index = loadVoiceIndex(config.ttsVoicesIndex);
        voiceExists = index.voices.some((voice) => voice.id === preferredVoiceId);
      }
      if (!voiceExists) {
        request.log.warn(
          {
            route: "/lesson-versions/:versionId/preferences",
            versionId,
            preferredVoiceId,
            provider
          },
          "preferred voice id not found during preference save; accepting value for deferred validation"
        );
      }
    }

    if (preferredTemplateId) {
      const template = await prisma.slideTemplate.findUnique({
        where: { id: preferredTemplateId }
      });
      if (!template || !template.isActive) {
        return reply.code(404).send({ error: "preferred template not found" });
      }
    }

    if (bgmPath) {
      const bgmLibraryDir = path.resolve(config.dataDir, "bgm_library");
      const resolved = resolveBgmLibraryPath(bgmLibraryDir, bgmPath);
      if (!resolved || !fs.existsSync(resolved)) {
        return reply.code(404).send({ error: "bgm file not found" });
      }
    }

    const updated = await prisma.videoVersion.update({
      where: { id: versionId },
      data: {
        ...(preferredVoiceId !== undefined ? { preferredVoiceId } : {}),
        ...(preferredTemplateId !== undefined ? { preferredTemplateId } : {}),
        ...(voiceVolume !== undefined ? { voiceVolume } : {}),
        ...(masterVolume !== undefined ? { masterVolume } : {}),
        ...(bgmPath !== undefined ? { bgmPath } : {}),
        ...(bgmVolume !== undefined ? { bgmVolume } : {})
      }
    });

    return reply.code(200).send({
      id: updated.id,
      videoId: updated.videoId,
      preferredVoiceId: updated.preferredVoiceId,
      preferredTemplateId: updated.preferredTemplateId,
      voiceVolume: updated.voiceVolume,
      masterVolume: updated.masterVolume,
      bgmPath: updated.bgmPath,
      bgmVolume: updated.bgmVolume
    });
  }
);

function resolveBgmLibraryPath(baseDir: string, relativePath: string): string | null {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("\0")) return null;
  const base = path.resolve(baseDir);
  const resolved = path.resolve(base, normalized);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
    return null;
  }
  return resolved;
}

fastify.get(
  "/bgm/library",
  {
    schema: {
      tags: ["Lessons"],
      summary: "Lista músicas de fundo locais",
      response: {
        200: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  path: { type: "string" },
                  name: { type: "string" },
                  sizeBytes: { type: "number" },
                  ext: { type: "string" }
                }
              }
            }
          }
        }
      }
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const baseDir = path.resolve(config.dataDir, "bgm_library");
    const items: Array<{ path: string; name: string; sizeBytes: number; ext: string }> = [];
    try {
      const entries = fs.readdirSync(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (![".mp3", ".wav", ".m4a", ".ogg"].includes(ext)) continue;
        const fullPath = path.join(baseDir, entry.name);
        const stat = fs.statSync(fullPath);
        items.push({
          path: entry.name,
          name: path.parse(entry.name).name,
          sizeBytes: stat.size,
          ext
        });
      }
    } catch {
      // empty library is valid for MVP
    }
    items.sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
    return reply.code(200).send({ items });
  }
);

fastify.get(
  "/bgm/library/raw",
  {
    schema: {
      tags: ["Lessons"],
      summary: "Obtém arquivo de música de fundo",
      querystring: {
        type: "object",
        required: ["path"],
        properties: {
          path: { type: "string" }
        }
      },
      response: {
        404: {
          type: "object",
          properties: { error: { type: "string" } }
        }
      }
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const query = request.query as { path?: string };
    const baseDir = path.resolve(config.dataDir, "bgm_library");
    const resolved = resolveBgmLibraryPath(baseDir, query.path ?? "");
    if (!resolved || !fs.existsSync(resolved)) {
      return reply.code(404).send({ error: "bgm file not found" });
    }
    const stat = await fs.promises.stat(resolved).catch(() => null);
    if (!stat?.isFile()) {
      return reply.code(404).send({ error: "bgm file not found" });
    }
    const ext = path.extname(resolved).toLowerCase();
    reply.header("Content-Type", mimeTypeForAudio(ext));
    reply.header("Cache-Control", "no-store");
    reply.header("Content-Length", String(stat.size));
    return reply.send(fs.createReadStream(resolved));
  }
);

function findFirstFile(dirPath: string, exts: string[]): string | null {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (exts.includes(ext)) {
        return path.join(dirPath, entry.name);
      }
    }
  } catch {
    return null;
  }
  return null;
}

function mimeTypeForImage(ext: string): string {
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

function mimeTypeForAudio(ext: string): string {
  switch (ext) {
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".ogg":
      return "audio/ogg";
    case ".m4a":
      return "audio/mp4";
    default:
      return "application/octet-stream";
  }
}

// Slides are served strictly from DB-registered assets.

async function resolveBlockContext(blockId: string) {
  return prisma.block.findUnique({
    where: { id: blockId },
    include: {
      videoVersion: {
        include: {
          video: {
            include: {
              section: {
                include: {
                  channel: true
                }
              }
            }
          }
        }
      }
    }
  });
}

fastify.get(
  "/blocks/:blockId/image/raw",
  {
    schema: {
      tags: ["Slides"],
      summary: "Obtém imagem raw de um bloco",
      description: "Retorna a imagem gerada para um bloco específico",
      response: {
        404: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        410: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        503: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  },
  async (request, reply) => {
    try {
      const auth = await getAuthenticatedScope(request, reply);
      if (!auth) return;
      const { blockId } = request.params as { blockId: string };
      const agentSession = getConnectedAgentForWorkspace(auth.scope.workspaceId);
      if (!agentSession) {
        return reply.code(503).send({ error: "agent_offline" });
      }
      const upstream = await requestAgentWorkerCommand(agentSession, "block_image_raw_get", { blockId });
      if (upstream.statusCode !== 200) {
        const statusCode = upstream.statusCode === 404 ? 404 : 503;
        return reply.code(statusCode).send({ error: String(upstream.data.error ?? "image not found") });
      }
      const bodyBase64 = typeof upstream.data.bodyBase64 === "string" ? upstream.data.bodyBase64 : "";
      if (!bodyBase64) {
        return reply.code(404).send({ error: "image not found" });
      }
      const contentType = typeof upstream.data.contentType === "string" ? upstream.data.contentType : "application/octet-stream";
      reply.header("Content-Type", contentType);
      reply.header("Cache-Control", "no-store");
      return reply.send(Buffer.from(bodyBase64, "base64"));
    } catch (err) {
      return reply.code(503).send({ error: (err as Error).message });
    }
  }
);

fastify.get(
  "/blocks/:blockId/audio/raw",
  {
    schema: {
      tags: ["Voices"],
      summary: "Obtém áudio raw de um bloco",
      description: "Retorna o áudio TTS gerado para um bloco específico",
      response: {
        200: {
          type: "string",
          format: "binary"
        },
        206: {
          type: "string",
          format: "binary"
        },
        404: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        416: {
          type: "object",
          properties: {}
        },
        503: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  },
  async (request, reply) => {
    try {
      const auth = await getAuthenticatedScope(request, reply);
      if (!auth) return;
      const { blockId } = request.params as { blockId: string };
      const agentSession = getConnectedAgentForWorkspace(auth.scope.workspaceId);
      if (!agentSession) {
        return reply.code(503).send({ error: "agent_offline" });
      }
      const range = typeof request.headers.range === "string" ? request.headers.range : undefined;
      const upstream = await requestAgentWorkerCommand(agentSession, "block_audio_raw_get", {
        blockId,
        range
      });
      if (upstream.statusCode === 404) {
        return reply.code(404).send({ error: String(upstream.data.error ?? "audio not found") });
      }
      if (upstream.statusCode === 416) {
        if (typeof upstream.data.contentRange === "string") {
          reply.header("Content-Range", upstream.data.contentRange);
        }
        return reply.code(416).send();
      }
      if (upstream.statusCode !== 200 && upstream.statusCode !== 206) {
        return reply.code(503).send({
          error: String(upstream.data.error ?? "agent_response_invalid")
        });
      }
      const bodyBase64 = typeof upstream.data.bodyBase64 === "string" ? upstream.data.bodyBase64 : "";
      if (!bodyBase64) {
        return reply.code(404).send({ error: "audio not found" });
      }
      const contentType = typeof upstream.data.contentType === "string" ? upstream.data.contentType : "application/octet-stream";
      reply.header("Content-Type", contentType);
      reply.header("Cache-Control", "no-store");
      reply.header("Accept-Ranges", "bytes");
      if (typeof upstream.data.contentRange === "string") {
        reply.header("Content-Range", upstream.data.contentRange);
      }
      if (typeof upstream.data.contentLength === "number") {
        reply.header("Content-Length", String(upstream.data.contentLength));
      }
      return reply.code(upstream.statusCode).send(Buffer.from(bodyBase64, "base64"));
    } catch (err) {
      return reply.code(503).send({ error: (err as Error).message });
    }
  }
);

fastify.get(
  "/lesson-versions/:versionId/final-video",
  {
    schema: {
      tags: ["Lessons"],
      summary: "Obtém vídeo final de uma versão",
      description: "Retorna o vídeo final renderizado de uma versão de lição",
      response: {
        200: { type: "string", format: "binary" },
        206: { type: "string", format: "binary" },
        404: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        416: {
          type: "object",
          additionalProperties: true
        },
        410: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        503: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  },
  async (request, reply) => {
    try {
      const auth = await getAuthenticatedScope(request, reply);
      if (!auth) return;
      const { versionId } = request.params as { versionId: string };
      const range = typeof request.headers.range === "string" ? request.headers.range : undefined;
      const agentSession = getConnectedAgentForWorkspace(auth.scope.workspaceId);
      if (!agentSession) {
        return reply.code(503).send({ error: "agent_offline" });
      }
      const upstream = await requestAgentWorkerCommand(agentSession, "lesson_version_final_video_get", {
        versionId,
        range
      });
      if (upstream.statusCode === 404) {
        return reply.code(404).send({
          error: String(upstream.data.error ?? "final video not found")
        });
      }
      if (upstream.statusCode === 416) {
        if (typeof upstream.data.contentRange === "string") {
          reply.header("Content-Range", upstream.data.contentRange);
        }
        return reply.code(416).send();
      }
      if (upstream.statusCode !== 200 && upstream.statusCode !== 206) {
        return reply.code(503).send({
          error: String(upstream.data.error ?? "agent_response_invalid")
        });
      }
      const bodyBase64 = typeof upstream.data.bodyBase64 === "string" ? upstream.data.bodyBase64 : "";
      if (!bodyBase64) {
        return reply.code(404).send({ error: "final video not found" });
      }
      const contentType = typeof upstream.data.contentType === "string" ? upstream.data.contentType : "video/mp4";
      reply.header("Content-Type", contentType);
      reply.header("Cache-Control", "no-store");
      reply.header("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges, Content-Type");
      reply.header("Accept-Ranges", "bytes");
      if (typeof upstream.data.contentRange === "string") {
        reply.header("Content-Range", upstream.data.contentRange);
      }
      if (typeof upstream.data.contentLength === "number") {
        reply.header("Content-Length", String(upstream.data.contentLength));
      }
      return reply.code(upstream.statusCode).send(Buffer.from(bodyBase64, "base64"));
    } catch (err) {
      return reply.code(503).send({ error: (err as Error).message });
    }
  }
);

fastify.get(
  "/blocks/:blockId/slide",
  {
    schema: {
      tags: ["Slides"],
      summary: "Obtém slide de um bloco",
      description: "Retorna o slide renderizado de um bloco específico",
      response: {
        400: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        404: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        410: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        503: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  },
  async (_request, reply) => {
    return reply.code(410).send({ error: "slides_disabled_in_mvp" });
  }
);

async function resolveTemplateByKind(kind: string) {
  return prisma.slideTemplate.findFirst({
    where: { isActive: true, kind },
    orderBy: { createdAt: "asc" }
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const resolveDataPath = (targetPath: string): string => {
  const base = path.resolve(config.dataDir);
  const absolute = path.isAbsolute(targetPath) ? path.resolve(targetPath) : path.resolve(base, targetPath);
  const relative = path.relative(base, absolute);
  // Guard against deleting files outside dataDir.
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return "";
  }
  return absolute;
};

const unlinkIfExists = async (targetPath: string | null | undefined): Promise<boolean> => {
  if (!targetPath) return false;
  const resolved = resolveDataPath(targetPath);
  if (!resolved) return false;
  try {
    await fs.promises.unlink(resolved);
    return true;
  } catch {
    // ignore missing/locked files in best-effort rollback cleanup
    return false;
  }
};

const pruneEmptyParentDirs = async (targetPath: string | null | undefined): Promise<void> => {
  if (!targetPath) return;
  const resolved = resolveDataPath(targetPath);
  if (!resolved) return;
  const dataRoot = path.resolve(config.dataDir);
  let currentDir = path.dirname(resolved);
  while (currentDir.startsWith(dataRoot) && currentDir !== dataRoot) {
    try {
      const entries = await fs.promises.readdir(currentDir);
      if (entries.length > 0) break;
      await fs.promises.rmdir(currentDir);
      currentDir = path.dirname(currentDir);
    } catch {
      break;
    }
  }
};

const cancelPendingAndRunningJobs = async (where: Parameters<typeof prisma.job.updateMany>[0]["where"]) => {
  const now = new Date();
  await prisma.job.updateMany({
    where: {
      ...where,
      status: { in: ["pending", "running"] }
    },
    data: {
      status: "canceled",
      canceledAt: now,
      leaseExpiresAt: now,
      error: "canceled by cascade delete"
    }
  });
};

async function invalidateFinalVideoForLessonVersion(videoVersionId: string, reason: string): Promise<void> {
  const assets = await prisma.asset.findMany({
    where: {
      kind: "final_mp4",
      block: { videoVersionId }
    },
    select: { id: true, path: true }
  });
  if (assets.length === 0) return;

  for (const asset of assets) {
    await unlinkIfExists(asset.path);
    await pruneEmptyParentDirs(asset.path);
  }
  await prisma.asset.deleteMany({
    where: { id: { in: assets.map((item) => item.id) } }
  });

  fastify.log.info({ videoVersionId, reason, deletedFinalVideos: assets.length }, "Final video invalidated");
}

async function deleteLessonCascade(videoId: string, workspaceId?: string): Promise<{ deletedLesson: boolean }> {
  const lesson = await prisma.video.findFirst({
    where: workspaceId ? { id: videoId, workspaceId } : { id: videoId },
    select: { id: true }
  });
  if (!lesson) return { deletedLesson: false };

  const versions = await prisma.videoVersion.findMany({
    where: workspaceId ? { videoId, workspaceId } : { videoId },
    select: { id: true }
  });
  const versionIds = versions.map((item) => item.id);
  if (versionIds.length > 0) {
    await cancelPendingAndRunningJobs({
      OR: [{ videoVersionId: { in: versionIds } }, { block: { videoVersionId: { in: versionIds } } }]
    });

    const blocks = await prisma.block.findMany({
      where: { videoVersionId: { in: versionIds } },
      select: { id: true }
    });
    const blockIds = blocks.map((item) => item.id);

    if (blockIds.length > 0) {
      const assets = await prisma.asset.findMany({
        where: { blockId: { in: blockIds } },
        select: { id: true, path: true }
      });
      for (const asset of assets) {
        await unlinkIfExists(asset.path);
        await pruneEmptyParentDirs(asset.path);
      }
      await prisma.asset.deleteMany({
        where: { id: { in: assets.map((item) => item.id) } }
      });
      await prisma.job.deleteMany({ where: { blockId: { in: blockIds } } });
      await prisma.block.deleteMany({ where: { id: { in: blockIds } } });
    }

    await prisma.job.deleteMany({
      where: { videoVersionId: { in: versionIds } }
    });
    await prisma.videoVersion.deleteMany({
      where: { id: { in: versionIds } }
    });
  }

  await prisma.notification.deleteMany({
    where: workspaceId ? { videoId: videoId, workspaceId } : { videoId: videoId }
  });
  await prisma.video.delete({ where: { id: videoId } });
  return { deletedLesson: true };
}

async function deleteModuleCascade(sectionId: string, workspaceId?: string): Promise<{ deletedModule: boolean; deletedLessons: number }> {
  const moduleRecord = await prisma.section.findFirst({
    where: workspaceId ? { id: sectionId, workspaceId } : { id: sectionId },
    select: { id: true }
  });
  if (!moduleRecord) return { deletedModule: false, deletedLessons: 0 };

  const lessons = await prisma.video.findMany({
    where: workspaceId ? { sectionId, workspaceId } : { sectionId },
    select: { id: true }
  });
  for (const lesson of lessons) {
    await deleteLessonCascade(lesson.id, workspaceId);
  }
  await prisma.section.delete({ where: { id: sectionId } });
  return { deletedModule: true, deletedLessons: lessons.length };
}

async function deleteCourseCascade(channelId: string, workspaceId?: string): Promise<{ deletedCourse: boolean; deletedModules: number }> {
  const course = await prisma.channel.findFirst({
    where: workspaceId ? { id: channelId, workspaceId } : { id: channelId },
    select: { id: true }
  });
  if (!course) return { deletedCourse: false, deletedModules: 0 };

  const modules = await prisma.section.findMany({
    where: workspaceId ? { channelId, workspaceId } : { channelId },
    select: { id: true }
  });
  for (const moduleItem of modules) {
    await deleteModuleCascade(moduleItem.id, workspaceId);
  }
  await prisma.channel.delete({ where: { id: channelId } });
  return { deletedCourse: true, deletedModules: modules.length };
}

async function emitPendingCourseBuildEvent(job: {
  id: string;
  status: string;
  type: string;
  videoVersionId: string | null;
  blockId: string | null;
  error: string | null;
  updatedAt: Date;
  requestId?: string | null;
}) {
  if (job.status !== "pending" || !job.videoVersionId) return;
  const lessonVersion = await prisma.videoVersion.findUnique({
    where: { id: job.videoVersionId },
    select: {
      videoId: true,
      video: {
        select: {
          sectionId: true,
          section: {
            select: {
              channelId: true
            }
          }
        }
      }
    }
  });
  const channelId = lessonVersion?.video?.section?.channelId ?? null;
  if (!channelId) return;
  const sectionId = lessonVersion?.video?.sectionId ?? null;
  const videoId = lessonVersion?.videoId ?? null;
  const correlationId = parseCorrelationId(job.requestId) ?? getActiveCorrelationId();
  await emitCourseBuildStatusEvent(channelId, {
    correlationId,
    jobId: job.id,
    status: job.status,
    type: job.type,
    sectionId,
    videoId,
    videoVersionId: job.videoVersionId,
    blockId: job.blockId,
    error: job.error,
    updatedAt: job.updatedAt
  });
}

async function emitCourseBuildStatusEvent(
  channelId: string,
  payload: {
    correlationId?: string | null;
    jobId?: string | null;
    status?: string | null;
    type?: string | null;
    sectionId?: string | null;
    videoId?: string | null;
    videoVersionId?: string | null;
    blockId?: string | null;
    lifecycle?: string | null;
    phase?: string | null;
    progressPercent?: number | null;
    error?: string | null;
    updatedAt?: Date | null;
  } = {}
) {
  let buildStatus: Awaited<ReturnType<typeof buildCourseDetailedStatus>> | null = null;
  try {
    buildStatus = await buildCourseDetailedStatus(channelId);
  } catch (err) {
    fastify.log.warn({ err, channelId }, "Failed to build course status for course job event");
  }
  broadcastJobEvent({
    correlationId: parseCorrelationId(payload.correlationId) ?? null,
    jobId: payload.jobId ?? null,
    status: payload.status ?? null,
    type: payload.type ?? null,
    channelId,
    sectionId: payload.sectionId ?? null,
    videoId: payload.videoId ?? null,
    videoVersionId: payload.videoVersionId ?? null,
    blockId: payload.blockId ?? null,
    lifecycle: normalizeString(payload.lifecycle) ?? null,
    phase: normalizeString(payload.phase) ?? null,
    progressPercent:
      typeof payload.progressPercent === "number" && Number.isFinite(payload.progressPercent)
        ? Math.max(1, Math.min(99, Math.trunc(payload.progressPercent)))
        : null,
    error: payload.error ?? null,
    updatedAt: payload.updatedAt ?? new Date(),
    buildStatus
  });
}

async function enqueueSlideJob(options: { versionId: string; templateId: string; clientId: string | null; requestId: string | null }) {
  const { versionId, templateId, clientId, requestId } = options;
  const versionScope = await prisma.videoVersion.findUnique({
    where: { id: versionId },
    select: { workspaceId: true }
  });
  if (!versionScope) {
    throw new Error("lesson version not found");
  }
  if (requestId) {
    const existingByRequest = await prisma.job.findFirst({
      where: { requestId },
      orderBy: { createdAt: "desc" }
    });
    if (existingByRequest) {
      if (existingByRequest.status === "pending") {
        await emitPendingCourseBuildEvent(existingByRequest);
      }
      return { status: 200, job: existingByRequest };
    }
  }

  const existing = await prisma.job.findFirst({
    where: {
      workspaceId: versionScope.workspaceId,
      videoVersionId: versionId,
      type: "render_slide",
      templateId,
      status: { in: ["pending", "running"] }
    },
    orderBy: { createdAt: "desc" }
  });

  if (existing) {
    if (clientId && existing.clientId && existing.clientId !== clientId) {
      // Different client has a running job; create a new one for this client.
    } else {
      if (existing.status === "running") {
        const staleAfterMs = Number(process.env.JOB_STALE_AFTER_MS ?? 10 * 60 * 1000);
        const now = Date.now();
        const updatedAtMs = new Date(existing.updatedAt).getTime();
        if (Number.isFinite(updatedAtMs) && now - updatedAtMs > staleAfterMs) {
          const resetJob = await prisma.job.update({
            where: { id: existing.id },
            data: {
              status: "pending",
              error: "stale running job reset",
              leaseExpiresAt: null
            }
          });
          await emitPendingCourseBuildEvent(resetJob);
          await notifyWorkerQueueChanged("enqueue_slide_reset_stale", versionScope.workspaceId, clientId);
          return { status: 200, job: resetJob };
        }
      }
      if (existing.status === "pending") {
        await emitPendingCourseBuildEvent(existing);
      }
      return { status: 200, job: existing };
    }
  }

  const job = await prisma.job.create({
    data: {
      workspaceId: versionScope.workspaceId,
      scope: "lesson",
      videoVersionId: versionId,
      type: "render_slide",
      status: "pending",
      clientId,
      requestId,
      templateId
    }
  });
  await emitPendingCourseBuildEvent(job);
  await notifyWorkerQueueChanged("enqueue_slide_created", versionScope.workspaceId, clientId);

  return { status: 201, job };
}

async function enqueueTtsJob(options: {
  videoVersionId: string;
  blockId?: string | null;
  clientId: string | null;
  requestId: string | null;
  meta?: {
    tts?: { releaseMemory?: boolean; voiceId?: string; language?: string };
  } | null;
}) {
  const { videoVersionId, blockId, clientId, requestId, meta } = options;
  const versionScope = await prisma.videoVersion.findUnique({
    where: { id: videoVersionId },
    select: { workspaceId: true }
  });
  if (!versionScope) {
    throw new Error("lesson version not found");
  }
  if (requestId) {
    const existingByRequest = await prisma.job.findFirst({
      where: { requestId },
      orderBy: { createdAt: "desc" }
    });
    if (existingByRequest) {
      if (existingByRequest.status === "pending") {
        await emitPendingCourseBuildEvent(existingByRequest);
      }
      return { status: 200, job: existingByRequest };
    }
  }

  const existing = await prisma.job.findFirst({
    where: {
      workspaceId: versionScope.workspaceId,
      videoVersionId,
      blockId: blockId ?? undefined,
      type: "tts",
      status: { in: ["pending", "running"] }
    },
    orderBy: { createdAt: "desc" }
  });

  if (existing) {
    if (clientId && existing.clientId && existing.clientId !== clientId) {
      // Different client has a running job; create a new one for this client.
    } else {
      if (existing.status === "running") {
        const staleAfterMs = Number(process.env.JOB_STALE_AFTER_MS ?? 10 * 60 * 1000);
        const now = Date.now();
        const updatedAtMs = new Date(existing.updatedAt).getTime();
        if (Number.isFinite(updatedAtMs) && now - updatedAtMs > staleAfterMs) {
          const resetJob = await prisma.job.update({
            where: { id: existing.id },
            data: {
              status: "pending",
              error: "stale running job reset",
              leaseExpiresAt: null
            }
          });
          await emitPendingCourseBuildEvent(resetJob);
          await notifyWorkerQueueChanged("enqueue_tts_reset_stale", versionScope.workspaceId, clientId);
          return { status: 200, job: resetJob };
        }
      }
      if (existing.status === "pending") {
        await emitPendingCourseBuildEvent(existing);
      }
      return { status: 200, job: existing };
    }
  }

  const job = await prisma.job.create({
    data: {
      workspaceId: versionScope.workspaceId,
      scope: blockId ? "block" : "lesson",
      videoVersionId,
      blockId: blockId ?? null,
      type: "tts",
      status: "pending",
      clientId,
      requestId,
      metaJson: meta ? JSON.stringify(meta) : null
    }
  });
  await emitPendingCourseBuildEvent(job);
  await notifyWorkerQueueChanged("enqueue_tts_created", versionScope.workspaceId, clientId);

  return { status: 201, job };
}

async function enqueueImageJob(options: {
  videoVersionId: string;
  blockId?: string | null;
  templateId?: string | null;
  clientId: string | null;
  requestId: string | null;
  meta?: { image?: { releaseMemory?: boolean; freeMemory?: boolean } } | null;
}) {
  const { videoVersionId, blockId, templateId, clientId, requestId, meta } = options;
  const versionScope = await prisma.videoVersion.findUnique({
    where: { id: videoVersionId },
    select: { workspaceId: true }
  });
  if (!versionScope) {
    throw new Error("lesson version not found");
  }
  if (requestId) {
    const existingByRequest = await prisma.job.findFirst({
      where: { requestId },
      orderBy: { createdAt: "desc" }
    });
    if (existingByRequest) {
      if (existingByRequest.status === "pending") {
        await emitPendingCourseBuildEvent(existingByRequest);
      }
      return { status: 200, job: existingByRequest };
    }
  }

  const existing = await prisma.job.findFirst({
    where: {
      workspaceId: versionScope.workspaceId,
      videoVersionId,
      blockId: blockId ?? undefined,
      type: "image",
      templateId: templateId ?? null,
      status: { in: ["pending", "running"] }
    },
    orderBy: { createdAt: "desc" }
  });

  if (existing) {
    if (clientId && existing.clientId && existing.clientId !== clientId) {
      // Different client has a running job; create a new one for this client.
    } else {
      if (existing.status === "running") {
        const staleAfterMs = Number(process.env.JOB_STALE_AFTER_MS ?? 10 * 60 * 1000);
        const now = Date.now();
        const updatedAtMs = new Date(existing.updatedAt).getTime();
        if (Number.isFinite(updatedAtMs) && now - updatedAtMs > staleAfterMs) {
          const resetJob = await prisma.job.update({
            where: { id: existing.id },
            data: {
              status: "pending",
              error: "stale running job reset",
              leaseExpiresAt: null
            }
          });
          await emitPendingCourseBuildEvent(resetJob);
          await notifyWorkerQueueChanged("enqueue_image_reset_stale", versionScope.workspaceId, clientId);
          return { status: 200, job: resetJob };
        }
      }
      if (existing.status === "pending") {
        await emitPendingCourseBuildEvent(existing);
      }
      return { status: 200, job: existing };
    }
  }

  const job = await prisma.job.create({
    data: {
      workspaceId: versionScope.workspaceId,
      scope: blockId ? "block" : "lesson",
      videoVersionId,
      blockId: blockId ?? null,
      type: "image",
      status: "pending",
      clientId,
      requestId,
      metaJson: meta ? JSON.stringify(meta) : null,
      templateId: templateId ?? null
    }
  });
  await emitPendingCourseBuildEvent(job);
  await notifyWorkerQueueChanged("enqueue_image_created", versionScope.workspaceId, clientId);

  return { status: 201, job };
}

async function enqueueFinalVideoJob(options: { videoVersionId: string; templateId?: string | null; clientId: string | null; requestId: string | null }) {
  const { videoVersionId, templateId, clientId, requestId } = options;
  const versionScope = await prisma.videoVersion.findUnique({
    where: { id: videoVersionId },
    select: { workspaceId: true }
  });
  if (!versionScope) {
    throw new Error("lesson version not found");
  }
  if (requestId) {
    const existingByRequest = await prisma.job.findFirst({
      where: { requestId },
      orderBy: { createdAt: "desc" }
    });
    if (existingByRequest) {
      if (existingByRequest.status === "pending") {
        await emitPendingCourseBuildEvent(existingByRequest);
      }
      return { status: 200, job: existingByRequest };
    }
  }

  const existing = await prisma.job.findFirst({
    where: {
      workspaceId: versionScope.workspaceId,
      videoVersionId,
      type: "concat_video",
      status: { in: ["pending", "running"] }
    },
    orderBy: { createdAt: "desc" }
  });

  if (existing) {
    if (clientId && existing.clientId && existing.clientId !== clientId) {
      // Different client has a running job; create a new one for this client.
    } else {
      if (existing.status === "running") {
        const staleAfterMs = Number(process.env.JOB_STALE_AFTER_MS ?? 10 * 60 * 1000);
        const now = Date.now();
        const updatedAtMs = new Date(existing.updatedAt).getTime();
        if (Number.isFinite(updatedAtMs) && now - updatedAtMs > staleAfterMs) {
          const resetJob = await prisma.job.update({
            where: { id: existing.id },
            data: {
              status: "pending",
              error: "stale running job reset",
              leaseExpiresAt: null
            }
          });
          await emitPendingCourseBuildEvent(resetJob);
          await notifyWorkerQueueChanged("enqueue_final_video_reset_stale", versionScope.workspaceId, clientId);
          return { status: 200, job: resetJob };
        }
      }
      if (existing.status === "pending") {
        await emitPendingCourseBuildEvent(existing);
      }
      return { status: 200, job: existing };
    }
  }

  const job = await prisma.job.create({
    data: {
      workspaceId: versionScope.workspaceId,
      scope: "lesson",
      videoVersionId,
      type: "concat_video",
      status: "pending",
      clientId,
      requestId,
      templateId: templateId || null
    }
  });
  await emitPendingCourseBuildEvent(job);
  await notifyWorkerQueueChanged("enqueue_final_video_created", versionScope.workspaceId, clientId);

  return { status: 201, job };
}

fastify.post(
  "/lesson-versions/:versionId/slides",
  {
    schema: {
      tags: ["Slides"],
      summary: "Gera slides de uma versão",
      description: "Inicia a geração de slides para todos os blocos de uma versão",
      response: {
        200: {
          type: "object",
          additionalProperties: true
        },
        201: {
          type: "object",
          additionalProperties: true
        },
        400: {
          type: "object",
          properties: { error: { type: "string" } }
        },
        404: {
          type: "object",
          properties: { error: { type: "string" } }
        },
        403: {
          type: "object",
          properties: { error: { type: "string" } }
        },
        410: {
          type: "object",
          properties: { error: { type: "string" } }
        },
        503: {
          type: "object",
          properties: { error: { type: "string" } }
        }
      }
    }
  },
  async (_request, reply) => {
    return reply.code(410).send({ error: "slides_disabled_in_mvp" });
  }
);

fastify.post(
  "/lesson-versions/:versionId/images",
  {
    schema: {
      tags: ["Slides"],
      summary: "Gera imagens de uma versão",
      description: "Inicia a geração de imagens via ComfyUI para todos os blocos de uma versão",
      response: {
        200: { type: "object", additionalProperties: true },
        201: { type: "object", additionalProperties: true },
        400: { type: "object", properties: { error: { type: "string" } } },
        404: { type: "object", properties: { error: { type: "string" } } },
        403: { type: "object", properties: { error: { type: "string" } } },
        503: { type: "object", properties: { error: { type: "string" } } }
      }
    }
  },
  async (request, reply) => {
    try {
      const auth = await getAuthenticatedScope(request, reply);
      if (!auth) return;
      const { versionId } = request.params as { versionId: string };
      const body = request.body as {
        clientId?: string;
        requestId?: string;
        templateId?: string;
        releaseMemory?: boolean;
        freeMemory?: boolean;
      };
      const dispatchClient = await resolveDispatchClientForRequest(request, body?.clientId);
      if (!dispatchClient.ok) {
        return reply.code(dispatchClient.statusCode).send({ error: dispatchClient.error });
      }
      const agentSession = getConnectedAgentForWorkspace(
        auth.scope.workspaceId,
        dispatchClient.clientId ?? undefined
      );
      if (!agentSession) {
        return reply.code(503).send({ error: "agent_offline" });
      }
      const upstream = await requestAgentWorkerCommand(
        agentSession,
        "lesson_version_images_post",
        {
          versionId,
          templateId: body?.templateId?.trim() || null,
          releaseMemory: body?.releaseMemory,
          freeMemory: body?.freeMemory,
          clientId: dispatchClient.clientId,
          requestId: body?.requestId?.trim() || null
        }
      );
      const statusCode =
        upstream.statusCode === 200 || upstream.statusCode === 201
          ? upstream.statusCode
          : upstream.statusCode === 400
            ? 400
            : upstream.statusCode === 404
              ? 404
              : 503;
      return reply.code(statusCode).send(upstream.data);
    } catch (err) {
      return reply.code(503).send({ error: (err as Error).message });
    }
  }
);

fastify.post(
  "/lesson-versions/:versionId/final-video",
  {
    schema: {
      tags: ["Lessons"],
      summary: "Gera vídeo final de uma versão",
      description: "Inicia a renderização do vídeo final concatenando slides e áudios",
      response: {
        200: { type: "object", additionalProperties: true },
        201: { type: "object", additionalProperties: true },
        400: { type: "object", properties: { error: { type: "string" } } },
        404: { type: "object", properties: { error: { type: "string" } } },
        403: { type: "object", properties: { error: { type: "string" } } },
        503: { type: "object", properties: { error: { type: "string" } } }
      }
    }
  },
  async (request, reply) => {
    try {
      const auth = await getAuthenticatedScope(request, reply);
      if (!auth) return;
      const { versionId } = request.params as { versionId: string };
      const body = request.body as {
        clientId?: string;
        requestId?: string;
        templateId?: string;
      };
      const dispatchClient = await resolveDispatchClientForRequest(request, body?.clientId);
      if (!dispatchClient.ok) {
        return reply.code(dispatchClient.statusCode).send({ error: dispatchClient.error });
      }
      const agentSession = getConnectedAgentForWorkspace(
        auth.scope.workspaceId,
        dispatchClient.clientId ?? undefined
      );
      if (!agentSession) {
        return reply.code(503).send({ error: "agent_offline" });
      }
      const upstream = await requestAgentWorkerCommand(
        agentSession,
        "lesson_version_final_video_post",
        {
          versionId,
          templateId: body?.templateId?.trim() || null,
          clientId: dispatchClient.clientId,
          requestId: body?.requestId?.trim() || null
        }
      );
      const statusCode =
        upstream.statusCode === 200 || upstream.statusCode === 201
          ? upstream.statusCode
          : upstream.statusCode === 400
            ? 400
            : upstream.statusCode === 404
              ? 404
              : 503;
      return reply.code(statusCode).send(upstream.data);
    } catch (err) {
      return reply.code(503).send({ error: (err as Error).message });
    }
  }
);

fastify.get(
  "/lesson-versions/:versionId/slides",
  {
    schema: {
      tags: ["Slides"],
      summary: "Lista slides de uma versão",
      description: "Retorna o status de todos os slides de uma versão de lição",
      response: {
        200: {
          type: "object",
          properties: {
            templateId: { type: "string" },
            blocks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  blockId: { type: "string" },
                  index: { type: "integer" },
                  exists: { type: "boolean" }
                }
              }
            }
          }
        },
        400: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        404: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        410: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        503: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  },
  async (_request, reply) => {
    return reply.code(410).send({ error: "slides_disabled_in_mvp" });
  }
);

fastify.get(
  "/lesson-versions/:versionId/audios",
  {
    schema: {
      tags: ["Voices"],
      summary: "Lista áudios de uma versão",
      description: "Retorna o status de todos os áudios TTS de uma versão de lição",
      response: {
        200: {
          type: "object",
          properties: {
            blocks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  blockId: { type: "string" },
                  index: { type: "integer" },
                  exists: { type: "boolean" },
                  url: { type: ["string", "null"] }
                }
              }
            }
          }
        },
        404: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        503: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  },
  async (request, reply) => {
    try {
      const auth = await getAuthenticatedScope(request, reply);
      if (!auth) return;
      const { versionId } = request.params as { versionId: string };
      const agentSession = getConnectedAgentForWorkspace(auth.scope.workspaceId);
      if (!agentSession) {
        return reply.code(503).send({ error: "agent_offline" });
      }
      const upstream = await requestAgentWorkerCommand(agentSession, "lesson_version_audios_list", { versionId });
      const statusCode = upstream.statusCode === 200 ? 200 : upstream.statusCode === 404 ? 404 : 503;
      return reply.code(statusCode).send(upstream.data);
    } catch (err) {
      return reply.code(503).send({ error: (err as Error).message });
    }
  }
);

fastify.get(
  "/lesson-versions/:versionId/images",
  {
    schema: {
      tags: ["Slides"],
      summary: "Lista imagens de uma versão",
      description: "Retorna o status de todas as imagens geradas de uma versão de lição",
      response: {
        200: {
          type: "object",
          properties: {
            blocks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  blockId: { type: "string" },
                  index: { type: "integer" },
                  exists: { type: "boolean" },
                  url: { type: ["string", "null"] }
                }
              }
            }
          }
        },
        404: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        503: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  },
  async (request, reply) => {
    try {
      const auth = await getAuthenticatedScope(request, reply);
      if (!auth) return;
      const { versionId } = request.params as { versionId: string };
      const agentSession = getConnectedAgentForWorkspace(auth.scope.workspaceId);
      if (!agentSession) {
        return reply.code(503).send({ error: "agent_offline" });
      }
      const upstream = await requestAgentWorkerCommand(agentSession, "lesson_version_images_list", { versionId });
      const statusCode = upstream.statusCode === 200 ? 200 : upstream.statusCode === 404 ? 404 : 503;
      return reply.code(statusCode).send(upstream.data);
    } catch (err) {
      return reply.code(503).send({ error: (err as Error).message });
    }
  }
);

fastify.get(
  "/lesson-versions/:versionId/job-state",
  {
    schema: {
      tags: ["Jobs"],
      summary: "Estado dos jobs de uma versão",
      description: "Retorna o estado agregado de todos os jobs de uma versão de lição",
      response: {
        200: {
          type: "object",
          description: "Estado agregado dos jobs da versão",
          additionalProperties: true
        },
        404: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        503: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  },
  async (request, reply) => {
    try {
      const auth = await getAuthenticatedScope(request, reply);
      if (!auth) return;
      const { versionId } = request.params as { versionId: string };
      const agentSession = getConnectedAgentForWorkspace(auth.scope.workspaceId);
      if (!agentSession) {
        return reply.code(503).send({ error: "agent_offline" });
      }
      const upstream = await requestAgentWorkerCommand(agentSession, "lesson_version_job_state", { versionId });
      const statusCode = upstream.statusCode === 200 ? 200 : upstream.statusCode === 404 ? 404 : 503;
      return reply.code(statusCode).send(upstream.data);
    } catch (err) {
      return reply.code(503).send({ error: (err as Error).message });
    }
  }
);

fastify.patch(
  "/blocks/:blockId",
  {
    schema: {
      tags: ["Lessons"],
      summary: "Atualiza um bloco",
      description: "Atualiza os dados de um bloco de lição (texto, prompt, etc.)"
    }
  },
  async (request, reply) => {
    const { blockId } = request.params as { blockId: string };
    const body = request.body as {
      imagePrompt?: {
        block_prompt?: string;
        avoid?: string;
        seed_hint?: string;
        seed?: number;
      };
      onScreen?: { title?: string; bullets?: string[] };
      ttsText?: string;
    };

    const data: Record<string, string | null> = {};

    if (body?.imagePrompt !== undefined) {
      const prompt = body?.imagePrompt?.block_prompt?.trim();
      let seed: number | undefined;
      if (body?.imagePrompt?.seed !== undefined) {
        if (typeof body.imagePrompt.seed !== "number" || !Number.isFinite(body.imagePrompt.seed)) {
          return reply.code(400).send({ error: "imagePrompt.seed must be a number" });
        }
        seed = Math.trunc(body.imagePrompt.seed);
      }

      if (!prompt) {
        data.imagePromptJson = null;
      } else {
        const imagePrompt = {
          block_prompt: prompt,
          avoid: body?.imagePrompt?.avoid?.trim() || undefined,
          seed_hint: body?.imagePrompt?.seed_hint?.trim() || undefined,
          seed
        };
        data.imagePromptJson = JSON.stringify(imagePrompt);
      }
    }

    if (body?.onScreen !== undefined) {
      // on-screen is disabled in MVP; explicitly clear legacy field if sent.
      data.onScreenJson = null;
    }

    if (body?.ttsText !== undefined) {
      const nextTts = sanitizeNarratedScriptText(body.ttsText);
      if (!nextTts) {
        return reply.code(400).send({ error: "ttsText cannot be empty" });
      }
      data.ttsText = nextTts;
    }

    if (Object.keys(data).length === 0) {
      return reply.code(400).send({ error: "no fields to update" });
    }

    try {
      const updated = await prisma.block.update({
        where: { id: blockId },
        data
      });
      const context = await resolveBlockContext(blockId);
      broadcastEntityChanged({
        entity: "block",
        action: "updated",
        blockId,
        videoVersionId: updated.videoVersionId,
        videoId: context?.videoVersion?.video?.id ?? null,
        sectionId: context?.videoVersion?.video?.section?.id ?? null,
        channelId: context?.videoVersion?.video?.section?.channel?.id ?? null,
        block: {
          id: updated.id,
          videoVersionId: updated.videoVersionId,
          ttsText: updated.ttsText,
          onScreenJson: updated.onScreenJson,
          imagePromptJson: updated.imagePromptJson,
          updatedAt: updated.updatedAt
        },
        occurredAt: new Date().toISOString()
      });
      return reply.code(200).send(updated);
    } catch (err) {
      fastify.log.error({ err, blockId }, "Failed to update block");
      return reply.code(404).send({ error: "block not found" });
    }
  }
);

fastify.post(
  "/lesson-versions/:versionId/segment",
  {
    schema: {
      tags: ["Lessons"],
      summary: "Segmenta uma versão em blocos",
      description: "Inicia a segmentação do script em blocos usando LLM"
    }
  },
  async (request, reply) => {
    const { versionId } = request.params as { versionId: string };
    const version = await prisma.videoVersion.findUnique({
      where: { id: versionId }
    });
    if (!version) {
      return reply.code(404).send({ error: "lesson version not found" });
    }
    await invalidateFinalVideoForLessonVersion(versionId, "segment_lesson_requested");
    const body = request.body as {
      clientId?: string;
      requestId?: string;
      purge?: boolean;
      autoQueue?: {
        audio?: boolean;
        image?: boolean;
      };
    };
    const dispatchClient = await resolveDispatchClientForRequest(request, body?.clientId);
    if (!dispatchClient.ok) {
      return reply.code(dispatchClient.statusCode).send({ error: dispatchClient.error });
    }
    const clientId = dispatchClient.clientId;
    const requestId = body?.requestId?.trim() || null;
    const purge = Boolean(body?.purge);
    let queueChanged = false;
    const seedDeterministicDraftBlocks = async (replaceExisting: boolean): Promise<number> => {
      const drafts = buildDeterministicBlocks(version.scriptText, version.speechRateWps);
      if (replaceExisting) {
        await prisma.block.deleteMany({
          where: { videoVersionId: versionId }
        });
      } else {
        const existingCount = await prisma.block.count({
          where: { videoVersionId: versionId }
        });
        if (existingCount > 0) return existingCount;
      }
      if (drafts.length === 0) return 0;
      await prisma.block.createMany({
        data: drafts.map((draft) => ({
          workspaceId: version.workspaceId,
          videoVersionId: versionId,
          index: draft.index,
          sourceText: draft.sourceText,
          ttsText: sanitizeNarratedScriptText(draft.sourceText),
          wordCount: draft.wordCount,
          durationEstimateS: draft.durationEstimateS,
          status: "segmentation_pending",
          segmentError: null,
          segmentMs: null,
          onScreenJson: null,
          imagePromptJson: null
        }))
      });
      return drafts.length;
    };

    if (requestId) {
      const existingByRequest = await prisma.job.findFirst({
        where: { requestId },
        orderBy: { createdAt: "desc" }
      });
      if (existingByRequest) {
        if (existingByRequest.status === "pending") {
          await emitPendingCourseBuildEvent(existingByRequest);
        }
        return reply.code(200).send(existingByRequest);
      }
    }
    const existing = await prisma.job.findFirst({
      where: {
        videoVersionId: versionId,
        type: "segment",
        status: { in: ["pending", "running"] }
      },
      orderBy: { createdAt: "desc" }
    });

    if (existing) {
      if (clientId && existing.clientId && existing.clientId !== clientId) {
        // Different client has a running job; create a new one for this client.
      } else {
        if (existing.status === "running") {
          const staleAfterMs = Number(process.env.JOB_STALE_AFTER_MS ?? 10 * 60 * 1000);
          const now = Date.now();
          const updatedAtMs = new Date(existing.updatedAt).getTime();
          if (Number.isFinite(updatedAtMs) && now - updatedAtMs > staleAfterMs) {
            const resetJob = await prisma.job.update({
              where: { id: existing.id },
              data: {
                status: "pending",
                error: "stale running job reset",
                leaseExpiresAt: null
              }
            });
            await notifyWorkerQueueChanged("segment_reset_stale", version.workspaceId, clientId);
            return reply.code(200).send(resetJob);
          }
        }
        // Ensure optional follow-up jobs exist for import flow even if segment already exists.
        const autoAudio = Boolean(body?.autoQueue?.audio);
        const autoImage = Boolean(body?.autoQueue?.image);
        if (autoAudio || autoImage) {
          let ttsJobId: string | null = null;
          if (autoAudio) {
            const existingTts = await prisma.job.findFirst({
              where: {
                videoVersionId: versionId,
                type: "tts",
                blockId: null,
                status: { in: ["pending", "running"] }
              },
              orderBy: { createdAt: "desc" }
            });
            if (existingTts) {
              ttsJobId = existingTts.id;
            } else {
              const createdTts = await prisma.job.create({
                data: {
                  workspaceId: version.workspaceId,
                  scope: "lesson",
                  videoVersionId: versionId,
                  type: "tts",
                  status: "pending",
                  clientId,
                  metaJson: JSON.stringify({
                    dependencies: [{ jobId: existing.id, require: "success" }]
                  })
                }
              });
              await emitPendingCourseBuildEvent(createdTts);
              ttsJobId = createdTts.id;
              queueChanged = true;
            }
          }
          if (autoImage) {
            const existingImage = await prisma.job.findFirst({
              where: {
                videoVersionId: versionId,
                type: "image",
                blockId: null,
                status: { in: ["pending", "running"] }
              },
              orderBy: { createdAt: "desc" }
            });
            if (!existingImage) {
              const dependencies: Array<{
                jobId: string;
                require: "success" | "terminal";
              }> = [{ jobId: existing.id, require: "success" }];
              if (autoAudio && ttsJobId) {
                dependencies.push({ jobId: ttsJobId, require: "terminal" });
              }
              const createdImage = await prisma.job.create({
                data: {
                  workspaceId: version.workspaceId,
                  scope: "lesson",
                  videoVersionId: versionId,
                  type: "image",
                  status: "pending",
                  clientId,
                  metaJson: JSON.stringify({ dependencies })
                }
              });
              await emitPendingCourseBuildEvent(createdImage);
              queueChanged = true;
            }
          }
        }
        if (queueChanged) {
          await notifyWorkerQueueChanged("segment_autoqueue_existing_created", version.workspaceId, clientId);
        }
        await seedDeterministicDraftBlocks(false);
        return reply.code(200).send(existing);
      }
    }

    if (purge) {
      await prisma.job.deleteMany({
        where: { block: { videoVersionId: versionId } }
      });
      await prisma.asset.deleteMany({
        where: { block: { videoVersionId: versionId } }
      });
      await prisma.block.deleteMany({ where: { videoVersionId: versionId } });
    }
    await seedDeterministicDraftBlocks(purge);

    const job = await prisma.job.create({
      data: {
        workspaceId: version.workspaceId,
        scope: "lesson",
        videoVersionId: versionId,
        type: "segment",
        status: "pending",
        clientId,
        requestId,
        metaJson: body?.autoQueue
          ? JSON.stringify({
              autoQueue: {
                audio: Boolean(body.autoQueue.audio),
                image: Boolean(body.autoQueue.image)
              }
            })
          : null
      }
    });
    await emitPendingCourseBuildEvent(job);
    queueChanged = true;

    // Pre-create optional follow-up jobs (audio/image) with dependency-based ordering.
    // This makes queue state visible immediately in any screen (e.g., lesson editor).
    const autoAudio = Boolean(body?.autoQueue?.audio);
    const autoImage = Boolean(body?.autoQueue?.image);
    if (autoAudio || autoImage) {
      let ttsJobId: string | null = null;
      if (autoAudio) {
        const existingTts = await prisma.job.findFirst({
          where: {
            videoVersionId: versionId,
            type: "tts",
            blockId: null,
            status: { in: ["pending", "running"] }
          },
          orderBy: { createdAt: "desc" }
        });
        if (existingTts) {
          ttsJobId = existingTts.id;
        } else {
          const createdTts = await prisma.job.create({
            data: {
              workspaceId: version.workspaceId,
              scope: "lesson",
              videoVersionId: versionId,
              type: "tts",
              status: "pending",
              clientId,
              metaJson: JSON.stringify({
                dependencies: [{ jobId: job.id, require: "success" }]
              })
            }
          });
          await emitPendingCourseBuildEvent(createdTts);
          ttsJobId = createdTts.id;
          queueChanged = true;
        }
      }
      if (autoImage) {
        const existingImage = await prisma.job.findFirst({
          where: {
            videoVersionId: versionId,
            type: "image",
            blockId: null,
            status: { in: ["pending", "running"] }
          },
          orderBy: { createdAt: "desc" }
        });
        if (!existingImage) {
          const dependencies: Array<{
            jobId: string;
            require: "success" | "terminal";
          }> = [{ jobId: job.id, require: "success" }];
          if (autoAudio && ttsJobId) {
            dependencies.push({ jobId: ttsJobId, require: "terminal" });
          }
          const createdImage = await prisma.job.create({
            data: {
              workspaceId: version.workspaceId,
              scope: "lesson",
              videoVersionId: versionId,
              type: "image",
              status: "pending",
              clientId,
              metaJson: JSON.stringify({ dependencies })
            }
          });
          await emitPendingCourseBuildEvent(createdImage);
          queueChanged = true;
        }
      }
    }

    if (queueChanged) {
      await notifyWorkerQueueChanged("segment_created", version.workspaceId, clientId);
    }

    return reply.code(201).send(job);
  }
);

fastify.get(
  "/lesson-versions/:versionId/segment-preview",
  {
    schema: {
      tags: ["Lessons"],
      summary: "Preview da segmentação",
      description: "Retorna uma prévia de como o texto será segmentado em blocos"
    }
  },
  async (request, reply) => {
    const { versionId } = request.params as { versionId: string };
    const version = await prisma.videoVersion.findUnique({
      where: { id: versionId }
    });
    if (!version) {
      return reply.code(404).send({ error: "lesson version not found" });
    }

    const blockCount = await prisma.block.count({
      where: { videoVersionId: versionId }
    });
    const assetGroups = await prisma.asset.groupBy({
      by: ["kind"],
      where: { block: { videoVersionId: versionId } },
      _count: { _all: true }
    });
    const assets: Record<string, number> = {};
    assetGroups.forEach((group) => {
      assets[group.kind] = group._count._all;
    });
    const jobCount = await prisma.job.count({
      where: {
        OR: [{ videoVersionId: versionId }, { block: { videoVersionId: versionId } }]
      }
    });

    return reply.code(200).send({
      blocks: blockCount,
      assets,
      jobs: jobCount
    });
  }
);

fastify.post(
  "/lesson-versions/:versionId/assets",
  {
    schema: {
      tags: ["Lessons"],
      summary: "Gera assets da lição",
      description: "Dispara a geração de todos os assets (áudio, imagens) da versão da lição",
      response: {
        200: { type: "object", additionalProperties: true },
        201: { type: "object", additionalProperties: true },
        404: { type: "object", properties: { error: { type: "string" } } },
        403: { type: "object", properties: { error: { type: "string" } } },
        503: { type: "object", properties: { error: { type: "string" } } }
      }
    }
  },
  async (request, reply) => {
    try {
      const auth = await getAuthenticatedScope(request, reply);
      if (!auth) return;
      const { versionId } = request.params as { versionId: string };
      const body = request.body as { clientId?: string; requestId?: string };
      const dispatchClient = await resolveDispatchClientForRequest(request, body?.clientId);
      if (!dispatchClient.ok) {
        return reply.code(dispatchClient.statusCode).send({ error: dispatchClient.error });
      }
      const agentSession = getConnectedAgentForWorkspace(auth.scope.workspaceId, dispatchClient.clientId ?? undefined);
      if (!agentSession) {
        return reply.code(503).send({ error: "agent_offline" });
      }
      const upstream = await requestAgentWorkerCommand(agentSession, "lesson_version_assets_post", {
        versionId,
        clientId: dispatchClient.clientId,
        requestId: body?.requestId?.trim() || null
      });
      const statusCode = upstream.statusCode === 200 || upstream.statusCode === 201 ? upstream.statusCode : upstream.statusCode === 404 ? 404 : 503;
      return reply.code(statusCode).send(upstream.data);
    } catch (err) {
      return reply.code(503).send({ error: (err as Error).message });
    }
  }
);

fastify.post(
  "/lesson-versions/:versionId/assets/image",
  {
    schema: {
      tags: ["Lessons"],
      summary: "Gera imagens da lição",
      description: "Dispara a geração de imagens para todos os blocos da versão",
      response: {
        200: { type: "object", additionalProperties: true },
        201: { type: "object", additionalProperties: true },
        404: { type: "object", properties: { error: { type: "string" } } },
        403: { type: "object", properties: { error: { type: "string" } } },
        503: { type: "object", properties: { error: { type: "string" } } }
      }
    }
  },
  async (request, reply) => {
    try {
      const auth = await getAuthenticatedScope(request, reply);
      if (!auth) return;
      const { versionId } = request.params as { versionId: string };
      const body = request.body as { clientId?: string; requestId?: string };
      const dispatchClient = await resolveDispatchClientForRequest(request, body?.clientId);
      if (!dispatchClient.ok) {
        return reply.code(dispatchClient.statusCode).send({ error: dispatchClient.error });
      }
      const agentSession = getConnectedAgentForWorkspace(auth.scope.workspaceId, dispatchClient.clientId ?? undefined);
      if (!agentSession) {
        return reply.code(503).send({ error: "agent_offline" });
      }
      const upstream = await requestAgentWorkerCommand(agentSession, "lesson_version_assets_image_post", {
        versionId,
        clientId: dispatchClient.clientId,
        requestId: body?.requestId?.trim() || null
      });
      const statusCode = upstream.statusCode === 200 || upstream.statusCode === 201 ? upstream.statusCode : upstream.statusCode === 404 ? 404 : 503;
      return reply.code(statusCode).send(upstream.data);
    } catch (err) {
      return reply.code(503).send({ error: (err as Error).message });
    }
  }
);

fastify.post(
  "/lesson-versions/:versionId/tts",
  {
    schema: {
      tags: ["Lessons"],
      summary: "Gera áudios TTS da lição",
      description: "Dispara a geração de áudio TTS para todos os blocos da versão"
    }
  },
  async (request, reply) => {
    const { versionId } = request.params as { versionId: string };
    const version = await prisma.videoVersion.findUnique({
      where: { id: versionId }
    });
    if (!version) {
      return reply.code(404).send({ error: "lesson version not found" });
    }
    await invalidateFinalVideoForLessonVersion(versionId, "tts_lesson_requested");
    const body = request.body as {
      clientId?: string;
      requestId?: string;
      releaseMemory?: boolean;
      voiceId?: string;
      language?: string;
    };
    const dispatchClient = await resolveDispatchClientForRequest(request, body?.clientId);
    if (!dispatchClient.ok) {
      return reply.code(dispatchClient.statusCode).send({ error: dispatchClient.error });
    }
    const clientId = dispatchClient.clientId;
    const requestId = body?.requestId?.trim() || null;
    const releaseMemory = body?.releaseMemory;
    const voiceId = body?.voiceId?.trim();
    const language = body?.language?.trim();

    const result = await enqueueTtsJob({
      videoVersionId: versionId,
      clientId,
      requestId,
      meta:
        releaseMemory === undefined && !voiceId && !language
          ? null
          : {
              tts: {
                releaseMemory,
                voiceId: voiceId || undefined,
                language: language || undefined
              }
            }
    });
    return reply.code(result.status).send(result.job);
  }
);

fastify.post(
  "/blocks/:blockId/tts",
  {
    schema: {
      tags: ["Jobs"],
      summary: "Gera áudio TTS do bloco",
      description: "Dispara a geração de áudio TTS para um bloco específico"
    }
  },
  async (request, reply) => {
    const { blockId } = request.params as { blockId: string };
    const body = request.body as {
      clientId?: string;
      requestId?: string;
      releaseMemory?: boolean;
      voiceId?: string;
      language?: string;
    };
    const dispatchClient = await resolveDispatchClientForRequest(request, body?.clientId);
    if (!dispatchClient.ok) {
      return reply.code(dispatchClient.statusCode).send({ error: dispatchClient.error });
    }
    const clientId = dispatchClient.clientId;
    const requestId = body?.requestId?.trim() || null;
    const releaseMemory = body?.releaseMemory;
    const voiceId = body?.voiceId?.trim();
    const language = body?.language?.trim();

    const block = await prisma.block.findUnique({ where: { id: blockId } });
    if (!block) {
      return reply.code(404).send({ error: "block not found" });
    }
    await invalidateFinalVideoForLessonVersion(block.videoVersionId, "tts_block_requested");

    const result = await enqueueTtsJob({
      videoVersionId: block.videoVersionId,
      blockId,
      clientId,
      requestId,
      meta:
        releaseMemory === undefined && !voiceId && !language
          ? null
          : {
              tts: {
                releaseMemory,
                voiceId: voiceId || undefined,
                language: language || undefined
              }
            }
    });
    return reply.code(result.status).send(result.job);
  }
);

fastify.post(
  "/blocks/:blockId/image",
  {
    schema: {
      tags: ["Jobs"],
      summary: "Gera imagem do bloco",
      description: "Dispara a geração de imagem para um bloco específico"
    }
  },
  async (request, reply) => {
    const { blockId } = request.params as { blockId: string };
    const body = request.body as {
      clientId?: string;
      requestId?: string;
      templateId?: string;
      releaseMemory?: boolean;
      freeMemory?: boolean;
    };
    const dispatchClient = await resolveDispatchClientForRequest(request, body?.clientId);
    if (!dispatchClient.ok) {
      return reply.code(dispatchClient.statusCode).send({ error: dispatchClient.error });
    }
    const clientId = dispatchClient.clientId;
    const requestId = body?.requestId?.trim() || null;
    const templateId = body?.templateId?.trim() || null;
    const releaseMemory = body?.releaseMemory;
    const freeMemory = body?.freeMemory;

    const block = await prisma.block.findUnique({ where: { id: blockId } });
    if (!block) {
      return reply.code(404).send({ error: "block not found" });
    }
    await invalidateFinalVideoForLessonVersion(block.videoVersionId, "image_block_requested");
    if (templateId) {
      const template = await prisma.slideTemplate.findUnique({
        where: { id: templateId }
      });
      if (!template || !template.isActive) {
        return reply.code(404).send({ error: "template not found" });
      }
    }

    const result = await enqueueImageJob({
      videoVersionId: block.videoVersionId,
      blockId,
      templateId,
      clientId,
      requestId,
      meta:
        releaseMemory === undefined && freeMemory === undefined
          ? null
          : {
              image: {
                releaseMemory,
                freeMemory
              }
            }
    });
    return reply.code(result.status).send(result.job);
  }
);

fastify.post(
  "/blocks/:blockId/segment/retry",
  {
    schema: {
      tags: ["Jobs"],
      summary: "Retenta segmentação do bloco",
      description: "Retenta a segmentação de um bloco que falhou"
    }
  },
  async (request, reply) => {
    const { blockId } = request.params as { blockId: string };
    const body = request.body as { clientId?: string; requestId?: string };
    const dispatchClient = await resolveDispatchClientForRequest(request, body?.clientId);
    if (!dispatchClient.ok) {
      return reply.code(dispatchClient.statusCode).send({ error: dispatchClient.error });
    }
    const clientId = dispatchClient.clientId;
    const requestId = body?.requestId?.trim() || null;

    const block = await prisma.block.findUnique({ where: { id: blockId } });
    if (!block) {
      return reply.code(404).send({ error: "block not found" });
    }
    await invalidateFinalVideoForLessonVersion(block.videoVersionId, "segment_block_requested");

    if (requestId) {
      const existingByRequest = await prisma.job.findFirst({
        where: { requestId },
        orderBy: { createdAt: "desc" }
      });
      if (existingByRequest) {
        return reply.code(200).send(existingByRequest);
      }
    }

    const job = await prisma.job.create({
      data: {
        workspaceId: block.workspaceId,
        scope: "block",
        videoVersionId: block.videoVersionId,
        blockId,
        type: "segment_block",
        status: "pending",
        clientId,
        requestId
      }
    });
    await emitPendingCourseBuildEvent(job);
    await notifyWorkerQueueChanged("segment_block_created", block.workspaceId, clientId);
    return reply.code(201).send(job);
  }
);

fastify.get(
  "/jobs/:jobId",
  {
    schema: {
      tags: ["Jobs"],
      summary: "Obtém detalhes de um job",
      description: "Retorna os detalhes de um job de processamento específico",
      response: {
        200: {
          type: "object",
          description: "Detalhes do job",
          additionalProperties: true
        },
        404: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        403: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  },
  async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      return reply.code(404).send({ error: "job not found" });
    }
    const canAccess = await canAccessJobForRequest(request, job.clientId ?? null);
    if (!canAccess) {
      return reply.code(403).send({ error: "agent_workspace_mismatch" });
    }
    return reply.code(200).send(job);
  }
);

fastify.post(
  "/system/hard-cleanup",
  {
    schema: {
      tags: ["Settings"],
      summary: "Limpeza profunda do sistema",
      description: "Remove dados órfãos e faz limpeza de arquivos não utilizados",
      response: {
        200: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            skipped: { type: "boolean" },
            reason: { type: "string" },
            activeJobs: {
              type: "object",
              properties: {
                pending: { type: "integer" },
                running: { type: "integer" }
              }
            }
          }
        },
        502: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            error: { type: "string" }
          }
        },
        503: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            error: { type: "string" }
          }
        }
      }
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const agentSession = getConnectedAgentForWorkspace(auth.scope.workspaceId);
    if (!agentSession) {
      return reply.code(503).send({ ok: false, error: "agent_offline" });
    }
    const body = request.body as { reason?: string } | undefined;
    const reason = body?.reason?.trim() || "manual";
    try {
      const activeJobs = await prisma.job.groupBy({
        by: ["status"],
        where: {
          status: { in: ["pending", "running"] }
        },
        _count: { _all: true }
      });
      const pendingCount = activeJobs.find((item) => item.status === "pending")?._count._all ?? 0;
      const runningCount = activeJobs.find((item) => item.status === "running")?._count._all ?? 0;
      if (pendingCount > 0 || runningCount > 0) {
        return reply.code(200).send({
          ok: true,
          skipped: true,
          reason: "active_jobs",
          activeJobs: {
            pending: pendingCount,
            running: runningCount
          }
        });
      }
      const upstream = await requestAgentWorkerCommand(agentSession, "system_hard_cleanup", {
        reason
      });
      return reply.code(upstream.statusCode === 200 ? 200 : 502).send(upstream.data);
    } catch (err) {
      fastify.log.error({ err, reason }, "Failed to execute worker hard cleanup");
      return reply.code(502).send({
        ok: false,
        error: (err as Error).message || "hard cleanup failed"
      });
    }
  }
);

fastify.post(
  "/system/free-space",
  {
    schema: {
      tags: ["Settings"],
      summary: "Planeja ou executa limpeza de arquivos orfaos no worker",
      description:
        "Aciona no worker o fluxo de free space via WS: dry-run (plan) ou execute.",
      response: {
        200: {
          type: "object",
          additionalProperties: true
        },
        502: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            error: { type: "string" }
          }
        },
        503: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            error: { type: "string" }
          }
        }
      }
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const body = request.body as
      | {
          mode?: "plan" | "execute";
          reason?: string;
          maxItems?: number;
          agentId?: string;
        }
      | undefined;
    const mode = body?.mode === "execute" ? "execute" : "plan";
    const reason = body?.reason?.trim() || "manual";
    const maxItems =
      typeof body?.maxItems === "number" && Number.isFinite(body.maxItems)
        ? Math.max(1, Math.min(5000, Math.trunc(body.maxItems)))
        : undefined;
    const requestedAgentId = typeof body?.agentId === "string" ? body.agentId.trim() : undefined;
    try {
      const upstream = await runWorkerFreeSpace({
        mode,
        reason,
        workspaceId: auth.scope.workspaceId,
        agentId: requestedAgentId,
        maxItems
      });
      return reply.code(upstream.statusCode === 200 ? 200 : 502).send(upstream.data);
    } catch (err) {
      const errorMessage = (err as Error).message || "free space failed";
      const statusCode = errorMessage === "agent_offline" ? 503 : 502;
      fastify.log.error(
        {
          err,
          mode,
          reason,
          workspaceId: auth.scope.workspaceId,
          agentId: requestedAgentId ?? null
        },
        "Failed to execute worker free space"
      );
      return reply.code(statusCode).send({
        ok: false,
        error: errorMessage
      });
    }
  }
);

fastify.post(
  "/jobs/:jobId/cancel",
  {
    schema: {
      tags: ["Jobs"],
      summary: "Cancela um job",
      description: "Cancela um job de processamento em execução ou pendente",
      response: {
        200: {
          type: "object",
          description: "Job atualizado para canceled",
          additionalProperties: true
        },
        403: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        404: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        409: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  },
  async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const body = request.body as { clientId?: string } | undefined;
    const dispatchClient = await resolveDispatchClientForRequest(request, body?.clientId);
    if (!dispatchClient.ok) {
      return reply.code(dispatchClient.statusCode).send({ error: dispatchClient.error });
    }
    const clientId = body?.clientId?.trim();
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        videoVersion: {
          select: {
            videoId: true,
            video: {
              select: {
                sectionId: true,
                section: { select: { channelId: true } }
              }
            }
          }
        },
        block: {
          select: {
            videoVersionId: true,
            videoVersion: {
              select: {
                videoId: true,
                video: {
                  select: {
                    sectionId: true,
                    section: { select: { channelId: true } }
                  }
                }
              }
            }
          }
        }
      }
    });
    if (!job) {
      return reply.code(404).send({ error: "job not found" });
    }
    const canAccess = await canAccessJobForRequest(request, job.clientId ?? null);
    if (!canAccess) {
      return reply.code(403).send({ error: "agent_workspace_mismatch" });
    }
    if (dispatchClient.clientId && job.clientId && job.clientId !== dispatchClient.clientId) {
      return reply.code(403).send({ error: "clientId mismatch" });
    }
    if (job.status === "succeeded" || job.status === "failed" || job.status === "canceled") {
      return reply.code(409).send({ error: "job already finished" });
    }
    fastify.log.info(
      {
        jobId,
        clientId: clientId ?? null,
        jobClientId: job.clientId ?? null,
        status: job.status,
        type: job.type,
        videoVersionId: job.videoVersionId,
        blockId: job.blockId,
        userAgent: request.headers["user-agent"] ?? null,
        referer: request.headers.referer ?? null
      },
      "Job cancel requested"
    );
    const now = new Date();
    const canceled = await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "canceled",
        error: "canceled by user",
        canceledAt: now,
        leaseExpiresAt: now
      }
    });
    const context = job.videoVersion?.video ?? job.block?.videoVersion?.video ?? null;
    const channelId = context?.section?.channelId ?? null;
    if (channelId) {
      await emitCourseBuildStatusEvent(channelId, {
        correlationId: getRequestCorrelationId(request),
        jobId: canceled.id,
        status: canceled.status,
        type: canceled.type,
        sectionId: context?.sectionId ?? null,
        videoId: job.videoVersion?.videoId ?? job.block?.videoVersion?.videoId ?? null,
        videoVersionId: canceled.videoVersionId,
        blockId: canceled.blockId,
        error: canceled.error,
        updatedAt: canceled.updatedAt
      });
    }
    jobStreamBus.emit(jobId);
    if (job.status === "running" && (job.type === "image" || job.type === "comfyui_image" || job.type === "render_slide")) {
      try {
        await runWorkerHardCleanup(
          `cancel_running_${job.type}_${job.id}`,
          job.workspaceId,
          job.clientId ?? dispatchClient.clientId ?? null
        );
      } catch (err) {
        fastify.log.warn({ err, jobId: job.id, type: job.type }, "Failed to force cleanup after running image job cancellation");
      }
    }
    await notifyWorkerQueueChanged(
      "job_canceled",
      job.workspaceId,
      job.clientId ?? dispatchClient.clientId ?? null
    );
    return reply.code(200).send(canceled);
  }
);

const jobTypesForGenerationPhase = (phase: "blocks" | "audio" | "images") => {
  if (phase === "blocks") return ["segment", "segment_block"];
  if (phase === "audio") return ["tts"];
  return ["image", "comfyui_image", "render_slide"];
};

const cancelGenerationForLessonIds = async (
  lessonIds: string[],
  phase: "blocks" | "audio" | "images",
  clientId?: string | null
) => {
  if (lessonIds.length === 0) return 0;
  const types = jobTypesForGenerationPhase(phase);
  const now = new Date();
  const result = await prisma.job.updateMany({
    where: {
      type: { in: types },
      status: { in: ["pending", "running"] },
      ...(clientId ? { clientId } : {}),
      OR: [{ videoVersion: { videoId: { in: lessonIds } } }, { block: { videoVersion: { videoId: { in: lessonIds } } } }]
    },
    data: {
      status: "canceled",
      canceledAt: now,
      leaseExpiresAt: now,
      error: "canceled by user"
    }
  });
  return result.count;
};

fastify.post(
  "/lessons/:videoId/generation/:phase/cancel",
  {
    schema: {
      tags: ["Jobs"],
      summary: "Cancela geração de uma lição",
      description: "Cancela jobs de geração de uma fase específica de uma lição",
      response: {
        200: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            canceled: { type: "integer" }
          }
        },
        403: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        400: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        404: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const { videoId, phase } = request.params as {
      videoId: string;
      phase: "blocks" | "audio" | "images";
    };
    if (!["blocks", "audio", "images"].includes(phase)) {
      return reply.code(400).send({ error: "invalid phase" });
    }
    const body = request.body as { clientId?: string } | undefined;
    const dispatchClient = await resolveDispatchClientForRequest(request, body?.clientId);
    if (!dispatchClient.ok) {
      return reply.code(dispatchClient.statusCode).send({ error: dispatchClient.error });
    }
    const lesson = await prisma.video.findFirst({
      where: { id: videoId, workspaceId: auth.scope.workspaceId },
      select: { id: true, section: { select: { channelId: true } } }
    });
    if (!lesson) {
      return reply.code(404).send({ error: "lesson not found" });
    }
    const count = await cancelGenerationForLessonIds(
      [videoId],
      phase,
      dispatchClient.clientId ?? null
    );
    if (count > 0) {
      await emitCourseBuildStatusEvent(lesson.section.channelId, {
        correlationId: getRequestCorrelationId(request),
        status: "canceled",
        type: phase
      });
      await notifyWorkerQueueChanged(
        "lesson_generation_canceled",
        auth.scope.workspaceId,
        dispatchClient.clientId
      );
    }
    return reply.code(200).send({ ok: true, canceled: count });
  }
);

fastify.post(
  "/modules/:sectionId/generation/:phase/cancel",
  {
    schema: {
      tags: ["Jobs"],
      summary: "Cancela geração de um módulo",
      description: "Cancela jobs de geração de uma fase específica de um módulo",
      response: {
        200: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            canceled: { type: "integer" }
          }
        },
        403: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        400: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        404: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const { sectionId, phase } = request.params as {
      sectionId: string;
      phase: "blocks" | "audio" | "images";
    };
    if (!["blocks", "audio", "images"].includes(phase)) {
      return reply.code(400).send({ error: "invalid phase" });
    }
    const body = request.body as { clientId?: string } | undefined;
    const dispatchClient = await resolveDispatchClientForRequest(request, body?.clientId);
    if (!dispatchClient.ok) {
      return reply.code(dispatchClient.statusCode).send({ error: dispatchClient.error });
    }
    const moduleItem = await prisma.section.findFirst({
      where: { id: sectionId, workspaceId: auth.scope.workspaceId },
      select: { id: true, channelId: true }
    });
    if (!moduleItem) {
      return reply.code(404).send({ error: "module not found" });
    }
    const lessons = await prisma.video.findMany({
      where: { sectionId, workspaceId: auth.scope.workspaceId },
      select: { id: true }
    });
    const count = await cancelGenerationForLessonIds(
      lessons.map((item) => item.id),
      phase,
      dispatchClient.clientId ?? null
    );
    if (count > 0) {
      await emitCourseBuildStatusEvent(moduleItem.channelId, {
        correlationId: getRequestCorrelationId(request),
        status: "canceled",
        type: phase
      });
      await notifyWorkerQueueChanged(
        "module_generation_canceled",
        auth.scope.workspaceId,
        dispatchClient.clientId
      );
    }
    return reply.code(200).send({ ok: true, canceled: count });
  }
);

fastify.post(
  "/courses/:channelId/generation/:phase/cancel",
  {
    schema: {
      tags: ["Jobs"],
      summary: "Cancela geração de um curso",
      description: "Cancela jobs de geração de uma fase específica de um curso",
      response: {
        200: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            canceled: { type: "integer" }
          }
        },
        403: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        400: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        404: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const { channelId, phase } = request.params as {
      channelId: string;
      phase: "blocks" | "audio" | "images";
    };
    if (!["blocks", "audio", "images"].includes(phase)) {
      return reply.code(400).send({ error: "invalid phase" });
    }
    const body = request.body as { clientId?: string } | undefined;
    const dispatchClient = await resolveDispatchClientForRequest(request, body?.clientId);
    if (!dispatchClient.ok) {
      return reply.code(dispatchClient.statusCode).send({ error: dispatchClient.error });
    }
    const course = await prisma.channel.findFirst({
      where: { id: channelId, workspaceId: auth.scope.workspaceId },
      select: { id: true }
    });
    if (!course) {
      return reply.code(404).send({ error: "course not found" });
    }
    const lessons = await prisma.video.findMany({
      where: { workspaceId: auth.scope.workspaceId, section: { channelId } },
      select: { id: true }
    });
    const count = await cancelGenerationForLessonIds(
      lessons.map((item) => item.id),
      phase,
      dispatchClient.clientId ?? null
    );
    if (count > 0) {
      await emitCourseBuildStatusEvent(channelId, {
        correlationId: getRequestCorrelationId(request),
        status: "canceled",
        type: phase
      });
      await notifyWorkerQueueChanged(
        "course_generation_canceled",
        auth.scope.workspaceId,
        dispatchClient.clientId
      );
    }
    return reply.code(200).send({ ok: true, canceled: count });
  }
);

fastify.post(
  "/imports/rollback",
  {
    schema: {
      tags: ["Courses"],
      summary: "Rollback de importação",
      description: "Desfaz uma importação de curso, removendo todos os dados criados",
      response: {
        200: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            audit: { type: "object", additionalProperties: true },
            removed: { type: "object", additionalProperties: true }
          },
          additionalProperties: true
        }
      }
    }
  },
  async (request, reply) => {
    const body = request.body as {
      createdCourseId?: string | null;
      createdModuleIds?: string[];
      createdLessonIds?: string[];
      createdVersionIds?: string[];
    };

    const createdCourseId = body?.createdCourseId?.trim() || null;
    const moduleIds = new Set((body?.createdModuleIds ?? []).map((id) => id.trim()).filter(Boolean));
    const lessonIds = new Set((body?.createdLessonIds ?? []).map((id) => id.trim()).filter(Boolean));
    const versionIds = new Set((body?.createdVersionIds ?? []).map((id) => id.trim()).filter(Boolean));
    let canceledJobsCount = 0;
    let deletedBlockJobsCount = 0;
    let deletedVersionJobsCount = 0;
    let deletedAssetsCount = 0;
    let deletedFilesCount = 0;
    let deletedFileErrorsCount = 0;
    let deletedBlocksCount = 0;
    let deletedVersionsCount = 0;
    let deletedLessonsCount = 0;
    let deletedModulesCount = 0;
    let deletedCoursesCount = 0;

    if (createdCourseId) {
      const modulesFromCourse = await prisma.section.findMany({
        where: { channelId: createdCourseId },
        select: { id: true }
      });
      modulesFromCourse.forEach((moduleItem) => moduleIds.add(moduleItem.id));
    }

    if (moduleIds.size > 0) {
      const lessonsFromModules = await prisma.video.findMany({
        where: { sectionId: { in: Array.from(moduleIds) } },
        select: { id: true }
      });
      lessonsFromModules.forEach((lessonItem) => lessonIds.add(lessonItem.id));
    }

    if (lessonIds.size > 0) {
      const versionsFromLessons = await prisma.videoVersion.findMany({
        where: { videoId: { in: Array.from(lessonIds) } },
        select: { id: true }
      });
      versionsFromLessons.forEach((version) => versionIds.add(version.id));
    }

    const safeVersionIds = Array.from(versionIds);
    if (safeVersionIds.length > 0) {
      const maxRounds = 20;
      for (let round = 0; round < maxRounds; round += 1) {
        const activeJobs = await prisma.job.findMany({
          where: {
            status: { in: ["pending", "running"] },
            OR: [{ videoVersionId: { in: safeVersionIds } }, { block: { videoVersionId: { in: safeVersionIds } } }]
          },
          select: { id: true }
        });
        if (activeJobs.length === 0) break;
        const activeIds = activeJobs.map((item) => item.id);
        const now = new Date();
        const canceledResult = await prisma.job.updateMany({
          where: { id: { in: activeIds } },
          data: {
            status: "canceled",
            error: "rolled back by import cancel",
            canceledAt: now,
            leaseExpiresAt: now
          }
        });
        canceledJobsCount += canceledResult.count;
        await sleep(300);
      }

      const blocks = await prisma.block.findMany({
        where: { videoVersionId: { in: safeVersionIds } },
        select: { id: true }
      });
      const blockIds = blocks.map((item) => item.id);

      if (blockIds.length > 0) {
        const assetsToDelete = await prisma.asset.findMany({
          where: { blockId: { in: blockIds } },
          select: { path: true }
        });
        deletedAssetsCount += assetsToDelete.length;
        for (const asset of assetsToDelete) {
          const deleted = await unlinkIfExists(asset.path);
          if (deleted) deletedFilesCount += 1;
          else if (asset.path) deletedFileErrorsCount += 1;
        }
        await prisma.asset.deleteMany({ where: { blockId: { in: blockIds } } });
        const deletedBlockJobs = await prisma.job.deleteMany({
          where: { blockId: { in: blockIds } }
        });
        deletedBlockJobsCount += deletedBlockJobs.count;
      }

      const deletedVersionJobs = await prisma.job.deleteMany({
        where: {
          videoVersionId: { in: safeVersionIds }
        }
      });
      deletedVersionJobsCount += deletedVersionJobs.count;
      const deletedBlocks = await prisma.block.deleteMany({
        where: { videoVersionId: { in: safeVersionIds } }
      });
      deletedBlocksCount += deletedBlocks.count;
      const deletedVersions = await prisma.videoVersion.deleteMany({
        where: { id: { in: safeVersionIds } }
      });
      deletedVersionsCount += deletedVersions.count;
    }

    const safeLessonIds = Array.from(lessonIds);
    if (safeLessonIds.length > 0) {
      const deletedLessons = await prisma.video.deleteMany({
        where: { id: { in: safeLessonIds } }
      });
      deletedLessonsCount += deletedLessons.count;
    }

    const safeModuleIds = Array.from(moduleIds);
    if (safeModuleIds.length > 0) {
      const deletedModules = await prisma.section.deleteMany({
        where: { id: { in: safeModuleIds } }
      });
      deletedModulesCount += deletedModules.count;
    }

    if (createdCourseId) {
      await prisma.section.deleteMany({ where: { channelId: createdCourseId } });
      const deletedCourse = await prisma.channel.deleteMany({
        where: { id: createdCourseId }
      });
      deletedCoursesCount += deletedCourse.count;
    }

    const audit = {
      channelId: createdCourseId,
      canceledJobs: canceledJobsCount,
      deletedJobs: {
        blockScoped: deletedBlockJobsCount,
        versionScoped: deletedVersionJobsCount
      },
      deletedAssets: deletedAssetsCount,
      deletedFiles: {
        ok: deletedFilesCount,
        errors: deletedFileErrorsCount
      },
      removed: {
        videoVersions: deletedVersionsCount,
        blocks: deletedBlocksCount,
        videos: deletedLessonsCount,
        sections: deletedModulesCount,
        courses: deletedCoursesCount
      }
    };
    fastify.log.info({ rollbackAudit: audit }, "Import rollback completed");

    broadcastEntityChanged({
      entity: "import_rollback",
      action: "completed",
      channelId: createdCourseId ?? null,
      occurredAt: new Date().toISOString(),
      removed: {
        channelId: createdCourseId,
        sections: deletedModulesCount || safeModuleIds.length,
        videos: deletedLessonsCount || safeLessonIds.length,
        videoVersions: deletedVersionsCount || safeVersionIds.length
      }
    });

    return reply.code(200).send({
      ok: true,
      audit,
      removed: {
        channelId: createdCourseId,
        sections: deletedModulesCount || safeModuleIds.length,
        videos: deletedLessonsCount || safeLessonIds.length,
        videoVersions: deletedVersionsCount || safeVersionIds.length
      }
    });
  }
);

fastify.get(
  "/jobs/:jobId/stream",
  {
    schema: {
      tags: ["Jobs"],
      summary: "Stream de eventos de um job",
      description: "Retorna um stream SSE com atualizações em tempo real do job"
    }
  },
  async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      return reply.code(404).send({ error: "job not found" });
    }
    const streamCorrelationId =
      parseCorrelationId(request.headers[CORRELATION_ID_HEADER]) ??
      parseCorrelationId(job.requestId) ??
      getRequestCorrelationId(request);
    setRequestScopeMeta(request, {
      workspaceId: job.workspaceId,
      agentId: job.clientId ?? undefined
    });

    reply.hijack();
    const origin = request.headers.origin ?? "*";
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Correlation-Id": streamCorrelationId,
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      Vary: "Origin"
    });
    reply.raw.flushHeaders?.();

    const sendEvent = (event: string, data: unknown) => {
      const payloadBase =
        data && typeof data === "object" && !Array.isArray(data)
          ? { correlationId: streamCorrelationId, ...(data as Record<string, unknown>) }
          : { correlationId: streamCorrelationId, data };
      const payload = enrichDomainAliasJsonValue(payloadBase);
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    let closed = false;
    request.raw.on("close", () => {
      closed = true;
    });

    let lastStatus = job.status;
    let lastBlockCount = 0;
    const blockStates = new Map<string, string>();
    const imageBlockStates = new Set<string>();
    const slideBlockStates = new Set<string>();
    const audioBlockStates = new Set<string>();
    sendEvent("status", { job });

    let expectedBlocks: number | null = null;
    let expectedSlides: number | null = null;
    let lastSlideCount = 0;
    let expectedAudio: number | null = null;
    let lastAudioCount = 0;
    let expectedImages: number | null = null;
    let lastImageCount = 0;
    let expectedClips: number | null = null;
    let lastClipCount = 0;
    let finalVideoSent = false;
    if (job.type === "segment" && job.videoVersionId) {
      const version = await prisma.videoVersion.findUnique({
        where: { id: job.videoVersionId }
      });
      if (version) {
        const drafts = buildDeterministicBlocks(version.scriptText, version.speechRateWps);
        expectedBlocks = drafts.length;
        sendEvent("start", {
          versionId: version.id,
          blockCount: drafts.length
        });
      }
    }
    if (job.type === "render_slide" && job.videoVersionId && job.templateId) {
      const total = await prisma.block.count({
        where: { videoVersionId: job.videoVersionId }
      });
      expectedSlides = total;
      sendEvent("start", {
        versionId: job.videoVersionId,
        blockCount: total,
        mode: "render_slide",
        templateId: job.templateId
      });
    }
    if (job.type === "tts") {
      if (job.blockId) {
        expectedAudio = 1;
        sendEvent("start", {
          blockCount: 1,
          mode: "tts",
          blockId: job.blockId
        });
      } else if (job.videoVersionId) {
        const total = await prisma.block.count({
          where: { videoVersionId: job.videoVersionId }
        });
        expectedAudio = total;
        sendEvent("start", {
          versionId: job.videoVersionId,
          blockCount: total,
          mode: "tts"
        });
      }
    }
    if (job.type === "image") {
      if (job.blockId) {
        expectedImages = 1;
        sendEvent("start", {
          blockCount: 1,
          mode: "image",
          blockId: job.blockId,
          templateId: job.templateId ?? null
        });
      } else if (job.videoVersionId) {
        const total = await prisma.block.count({
          where: { videoVersionId: job.videoVersionId }
        });
        expectedImages = total;
        sendEvent("start", {
          versionId: job.videoVersionId,
          blockCount: total,
          mode: "image",
          templateId: job.templateId ?? null
        });
      }
    }
    if (job.type === "concat_video" && job.videoVersionId) {
      const total = await prisma.block.count({
        where: { videoVersionId: job.videoVersionId }
      });
      expectedClips = total;
      sendEvent("start", {
        versionId: job.videoVersionId,
        blockCount: total,
        mode: "final_video",
        templateId: job.templateId ?? null
      });
    }

    const refresh = async () => {
      if (closed) return;
      try {
        const current = await prisma.job.findUnique({ where: { id: jobId } });
        if (!current) {
          sendEvent(JOB_STREAM_EVENT.ERROR, { message: "job not found" });
          reply.raw.end();
          return;
        }
        if (current.status === "running" && current.leaseExpiresAt && current.leaseExpiresAt.getTime() <= Date.now()) {
          const canceled = await prisma.job.update({
            where: { id: current.id },
            data: {
              status: "canceled",
              error: "lease expired",
              canceledAt: new Date()
            }
          });
          sendEvent("status", { job: canceled });
          sendEvent(JOB_STREAM_EVENT.DONE, { job: canceled });
          reply.raw.end();
          return;
        }
        if (current.status !== lastStatus) {
          lastStatus = current.status;
          sendEvent("status", { job: current });
        }
        if (current.type === "segment" && current.videoVersionId) {
          const blocks = await prisma.block.findMany({
            where: { videoVersionId: current.videoVersionId },
            orderBy: { index: "asc" }
          });
          blocks.forEach((block) => {
            const previous = blockStates.get(block.id);
            if (!previous) {
              blockStates.set(block.id, block.status ?? "");
              if (block.status === "segment_error") {
                sendEvent("block_error", { block });
              } else {
                sendEvent(JOB_STREAM_EVENT.BLOCK, { block, blockMs: block.segmentMs ?? null });
              }
            } else if (previous !== (block.status ?? "")) {
              blockStates.set(block.id, block.status ?? "");
              if (block.status === "segment_error") {
                sendEvent("block_error", { block });
              } else {
                sendEvent(JOB_STREAM_EVENT.BLOCK, { block, blockMs: block.segmentMs ?? null });
              }
            }
          });
          const processedCount = blocks.reduce((sum, block) => {
            return sum + (block.status === "segmentation_done" || block.status === "segment_error" ? 1 : 0);
          }, 0);
          if (processedCount !== lastBlockCount) {
            lastBlockCount = processedCount;
            sendEvent(JOB_STREAM_EVENT.PROGRESS, {
              index: lastBlockCount,
              total: expectedBlocks ?? blocks.length ?? lastBlockCount
            });
          }
        }
        if (current.type === "segment_block" && current.blockId) {
          const block = await prisma.block.findUnique({
            where: { id: current.blockId }
          });
          if (block) {
            const previous = blockStates.get(block.id);
            const statusKey = `${block.status ?? ""}:${block.segmentMs ?? ""}:${block.updatedAt.toISOString()}`;
            if (!previous || previous !== statusKey) {
              blockStates.set(block.id, statusKey);
              if (block.status === "segment_error") {
                sendEvent("block_error", { block });
              } else {
                sendEvent(JOB_STREAM_EVENT.BLOCK, { block, blockMs: block.segmentMs ?? null });
              }
            }
            sendEvent(JOB_STREAM_EVENT.PROGRESS, { index: 1, total: 1 });
          }
        }
        if (current.type === "render_slide" && current.videoVersionId && current.templateId) {
          if (expectedSlides === null) {
            expectedSlides = await prisma.block.count({
              where: { videoVersionId: current.videoVersionId }
            });
          }
          const rendered = await prisma.asset.count({
            where: {
              kind: "slide_png",
              templateId: current.templateId,
              block: { videoVersionId: current.videoVersionId }
            }
          });
          if (rendered !== lastSlideCount) {
            lastSlideCount = rendered;
            sendEvent(JOB_STREAM_EVENT.PROGRESS, {
              index: rendered,
              total: expectedSlides ?? rendered
            });
          }
        }
        if (current.type === "tts") {
          if (expectedAudio === null) {
            if (current.blockId) {
              expectedAudio = 1;
            } else if (current.videoVersionId) {
              expectedAudio = await prisma.block.count({
                where: { videoVersionId: current.videoVersionId }
              });
            }
          }
          let generated = 0;
          if (current.blockId) {
            generated = await prisma.asset.count({
              where: {
                kind: "audio_raw",
                blockId: current.blockId,
                createdAt: { gte: current.createdAt }
              }
            });
            const audioAssets = await prisma.asset.findMany({
              where: {
                kind: "audio_raw",
                blockId: current.blockId,
                createdAt: { gte: current.createdAt }
              },
              select: {
                blockId: true,
                path: true,
                block: { select: { index: true } }
              }
            });
            for (const asset of audioAssets) {
              if (!audioBlockStates.has(asset.blockId)) {
                audioBlockStates.add(asset.blockId);
                sendEvent(JOB_STREAM_EVENT.AUDIO_BLOCK, {
                  blockId: asset.blockId,
                  blockIndex: asset.block?.index ?? null,
                  path: asset.path
                });
              }
            }
          } else if (current.videoVersionId) {
            generated = await prisma.asset.count({
              where: {
                kind: "audio_raw",
                block: { videoVersionId: current.videoVersionId },
                createdAt: { gte: current.createdAt }
              }
            });
            const audioAssets = await prisma.asset.findMany({
              where: {
                kind: "audio_raw",
                block: { videoVersionId: current.videoVersionId },
                createdAt: { gte: current.createdAt }
              },
              select: {
                blockId: true,
                path: true,
                block: { select: { index: true } }
              }
            });
            for (const asset of audioAssets) {
              if (!audioBlockStates.has(asset.blockId)) {
                audioBlockStates.add(asset.blockId);
                sendEvent(JOB_STREAM_EVENT.AUDIO_BLOCK, {
                  blockId: asset.blockId,
                  blockIndex: asset.block?.index ?? null,
                  path: asset.path
                });
              }
            }
          }
          if (generated !== lastAudioCount) {
            lastAudioCount = generated;
            sendEvent(JOB_STREAM_EVENT.PROGRESS, {
              index: generated,
              total: expectedAudio ?? generated
            });
          }
        }
        if (current.type === "image") {
          if (expectedImages === null) {
            if (current.blockId) {
              expectedImages = 1;
            } else if (current.videoVersionId) {
              expectedImages = await prisma.block.count({
                where: { videoVersionId: current.videoVersionId }
              });
            }
          }
          let generated = 0;
          if (current.blockId) {
            generated = await prisma.asset.count({
              where: {
                kind: "image_raw",
                blockId: current.blockId,
                createdAt: { gte: current.createdAt }
              }
            });
          } else if (current.videoVersionId) {
            generated = await prisma.asset.count({
              where: {
                kind: "image_raw",
                block: { videoVersionId: current.videoVersionId },
                createdAt: { gte: current.createdAt }
              }
            });
          }
          if (current.blockId) {
            if (!imageBlockStates.has(current.blockId)) {
              const asset = await prisma.asset.findFirst({
                where: {
                  kind: "image_raw",
                  blockId: current.blockId,
                  createdAt: { gte: current.createdAt }
                },
                orderBy: { createdAt: "desc" }
              });
              if (asset?.path && fs.existsSync(asset.path)) {
                imageBlockStates.add(current.blockId);
                sendEvent(JOB_STREAM_EVENT.IMAGE, {
                  blockId: current.blockId,
                  url: `/blocks/${current.blockId}/image/raw`
                });
              }
            }
            if (current.templateId && !slideBlockStates.has(current.blockId)) {
              const slide = await prisma.asset.findFirst({
                where: {
                  kind: "slide_png",
                  blockId: current.blockId,
                  templateId: current.templateId,
                  createdAt: { gte: current.createdAt }
                },
                orderBy: { createdAt: "desc" }
              });
              if (slide?.path && fs.existsSync(slide.path)) {
                slideBlockStates.add(current.blockId);
                sendEvent("slide", {
                  blockId: current.blockId,
                  templateId: current.templateId,
                  url: `/blocks/${current.blockId}/slide?templateId=${current.templateId}`
                });
              }
            }
          } else if (current.videoVersionId) {
            const assets = await prisma.asset.findMany({
              where: {
                kind: "image_raw",
                block: { videoVersionId: current.videoVersionId },
                createdAt: { gte: current.createdAt }
              },
              orderBy: { createdAt: "desc" },
              distinct: ["blockId"],
              select: { blockId: true, path: true }
            });
            for (const asset of assets) {
              if (!asset.blockId || imageBlockStates.has(asset.blockId)) continue;
              if (!asset.path || !fs.existsSync(asset.path)) continue;
              imageBlockStates.add(asset.blockId);
              sendEvent(JOB_STREAM_EVENT.IMAGE, {
                blockId: asset.blockId,
                url: `/blocks/${asset.blockId}/image/raw`
              });
            }
            if (current.templateId) {
              const slides = await prisma.asset.findMany({
                where: {
                  kind: "slide_png",
                  templateId: current.templateId,
                  block: { videoVersionId: current.videoVersionId },
                  createdAt: { gte: current.createdAt }
                },
                orderBy: { createdAt: "desc" },
                distinct: ["blockId"],
                select: { blockId: true, path: true }
              });
              for (const slide of slides) {
                if (!slide.blockId || slideBlockStates.has(slide.blockId)) continue;
                if (!slide.path || !fs.existsSync(slide.path)) continue;
                slideBlockStates.add(slide.blockId);
                sendEvent("slide", {
                  blockId: slide.blockId,
                  templateId: current.templateId,
                  url: `/blocks/${slide.blockId}/slide?templateId=${current.templateId}`
                });
              }
            }
          }
          if (generated !== lastImageCount) {
            lastImageCount = generated;
            sendEvent(JOB_STREAM_EVENT.PROGRESS, {
              index: generated,
              total: expectedImages ?? generated
            });
          }
        }
        if (current.type === "concat_video" && current.videoVersionId) {
          if (expectedClips === null) {
            expectedClips = await prisma.block.count({
              where: { videoVersionId: current.videoVersionId }
            });
          }
          const rendered = await prisma.asset.count({
            where: {
              kind: "clip_mp4",
              block: { videoVersionId: current.videoVersionId },
              createdAt: { gte: current.createdAt }
            }
          });
          if (rendered !== lastClipCount) {
            lastClipCount = rendered;
            sendEvent(JOB_STREAM_EVENT.PROGRESS, {
              index: rendered,
              total: expectedClips ?? rendered
            });
          } else if ((expectedClips ?? 0) > 0) {
            let progressPercentFromMeta: number | null = null;
            if (typeof current.metaJson === "string" && current.metaJson.trim()) {
              try {
                const meta = JSON.parse(current.metaJson) as { progressPercent?: unknown };
                if (
                  typeof meta.progressPercent === "number" &&
                  Number.isFinite(meta.progressPercent)
                ) {
                  progressPercentFromMeta = meta.progressPercent;
                }
              } catch {
                // ignore malformed metaJson
              }
            }
            if (progressPercentFromMeta !== null) {
              const total = expectedClips ?? 0;
              const percent = Math.max(1, Math.min(99, Math.trunc(progressPercentFromMeta)));
              const estimated = Math.max(1, Math.min(total, Math.ceil((percent / 100) * total)));
              if (estimated !== lastClipCount) {
                lastClipCount = estimated;
                sendEvent(JOB_STREAM_EVENT.PROGRESS, {
                  index: estimated,
                  total
                });
              }
            }
          }
          if (!finalVideoSent) {
            const finalAsset = await prisma.asset.findFirst({
              where: {
                kind: "final_mp4",
                block: { videoVersionId: current.videoVersionId },
                createdAt: { gte: current.createdAt }
              },
              orderBy: { createdAt: "desc" }
            });
            if (finalAsset?.path && fs.existsSync(finalAsset.path)) {
              finalVideoSent = true;
              sendEvent(JOB_STREAM_EVENT.FINAL_VIDEO, {
                url: `/video-versions/${current.videoVersionId}/final-video`
              });
            }
          }
        }
        if (current.status === "succeeded" || current.status === "failed" || current.status === "canceled") {
          sendEvent(JOB_STREAM_EVENT.DONE, { job: current, blockCount: lastBlockCount });
          reply.raw.end();
          return;
        }
      } catch (err) {
        sendEvent(JOB_STREAM_EVENT.ERROR, { message: (err as Error).message });
        reply.raw.end();
        return;
      }
    };
    let refreshQueued = false;
    const scheduleRefresh = () => {
      if (closed || refreshQueued) return;
      refreshQueued = true;
      queueMicrotask(async () => {
        refreshQueued = false;
        await refresh();
      });
    };
    const onSignal = () => {
      scheduleRefresh();
    };
    jobStreamBus.on(jobId, onSignal);
    request.raw.on("close", () => {
      jobStreamBus.off(jobId, onSignal);
    });
    scheduleRefresh();
  }
);

function appendOriginalQuery(request: FastifyRequest, basePath: string): string {
  const rawUrl = request.raw.url ?? "";
  const queryIndex = rawUrl.indexOf("?");
  if (queryIndex === -1) return basePath;
  const query = rawUrl.slice(queryIndex + 1);
  if (!query) return basePath;
  return `${basePath}?${query}`;
}

async function proxyLegacyAlias(request: FastifyRequest, reply: FastifyReply, legacyPath: string) {
  const method = request.method.toUpperCase();
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(request.headers)) {
    if (!value) continue;
    if (key.toLowerCase() === "host") continue;
    if (Array.isArray(value)) {
      headers[key] = value.join(", ");
    } else {
      headers[key] = String(value);
    }
  }

  const injectResponse = (await fastify.inject({
    method: method as any,
    url: appendOriginalQuery(request, legacyPath),
    headers,
    payload: method === "GET" || method === "HEAD" ? undefined : (request.body as Record<string, unknown> | undefined)
  })) as any;

  for (const [key, value] of Object.entries(injectResponse.headers)) {
    if (value === undefined) continue;
    const lower = key.toLowerCase();
    if (lower === "content-length" || lower === "transfer-encoding") continue;
    if (lower === "set-cookie") continue;
    reply.header(key, value as string);
  }

  const setCookieHeader = injectResponse.headers["set-cookie"];
  if (setCookieHeader) {
    reply.header("set-cookie", setCookieHeader as string | string[]);
  }

  reply.code(injectResponse.statusCode);
  if (method === "HEAD" || injectResponse.rawPayload.length === 0) {
    return reply.send();
  }
  const contentType = String(injectResponse.headers["content-type"] ?? "");
  if (contentType.toLowerCase().includes("application/json")) {
    try {
      const parsed = JSON.parse(injectResponse.rawPayload.toString("utf8"));
      return reply.send(enrichDomainAliasJsonValue(parsed));
    } catch {
      // Fall back to raw payload if upstream returned invalid JSON despite content-type.
    }
  }
  return reply.send(injectResponse.rawPayload);
}

// Domain aliases (channel/video) - external API vocabulary while internal schema remains legacy.
fastify.get("/channels", async (request, reply) => proxyLegacyAlias(request, reply, "/courses"));
fastify.post("/channels", async (request, reply) => proxyLegacyAlias(request, reply, "/courses"));
fastify.patch("/channels/:channelId", async (request, reply) => {
  const { channelId } = request.params as { channelId: string };
  return proxyLegacyAlias(request, reply, `/courses/${channelId}`);
});
fastify.delete("/channels/:channelId", async (request, reply) => {
  const { channelId } = request.params as { channelId: string };
  return proxyLegacyAlias(request, reply, `/courses/${channelId}`);
});
fastify.get("/channels/:channelId/build-status", async (request, reply) => {
  const { channelId } = request.params as { channelId: string };
  return proxyLegacyAlias(request, reply, `/courses/${channelId}/build-status`);
});
fastify.get("/channels/:channelId/sections", async (request, reply) => {
  const { channelId } = request.params as { channelId: string };
  return proxyLegacyAlias(request, reply, `/courses/${channelId}/modules`);
});
fastify.post("/channels/:channelId/sections", async (request, reply) => {
  const { channelId } = request.params as { channelId: string };
  return proxyLegacyAlias(request, reply, `/courses/${channelId}/modules`);
});
fastify.patch("/channels/:channelId/structure/reorder", async (request, reply) => {
  const { channelId } = request.params as { channelId: string };
  return proxyLegacyAlias(request, reply, `/courses/${channelId}/structure/reorder`);
});
fastify.post("/channels/:channelId/generation/:phase/cancel", async (request, reply) => {
  const { channelId, phase } = request.params as { channelId: string; phase: string };
  return proxyLegacyAlias(request, reply, `/courses/${channelId}/generation/${phase}/cancel`);
});

fastify.patch("/sections/:sectionId", async (request, reply) => {
  const { sectionId } = request.params as { sectionId: string };
  return proxyLegacyAlias(request, reply, `/modules/${sectionId}`);
});
fastify.delete("/sections/:sectionId", async (request, reply) => {
  const { sectionId } = request.params as { sectionId: string };
  return proxyLegacyAlias(request, reply, `/modules/${sectionId}`);
});
fastify.get("/sections/:sectionId/videos", async (request, reply) => {
  const { sectionId } = request.params as { sectionId: string };
  return proxyLegacyAlias(request, reply, `/modules/${sectionId}/lessons`);
});
fastify.post("/sections/:sectionId/videos", async (request, reply) => {
  const { sectionId } = request.params as { sectionId: string };
  return proxyLegacyAlias(request, reply, `/modules/${sectionId}/lessons`);
});
fastify.post("/sections/:sectionId/generation/:phase/cancel", async (request, reply) => {
  const { sectionId, phase } = request.params as { sectionId: string; phase: string };
  return proxyLegacyAlias(request, reply, `/modules/${sectionId}/generation/${phase}/cancel`);
});

fastify.get("/videos/:videoId", async (request, reply) => {
  const { videoId } = request.params as { videoId: string };
  return proxyLegacyAlias(request, reply, `/lessons/${videoId}`);
});
fastify.patch("/videos/:videoId", async (request, reply) => {
  const { videoId } = request.params as { videoId: string };
  return proxyLegacyAlias(request, reply, `/lessons/${videoId}`);
});
fastify.delete("/videos/:videoId", async (request, reply) => {
  const { videoId } = request.params as { videoId: string };
  return proxyLegacyAlias(request, reply, `/lessons/${videoId}`);
});
fastify.get("/videos/:videoId/versions", async (request, reply) => {
  const { videoId } = request.params as { videoId: string };
  return proxyLegacyAlias(request, reply, `/lessons/${videoId}/versions`);
});
fastify.post("/videos/:videoId/versions", async (request, reply) => {
  const { videoId } = request.params as { videoId: string };
  return proxyLegacyAlias(request, reply, `/lessons/${videoId}/versions`);
});
fastify.post("/videos/:videoId/generation/:phase/cancel", async (request, reply) => {
  const { videoId, phase } = request.params as { videoId: string; phase: string };
  return proxyLegacyAlias(request, reply, `/lessons/${videoId}/generation/${phase}/cancel`);
});

fastify.get("/video-versions/:versionId/blocks", async (request, reply) => {
  const { versionId } = request.params as { versionId: string };
  return proxyLegacyAlias(request, reply, `/lesson-versions/${versionId}/blocks`);
});
fastify.patch("/video-versions/:versionId/preferences", async (request, reply) => {
  const { versionId } = request.params as { versionId: string };
  return proxyLegacyAlias(request, reply, `/lesson-versions/${versionId}/preferences`);
});
fastify.get("/video-versions/:versionId/final-video", async (request, reply) => {
  const { versionId } = request.params as { versionId: string };
  return proxyLegacyAlias(request, reply, `/lesson-versions/${versionId}/final-video`);
});
fastify.get("/video-versions/:versionId/audios", async (request, reply) => {
  const { versionId } = request.params as { versionId: string };
  return proxyLegacyAlias(request, reply, `/lesson-versions/${versionId}/audios`);
});
fastify.get("/video-versions/:versionId/images", async (request, reply) => {
  const { versionId } = request.params as { versionId: string };
  return proxyLegacyAlias(request, reply, `/lesson-versions/${versionId}/images`);
});
fastify.get("/video-versions/:versionId/job-state", async (request, reply) => {
  const { versionId } = request.params as { versionId: string };
  return proxyLegacyAlias(request, reply, `/lesson-versions/${versionId}/job-state`);
});
fastify.get("/video-versions/:versionId/assets", async (request, reply) => {
  const { versionId } = request.params as { versionId: string };
  return proxyLegacyAlias(request, reply, `/lesson-versions/${versionId}/assets`);
});
fastify.post("/video-versions/:versionId/segment", async (request, reply) => {
  const { versionId } = request.params as { versionId: string };
  return proxyLegacyAlias(request, reply, `/lesson-versions/${versionId}/segment`);
});
fastify.post("/video-versions/:versionId/segment-preview", async (request, reply) => {
  const { versionId } = request.params as { versionId: string };
  return proxyLegacyAlias(request, reply, `/lesson-versions/${versionId}/segment-preview`);
});
fastify.post("/video-versions/:versionId/assets", async (request, reply) => {
  const { versionId } = request.params as { versionId: string };
  return proxyLegacyAlias(request, reply, `/lesson-versions/${versionId}/assets`);
});
fastify.post("/video-versions/:versionId/assets/image", async (request, reply) => {
  const { versionId } = request.params as { versionId: string };
  return proxyLegacyAlias(request, reply, `/lesson-versions/${versionId}/assets/image`);
});
fastify.post("/video-versions/:versionId/tts", async (request, reply) => {
  const { versionId } = request.params as { versionId: string };
  return proxyLegacyAlias(request, reply, `/lesson-versions/${versionId}/tts`);
});
fastify.post("/video-versions/:versionId/images", async (request, reply) => {
  const { versionId } = request.params as { versionId: string };
  return proxyLegacyAlias(request, reply, `/lesson-versions/${versionId}/images`);
});
fastify.post("/video-versions/:versionId/final-video", async (request, reply) => {
  const { versionId } = request.params as { versionId: string };
  return proxyLegacyAlias(request, reply, `/lesson-versions/${versionId}/final-video`);
});

fastify.addHook("onClose", async () => {
  await prisma.$disconnect();
});

const start = async () => {
  await fastify.listen({ port: config.apiPort, host: config.apiHost });
};

let shuttingDown = false;
const shutdownSignals: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGBREAK"];

function installShutdownHandlers(): void {
  for (const signal of shutdownSignals) {
    process.on(signal, () => {
      if (shuttingDown) return;
      shuttingDown = true;
      void (async () => {
        try {
          fastify.log.info({ signal }, "Shutting down API");
          await fastify.close();
          process.exit(0);
        } catch (err) {
          fastify.log.error({ err, signal }, "Failed to close API gracefully");
          process.exit(1);
        }
      })();
    });
  }
}

const isDirectExecution = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
})();

if (isDirectExecution && process.env.VIZLEC_SKIP_API_LISTEN !== "true") {
  installShutdownHandlers();
  start().catch((err) => {
    fastify.log.error(err, "Failed to start API");
    process.exit(1);
  });
}

export { fastify };





