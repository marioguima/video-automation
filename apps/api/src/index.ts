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
  buildFallbackMeta,
  ensureAppSettingsFile,
  ensureDataDir,
  getConfig,
  getMissingAppSettingsSecrets,
  loadRootEnv,
  normalizeLlmProvider,
  readAppSettingsFile,
  resolveLlmProviders,
  sanitizeNarratedScriptText,
  writeAppSettingsFile,
  loadVoiceIndex,
  findVoiceById,
  blockSlideDir,
  type AppSettings,
  type VisualGenerationCapability
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
  lessonId: string | null
): Record<string, unknown> | null {
  if (!buildStatus || !lessonId) return null;
  const modules = Array.isArray(buildStatus.modules) ? buildStatus.modules : [];
  for (const moduleItem of modules) {
    if (!moduleItem || typeof moduleItem !== "object") continue;
    const lessons = Array.isArray((moduleItem as Record<string, unknown>).lessons)
      ? ((moduleItem as Record<string, unknown>).lessons as unknown[])
      : [];
    for (const lessonItem of lessons) {
      if (!lessonItem || typeof lessonItem !== "object") continue;
      const lesson = lessonItem as Record<string, unknown>;
      if (normalizeString(lesson.lessonId) !== lessonId) continue;
      const audio = lesson.audio as Record<string, unknown> | undefined;
      const images = lesson.images as Record<string, unknown> | undefined;
      return {
        lessonId: normalizeString(lesson.lessonId),
        lessonVersionId: normalizeString(lesson.lessonVersionId),
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
  const courseId = normalizeString(payload.courseId);
  const moduleId = normalizeString(payload.moduleId);
  const lessonId = normalizeString(payload.lessonId);
  const lessonVersionId = normalizeString(payload.lessonVersionId);
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
        impactedLesson: extractImpactedLessonSnapshot(buildStatusRaw, lessonId)
      }
    : null;

  const canonical = stableJson({
    jobId,
    type,
    status,
    courseId,
    moduleId,
    lessonId,
    lessonVersionId,
    blockId,
    lifecycle,
    phase,
    progressPercent,
    error,
    buildStatus
  });
  const scopeKey = jobId
    ? `job:${jobId}`
    : `agg:${type ?? "unknown"}|${courseId ?? "none"}|${moduleId ?? "none"}|${lessonId ?? "none"}|${lessonVersionId ?? "none"}|${blockId ?? "none"}|${status ?? "none"}`;
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
  if (!shouldBroadcastCanonicalJobUpdate(payload)) return;
  broadcastWsEvent("job_update", payload);
};
const broadcastNotification = (payload: Record<string, unknown>): void => {
  broadcastWsEvent("notification", payload);
};
const broadcastEntityChanged = (payload: Record<string, unknown>): void => {
  broadcastWsEvent("entity_changed", payload);
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

type WorkerInventoryAssetRef = {
  assetId?: string;
  courseId?: string;
  moduleId?: string;
  lessonId?: string;
  lessonVersionId?: string;
  blockId: string;
  kind: string;
  path: string;
  sizeBytes?: number;
  durationSeconds?: number;
};

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
const pairingTokens = new Map<
  string,
  { workspaceId: string; createdByUserId: string; expiresAtMs: number; used: boolean }
>();

type AgentControlCommandName = "ollama_health" | "xtts_health" | "comfyui_health";

type AgentControlMessage =
  | {
      type: "agent_hello";
      messageId: string;
      payload: {
        workspaceId: string;
        agentId: string;
        label?: string | null;
        machineFingerprint?: string | null;
      };
    }
  | {
      type: "agent_heartbeat";
      messageId: string;
      payload: { workspaceId: string; agentId: string };
    }
  | {
      type: "integration_health_response";
      messageId: string;
      inReplyTo: string;
      payload: {
        provider: "ollama" | "xtts" | "comfyui";
        statusCode: number;
        data: Record<string, unknown>;
      };
    }
  | {
      type: "agent_error";
      messageId: string;
      inReplyTo?: string;
      payload: { code: string; message: string };
    }
  | {
      type: "worker_command_response";
      messageId: string;
      inReplyTo: string;
      payload: {
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
          | "lesson_version_job_state";
        statusCode: number;
        data: Record<string, unknown>;
      };
    };

type AgentControlRequestMessage =
  | {
      type: "integration_health_request";
      messageId: string;
      payload: {
        provider: "ollama" | "xtts" | "comfyui";
        options?: Record<string, unknown>;
        correlationId?: string;
      };
    }
  | {
      type: "worker_command_request";
      messageId: string;
      payload: {
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
          | "lesson_version_job_state";
        params?: Record<string, unknown>;
        correlationId?: string;
      };
    };

type AgentIntegrationConfigSnapshot = {
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
      provider?: "ollama" | "xtts" | "comfyui";
      command?:
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
        | "lesson_version_job_state";
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
      courseId: item.courseId?.trim() || undefined,
      moduleId: item.moduleId?.trim() || undefined,
      lessonId: item.lessonId?.trim() || undefined,
      lessonVersionId: item.lessonVersionId?.trim() || undefined
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
          lessonVersionId: true,
          lessonVersion: {
            select: {
              lessonId: true,
              lesson: {
                select: {
                  moduleId: true,
                  module: {
                    select: {
                      courseId: true
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
      courseId: block.lessonVersion.lesson.module.courseId,
      moduleId: block.lessonVersion.lesson.moduleId,
      lessonId: block.lessonVersion.lessonId,
      lessonVersionId: block.lessonVersionId
    };
    const hasHierarchyMismatch =
      (assetRef.courseId && assetRef.courseId !== expected.courseId) ||
      (assetRef.moduleId && assetRef.moduleId !== expected.moduleId) ||
      (assetRef.lessonId && assetRef.lessonId !== expected.lessonId) ||
      (assetRef.lessonVersionId && assetRef.lessonVersionId !== expected.lessonVersionId);
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
            courseId: assetRef.courseId ?? null,
            moduleId: assetRef.moduleId ?? null,
            lessonId: assetRef.lessonId ?? null,
            lessonVersionId: assetRef.lessonVersionId ?? null
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
  inventoryStateByAgent.forEach((state) => {
    if (state.workspaceId !== workspaceId) return;
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
  const provider = normalizeLlmProvider(current.llm?.provider);
  const llmProviders = resolveLlmProviders(current.llm);
  return {
    llmBaseUrl: (llmProviders[provider]?.baseUrl ?? config.ollamaBaseUrl).trim(),
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
  return readAppSettingsFile(config.appSettingsPath, config.appSettingsTemplatePath);
}

function writeAppSettings(next: AppSettings): void {
  writeAppSettingsFile(config.appSettingsPath, next);
}

function initializeAppSettings(): void {
  const result = ensureAppSettingsFile({
    settingsPath: config.appSettingsPath,
    templatePath: config.appSettingsTemplatePath,
    ttsSettingsPath: config.ttsSettingsPath,
    comfySettingsPath: config.comfySettingsPath,
    removeLegacyFiles: true
  });
  if (result.created) {
    fastify.log.info({
      app_settings_path: config.appSettingsPath,
      app_settings_template_path: config.appSettingsTemplatePath
    }, "app_settings_created");
  } else if (result.normalized) {
    fastify.log.info({
      app_settings_path: config.appSettingsPath,
      app_settings_template_path: config.appSettingsTemplatePath
    }, "app_settings_normalized");
  }
  for (const issue of result.missingSecrets) {
    fastify.log.warn({
      provider: issue.provider,
      field: issue.field,
      settings_path: config.appSettingsPath
    }, "app_settings_secret_missing");
  }
}

await ensureSlideTemplates();
initializeAppSettings();

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
      description: "API para gerenciamento de cursos, módulos, lições e geração de conteúdo com IA",
      version: "0.0.1"
    },
    tags: [
      { name: "Auth", description: "Autenticação e autorização" },
      { name: "Team", description: "Gerenciamento de equipe e convites" },
      { name: "Courses", description: "Gerenciamento de cursos" },
      { name: "Modules", description: "Gerenciamento de módulos" },
      { name: "Lessons", description: "Gerenciamento de lições" },
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

  if (currentDescription?.includes("**Inventario de execucao**")) {
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
    const body = request.body as {
      jobId?: string;
      lifecycle?: string;
      phase?: string;
      progressPercent?: number;
    };
    const jobId = body?.jobId?.trim();
    if (!jobId) {
      return reply.code(400).send({ error: "jobId is required" });
    }
    const lifecycle = (() => {
      const value = normalizeString(body?.lifecycle);
      if (!value) return null;
      if (value === "started" || value === "running" || value === "finished") return value;
      return null;
    })();
    const phase = (() => {
      const value = normalizeString(body?.phase);
      if (!value) return null;
      if (value === "cleanup" || value === "generation") return value;
      return null;
    })();
    const progressPercent =
      typeof body?.progressPercent === "number" && Number.isFinite(body.progressPercent)
        ? Math.max(1, Math.min(99, Math.trunc(body.progressPercent)))
        : null;
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        lessonVersion: {
          select: {
            lessonId: true,
            lesson: {
              select: {
                title: true,
                module: {
                  select: {
                    id: true,
                    name: true,
                    course: {
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
            lessonVersionId: true,
            lessonVersion: {
              select: {
                lessonId: true,
                lesson: {
                  select: {
                    title: true,
                    module: {
                      select: {
                        id: true,
                        name: true,
                        course: {
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
    const lessonId =
      job.lessonVersion?.lessonId ?? job.block?.lessonVersion?.lessonId ?? null;
    const lessonVersionId = job.lessonVersionId ?? job.block?.lessonVersionId ?? null;
    const lessonContext = job.lessonVersion?.lesson ?? job.block?.lessonVersion?.lesson ?? null;
    const courseId = lessonContext?.module?.course?.id ?? null;
    const moduleId = lessonContext?.module?.id ?? null;
    const courseName = lessonContext?.module?.course?.name?.trim();
    const moduleName = lessonContext?.module?.name?.trim();
    const lessonTitle = lessonContext?.title?.trim();
    const blockNumber = typeof job.block?.index === "number" ? job.block.index + 1 : null;
    let buildStatus: Awaited<ReturnType<typeof buildCourseDetailedStatus>> | null = null;
    if (courseId) {
      try {
        buildStatus = await buildCourseDetailedStatus(courseId);
      } catch (err) {
        fastify.log.warn({ err, courseId }, "Failed to build course status for job event");
      }
    }

    const jobPayload = {
      correlationId: jobCorrelationId,
      jobId: job.id,
      status: job.status,
      type: job.type,
      courseId,
      moduleId,
      lessonId,
      lessonVersionId,
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
            lessonId: lessonId ?? undefined,
            lessonVersionId: lessonVersionId ?? undefined
          }
        });
        broadcastNotification({
          id: notification.id,
          title: notification.title,
          message: notification.message,
          time: notification.createdAt.toISOString(),
          read: notification.read,
          type: notification.type,
          relatedLessonId: notification.lessonId ?? undefined,
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
    const body = request.body as {
      workspaceId?: string;
      agentId?: string;
      snapshot?: {
        audioCount?: number;
        durationSeconds?: number;
        diskUsageBytes?: number;
        updatedAt?: string;
        assetRefs?: Array<{
          assetId?: string;
          courseId?: string;
          moduleId?: string;
          lessonId?: string;
          lessonVersionId?: string;
          blockId?: string;
          kind?: string;
          path?: string;
          sizeBytes?: number;
          durationSeconds?: number;
        }>;
      };
    };
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

    const next: InventoryState = {
      workspaceId,
      agentId,
      audioCount: Math.trunc(normalizeNonNegativeNumber(body?.snapshot?.audioCount)),
      durationSeconds: normalizeNonNegativeNumber(body?.snapshot?.durationSeconds),
      diskUsageBytes: Math.trunc(normalizeNonNegativeNumber(body?.snapshot?.diskUsageBytes)),
      updatedAt: body?.snapshot?.updatedAt?.trim() || new Date().toISOString()
    };
    const assetRefsRaw = Array.isArray(body?.snapshot?.assetRefs)
      ? body.snapshot.assetRefs
      : null;
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
          .filter((item): item is NonNullable<typeof item> => Boolean(item && typeof item === "object"))
          .map((item) => ({
            assetId: item.assetId,
            courseId: item.courseId,
            moduleId: item.moduleId,
            lessonId: item.lessonId,
            lessonVersionId: item.lessonVersionId,
            blockId: item.blockId?.trim() ?? "",
            kind: item.kind?.trim() ?? "",
            path: item.path?.trim() ?? "",
            sizeBytes: typeof item.sizeBytes === "number" ? item.sizeBytes : undefined,
            durationSeconds:
              typeof item.durationSeconds === "number" ? item.durationSeconds : undefined
          }))
          .filter((item) => Boolean(item.blockId && item.kind && item.path))
      });
    }
    inventoryStateByAgent.set(agentId, next);
    broadcastWsEvent("inventory_reconciled", {
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
    const body = request.body as {
      workspaceId?: string;
      agentId?: string;
      delta?: {
        audioCountDelta?: number;
        durationSecondsDelta?: number;
        diskUsageBytesDelta?: number;
        updatedAt?: string;
      };
    };
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
    const next = applyInventoryDelta(current, {
      audioCountDelta: body?.delta?.audioCountDelta,
      durationSecondsDelta: body?.delta?.durationSecondsDelta,
      diskUsageBytesDelta: body?.delta?.diskUsageBytesDelta,
      updatedAt: body?.delta?.updatedAt
    });
    inventoryStateByAgent.set(agentId, next);
    broadcastWsEvent("inventory_reconciled", {
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

fastify.post(
  "/auth/password",
  {
    schema: {
      tags: ["Auth"],
      summary: "Atualiza a senha do usuário logado",
      description: "Valida a senha atual e grava um novo hash Argon2id para o usuário autenticado",
      body: {
        type: "object",
        required: ["currentPassword", "newPassword"],
        properties: {
          currentPassword: {
            type: "string",
            minLength: 8,
            maxLength: 200,
            description: "Senha atual do usuário"
          },
          newPassword: {
            type: "string",
            minLength: 8,
            maxLength: 200,
            description: "Nova senha do usuário"
          }
        }
      },
      response: {
        200: {
          type: "object",
          description: "Senha atualizada com sucesso",
          properties: { ok: { type: "boolean" } }
        },
        400: {
          type: "object",
          description: "Payload inválido",
          properties: { error: { type: "string" } }
        },
        401: {
          type: "object",
          description: "Não autenticado ou senha atual inválida",
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

    const body = request.body as { currentPassword?: string; newPassword?: string };
    const currentPassword = body?.currentPassword ?? "";
    const newPassword = body?.newPassword ?? "";
    if (
      currentPassword.length < 8 ||
      currentPassword.length > 200 ||
      newPassword.length < 8 ||
      newPassword.length > 200
    ) {
      return reply.code(400).send({ error: "Password must be between 8 and 200 characters." });
    }

    const user = await prisma.user.findUnique({ where: { id: currentUser.id } });
    if (!user) {
      clearAuthCookie(reply);
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const currentPasswordOk = await argon2.verify(user.passwordHash, currentPassword);
    if (!currentPasswordOk) {
      return reply.code(401).send({ error: "Current password is incorrect." });
    }

    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash }
    });

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
        relatedLessonId: item.lessonId ?? undefined,
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
    return prisma.slideTemplate.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "asc" }
    });
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
    const provider = normalizeLlmProvider(current.llm?.provider);
    const providers = resolveLlmProviders(current.llm);
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
        provider,
        providers
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
        providers: current.tts?.providers ?? {},
        languageRoutes: current.tts?.languageRoutes ?? {}
      },
      visualGeneration: current.visualGeneration ?? { providers: {} },
      memory: {
        idleUnloadMs: current.memory?.idleUnloadMs ?? 15 * 60 * 1000
      },
      auth: {
        loginBackground: current.auth?.loginBackground ?? null
      },
      setup: {
        missingSecrets: getMissingAppSettingsSecrets(current)
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
      const provider = (body.llm.provider ?? current.llm?.provider ?? "ollama").trim().toLowerCase();
      if (!["ollama", "gemini", "openai"].includes(provider)) {
        return reply.code(400).send({ error: "llm.provider must be one of: ollama, gemini, openai" });
      }
      const providers = resolveLlmProviders(current.llm);
      for (const [providerKey, providerSettings] of Object.entries(body.llm.providers ?? {})) {
        if (!providerSettings) continue;
        const timeout = providerSettings.timeoutMs;
        if (timeout !== undefined && (!Number.isFinite(timeout) || timeout <= 0)) {
          return reply.code(400).send({ error: `llm.providers.${providerKey}.timeoutMs must be a positive number` });
        }
        providers[providerKey] = {
          ...(providers[providerKey] ?? {}),
          baseUrl: providerSettings.baseUrl ?? providers[providerKey]?.baseUrl,
          model: providerSettings.model ?? providers[providerKey]?.model,
          timeoutMs: timeout !== undefined ? Math.trunc(timeout) : providers[providerKey]?.timeoutMs
        };
        if (providerKey !== "ollama") {
          providers[providerKey].apiKey =
            providerSettings.apiKey !== undefined ? providerSettings.apiKey.trim() : providers[providerKey]?.apiKey ?? "";
        }
      }
      const activeSettings = providers[provider] ?? {};
      const activeApiKey = activeSettings.apiKey?.trim() ?? "";
      if (provider === "gemini" && !activeApiKey) {
        return reply.code(400).send({ error: "Gemini API key is required when Gemini is selected" });
      }
      if (provider === "openai" && !activeApiKey) {
        return reply.code(400).send({ error: "OpenAI API key is required when OpenAI is selected" });
      }
      next.llm = {
        provider,
        providers
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
      const validatePositive = (value: number | undefined, field: string) => {
        if (value === undefined) return;
        if (!Number.isFinite(value) || value <= 0) {
          throw new Error(`${field} must be a positive number`);
        }
      };
      const normalizePositiveInteger = (value: number | undefined): number | undefined =>
        value !== undefined ? Math.trunc(value) : undefined;
      const normalizeLanguageList = (value: unknown, field: string): string[] => {
        if (value === undefined) return [];
        if (!Array.isArray(value)) {
          throw new Error(`${field} must be an array of language codes`);
        }
        const seen = new Set<string>();
        const languages: string[] = [];
        for (const item of value) {
          if (typeof item !== "string") {
            throw new Error(`${field} must contain only strings`);
          }
          const language = item.trim();
          if (!language) continue;
          const key = language.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          languages.push(language);
        }
        return languages;
      };
      const timeoutUs = body.tts.timeoutUs;
      if (timeoutUs !== undefined && (!Number.isFinite(timeoutUs) || timeoutUs <= 0)) {
        return reply.code(400).send({ error: "tts.timeoutUs must be a positive number" });
      }
      try {
        validatePositive(body.tts.targetChars, "tts.targetChars");
        validatePositive(body.tts.maxChars, "tts.maxChars");
        validatePositive(body.tts.targetSpeechSeconds, "tts.targetSpeechSeconds");
        validatePositive(body.tts.maxSpeechSeconds, "tts.maxSpeechSeconds");
        for (const [providerId, providerSettings] of Object.entries(body.tts.providers ?? {})) {
          if (!providerSettings) continue;
          normalizeLanguageList(providerSettings.languages, `tts.providers.${providerId}.languages`);
          validatePositive(providerSettings.timeoutUs, `tts.providers.${providerId}.timeoutUs`);
          validatePositive(providerSettings.targetChars, `tts.providers.${providerId}.targetChars`);
          validatePositive(providerSettings.maxChars, `tts.providers.${providerId}.maxChars`);
          validatePositive(providerSettings.targetSpeechSeconds, `tts.providers.${providerId}.targetSpeechSeconds`);
          validatePositive(providerSettings.maxSpeechSeconds, `tts.providers.${providerId}.maxSpeechSeconds`);
        }
        for (const [language, routeSettings] of Object.entries(body.tts.languageRoutes ?? {})) {
          if (!routeSettings) continue;
          if (!language.trim()) {
            throw new Error("tts.languageRoutes keys must be non-empty language codes");
          }
          validatePositive(routeSettings.targetChars, `tts.languageRoutes.${language}.targetChars`);
          validatePositive(routeSettings.maxChars, `tts.languageRoutes.${language}.maxChars`);
          validatePositive(routeSettings.targetSpeechSeconds, `tts.languageRoutes.${language}.targetSpeechSeconds`);
          validatePositive(routeSettings.maxSpeechSeconds, `tts.languageRoutes.${language}.maxSpeechSeconds`);
        }
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }

      const providers = { ...(current.tts?.providers ?? {}) };
      for (const [providerId, providerSettings] of Object.entries(body.tts.providers ?? {})) {
        if (!providerSettings) continue;
        providers[providerId] = {
          ...(providers[providerId] ?? {}),
          provider: providerSettings.provider ?? providers[providerId]?.provider,
          displayName: providerSettings.displayName ?? providers[providerId]?.displayName,
          baseUrl: providerSettings.baseUrl ?? providers[providerId]?.baseUrl,
          timeoutUs: normalizePositiveInteger(providerSettings.timeoutUs) ?? providers[providerId]?.timeoutUs,
          language: providerSettings.language ?? providers[providerId]?.language,
          languages:
            providerSettings.languages !== undefined
              ? normalizeLanguageList(providerSettings.languages, `tts.providers.${providerId}.languages`)
              : providers[providerId]?.languages,
          defaultVoiceId: providerSettings.defaultVoiceId ?? providers[providerId]?.defaultVoiceId,
          useCase: providerSettings.useCase ?? providers[providerId]?.useCase,
          targetChars: normalizePositiveInteger(providerSettings.targetChars) ?? providers[providerId]?.targetChars,
          maxChars: normalizePositiveInteger(providerSettings.maxChars) ?? providers[providerId]?.maxChars,
          targetSpeechSeconds:
            providerSettings.targetSpeechSeconds !== undefined
              ? providerSettings.targetSpeechSeconds
              : providers[providerId]?.targetSpeechSeconds,
          maxSpeechSeconds:
            providerSettings.maxSpeechSeconds !== undefined
              ? providerSettings.maxSpeechSeconds
              : providers[providerId]?.maxSpeechSeconds
        };
      }

      const languageRoutes =
        body.tts.languageRoutes !== undefined
          ? {}
          : { ...(current.tts?.languageRoutes ?? {}) };
      for (const [language, routeSettings] of Object.entries(body.tts.languageRoutes ?? {})) {
        if (!routeSettings) continue;
        languageRoutes[language] = {
          ...(languageRoutes[language] ?? {}),
          providerId: routeSettings.providerId ?? languageRoutes[language]?.providerId,
          voiceId: routeSettings.voiceId ?? languageRoutes[language]?.voiceId,
          targetChars: normalizePositiveInteger(routeSettings.targetChars) ?? languageRoutes[language]?.targetChars,
          maxChars: normalizePositiveInteger(routeSettings.maxChars) ?? languageRoutes[language]?.maxChars,
          targetSpeechSeconds:
            routeSettings.targetSpeechSeconds !== undefined
              ? routeSettings.targetSpeechSeconds
              : languageRoutes[language]?.targetSpeechSeconds,
          maxSpeechSeconds:
            routeSettings.maxSpeechSeconds !== undefined
              ? routeSettings.maxSpeechSeconds
              : languageRoutes[language]?.maxSpeechSeconds
        };
      }

      const languageOwners = new Map<string, string>();
      for (const [providerId, providerSettings] of Object.entries(providers)) {
        if (!providerSettings) continue;
        for (const language of providerSettings.languages ?? []) {
          const key = language.trim().toLowerCase();
          if (!key) continue;
          const existingProviderId = languageOwners.get(key);
          if (existingProviderId && existingProviderId !== providerId) {
            return reply.code(400).send({
              error: `TTS language '${language}' is assigned to both '${existingProviderId}' and '${providerId}'`
            });
          }
          languageOwners.set(key, providerId);
          if (languageRoutes[language]?.providerId && languageRoutes[language]?.providerId !== providerId) {
            return reply.code(400).send({
              error: `tts.languageRoutes.${language}.providerId must match the TTS provider that owns the language`
            });
          }
          const providerVoiceId =
            typeof providerSettings.defaultVoiceId === "string" ? providerSettings.defaultVoiceId.trim() : "";
          const routeVoiceId =
            typeof languageRoutes[language]?.voiceId === "string" ? languageRoutes[language]?.voiceId.trim() : "";
          if (!providerVoiceId && !routeVoiceId) {
            return reply.code(400).send({
              error: `tts.providers.${providerId}.defaultVoiceId is required when language '${language}' is assigned`
            });
          }
          if (!languageRoutes[language]) {
            languageRoutes[language] = {
              providerId,
              voiceId: providerSettings.defaultVoiceId ?? null,
              targetChars: providerSettings.targetChars,
              maxChars: providerSettings.maxChars,
              targetSpeechSeconds: providerSettings.targetSpeechSeconds,
              maxSpeechSeconds: providerSettings.maxSpeechSeconds
            };
          } else if (!languageRoutes[language]?.voiceId && providerSettings.defaultVoiceId) {
            languageRoutes[language] = {
              ...languageRoutes[language],
              voiceId: providerSettings.defaultVoiceId
            };
          }
        }
      }
      for (const [language, routeSettings] of Object.entries(languageRoutes)) {
        if (!routeSettings?.providerId) continue;
        if (!providers[routeSettings.providerId]) {
          return reply.code(400).send({
            error: `tts.languageRoutes.${language}.providerId must reference a configured TTS provider`
          });
        }
      }

      next.tts = {
        providers,
        languageRoutes
      };
    }
    if (body.visualGeneration) {
      const normalizeStringList = (value: unknown, field: string): string[] | undefined => {
        if (value === undefined) return undefined;
        if (!Array.isArray(value)) {
          throw new Error(`${field} must be an array`);
        }
        const seen = new Set<string>();
        const result: string[] = [];
        for (const item of value) {
          if (typeof item !== "string") {
            throw new Error(`${field} must contain only strings`);
          }
          const normalized = item.trim();
          if (!normalized) continue;
          const key = normalized.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          result.push(normalized);
        }
        return result;
      };
      const normalizeNumberList = (value: unknown, field: string): number[] | undefined => {
        if (value === undefined) return undefined;
        if (!Array.isArray(value)) {
          throw new Error(`${field} must be an array`);
        }
        const result: number[] = [];
        for (const item of value) {
          if (typeof item !== "number" || !Number.isFinite(item) || item <= 0) {
            throw new Error(`${field} must contain only positive numbers`);
          }
          result.push(item);
        }
        return result;
      };
      const providers = { ...(current.visualGeneration?.providers ?? {}) };
      try {
        for (const [providerId, providerSettings] of Object.entries(body.visualGeneration.providers ?? {})) {
          if (!providerSettings) continue;
          const existingProvider = providers[providerId] ?? {};
          const models = { ...(existingProvider.models ?? {}) };
          for (const [modelId, modelSettings] of Object.entries(providerSettings.models ?? {})) {
            if (!modelSettings) continue;
            const existingModel = models[modelId] ?? {};
            const acceptedDurationsSeconds = normalizeNumberList(
              modelSettings.acceptedDurationsSeconds,
              `visualGeneration.providers.${providerId}.models.${modelId}.acceptedDurationsSeconds`
            );
            const maxNativeSpeechSeconds = modelSettings.maxNativeSpeechSeconds;
            if (
              maxNativeSpeechSeconds !== undefined &&
              (!Number.isFinite(maxNativeSpeechSeconds) || maxNativeSpeechSeconds <= 0)
            ) {
              throw new Error(
                `visualGeneration.providers.${providerId}.models.${modelId}.maxNativeSpeechSeconds must be a positive number`
              );
            }
            models[modelId] = {
              ...existingModel,
              displayName: modelSettings.displayName ?? existingModel.displayName,
              kind: modelSettings.kind ?? existingModel.kind,
              acceptedAspectRatios:
                normalizeStringList(
                  modelSettings.acceptedAspectRatios,
                  `visualGeneration.providers.${providerId}.models.${modelId}.acceptedAspectRatios`
                ) ?? existingModel.acceptedAspectRatios,
              acceptedDurationsSeconds: acceptedDurationsSeconds ?? existingModel.acceptedDurationsSeconds,
              maxNativeSpeechSeconds:
                maxNativeSpeechSeconds !== undefined ? maxNativeSpeechSeconds : existingModel.maxNativeSpeechSeconds,
              supportsNativeAudio:
                modelSettings.supportsNativeAudio !== undefined
                  ? modelSettings.supportsNativeAudio
                  : existingModel.supportsNativeAudio,
              supportsPromptEnhancement:
                modelSettings.supportsPromptEnhancement !== undefined
                  ? modelSettings.supportsPromptEnhancement
                  : existingModel.supportsPromptEnhancement,
              costTier: modelSettings.costTier ?? existingModel.costTier,
              notes: modelSettings.notes ?? existingModel.notes
            };
          }
          providers[providerId] = {
            ...existingProvider,
            provider: providerSettings.provider ?? existingProvider.provider,
            displayName: providerSettings.displayName ?? existingProvider.displayName,
            baseUrl: providerSettings.baseUrl ?? existingProvider.baseUrl,
            capabilities:
              (normalizeStringList(
                providerSettings.capabilities,
                `visualGeneration.providers.${providerId}.capabilities`
              ) as VisualGenerationCapability[] | undefined) ??
              existingProvider.capabilities as VisualGenerationCapability[] | undefined,
            useCase: providerSettings.useCase ?? existingProvider.useCase,
            models
          };
        }
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }
      next.visualGeneration = { providers };
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
  lessonId: string;
  moduleId: string;
  lessonVersionId: string | null;
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

async function buildLessonSnapshotsByCourse(courseId: string): Promise<LessonBuildSnapshot[]> {
  const modules = await prisma.module.findMany({
    where: { courseId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true }
  });
  if (modules.length === 0) return [];
  const moduleIds = modules.map((item) => item.id);
  const lessons = await prisma.lesson.findMany({
    where: { moduleId: { in: moduleIds } },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, moduleId: true, title: true }
  });
  if (lessons.length === 0) return [];
  const lessonIds = lessons.map((item) => item.id);
  const versions = await prisma.lessonVersion.findMany({
    where: { lessonId: { in: lessonIds } },
    orderBy: [{ lessonId: "asc" }, { createdAt: "desc" }],
    select: { id: true, lessonId: true, createdAt: true }
  });
  const latestVersionByLesson = new Map<string, { id: string; createdAt: Date }>();
  for (const version of versions) {
    if (!latestVersionByLesson.has(version.lessonId)) {
      latestVersionByLesson.set(version.lessonId, {
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
      by: ["lessonVersionId"],
      where: { lessonVersionId: { in: versionIds } },
      _count: { _all: true }
    });
    blockGroups.forEach((row) => {
      blocksTotalByVersion.set(row.lessonVersionId, row._count._all);
    });

    const blocksReadyGroups = await prisma.block.groupBy({
      by: ["lessonVersionId"],
      where: {
        lessonVersionId: { in: versionIds },
        onScreenJson: { not: null },
        imagePromptJson: { not: null }
      },
      _count: { _all: true }
    });
    blocksReadyGroups.forEach((row) => {
      blocksReadyByVersion.set(row.lessonVersionId, row._count._all);
    });

    const audioAssets = await prisma.asset.findMany({
      where: {
        kind: "audio_raw",
        block: { lessonVersionId: { in: versionIds } }
      },
      distinct: ["blockId"],
      select: {
        block: { select: { lessonVersionId: true } }
      }
    });
    audioAssets.forEach((item) => {
      const versionId = item.block.lessonVersionId;
      audioReadyByVersion.set(versionId, (audioReadyByVersion.get(versionId) ?? 0) + 1);
    });

    const audioDurationGroups = await prisma.block.groupBy({
      by: ["lessonVersionId"],
      where: {
        lessonVersionId: { in: versionIds },
        audioDurationS: { not: null }
      },
      _sum: { audioDurationS: true }
    });
    audioDurationGroups.forEach((row) => {
      const total = row._sum.audioDurationS;
      if (typeof total === "number" && Number.isFinite(total) && total > 0) {
        audioDurationByVersion.set(row.lessonVersionId, total);
      }
    });

    const imageAssets = await prisma.asset.findMany({
      where: {
        kind: { in: ["image_raw", "slide_png"] },
        block: { lessonVersionId: { in: versionIds } }
      },
      distinct: ["blockId"],
      select: {
        block: { select: { lessonVersionId: true } }
      }
    });
    imageAssets.forEach((item) => {
      const versionId = item.block.lessonVersionId;
      imagesReadyByVersion.set(versionId, (imagesReadyByVersion.get(versionId) ?? 0) + 1);
    });

    const finalVideoAssets = await prisma.asset.findMany({
      where: {
        kind: "final_mp4",
        block: { lessonVersionId: { in: versionIds } }
      },
      distinct: ["blockId"],
      select: {
        block: { select: { lessonVersionId: true } }
      }
    });
    finalVideoAssets.forEach((item) => {
      finalVideoReadyByVersion.set(item.block.lessonVersionId, true);
    });

    const activeJobs = await prisma.job.findMany({
      where: {
        lessonVersionId: { in: versionIds },
        status: { in: ["pending", "running"] }
      },
      select: { lessonVersionId: true, type: true, status: true }
    });
    activeJobs.forEach((job) => {
      if (!job.lessonVersionId) return;
      const step = mapJobTypeToStep(job.type);
      if (!step) return;
      if (!jobCountsByVersion.has(job.lessonVersionId)) {
        jobCountsByVersion.set(job.lessonVersionId, createEmptyJobCounts());
      }
      const counts = jobCountsByVersion.get(job.lessonVersionId)!;
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
        lessonId: lesson.id,
        moduleId: lesson.moduleId,
        lessonVersionId: null,
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
      lessonId: lesson.id,
      moduleId: lesson.moduleId,
      lessonVersionId: versionId,
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

async function buildCourseDetailedStatus(courseId: string, workspaceId?: string) {
  if (workspaceId) {
    const course = await prisma.course.findFirst({
      where: { id: courseId, workspaceId },
      select: { id: true }
    });
    if (!course) return null;
  }
  const modules = await prisma.module.findMany({
    where: { courseId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, order: true }
  });
  const lessons = await prisma.lesson.findMany({
    where: { moduleId: { in: modules.map((item) => item.id) } },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, moduleId: true, order: true, title: true }
  });
  const lessonSnapshots = await buildLessonSnapshotsByCourse(courseId);
  const lessonSnapshotMap = new Map(lessonSnapshots.map((item) => [item.lessonId, item]));

  const modulesOut = modules.map((module) => {
    const moduleLessons = lessons
      .filter((lesson) => lesson.moduleId === module.id)
      .map((lesson) => {
        const snapshot = lessonSnapshotMap.get(lesson.id);
        return {
          lessonId: lesson.id,
          title: lesson.title,
          order: lesson.order,
          lessonVersionId: snapshot?.lessonVersionId ?? null,
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
      moduleId: module.id,
      name: module.name,
      order: module.order,
      progressPercent,
      jobs,
      lessons: moduleLessons
    };
  });

  const courseProgressPercent = modulesOut.length > 0 ? Math.round(modulesOut.reduce((sum, module) => sum + module.progressPercent, 0) / modulesOut.length) : 0;
  const jobs = modulesOut.reduce((acc, module) => mergeJobCounts(acc, module.jobs), createEmptyJobCounts());
  return {
    courseId,
    progressPercent: courseProgressPercent,
    jobs,
    modules: modulesOut
  };
}

async function buildCourseBuildSummaries(courseIds: string[], workspaceId?: string) {
  const output: Record<string, { progressPercent: number; jobs: BuildJobCounts }> = {};
  await Promise.all(
    courseIds.map(async (courseId) => {
      const detailed = await buildCourseDetailedStatus(courseId, workspaceId);
      if (!detailed) return;
      output[courseId] = {
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
    prisma.course.count({ where: { workspaceId } }),
    prisma.lesson.count({ where: { module: { course: { workspaceId } } } }),
    prisma.course.count({
      where: { workspaceId, createdAt: { gte: range.since } }
    }),
    prisma.lesson.count({
      where: {
        createdAt: { gte: range.since },
        module: { course: { workspaceId } }
      }
    }),
    prisma.lessonVersion.findMany({
      where: { lesson: { module: { course: { workspaceId } } } },
      orderBy: [{ lessonId: "asc" }, { createdAt: "desc" }],
      select: { id: true, lessonId: true, createdAt: true }
    }),
    prisma.asset.findMany({
      where: {
        block: {
          lessonVersion: { lesson: { module: { course: { workspaceId } } } }
        }
      },
      select: { path: true, createdAt: true }
    })
  ]);

  const latestVersionByLesson = new Map<string, { id: string; createdAt: Date }>();
  for (const version of versions) {
    if (!latestVersionByLesson.has(version.lessonId)) {
      latestVersionByLesson.set(version.lessonId, {
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
        block: { lessonVersionId: { in: latestVersionIds } }
      },
      select: {
        blockId: true,
        createdAt: true,
        path: true,
        block: {
          select: {
            lessonVersionId: true,
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
        lessonVersionId: string;
        audioDurationS: number | null;
      }
    >();
    for (const item of audioAssets) {
      if (latestAssetByBlock.has(item.blockId)) continue;
      latestAssetByBlock.set(item.blockId, {
        createdAt: item.createdAt,
        path: item.path,
        lessonVersionId: item.block.lessonVersionId,
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
      durationByVersionId.set(item.lessonVersionId, (durationByVersionId.get(item.lessonVersionId) ?? 0) + duration);
      if (item.createdAt >= range.since) {
        rangeDurationByVersionId.set(item.lessonVersionId, (rangeDurationByVersionId.get(item.lessonVersionId) ?? 0) + duration);
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
      lessons: totalLessons,
      audioCount: reconciliation.reconciled.audioCount,
      contentSeconds: reconciliation.reconciled.durationSeconds,
      storageUsedBytes: reconciledStorageUsedBytes
    },
    growth: {
      courses: rangeCourses,
      lessons: rangeLessons,
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
              required: ["courses", "lessons", "audioCount", "contentSeconds", "storageUsedBytes"],
              properties: {
                courses: { type: "number" },
                lessons: { type: "number" },
                audioCount: { type: "number" },
                contentSeconds: { type: "number" },
                storageUsedBytes: { type: "number" }
              }
            },
            growth: {
              type: "object",
              required: ["courses", "lessons", "contentSeconds", "storageUsedBytes"],
              properties: {
                courses: { type: "number" },
                lessons: { type: "number" },
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
    const courses = await prisma.course.findMany({
      where: { workspaceId: auth.scope.workspaceId },
      orderBy: { createdAt: "desc" },
      include: {
        modules: {
          select: {
            _count: {
              select: {
                lessons: true
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
      modulesCount: course.modules.length,
      lessonsCount: course.modules.reduce((total, moduleItem) => total + moduleItem._count.lessons, 0),
      build: summaryMap[course.id] ?? {
        progressPercent: 0,
        jobs: createEmptyJobCounts()
      }
    }));
  }
);

fastify.get(
  "/courses/:courseId/build-status",
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
    const { courseId } = request.params as { courseId: string };
    const course = await prisma.course.findFirst({
      where: { id: courseId, workspaceId: auth.scope.workspaceId }
    });
    if (!course) {
      return reply.code(404).send({ error: "course not found" });
    }
    const detailed = await buildCourseDetailedStatus(courseId, auth.scope.workspaceId);
    return reply.code(200).send(detailed);
  }
);

const COURSE_STATUS_VALUES = new Set(["draft", "active", "archived"]);
const HOTMART_PRODUCT_LANGUAGE_VALUES = new Set(["PT_BR", "ES", "EN", "FR", "PT_PT", "RU", "AR", "DE", "JA", "IT"]);
const KIWIFY_EMAIL_LANGUAGE_VALUES = new Set(["PT", "EN", "ES"]);
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

const CONTENT_ITEM_KIND_VALUES = new Set(["content", "video", "image", "ebook", "audio", "music_video"]);
const CONTENT_ORIENTATION_VALUES = new Set(["horizontal", "vertical", "square"]);

function normalizeJsonRecord(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) return undefined;
  return JSON.stringify(value);
}

function parseJsonRecord(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

type ProjectPipelineScriptMode = "none" | "scene_blocks" | "music_storyboard";
type ProjectPipelineAudioMode = "none" | "tts" | "music" | "video_native_audio";
type ProjectPipelineVideoMode = "none" | "editor_motion" | "text_to_video" | "image_to_video" | "looped_clips";
type ProjectPipelineRenderOutputMode = "images_only" | "single_video" | "clips";

type NormalizedProjectPipeline = {
  version: 1;
  script: { mode: ProjectPipelineScriptMode };
  audio: { mode: ProjectPipelineAudioMode };
  image: { enabled: boolean };
  video: { mode: ProjectPipelineVideoMode };
  render: { outputMode: ProjectPipelineRenderOutputMode };
};

const PROJECT_PIPELINE_SCRIPT_MODES = new Set<ProjectPipelineScriptMode>(["none", "scene_blocks", "music_storyboard"]);
const PROJECT_PIPELINE_AUDIO_MODES = new Set<ProjectPipelineAudioMode>(["none", "tts", "music", "video_native_audio"]);
const PROJECT_PIPELINE_VIDEO_MODES = new Set<ProjectPipelineVideoMode>([
  "none",
  "editor_motion",
  "text_to_video",
  "image_to_video",
  "looped_clips"
]);
const PROJECT_PIPELINE_RENDER_OUTPUT_MODES = new Set<ProjectPipelineRenderOutputMode>(["images_only", "single_video", "clips"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function normalizeProjectPipelineEnum<T extends string>(
  value: unknown,
  allowed: Set<T>,
  fallback: T,
  field: string
): { value: T } | { error: string } {
  if (value === undefined || value === null || value === "") return { value: fallback };
  if (typeof value !== "string" || !allowed.has(value as T)) {
    return { error: `${field} must be one of: ${Array.from(allowed).join(", ")}` };
  }
  return { value: value as T };
}

function deriveProjectPipelineFromLegacy(metadata: Record<string, unknown>): NormalizedProjectPipeline {
  const tts = asRecord(metadata.tts);
  const visualGeneration = asRecord(metadata.visualGeneration);
  const image = asRecord(visualGeneration?.image);
  const video = asRecord(visualGeneration?.video);
  const videoKind = normalizeOptionalText(video?.kind);
  const videoMode: ProjectPipelineVideoMode = video
    ? image && videoKind === "image_to_video"
      ? "image_to_video"
      : "text_to_video"
    : "none";
  return {
    version: 1,
    script: { mode: "scene_blocks" },
    audio: { mode: tts ? "tts" : "none" },
    image: { enabled: Boolean(image) },
    video: { mode: videoMode },
    render: { outputMode: video ? "single_video" : image ? "images_only" : "single_video" }
  };
}

function normalizeProjectPipelineMetadata(
  value: unknown,
  metadata: Record<string, unknown>
): { value?: NormalizedProjectPipeline; error?: string } {
  const fallback = deriveProjectPipelineFromLegacy(metadata);
  if (value === undefined || value === null) return { value: fallback };
  const raw = asRecord(value);
  if (!raw) return { error: "metadata.pipeline must be an object" };

  const script = asRecord(raw.script);
  const audio = asRecord(raw.audio);
  const image = asRecord(raw.image);
  const video = asRecord(raw.video);
  const render = asRecord(raw.render);

  const scriptMode = normalizeProjectPipelineEnum(
    script?.mode,
    PROJECT_PIPELINE_SCRIPT_MODES,
    fallback.script.mode,
    "metadata.pipeline.script.mode"
  );
  if ("error" in scriptMode) return { error: scriptMode.error };

  const audioMode = normalizeProjectPipelineEnum(
    audio?.mode,
    PROJECT_PIPELINE_AUDIO_MODES,
    fallback.audio.mode,
    "metadata.pipeline.audio.mode"
  );
  if ("error" in audioMode) return { error: audioMode.error };

  const videoMode = normalizeProjectPipelineEnum(
    video?.mode,
    PROJECT_PIPELINE_VIDEO_MODES,
    fallback.video.mode,
    "metadata.pipeline.video.mode"
  );
  if ("error" in videoMode) return { error: videoMode.error };

  const renderOutputMode = normalizeProjectPipelineEnum(
    render?.outputMode,
    PROJECT_PIPELINE_RENDER_OUTPUT_MODES,
    fallback.render.outputMode,
    "metadata.pipeline.render.outputMode"
  );
  if ("error" in renderOutputMode) return { error: renderOutputMode.error };

  const imageEnabled =
    typeof image?.enabled === "boolean"
      ? image.enabled
      : videoMode.value === "editor_motion" || videoMode.value === "image_to_video"
        ? true
        : fallback.image.enabled;

  if ((videoMode.value === "editor_motion" || videoMode.value === "image_to_video") && !imageEnabled) {
    return { error: "metadata.pipeline.image.enabled must be true when video mode uses generated images" };
  }
  if (audioMode.value === "video_native_audio" && (videoMode.value === "none" || videoMode.value === "editor_motion")) {
    return { error: "metadata.pipeline.video.mode must use a video generation provider when audio mode is video_native_audio" };
  }
  if (renderOutputMode.value === "images_only" && !imageEnabled) {
    return { error: "metadata.pipeline.image.enabled must be true when render output is images_only" };
  }

  return {
    value: {
      version: 1,
      script: { mode: scriptMode.value },
      audio: { mode: audioMode.value },
      image: { enabled: imageEnabled },
      video: { mode: videoMode.value },
      render: { outputMode: renderOutputMode.value }
    }
  };
}

function normalizeProjectTtsMetadata(value: unknown, required = false): { value?: Record<string, unknown>; error?: string } {
  if (value === undefined || value === null) {
    return required ? { error: "metadata.tts is required when metadata.pipeline.audio.mode is tts" } : {};
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return { error: "metadata.tts must be an object" };
  }
  const raw = value as Record<string, unknown>;
  const providerId = normalizeOptionalText(raw.providerId);
  const languageInput = normalizeOptionalText(raw.language);
  if (!providerId) return { error: "metadata.tts.providerId is required" };
  if (!languageInput) return { error: "metadata.tts.language is required" };

  const settings = readAppSettings();
  const provider = settings.tts?.providers?.[providerId];
  if (!provider) {
    return { error: `metadata.tts.providerId '${providerId}' is not configured` };
  }

  const routeEntry = Object.entries(settings.tts?.languageRoutes ?? {}).find(
    ([language, route]) => language.toLowerCase() === languageInput.toLowerCase() && route?.providerId === providerId
  );
  if (!routeEntry) {
    return { error: `metadata.tts language '${languageInput}' is not assigned to provider '${providerId}'` };
  }
  const [language, route] = routeEntry;
  return {
    value: {
      mode: "external_tts",
      providerId,
      provider: provider.provider ?? providerId,
      language,
      voiceId: route?.voiceId ?? provider.defaultVoiceId ?? null,
      targetChars: route?.targetChars ?? provider.targetChars ?? null,
      maxChars: route?.maxChars ?? provider.maxChars ?? null,
      targetSpeechSeconds: route?.targetSpeechSeconds ?? provider.targetSpeechSeconds ?? null,
      maxSpeechSeconds: route?.maxSpeechSeconds ?? provider.maxSpeechSeconds ?? null
    }
  };
}

function normalizeProjectVisualModelMetadata(
  value: unknown,
  field: "image" | "video",
  required: boolean
): { value?: Record<string, unknown> | null; error?: string } {
  if (value === undefined || value === null) {
    return required ? { error: `metadata.visualGeneration.${field} is required` } : { value: null };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return { error: `metadata.visualGeneration.${field} must be an object` };
  }
  const raw = value as Record<string, unknown>;
  const providerId = normalizeOptionalText(raw.providerId);
  const modelId = normalizeOptionalText(raw.modelId);
  if (!providerId) return { error: `metadata.visualGeneration.${field}.providerId is required` };
  if (!modelId) return { error: `metadata.visualGeneration.${field}.modelId is required` };

  const settings = readAppSettings();
  const provider = settings.visualGeneration?.providers?.[providerId];
  if (!provider) {
    return { error: `metadata.visualGeneration.${field}.providerId '${providerId}' is not configured` };
  }
  const model = provider.models?.[modelId];
  if (!model) {
    return { error: `metadata.visualGeneration.${field}.modelId '${modelId}' is not configured for '${providerId}'` };
  }
  const kind = model.kind ?? (field === "image" ? "text_to_image" : "image_to_video");
  const imageKinds = new Set(["text_to_image", "image_to_image"]);
  const videoKinds = new Set(["text_to_video", "image_to_video"]);
  if (field === "image" && !imageKinds.has(kind)) {
    return { error: `metadata.visualGeneration.image.modelId '${modelId}' is not an image generation model` };
  }
  if (field === "video" && !videoKinds.has(kind)) {
    return { error: `metadata.visualGeneration.video.modelId '${modelId}' is not a video generation model` };
  }
  return {
    value: {
      providerId,
      provider: provider.provider ?? providerId,
      providerLabel: provider.displayName ?? providerId,
      modelId,
      modelLabel: model.displayName ?? modelId,
      kind,
      acceptedAspectRatios: model.acceptedAspectRatios ?? null,
      acceptedDurationsSeconds: model.acceptedDurationsSeconds ?? null,
      maxNativeSpeechSeconds: model.maxNativeSpeechSeconds ?? null,
      supportsNativeAudio: model.supportsNativeAudio ?? false,
      supportsPromptEnhancement: model.supportsPromptEnhancement ?? false,
      costTier: model.costTier ?? null
    }
  };
}

function normalizeProjectVisualGenerationMetadata(
  value: unknown,
  options: { imageRequired?: boolean; videoRequired?: boolean } = {}
): { value?: Record<string, unknown>; error?: string } {
  const imageRequired = options.imageRequired ?? false;
  const videoRequired = options.videoRequired ?? false;
  if (value === undefined || value === null) {
    if (imageRequired || videoRequired) {
      return { error: "metadata.visualGeneration is required by metadata.pipeline" };
    }
    return {};
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return { error: "metadata.visualGeneration must be an object" };
  }
  const raw = value as Record<string, unknown>;
  const image = normalizeProjectVisualModelMetadata(raw.image, "image", imageRequired);
  if (image.error) return { error: image.error };
  const video = normalizeProjectVisualModelMetadata(raw.video, "video", videoRequired);
  if (video.error) return { error: video.error };
  return {
    value: {
      image: image.value,
      video: video.value ?? null
    }
  };
}

function validateProjectPipelineVisualSelections(
  pipeline: NormalizedProjectPipeline,
  visualGeneration: Record<string, unknown> | undefined
): string | null {
  const image = asRecord(visualGeneration?.image);
  const video = asRecord(visualGeneration?.video);
  const videoKind = normalizeOptionalText(video?.kind);

  if (pipeline.image.enabled && !image) {
    return "metadata.visualGeneration.image is required when metadata.pipeline.image.enabled is true";
  }
  if (pipeline.video.mode === "editor_motion" && !image) {
    return "metadata.visualGeneration.image is required when metadata.pipeline.video.mode is editor_motion";
  }
  if (pipeline.video.mode === "text_to_video") {
    if (!video) return "metadata.visualGeneration.video is required when metadata.pipeline.video.mode is text_to_video";
    if (videoKind !== "text_to_video") {
      return "metadata.visualGeneration.video.kind must be text_to_video when metadata.pipeline.video.mode is text_to_video";
    }
  }
  if (pipeline.video.mode === "image_to_video") {
    if (!image) return "metadata.visualGeneration.image is required when metadata.pipeline.video.mode is image_to_video";
    if (!video) return "metadata.visualGeneration.video is required when metadata.pipeline.video.mode is image_to_video";
    if (videoKind !== "image_to_video") {
      return "metadata.visualGeneration.video.kind must be image_to_video when metadata.pipeline.video.mode is image_to_video";
    }
  }
  if (pipeline.video.mode === "looped_clips") {
    if (!video) return "metadata.visualGeneration.video is required when metadata.pipeline.video.mode is looped_clips";
    if (videoKind === "image_to_video" && !image) {
      return "metadata.visualGeneration.image is required when looped_clips uses an image_to_video model";
    }
  }
  if (pipeline.audio.mode === "video_native_audio") {
    if (!video) return "metadata.visualGeneration.video is required when metadata.pipeline.audio.mode is video_native_audio";
    if (video.supportsNativeAudio !== true) {
      return "metadata.visualGeneration.video must support native audio when metadata.pipeline.audio.mode is video_native_audio";
    }
  }
  return null;
}

function normalizeContentProjectMetadata(value: unknown): { metadataJson?: string; error?: string } {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    return { error: "metadata must be an object" };
  }
  const metadata = { ...(value as Record<string, unknown>) };

  const pipeline = normalizeProjectPipelineMetadata(metadata.pipeline, metadata);
  if (pipeline.error) return { error: pipeline.error };
  if (!pipeline.value) return { error: "metadata.pipeline could not be resolved" };
  metadata.pipeline = pipeline.value;

  if (pipeline.value.audio.mode === "tts") {
    const tts = normalizeProjectTtsMetadata(metadata.tts, true);
    if (tts.error) return { error: tts.error };
    if (tts.value) metadata.tts = tts.value;
  } else {
    delete metadata.tts;
  }

  const imageRequired =
    pipeline.value.image.enabled ||
    pipeline.value.video.mode === "editor_motion" ||
    pipeline.value.video.mode === "image_to_video";
  const videoRequired =
    pipeline.value.video.mode === "text_to_video" ||
    pipeline.value.video.mode === "image_to_video" ||
    pipeline.value.video.mode === "looped_clips" ||
    pipeline.value.audio.mode === "video_native_audio";

  if (imageRequired || videoRequired || metadata.visualGeneration !== undefined) {
    const visualGeneration = normalizeProjectVisualGenerationMetadata(metadata.visualGeneration, {
      imageRequired,
      videoRequired
    });
    if (visualGeneration.error) return { error: visualGeneration.error };
    const resolvedVisualGeneration = {
      image: imageRequired ? visualGeneration.value?.image ?? null : null,
      video: videoRequired ? visualGeneration.value?.video ?? null : null
    };
    const visualError = validateProjectPipelineVisualSelections(pipeline.value, resolvedVisualGeneration);
    if (visualError) return { error: visualError };
    if (resolvedVisualGeneration.image || resolvedVisualGeneration.video) {
      metadata.visualGeneration = resolvedVisualGeneration;
    } else {
      delete metadata.visualGeneration;
    }
  } else {
    delete metadata.visualGeneration;
  }
  return { metadataJson: JSON.stringify(metadata) };
}

function normalizeContentProjectInput(body: unknown):
  | {
      name: string;
      description?: string;
      language?: string;
      status: string;
      metadataJson?: string;
  }
  | { error: string } {
  const payload = (body ?? {}) as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(payload, "kind")) {
    return { error: "project kind is not supported" };
  }
  const name = normalizeOptionalText(payload.name);
  if (!name) return { error: "name is required" };
  const status = normalizeOptionalText(payload.status) ?? "draft";
  const metadata = normalizeContentProjectMetadata(payload.metadata);
  if (metadata.error) return { error: metadata.error };
  return {
    name,
    description: normalizeOptionalText(payload.description),
    language: normalizeOptionalText(payload.language),
    status,
    metadataJson: metadata.metadataJson
  };
}

function normalizeContentItemInput(body: unknown):
  | {
      kind: string;
      title: string;
      sourceText?: string;
      orientation?: string;
      status: string;
      metadataJson?: string;
    }
  | { error: string } {
  const payload = (body ?? {}) as Record<string, unknown>;
  const kind = normalizeOptionalText(payload.kind) ?? "content";
  if (!CONTENT_ITEM_KIND_VALUES.has(kind)) {
    return { error: "kind must be one of: content, video, image, ebook, audio, music_video" };
  }
  const title = normalizeOptionalText(payload.title);
  if (!title) return { error: "title is required" };
  const orientation = normalizeOptionalText(payload.orientation);
  if (orientation && !CONTENT_ORIENTATION_VALUES.has(orientation)) {
    return { error: "orientation must be one of: horizontal, vertical, square" };
  }
  return {
    kind,
    title,
    sourceText: normalizeOptionalText(payload.sourceText),
    orientation,
    status: normalizeOptionalText(payload.status) ?? "draft",
    metadataJson: normalizeJsonRecord(payload.metadata)
  };
}

function serializeContentProject(project: {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  language: string | null;
  status: string;
  metadataJson: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { items?: number };
}) {
  return {
    ...project,
    metadata: parseJsonRecord(project.metadataJson),
    metadataJson: undefined,
    itemsCount: project._count?.items ?? 0
  };
}

function serializeContentItem(item: {
  id: string;
  workspaceId: string;
  projectId: string;
  kind: string;
  title: string;
  sourceText: string | null;
  orientation: string | null;
  status: string;
  metadataJson: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...item,
    metadata: parseJsonRecord(item.metadataJson),
    metadataJson: undefined
  };
}

type ContentItemBacking = {
  courseId: string;
  moduleId: string;
  lessonId: string;
  lessonVersionId: string;
};

function readContentItemBacking(item: { metadataJson: string | null }): ContentItemBacking | null {
  const metadata = parseJsonRecord(item.metadataJson);
  const backing = metadata?.backing;
  if (!backing || typeof backing !== "object" || Array.isArray(backing)) return null;
  const raw = backing as Record<string, unknown>;
  const courseId = typeof raw.courseId === "string" ? raw.courseId : "";
  const moduleId = typeof raw.moduleId === "string" ? raw.moduleId : "";
  const lessonId = typeof raw.lessonId === "string" ? raw.lessonId : "";
  const lessonVersionId = typeof raw.lessonVersionId === "string" ? raw.lessonVersionId : "";
  if (!courseId || !moduleId || !lessonId || !lessonVersionId) return null;
  return { courseId, moduleId, lessonId, lessonVersionId };
}

function mergeContentItemMetadata(
  current: string | null,
  patch: Record<string, unknown>
): string {
  return JSON.stringify({
    ...(parseJsonRecord(current) ?? {}),
    ...patch
  });
}

async function deleteContentProjectCascade(
  projectId: string,
  workspaceId: string
): Promise<{
  deletedProject: boolean;
  deletedItems: number;
  deletedBackingCourseIds: string[];
}> {
  const project = await prisma.contentProject.findFirst({
    where: { id: projectId, workspaceId },
    select: { id: true }
  });
  if (!project) {
    return { deletedProject: false, deletedItems: 0, deletedBackingCourseIds: [] };
  }

  const items = await prisma.contentItem.findMany({
    where: { projectId, workspaceId },
    select: { id: true, metadataJson: true }
  });
  const backingCourseIds = Array.from(
    new Set(
      items
        .map((item) => readContentItemBacking(item)?.courseId)
        .filter((courseId): courseId is string => Boolean(courseId))
    )
  );
  const deletedBackingCourseIds: string[] = [];
  for (const courseId of backingCourseIds) {
    const result = await deleteCourseCascade(courseId, workspaceId);
    if (result.deletedCourse) {
      deletedBackingCourseIds.push(courseId);
    }
  }

  const deleted = await prisma.contentProject.deleteMany({
    where: { id: projectId, workspaceId }
  });
  return {
    deletedProject: deleted.count > 0,
    deletedItems: items.length,
    deletedBackingCourseIds
  };
}

async function ensureContentItemBacking(
  itemId: string,
  workspaceId: string
): Promise<ContentItemBacking> {
  const item = await prisma.contentItem.findFirst({
    where: { id: itemId, workspaceId },
    include: { project: true }
  });
  if (!item) {
    throw new Error("content item not found");
  }
  const existing = readContentItemBacking(item);
  if (existing) {
    const version = await prisma.lessonVersion.findFirst({
      where: { id: existing.lessonVersionId, workspaceId }
    });
    if (version) {
      if ((item.sourceText ?? "") !== version.scriptText) {
        await prisma.lessonVersion.update({
          where: { id: version.id },
          data: { scriptText: item.sourceText ?? "" }
        });
      }
      return existing;
    }
  }

  const course = await prisma.course.create({
    data: {
      workspaceId,
      name: `[Content] ${item.project.name}`,
      description: item.project.description ?? undefined,
      status: "draft"
    }
  });
  const moduleRecord = await prisma.module.create({
    data: {
      workspaceId,
      courseId: course.id,
      name: "Videos",
      order: 1
    }
  });
  const lesson = await prisma.lesson.create({
    data: {
      workspaceId,
      moduleId: moduleRecord.id,
      title: item.title,
      order: 1
    }
  });
  const version = await prisma.lessonVersion.create({
    data: {
      workspaceId,
      lessonId: lesson.id,
      scriptText: item.sourceText ?? "",
      speechRateWps: 2.5
    }
  });
  const backing: ContentItemBacking = {
    courseId: course.id,
    moduleId: moduleRecord.id,
    lessonId: lesson.id,
    lessonVersionId: version.id
  };
  await prisma.contentItem.update({
    where: { id: item.id },
    data: {
      metadataJson: mergeContentItemMetadata(item.metadataJson, { backing })
    }
  });
  return backing;
}

async function seedBlocksForLessonVersion(versionId: string, workspaceId: string, replaceExisting: boolean): Promise<number> {
  const version = await prisma.lessonVersion.findFirst({
    where: { id: versionId, workspaceId }
  });
  if (!version) {
    throw new Error("lesson version not found");
  }
  const drafts = buildDeterministicBlocks(version.scriptText, version.speechRateWps);
  if (replaceExisting) {
    await prisma.block.deleteMany({ where: { lessonVersionId: versionId, workspaceId } });
  } else {
    const existingCount = await prisma.block.count({ where: { lessonVersionId: versionId, workspaceId } });
    if (existingCount > 0) return existingCount;
  }
  if (drafts.length === 0) return 0;
  await prisma.block.createMany({
    data: drafts.map((draft) => {
      const fallbackMeta = buildFallbackMeta(draft.sourceText, draft.index);
      return {
        workspaceId,
        lessonVersionId: versionId,
        index: draft.index,
        sourceText: draft.sourceText,
      ttsText: sanitizeNarratedScriptText(draft.sourceText),
      wordCount: draft.wordCount,
      durationEstimateS: draft.durationEstimateS,
      status: "segmentation_pending",
      segmentError: null,
      segmentMs: null,
      onScreenJson: JSON.stringify(fallbackMeta.onScreen),
      imagePromptJson: JSON.stringify(fallbackMeta.imagePrompt),
      animationPromptJson: JSON.stringify(fallbackMeta.animationPrompt),
      directionNotesJson: JSON.stringify(fallbackMeta.directionNotes),
      soundEffectPromptJson: null
      };
    })
  });
  return drafts.length;
}

fastify.get(
  "/content-projects",
  {
      schema: {
        tags: ["Content"],
        summary: "Lista projetos de conteúdo COPE",
        description: "Lista agrupadores editoriais content-first com seus destinos e formatos nos metadados."
      }
    },
    async (request, reply) => {
      const auth = await getAuthenticatedScope(request, reply);
      if (!auth) return;
      const query = (request.query ?? {}) as Record<string, unknown>;
      if (Object.prototype.hasOwnProperty.call(query, "kind")) {
        return reply.code(400).send({ error: "project kind is not supported" });
      }
      const projects = await prisma.contentProject.findMany({
        where: {
          workspaceId: auth.scope.workspaceId
        },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { items: true } } }
    });
    return projects.map(serializeContentProject);
  }
);

fastify.post(
  "/content-projects",
  {
      schema: {
        tags: ["Content"],
        summary: "Cria projeto de conteúdo COPE",
        description: "Cria um agrupador editorial content-first com destinos e formatos definidos nos metadados."
      }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const normalized = normalizeContentProjectInput(request.body);
    if ("error" in normalized) {
      return reply.code(400).send({ error: normalized.error });
    }
    const project = await prisma.contentProject.create({
      data: {
        ...normalized,
        workspaceId: auth.scope.workspaceId
      },
      include: { _count: { select: { items: true } } }
    });
    return reply.code(201).send(serializeContentProject(project));
  }
);

fastify.patch(
  "/content-projects/:projectId",
  {
    schema: {
      tags: ["Content"],
      summary: "Atualiza projeto de conteúdo COPE",
      description: "Atualiza nome, descrição, status e metadados de um projeto content-first."
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const { projectId } = request.params as { projectId: string };
    const existing = await prisma.contentProject.findFirst({
      where: { id: projectId, workspaceId: auth.scope.workspaceId },
      select: { id: true }
    });
    if (!existing) return reply.code(404).send({ error: "content project not found" });

    const payload = (request.body ?? {}) as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(payload, "kind")) {
      return reply.code(400).send({ error: "project kind is not supported" });
    }

    const data: {
      name?: string;
      description?: string | null;
      language?: string | null;
      status?: string;
      metadataJson?: string | null;
    } = {};

    if (payload.name !== undefined) {
      const name = normalizeOptionalText(payload.name);
      if (!name) return reply.code(400).send({ error: "name must be a non-empty string" });
      data.name = name;
    }
    if (payload.description !== undefined) {
      data.description = normalizeOptionalText(payload.description) ?? null;
    }
    if (payload.language !== undefined) {
      data.language = normalizeOptionalText(payload.language) ?? null;
    }
    if (payload.status !== undefined) {
      const status = normalizeOptionalText(payload.status);
      if (!status) return reply.code(400).send({ error: "status must be a non-empty string" });
      data.status = status;
    }
    if (payload.metadata !== undefined) {
      if (payload.metadata === null) {
        data.metadataJson = null;
      } else {
        const metadata = normalizeContentProjectMetadata(payload.metadata);
        if (metadata.error) return reply.code(400).send({ error: metadata.error });
        data.metadataJson = metadata.metadataJson;
      }
    }

    const project = await prisma.contentProject.update({
      where: { id: projectId },
      data,
      include: { _count: { select: { items: true } } }
    });
    return reply.code(200).send(serializeContentProject(project));
  }
);

fastify.delete(
  "/content-projects/:projectId",
  {
    schema: {
      tags: ["Content"],
      summary: "Remove projeto de conteúdo COPE",
      description: "Remove um projeto content-first, seus itens e os dados técnicos gerados para edição."
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const { projectId } = request.params as { projectId: string };
    const result = await deleteContentProjectCascade(projectId, auth.scope.workspaceId);
    if (!result.deletedProject) {
      return reply.code(404).send({ error: "content project not found" });
    }
    for (const courseId of result.deletedBackingCourseIds) {
      broadcastEntityChanged({
        entity: "course",
        action: "deleted",
        courseId,
        occurredAt: new Date().toISOString()
      });
    }
    return reply.code(200).send({
      ok: true,
      deletedItems: result.deletedItems,
      deletedBackingCourses: result.deletedBackingCourseIds.length
    });
  }
);

fastify.get(
  "/content-projects/:projectId/items",
  {
    schema: {
      tags: ["Content"],
      summary: "Lista conteúdos de um projeto COPE",
      description: "Lista vídeos e outros formatos planejados sob um projeto content-first."
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const { projectId } = request.params as { projectId: string };
    const project = await prisma.contentProject.findFirst({
      where: { id: projectId, workspaceId: auth.scope.workspaceId }
    });
    if (!project) return reply.code(404).send({ error: "content project not found" });
    const items = await prisma.contentItem.findMany({
      where: { projectId, workspaceId: auth.scope.workspaceId },
      orderBy: { createdAt: "desc" }
    });
    return items.map(serializeContentItem);
  }
);

  fastify.post(
    "/content-projects/:projectId/items",
  {
    schema: {
      tags: ["Content"],
      summary: "Cria conteúdo em projeto COPE",
      description: "Cria vídeo/imagem/e-book/áudio sob um projeto; nesta fase a saída operacional priorizada é vídeo."
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const { projectId } = request.params as { projectId: string };
    const project = await prisma.contentProject.findFirst({
      where: { id: projectId, workspaceId: auth.scope.workspaceId }
    });
    if (!project) return reply.code(404).send({ error: "content project not found" });
    const normalized = normalizeContentItemInput(request.body);
    if ("error" in normalized) {
      return reply.code(400).send({ error: normalized.error });
    }
    const item = await prisma.contentItem.create({
      data: {
        ...normalized,
        projectId,
        workspaceId: auth.scope.workspaceId
      }
    });
    const backing = normalized.kind === "content" || normalized.kind === "video" || normalized.kind === "music_video"
      ? await ensureContentItemBacking(item.id, auth.scope.workspaceId)
      : null;
    const refreshed = await prisma.contentItem.findUnique({ where: { id: item.id } });
    return reply.code(201).send({
      ...serializeContentItem(refreshed ?? item),
      backing
    });
    }
  );

  fastify.patch(
    "/content-items/:itemId",
    {
      schema: {
        tags: ["Content"],
        summary: "Atualiza conteúdo COPE",
        description: "Atualiza campos editoriais e metadados operacionais de um conteúdo, preservando o backing técnico."
      }
    },
    async (request, reply) => {
      const auth = await getAuthenticatedScope(request, reply);
      if (!auth) return;
      const { itemId } = request.params as { itemId: string };
      const item = await prisma.contentItem.findFirst({
        where: { id: itemId, workspaceId: auth.scope.workspaceId }
      });
      if (!item) return reply.code(404).send({ error: "content item not found" });

      const payload = (request.body ?? {}) as Record<string, unknown>;
      const data: {
        title?: string;
        sourceText?: string | null;
        orientation?: string | null;
        status?: string;
        metadataJson?: string;
      } = {};

      if (payload.title !== undefined) {
        const title = normalizeOptionalText(payload.title);
        if (!title) return reply.code(400).send({ error: "title must be a non-empty string" });
        data.title = title;
      }
      if (payload.sourceText !== undefined) {
        data.sourceText = normalizeOptionalText(payload.sourceText) ?? null;
      }
      if (payload.orientation !== undefined) {
        const orientation = normalizeOptionalText(payload.orientation);
        if (orientation && !CONTENT_ORIENTATION_VALUES.has(orientation)) {
          return reply.code(400).send({ error: "orientation must be one of: horizontal, vertical, square" });
        }
        data.orientation = orientation ?? null;
      }
      if (payload.status !== undefined) {
        const status = normalizeOptionalText(payload.status);
        if (!status) return reply.code(400).send({ error: "status must be a non-empty string" });
        data.status = status;
      }
      if (payload.metadata !== undefined) {
        if (!payload.metadata || typeof payload.metadata !== "object" || Array.isArray(payload.metadata)) {
          return reply.code(400).send({ error: "metadata must be an object" });
        }
        data.metadataJson = mergeContentItemMetadata(item.metadataJson, payload.metadata as Record<string, unknown>);
      }

      if (Object.keys(data).length === 0) {
        return reply.code(400).send({ error: "no valid fields to update" });
      }

      const updated = await prisma.contentItem.update({
        where: { id: item.id },
        data
      });
      if (data.sourceText !== undefined) {
        const backing = readContentItemBacking(updated);
        if (backing) {
          await prisma.lessonVersion.updateMany({
            where: { id: backing.lessonVersionId, workspaceId: auth.scope.workspaceId },
            data: { scriptText: updated.sourceText ?? "" }
          });
        }
      }

      return reply.code(200).send(serializeContentItem(updated));
    }
  );

  fastify.get(
    "/content-items/:itemId/blocks",
  {
    schema: {
      tags: ["Content"],
      summary: "Lista blocos de um conteúdo",
      description: "Lista blocos técnicos associados a um vídeo content-first."
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const { itemId } = request.params as { itemId: string };
    const item = await prisma.contentItem.findFirst({
      where: { id: itemId, workspaceId: auth.scope.workspaceId }
    });
    if (!item) return reply.code(404).send({ error: "content item not found" });
    const backing = await ensureContentItemBacking(itemId, auth.scope.workspaceId);
    const blocks = await prisma.block.findMany({
      where: { lessonVersionId: backing.lessonVersionId, workspaceId: auth.scope.workspaceId },
      orderBy: { index: "asc" }
    });
    return reply.code(200).send({
      itemId,
      backing,
      blocks
    });
  }
);

fastify.post(
  "/content-items/:itemId/segment",
  {
    schema: {
      tags: ["Content"],
      summary: "Segmenta um conteúdo em blocos",
      description: "Inicia a segmentação LLM de um vídeo content-first usando o pipeline existente."
    }
  },
  async (request, reply) => {
    const auth = await getAuthenticatedScope(request, reply);
    if (!auth) return;
    const { itemId } = request.params as { itemId: string };
    const body = request.body as {
      clientId?: string;
      requestId?: string;
      purge?: boolean;
      autoQueue?: { audio?: boolean; image?: boolean };
    };
    const item = await prisma.contentItem.findFirst({
      where: { id: itemId, workspaceId: auth.scope.workspaceId }
    });
    if (!item) return reply.code(404).send({ error: "content item not found" });
    if (!item.sourceText?.trim()) return reply.code(400).send({ error: "sourceText is required before segmentation" });

    const dispatchClient = await resolveDispatchClientForRequest(request, body?.clientId);
    if (!dispatchClient.ok) {
      return reply.code(dispatchClient.statusCode).send({ error: dispatchClient.error });
    }
    const clientId = dispatchClient.clientId;
    const requestId = body?.requestId?.trim() || `content-${itemId}-${Date.now()}`;
    const backing = await ensureContentItemBacking(itemId, auth.scope.workspaceId);
    await invalidateFinalVideoForLessonVersion(backing.lessonVersionId, "content_item_segment_requested");
    const blocksCount = await seedBlocksForLessonVersion(
      backing.lessonVersionId,
      auth.scope.workspaceId,
      Boolean(body?.purge)
    );

    const existingByRequest = await prisma.job.findFirst({
      where: { requestId },
      orderBy: { createdAt: "desc" }
    });
    if (existingByRequest) {
      return reply.code(200).send({ itemId, backing, blocksCount, job: existingByRequest });
    }

    const job = await prisma.job.create({
      data: {
        workspaceId: auth.scope.workspaceId,
        scope: "lesson",
        lessonVersionId: backing.lessonVersionId,
        type: "segment",
        status: "pending",
        clientId,
        requestId,
        metaJson: JSON.stringify({
          contentItemId: itemId,
          autoQueue: {
            audio: Boolean(body?.autoQueue?.audio),
            image: Boolean(body?.autoQueue?.image)
          }
        })
      }
    });
    await emitPendingCourseBuildEvent(job);

    let ttsJobId: string | null = null;
    if (body?.autoQueue?.audio) {
      const createdTts = await prisma.job.create({
        data: {
          workspaceId: auth.scope.workspaceId,
          scope: "lesson",
          lessonVersionId: backing.lessonVersionId,
          type: "tts",
          status: "pending",
          clientId,
          metaJson: JSON.stringify({
            contentItemId: itemId,
            dependencies: [{ jobId: job.id, require: "success" }]
          })
        }
      });
      await emitPendingCourseBuildEvent(createdTts);
      ttsJobId = createdTts.id;
    }
    if (body?.autoQueue?.image) {
      const dependencies: Array<{ jobId: string; require: "success" | "terminal" }> = [
        { jobId: job.id, require: "success" }
      ];
      if (ttsJobId) dependencies.push({ jobId: ttsJobId, require: "terminal" });
      const createdImage = await prisma.job.create({
        data: {
          workspaceId: auth.scope.workspaceId,
          scope: "lesson",
          lessonVersionId: backing.lessonVersionId,
          type: "image",
          status: "pending",
          clientId,
          metaJson: JSON.stringify({ contentItemId: itemId, dependencies })
        }
      });
      await emitPendingCourseBuildEvent(createdImage);
    }

    await prisma.contentItem.update({
      where: { id: itemId },
      data: { status: "segmenting" }
    });
    await notifyWorkerQueueChanged("content_segment_created", auth.scope.workspaceId, clientId);
    return reply.code(201).send({ itemId, backing, blocksCount, job });
  }
);

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

async function buildRealtimeCoursePayload(courseId: string, workspaceId?: string) {
  const course = await prisma.course.findFirst({
    where: workspaceId ? { id: courseId, workspaceId } : { id: courseId },
    include: {
      modules: {
        select: {
          _count: {
            select: {
              lessons: true
            }
          }
        }
      }
    }
  });
  if (!course) return null;
  const summaryMap = await buildCourseBuildSummaries([courseId], workspaceId);
  const summary = summaryMap[courseId] ?? {
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
    modulesCount: course.modules.length,
    lessonsCount: course.modules.reduce((total, moduleItem) => total + moduleItem._count.lessons, 0),
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
    const course = await prisma.course.create({
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
        courseId: course.id,
        course: coursePayload,
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
    const existing = await prisma.course.findFirst({
      where: { id: courseId, workspaceId: auth.scope.workspaceId }
    });
    if (!existing) {
      return reply.code(404).send({ error: "course not found" });
    }
    const course = await prisma.course.update({
      where: { id: courseId },
      data: normalized
    });
    const coursePayload = await buildRealtimeCoursePayload(course.id, auth.scope.workspaceId);
    if (coursePayload) {
      broadcastEntityChanged({
        entity: "course",
        action: "updated",
        courseId: course.id,
        course: coursePayload,
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
      courseId,
      occurredAt: new Date().toISOString()
    });
    return reply.code(200).send({ ok: true });
  }
);

fastify.get(
  "/courses/:courseId/modules",
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
    const { courseId } = request.params as { courseId: string };
    const course = await prisma.course.findFirst({
      where: { id: courseId, workspaceId: auth.scope.workspaceId },
      select: { id: true }
    });
    if (!course) {
      return reply.code(404).send({ error: "course not found" });
    }
    return prisma.module.findMany({
      where: {
        courseId,
        workspaceId: auth.scope.workspaceId
      },
      orderBy: { order: "asc" }
    });
  }
);

fastify.post(
  "/courses/:courseId/modules",
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
    const { courseId } = request.params as { courseId: string };
    const course = await prisma.course.findFirst({
      where: { id: courseId, workspaceId: auth.scope.workspaceId },
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
      const count = await prisma.module.count({ where: { courseId } });
      order = count + 1;
    }
    const moduleRecord = await prisma.module.create({
      data: {
        workspaceId: auth.scope.workspaceId,
        courseId,
        name,
        order
      }
    });
    broadcastEntityChanged({
      entity: "module",
      action: "created",
      courseId,
      moduleId: moduleRecord.id,
      module: moduleRecord,
      occurredAt: new Date().toISOString()
    });
    const coursePayload = await buildRealtimeCoursePayload(courseId, auth.scope.workspaceId);
    if (coursePayload) {
      broadcastEntityChanged({
        entity: "course",
        action: "updated",
        courseId,
        course: coursePayload,
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
    const existing = await prisma.module.findFirst({
      where: {
        id: moduleId,
        workspaceId: auth.scope.workspaceId
      }
    });
    if (!existing) {
      return reply.code(404).send({ error: "module not found" });
    }
    const moduleRecord = await prisma.module.update({
      where: { id: moduleId },
      data: { name }
    });
    broadcastEntityChanged({
      entity: "module",
      action: "updated",
      courseId: existing.courseId,
      moduleId: moduleRecord.id,
      module: moduleRecord,
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
    const existing = await prisma.module.findFirst({
      where: {
        id: moduleId,
        workspaceId: auth.scope.workspaceId
      },
      select: { courseId: true }
    });
    const result = await deleteModuleCascade(moduleId, auth.scope.workspaceId);
    if (!result.deletedModule) {
      return reply.code(404).send({ error: "module not found" });
    }
    broadcastEntityChanged({
      entity: "module",
      action: "deleted",
      moduleId,
      courseId: existing?.courseId ?? null,
      occurredAt: new Date().toISOString()
    });
    if (existing?.courseId) {
      const coursePayload = await buildRealtimeCoursePayload(existing.courseId);
      if (coursePayload) {
        broadcastEntityChanged({
          entity: "course",
          action: "updated",
          courseId: existing.courseId,
          course: coursePayload,
          occurredAt: new Date().toISOString()
        });
      }
    }
    return reply.code(200).send({ ok: true });
  }
);

fastify.patch(
  "/courses/:courseId/structure/reorder",
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
    const { courseId } = request.params as { courseId: string };
    const course = await prisma.course.findFirst({
      where: { id: courseId, workspaceId: auth.scope.workspaceId },
      select: { id: true }
    });
    if (!course) {
      return reply.code(404).send({ error: "course not found" });
    }
    const body = request.body as
      | {
          modules?: Array<{
            moduleId?: string;
            lessonIds?: string[];
          }>;
        }
      | undefined;

    const payloadModules = (body?.modules ?? [])
      .map((item) => ({
        moduleId: item?.moduleId?.trim() ?? "",
        lessonIds: (item?.lessonIds ?? []).map((lessonId) => lessonId.trim()).filter(Boolean)
      }))
      .filter((item) => item.moduleId.length > 0);

    const existingModules = await prisma.module.findMany({
      where: { courseId },
      include: {
        lessons: {
          select: { id: true }
        }
      }
    });

    if (payloadModules.length !== existingModules.length) {
      return reply.code(400).send({ error: "invalid module order payload" });
    }

    const payloadModuleIds = payloadModules.map((item) => item.moduleId);
    const payloadModuleIdSet = new Set(payloadModuleIds);
    if (payloadModuleIdSet.size !== payloadModuleIds.length) {
      return reply.code(400).send({ error: "duplicate module ids in payload" });
    }

    const existingModuleIds = existingModules.map((item) => item.id);
    const existingModuleIdSet = new Set(existingModuleIds);
    if (payloadModuleIds.some((moduleId) => !existingModuleIdSet.has(moduleId)) || existingModuleIds.some((moduleId) => !payloadModuleIdSet.has(moduleId))) {
      return reply.code(400).send({ error: "payload modules do not match course modules" });
    }

    const existingLessonIds = existingModules.flatMap((moduleItem) => moduleItem.lessons.map((lessonItem) => lessonItem.id));
    const existingLessonIdSet = new Set(existingLessonIds);
    const payloadLessonIds = payloadModules.flatMap((moduleItem) => moduleItem.lessonIds);
    const payloadLessonIdSet = new Set(payloadLessonIds);

    if (payloadLessonIdSet.size !== payloadLessonIds.length) {
      return reply.code(400).send({ error: "duplicate lesson ids in payload" });
    }
    if (payloadLessonIds.some((lessonId) => !existingLessonIdSet.has(lessonId)) || existingLessonIds.some((lessonId) => !payloadLessonIdSet.has(lessonId))) {
      return reply.code(400).send({ error: "payload lessons do not match course lessons" });
    }

    await prisma.$transaction(async (tx) => {
      await Promise.all(
        payloadModules.map((moduleItem, index) =>
          tx.module.update({
            where: { id: moduleItem.moduleId },
            data: { order: index + 1 }
          })
        )
      );

      if (payloadLessonIds.length > 0) {
        await tx.lesson.updateMany({
          where: { id: { in: payloadLessonIds } },
          data: { order: { increment: 1000000 } }
        });
      }

      for (const moduleItem of payloadModules) {
        for (let index = 0; index < moduleItem.lessonIds.length; index += 1) {
          const lessonId = moduleItem.lessonIds[index];
          await tx.lesson.update({
            where: { id: lessonId },
            data: {
              moduleId: moduleItem.moduleId,
              order: index + 1
            }
          });
        }
      }
    });

    broadcastEntityChanged({
      entity: "course_structure",
      action: "reordered",
      courseId,
      modules: payloadModules,
      occurredAt: new Date().toISOString()
    });

    return reply.code(200).send({ ok: true });
  }
);

fastify.get(
  "/modules/:moduleId/lessons",
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
    const { moduleId } = request.params as { moduleId: string };
    return prisma.lesson.findMany({
      where: {
        moduleId,
        workspaceId: auth.scope.workspaceId
      },
      orderBy: { order: "asc" }
    });
  }
);

fastify.post(
  "/modules/:moduleId/lessons",
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
    const { moduleId } = request.params as { moduleId: string };
    const moduleRecord = await prisma.module.findFirst({
      where: {
        id: moduleId,
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
    const lessonCount = await prisma.lesson.count({
      where: {
        moduleId,
        workspaceId: auth.scope.workspaceId
      }
    });
    const lesson = await prisma.lesson.create({
      data: {
        workspaceId: auth.scope.workspaceId,
        moduleId,
        title,
        order: lessonCount + 1
      }
    });
    const moduleWithCourse = await prisma.module.findUnique({
      where: { id: moduleId },
      select: { courseId: true }
    });
    broadcastEntityChanged({
      entity: "lesson",
      action: "created",
      courseId: moduleWithCourse?.courseId ?? null,
      moduleId,
      lessonId: lesson.id,
      lesson,
      occurredAt: new Date().toISOString()
    });
    if (moduleWithCourse?.courseId) {
      const coursePayload = await buildRealtimeCoursePayload(moduleWithCourse.courseId);
      if (coursePayload) {
        broadcastEntityChanged({
          entity: "course",
          action: "updated",
          courseId: moduleWithCourse.courseId,
          course: coursePayload,
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
    const lesson = await prisma.lesson.findFirst({
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
    const existing = await prisma.lesson.findFirst({
      where: {
        id: lessonId,
        workspaceId: auth.scope.workspaceId
      }
    });
    if (!existing) {
      return reply.code(404).send({ error: "lesson not found" });
    }
    const lesson = await prisma.lesson.update({
      where: { id: lessonId },
      data: { title }
    });
    const moduleWithCourse = await prisma.module.findUnique({
      where: { id: lesson.moduleId },
      select: { courseId: true }
    });
    broadcastEntityChanged({
      entity: "lesson",
      action: "updated",
      courseId: moduleWithCourse?.courseId ?? null,
      moduleId: lesson.moduleId,
      lessonId: lesson.id,
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
    const existing = await prisma.lesson.findFirst({
      where: {
        id: lessonId,
        workspaceId: auth.scope.workspaceId
      },
      select: {
        moduleId: true,
        module: {
          select: {
            courseId: true
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
      courseId: existing?.module?.courseId ?? null,
      moduleId: existing?.moduleId ?? null,
      lessonId,
      occurredAt: new Date().toISOString()
    });
    if (existing?.module?.courseId) {
      const coursePayload = await buildRealtimeCoursePayload(existing.module.courseId);
      if (coursePayload) {
        broadcastEntityChanged({
          entity: "course",
          action: "updated",
          courseId: existing.module.courseId,
          course: coursePayload,
          occurredAt: new Date().toISOString()
        });
      }
    }
    return reply.code(200).send({ ok: true });
  }
);

fastify.get(
  "/lessons/:lessonId/versions",
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
    const { lessonId } = request.params as { lessonId: string };
    return prisma.lessonVersion.findMany({
      where: {
        lessonId,
        workspaceId: auth.scope.workspaceId
      },
      orderBy: { createdAt: "desc" }
    });
  }
);

fastify.post(
  "/lessons/:lessonId/versions",
  {
    schema: {
      tags: ["Lessons"],
      summary: "Cria uma versão de lição",
      description: "Cria uma nova versão para uma lição existente",
      params: {
        type: "object",
        required: ["lessonId"],
        properties: {
          lessonId: { type: "string" }
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
            lessonId: { type: "string" },
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
    const { lessonId } = request.params as { lessonId: string };
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
    const lessonScope = await prisma.lesson.findFirst({
      where: {
        id: lessonId,
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
    const version = await prisma.lessonVersion.create({
      data: {
        workspaceId: auth.scope.workspaceId,
        lessonId,
        scriptText,
        speechRateWps,
        preferredVoiceId,
        preferredTemplateId
      }
    });
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        module: {
          select: {
            courseId: true
          }
        }
      }
    });
    broadcastEntityChanged({
      entity: "lesson_version",
      action: "created",
      courseId: lesson?.module?.courseId ?? null,
      moduleId: lesson?.moduleId ?? null,
      lessonId,
      lessonVersionId: version.id,
      lessonVersion: version,
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
        lessonVersionId: versionId,
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
          }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            id: { type: "string" },
            lessonId: { type: "string" },
            preferredVoiceId: { type: ["string", "null"] },
            preferredTemplateId: { type: ["string", "null"] }
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
    const { versionId } = request.params as { versionId: string };
    const body = request.body as
      | {
          preferredVoiceId?: string | null;
          preferredTemplateId?: string | null;
        }
      | undefined;

    const existing = await prisma.lessonVersion.findUnique({
      where: { id: versionId }
    });
    if (!existing) {
      return reply.code(404).send({ error: "lesson version not found" });
    }

    const preferredVoiceIdRaw = body?.preferredVoiceId;
    const preferredTemplateIdRaw = body?.preferredTemplateId;
    const preferredVoiceId = typeof preferredVoiceIdRaw === "string" ? preferredVoiceIdRaw.trim() || null : (preferredVoiceIdRaw ?? undefined);
    const preferredTemplateId = typeof preferredTemplateIdRaw === "string" ? preferredTemplateIdRaw.trim() || null : (preferredTemplateIdRaw ?? undefined);

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
        return reply.code(404).send({ error: "preferred voice not found" });
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

    const updated = await prisma.lessonVersion.update({
      where: { id: versionId },
      data: {
        ...(preferredVoiceId !== undefined ? { preferredVoiceId } : {}),
        ...(preferredTemplateId !== undefined ? { preferredTemplateId } : {})
      }
    });

    return reply.code(200).send({
      id: updated.id,
      lessonId: updated.lessonId,
      preferredVoiceId: updated.preferredVoiceId,
      preferredTemplateId: updated.preferredTemplateId
    });
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
      lessonVersion: {
        include: {
          lesson: {
            include: {
              module: {
                include: {
                  course: true
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
      const upstream = await requestAgentWorkerCommand(agentSession, "lesson_version_final_video_get", { versionId });
      if (upstream.statusCode === 404) {
        return reply.code(404).send({
          error: String(upstream.data.error ?? "final video not found")
        });
      }
      if (upstream.statusCode !== 200) {
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
      return reply.send(Buffer.from(bodyBase64, "base64"));
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
      const { templateId } = request.query as { templateId?: string };
      if (!templateId) {
        return reply.code(400).send({ error: "templateId is required" });
      }
      const agentSession = getConnectedAgentForWorkspace(auth.scope.workspaceId);
      if (!agentSession) {
        return reply.code(503).send({ error: "agent_offline" });
      }
      const upstream = await requestAgentWorkerCommand(agentSession, "block_slide_get", {
        blockId,
        templateId
      });
      if (upstream.statusCode === 400) {
        return reply.code(400).send({
          error: String(upstream.data.error ?? "templateId is required")
        });
      }
      if (upstream.statusCode === 404) {
        return reply.code(404).send({ error: String(upstream.data.error ?? "slide not found") });
      }
      if (upstream.statusCode !== 200) {
        return reply.code(503).send({
          error: String(upstream.data.error ?? "agent_response_invalid")
        });
      }
      const bodyBase64 = typeof upstream.data.bodyBase64 === "string" ? upstream.data.bodyBase64 : "";
      if (!bodyBase64) {
        return reply.code(404).send({ error: "slide not found" });
      }
      const contentType = typeof upstream.data.contentType === "string" ? upstream.data.contentType : "image/png";
      reply.header("Content-Type", contentType);
      reply.header("Cache-Control", "no-store");
      return reply.send(Buffer.from(bodyBase64, "base64"));
    } catch (err) {
      return reply.code(503).send({ error: (err as Error).message });
    }
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

async function invalidateFinalVideoForLessonVersion(lessonVersionId: string, reason: string): Promise<void> {
  const assets = await prisma.asset.findMany({
    where: {
      kind: "final_mp4",
      block: { lessonVersionId }
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

  fastify.log.info({ lessonVersionId, reason, deletedFinalVideos: assets.length }, "Final video invalidated");
}

async function invalidateBlockAssets(blockId: string, kinds: string[], reason: string): Promise<void> {
  if (kinds.length === 0) return;
  const assets = await prisma.asset.findMany({
    where: {
      blockId,
      kind: { in: kinds }
    },
    select: { id: true, path: true, kind: true }
  });
  if (assets.length === 0) return;

  for (const asset of assets) {
    await unlinkIfExists(asset.path);
    await pruneEmptyParentDirs(asset.path);
  }
  await prisma.asset.deleteMany({
    where: { id: { in: assets.map((item) => item.id) } }
  });
  fastify.log.info({ blockId, reason, deletedAssets: assets.length, kinds }, "Block assets invalidated");
}

async function deleteLessonCascade(lessonId: string, workspaceId?: string): Promise<{ deletedLesson: boolean }> {
  const lesson = await prisma.lesson.findFirst({
    where: workspaceId ? { id: lessonId, workspaceId } : { id: lessonId },
    select: { id: true }
  });
  if (!lesson) return { deletedLesson: false };

  const versions = await prisma.lessonVersion.findMany({
    where: workspaceId ? { lessonId, workspaceId } : { lessonId },
    select: { id: true }
  });
  const versionIds = versions.map((item) => item.id);
  if (versionIds.length > 0) {
    await cancelPendingAndRunningJobs({
      OR: [{ lessonVersionId: { in: versionIds } }, { block: { lessonVersionId: { in: versionIds } } }]
    });

    const blocks = await prisma.block.findMany({
      where: { lessonVersionId: { in: versionIds } },
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
      where: { lessonVersionId: { in: versionIds } }
    });
    await prisma.lessonVersion.deleteMany({
      where: { id: { in: versionIds } }
    });
  }

  await prisma.notification.deleteMany({
    where: workspaceId ? { lessonId, workspaceId } : { lessonId }
  });
  await prisma.lesson.delete({ where: { id: lessonId } });
  return { deletedLesson: true };
}

async function deleteModuleCascade(moduleId: string, workspaceId?: string): Promise<{ deletedModule: boolean; deletedLessons: number }> {
  const moduleRecord = await prisma.module.findFirst({
    where: workspaceId ? { id: moduleId, workspaceId } : { id: moduleId },
    select: { id: true }
  });
  if (!moduleRecord) return { deletedModule: false, deletedLessons: 0 };

  const lessons = await prisma.lesson.findMany({
    where: workspaceId ? { moduleId, workspaceId } : { moduleId },
    select: { id: true }
  });
  for (const lesson of lessons) {
    await deleteLessonCascade(lesson.id, workspaceId);
  }
  await prisma.module.delete({ where: { id: moduleId } });
  return { deletedModule: true, deletedLessons: lessons.length };
}

async function deleteCourseCascade(courseId: string, workspaceId?: string): Promise<{ deletedCourse: boolean; deletedModules: number }> {
  const course = await prisma.course.findFirst({
    where: workspaceId ? { id: courseId, workspaceId } : { id: courseId },
    select: { id: true }
  });
  if (!course) return { deletedCourse: false, deletedModules: 0 };

  const modules = await prisma.module.findMany({
    where: workspaceId ? { courseId, workspaceId } : { courseId },
    select: { id: true }
  });
  for (const moduleItem of modules) {
    await deleteModuleCascade(moduleItem.id, workspaceId);
  }
  await prisma.course.delete({ where: { id: courseId } });
  return { deletedCourse: true, deletedModules: modules.length };
}

async function emitPendingCourseBuildEvent(job: {
  id: string;
  status: string;
  type: string;
  lessonVersionId: string | null;
  blockId: string | null;
  error: string | null;
  updatedAt: Date;
  requestId?: string | null;
}) {
  if (job.status !== "pending" || !job.lessonVersionId) return;
  const lessonVersion = await prisma.lessonVersion.findUnique({
    where: { id: job.lessonVersionId },
    select: {
      lessonId: true,
      lesson: {
        select: {
          moduleId: true,
          module: {
            select: {
              courseId: true
            }
          }
        }
      }
    }
  });
  const courseId = lessonVersion?.lesson?.module?.courseId ?? null;
  if (!courseId) return;
  const moduleId = lessonVersion?.lesson?.moduleId ?? null;
  const lessonId = lessonVersion?.lessonId ?? null;
  const correlationId = parseCorrelationId(job.requestId) ?? getActiveCorrelationId();
  await emitCourseBuildStatusEvent(courseId, {
    correlationId,
    jobId: job.id,
    status: job.status,
    type: job.type,
    moduleId,
    lessonId,
    lessonVersionId: job.lessonVersionId,
    blockId: job.blockId,
    error: job.error,
    updatedAt: job.updatedAt
  });
}

async function emitCourseBuildStatusEvent(
  courseId: string,
  payload: {
    correlationId?: string | null;
    jobId?: string | null;
    status?: string | null;
    type?: string | null;
    moduleId?: string | null;
    lessonId?: string | null;
    lessonVersionId?: string | null;
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
    buildStatus = await buildCourseDetailedStatus(courseId);
  } catch (err) {
    fastify.log.warn({ err, courseId }, "Failed to build course status for course job event");
  }
  broadcastJobEvent({
    correlationId: parseCorrelationId(payload.correlationId) ?? null,
    jobId: payload.jobId ?? null,
    status: payload.status ?? null,
    type: payload.type ?? null,
    courseId,
    moduleId: payload.moduleId ?? null,
    lessonId: payload.lessonId ?? null,
    lessonVersionId: payload.lessonVersionId ?? null,
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
  const versionScope = await prisma.lessonVersion.findUnique({
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
      lessonVersionId: versionId,
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
      lessonVersionId: versionId,
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
  lessonVersionId: string;
  blockId?: string | null;
  clientId: string | null;
  requestId: string | null;
  meta?: {
    tts?: { releaseMemory?: boolean; voiceId?: string; language?: string };
  } | null;
}) {
  const { lessonVersionId, blockId, clientId, requestId, meta } = options;
  const versionScope = await prisma.lessonVersion.findUnique({
    where: { id: lessonVersionId },
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
      lessonVersionId,
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
      lessonVersionId,
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
  lessonVersionId: string;
  blockId?: string | null;
  templateId?: string | null;
  clientId: string | null;
  requestId: string | null;
  meta?: { image?: { releaseMemory?: boolean; freeMemory?: boolean } } | null;
}) {
  const { lessonVersionId, blockId, templateId, clientId, requestId, meta } = options;
  const versionScope = await prisma.lessonVersion.findUnique({
    where: { id: lessonVersionId },
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
      lessonVersionId,
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
      lessonVersionId,
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

async function enqueueFinalVideoJob(options: { lessonVersionId: string; templateId?: string | null; clientId: string | null; requestId: string | null }) {
  const { lessonVersionId, templateId, clientId, requestId } = options;
  const versionScope = await prisma.lessonVersion.findUnique({
    where: { id: lessonVersionId },
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
      lessonVersionId,
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
      lessonVersionId,
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
        503: {
          type: "object",
          properties: { error: { type: "string" } }
        }
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
      const agentSession = getConnectedAgentForWorkspace(auth.scope.workspaceId, dispatchClient.clientId ?? undefined);
      if (!agentSession) {
        return reply.code(503).send({ error: "agent_offline" });
      }
      const upstream = await requestAgentWorkerCommand(agentSession, "lesson_version_slides_post", {
        versionId,
        templateId: body?.templateId?.trim(),
        clientId: dispatchClient.clientId,
        requestId: body?.requestId?.trim() || null
      });
      const statusCode = upstream.statusCode === 200 || upstream.statusCode === 201 ? upstream.statusCode : upstream.statusCode === 400 ? 400 : upstream.statusCode === 404 ? 404 : 503;
      return reply.code(statusCode).send(upstream.data);
    } catch (err) {
      return reply.code(503).send({ error: (err as Error).message });
    }
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
      const { templateId } = request.query as { templateId?: string };
      const agentSession = getConnectedAgentForWorkspace(auth.scope.workspaceId);
      if (!agentSession) {
        return reply.code(503).send({ error: "agent_offline" });
      }
      const upstream = await requestAgentWorkerCommand(agentSession, "lesson_version_slides_list", { versionId, templateId });
      const statusCode = upstream.statusCode === 200 ? 200 : upstream.statusCode === 400 ? 400 : upstream.statusCode === 404 ? 404 : 503;
      return reply.code(statusCode).send(upstream.data);
    } catch (err) {
      return reply.code(503).send({ error: (err as Error).message });
    }
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
      animationPrompt?: {
        prompt?: string;
        motion?: string;
        camera?: string;
        duration_hint?: string;
      };
      directionNotes?: { notes?: string };
      soundEffectPrompt?: {
        prompt?: string;
        timing?: string;
        avoid?: string;
      };
      onScreen?: { title?: string; bullets?: string[] };
      ttsText?: string;
    };

    const data: Record<string, string | null> = {};
    const invalidAssetKinds = new Set<string>();

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
      ["image_raw", "slide_png", "clip_mp4"].forEach((kind) => invalidAssetKinds.add(kind));
    }

    if (body?.onScreen !== undefined) {
      const title = body.onScreen.title?.trim() || "";
      if (!title) {
        data.onScreenJson = null;
      } else {
        const bullets = Array.isArray(body.onScreen.bullets)
          ? body.onScreen.bullets
              .map((item) => String(item).trim())
              .filter(Boolean)
              .slice(0, 8)
          : [];
        const onScreen = {
          title,
          bullets
        };
        data.onScreenJson = JSON.stringify(onScreen);
      }
      ["slide_png", "clip_mp4"].forEach((kind) => invalidAssetKinds.add(kind));
    }

    if (body?.animationPrompt !== undefined) {
      const prompt = body.animationPrompt.prompt?.trim();
      if (!prompt) {
        data.animationPromptJson = null;
      } else {
        const animationPrompt = {
          prompt,
          motion: body.animationPrompt.motion?.trim() || undefined,
          camera: body.animationPrompt.camera?.trim() || undefined,
          duration_hint: body.animationPrompt.duration_hint?.trim() || undefined
        };
        data.animationPromptJson = JSON.stringify(animationPrompt);
      }
      invalidAssetKinds.add("clip_mp4");
    }

    if (body?.directionNotes !== undefined) {
      const notes = body.directionNotes.notes?.trim();
      data.directionNotesJson = notes ? JSON.stringify({ notes }) : null;
    }

    if (body?.soundEffectPrompt !== undefined) {
      const prompt = body.soundEffectPrompt.prompt?.trim();
      if (!prompt) {
        data.soundEffectPromptJson = null;
      } else {
        const soundEffectPrompt = {
          prompt,
          timing: body.soundEffectPrompt.timing?.trim() || undefined,
          avoid: body.soundEffectPrompt.avoid?.trim() || undefined
        };
        data.soundEffectPromptJson = JSON.stringify(soundEffectPrompt);
      }
      invalidAssetKinds.add("clip_mp4");
    }

    if (body?.ttsText !== undefined) {
      const nextTts = sanitizeNarratedScriptText(body.ttsText);
      if (!nextTts) {
        return reply.code(400).send({ error: "ttsText cannot be empty" });
      }
      data.ttsText = nextTts;
      ["audio_raw", "clip_mp4"].forEach((kind) => invalidAssetKinds.add(kind));
    }

    if (Object.keys(data).length === 0) {
      return reply.code(400).send({ error: "no fields to update" });
    }

    try {
      const updated = await prisma.block.update({
        where: { id: blockId },
        data
      });
      await invalidateBlockAssets(blockId, [...invalidAssetKinds], "block_updated");
      if (invalidAssetKinds.size > 0) {
        await invalidateFinalVideoForLessonVersion(updated.lessonVersionId, "block_updated");
      }
      const context = await resolveBlockContext(blockId);
      broadcastEntityChanged({
        entity: "block",
        action: "updated",
        blockId,
        lessonVersionId: updated.lessonVersionId,
        lessonId: context?.lessonVersion?.lesson?.id ?? null,
        moduleId: context?.lessonVersion?.lesson?.module?.id ?? null,
        courseId: context?.lessonVersion?.lesson?.module?.course?.id ?? null,
        block: {
          id: updated.id,
          lessonVersionId: updated.lessonVersionId,
          ttsText: updated.ttsText,
          onScreenJson: updated.onScreenJson,
          imagePromptJson: updated.imagePromptJson,
          animationPromptJson: updated.animationPromptJson,
          directionNotesJson: updated.directionNotesJson,
          soundEffectPromptJson: updated.soundEffectPromptJson,
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
    const version = await prisma.lessonVersion.findUnique({
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
          where: { lessonVersionId: versionId }
        });
      } else {
        const existingCount = await prisma.block.count({
          where: { lessonVersionId: versionId }
        });
        if (existingCount > 0) return existingCount;
      }
      if (drafts.length === 0) return 0;
      await prisma.block.createMany({
        data: drafts.map((draft) => {
          const fallbackMeta = buildFallbackMeta(draft.sourceText, draft.index);
          return {
            workspaceId: version.workspaceId,
            lessonVersionId: versionId,
            index: draft.index,
            sourceText: draft.sourceText,
            ttsText: sanitizeNarratedScriptText(draft.sourceText),
            wordCount: draft.wordCount,
            durationEstimateS: draft.durationEstimateS,
            status: "segmentation_pending",
            segmentError: null,
            segmentMs: null,
            onScreenJson: JSON.stringify(fallbackMeta.onScreen),
            imagePromptJson: JSON.stringify(fallbackMeta.imagePrompt),
            animationPromptJson: JSON.stringify(fallbackMeta.animationPrompt),
            directionNotesJson: JSON.stringify(fallbackMeta.directionNotes),
            soundEffectPromptJson: null
          };
        })
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
        lessonVersionId: versionId,
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
                lessonVersionId: versionId,
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
                  lessonVersionId: versionId,
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
                lessonVersionId: versionId,
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
                  lessonVersionId: versionId,
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
        where: { block: { lessonVersionId: versionId } }
      });
      await prisma.asset.deleteMany({
        where: { block: { lessonVersionId: versionId } }
      });
      await prisma.block.deleteMany({ where: { lessonVersionId: versionId } });
    }
    await seedDeterministicDraftBlocks(purge);

    const job = await prisma.job.create({
      data: {
        workspaceId: version.workspaceId,
        scope: "lesson",
        lessonVersionId: versionId,
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
            lessonVersionId: versionId,
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
              lessonVersionId: versionId,
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
            lessonVersionId: versionId,
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
              lessonVersionId: versionId,
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
    const version = await prisma.lessonVersion.findUnique({
      where: { id: versionId }
    });
    if (!version) {
      return reply.code(404).send({ error: "lesson version not found" });
    }

    const blockCount = await prisma.block.count({
      where: { lessonVersionId: versionId }
    });
    const assetGroups = await prisma.asset.groupBy({
      by: ["kind"],
      where: { block: { lessonVersionId: versionId } },
      _count: { _all: true }
    });
    const assets: Record<string, number> = {};
    assetGroups.forEach((group) => {
      assets[group.kind] = group._count._all;
    });
    const jobCount = await prisma.job.count({
      where: {
        OR: [{ lessonVersionId: versionId }, { block: { lessonVersionId: versionId } }]
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
    const version = await prisma.lessonVersion.findUnique({
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
      lessonVersionId: versionId,
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
    await invalidateFinalVideoForLessonVersion(block.lessonVersionId, "tts_block_requested");

    const result = await enqueueTtsJob({
      lessonVersionId: block.lessonVersionId,
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
    await invalidateFinalVideoForLessonVersion(block.lessonVersionId, "image_block_requested");
    if (templateId) {
      const template = await prisma.slideTemplate.findUnique({
        where: { id: templateId }
      });
      if (!template || !template.isActive) {
        return reply.code(404).send({ error: "template not found" });
      }
    }

    const result = await enqueueImageJob({
      lessonVersionId: block.lessonVersionId,
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
    await invalidateFinalVideoForLessonVersion(block.lessonVersionId, "segment_block_requested");

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
        lessonVersionId: block.lessonVersionId,
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
        lessonVersion: {
          select: {
            lessonId: true,
            lesson: {
              select: {
                moduleId: true,
                module: { select: { courseId: true } }
              }
            }
          }
        },
        block: {
          select: {
            lessonVersionId: true,
            lessonVersion: {
              select: {
                lessonId: true,
                lesson: {
                  select: {
                    moduleId: true,
                    module: { select: { courseId: true } }
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
        lessonVersionId: job.lessonVersionId,
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
    const context = job.lessonVersion?.lesson ?? job.block?.lessonVersion?.lesson ?? null;
    const courseId = context?.module?.courseId ?? null;
    if (courseId) {
      await emitCourseBuildStatusEvent(courseId, {
        correlationId: getRequestCorrelationId(request),
        jobId: canceled.id,
        status: canceled.status,
        type: canceled.type,
        moduleId: context?.moduleId ?? null,
        lessonId: job.lessonVersion?.lessonId ?? job.block?.lessonVersion?.lessonId ?? null,
        lessonVersionId: canceled.lessonVersionId,
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
      OR: [{ lessonVersion: { lessonId: { in: lessonIds } } }, { block: { lessonVersion: { lessonId: { in: lessonIds } } } }]
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
  "/lessons/:lessonId/generation/:phase/cancel",
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
    const { lessonId, phase } = request.params as {
      lessonId: string;
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
    const lesson = await prisma.lesson.findFirst({
      where: { id: lessonId, workspaceId: auth.scope.workspaceId },
      select: { id: true, module: { select: { courseId: true } } }
    });
    if (!lesson) {
      return reply.code(404).send({ error: "lesson not found" });
    }
    const count = await cancelGenerationForLessonIds(
      [lessonId],
      phase,
      dispatchClient.clientId ?? null
    );
    if (count > 0) {
      await emitCourseBuildStatusEvent(lesson.module.courseId, {
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
  "/modules/:moduleId/generation/:phase/cancel",
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
    const { moduleId, phase } = request.params as {
      moduleId: string;
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
    const moduleItem = await prisma.module.findFirst({
      where: { id: moduleId, workspaceId: auth.scope.workspaceId },
      select: { id: true, courseId: true }
    });
    if (!moduleItem) {
      return reply.code(404).send({ error: "module not found" });
    }
    const lessons = await prisma.lesson.findMany({
      where: { moduleId, workspaceId: auth.scope.workspaceId },
      select: { id: true }
    });
    const count = await cancelGenerationForLessonIds(
      lessons.map((item) => item.id),
      phase,
      dispatchClient.clientId ?? null
    );
    if (count > 0) {
      await emitCourseBuildStatusEvent(moduleItem.courseId, {
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
  "/courses/:courseId/generation/:phase/cancel",
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
    const { courseId, phase } = request.params as {
      courseId: string;
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
    const course = await prisma.course.findFirst({
      where: { id: courseId, workspaceId: auth.scope.workspaceId },
      select: { id: true }
    });
    if (!course) {
      return reply.code(404).send({ error: "course not found" });
    }
    const lessons = await prisma.lesson.findMany({
      where: { workspaceId: auth.scope.workspaceId, module: { courseId } },
      select: { id: true }
    });
    const count = await cancelGenerationForLessonIds(
      lessons.map((item) => item.id),
      phase,
      dispatchClient.clientId ?? null
    );
    if (count > 0) {
      await emitCourseBuildStatusEvent(courseId, {
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
      const modulesFromCourse = await prisma.module.findMany({
        where: { courseId: createdCourseId },
        select: { id: true }
      });
      modulesFromCourse.forEach((moduleItem) => moduleIds.add(moduleItem.id));
    }

    if (moduleIds.size > 0) {
      const lessonsFromModules = await prisma.lesson.findMany({
        where: { moduleId: { in: Array.from(moduleIds) } },
        select: { id: true }
      });
      lessonsFromModules.forEach((lessonItem) => lessonIds.add(lessonItem.id));
    }

    if (lessonIds.size > 0) {
      const versionsFromLessons = await prisma.lessonVersion.findMany({
        where: { lessonId: { in: Array.from(lessonIds) } },
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
            OR: [{ lessonVersionId: { in: safeVersionIds } }, { block: { lessonVersionId: { in: safeVersionIds } } }]
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
        where: { lessonVersionId: { in: safeVersionIds } },
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
          lessonVersionId: { in: safeVersionIds }
        }
      });
      deletedVersionJobsCount += deletedVersionJobs.count;
      const deletedBlocks = await prisma.block.deleteMany({
        where: { lessonVersionId: { in: safeVersionIds } }
      });
      deletedBlocksCount += deletedBlocks.count;
      const deletedVersions = await prisma.lessonVersion.deleteMany({
        where: { id: { in: safeVersionIds } }
      });
      deletedVersionsCount += deletedVersions.count;
    }

    const safeLessonIds = Array.from(lessonIds);
    if (safeLessonIds.length > 0) {
      const deletedLessons = await prisma.lesson.deleteMany({
        where: { id: { in: safeLessonIds } }
      });
      deletedLessonsCount += deletedLessons.count;
    }

    const safeModuleIds = Array.from(moduleIds);
    if (safeModuleIds.length > 0) {
      const deletedModules = await prisma.module.deleteMany({
        where: { id: { in: safeModuleIds } }
      });
      deletedModulesCount += deletedModules.count;
    }

    if (createdCourseId) {
      await prisma.module.deleteMany({ where: { courseId: createdCourseId } });
      const deletedCourse = await prisma.course.deleteMany({
        where: { id: createdCourseId }
      });
      deletedCoursesCount += deletedCourse.count;
    }

    const audit = {
      courseId: createdCourseId,
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
        versions: deletedVersionsCount,
        blocks: deletedBlocksCount,
        lessons: deletedLessonsCount,
        modules: deletedModulesCount,
        courses: deletedCoursesCount
      }
    };
    fastify.log.info({ rollbackAudit: audit }, "Import rollback completed");

    broadcastEntityChanged({
      entity: "import_rollback",
      action: "completed",
      courseId: createdCourseId ?? null,
      occurredAt: new Date().toISOString(),
      removed: {
        courseId: createdCourseId,
        modules: deletedModulesCount || safeModuleIds.length,
        lessons: deletedLessonsCount || safeLessonIds.length,
        versions: deletedVersionsCount || safeVersionIds.length
      }
    });

    return reply.code(200).send({
      ok: true,
      audit,
      removed: {
        courseId: createdCourseId,
        modules: deletedModulesCount || safeModuleIds.length,
        lessons: deletedLessonsCount || safeLessonIds.length,
        versions: deletedVersionsCount || safeVersionIds.length
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
      const payload =
        data && typeof data === "object" && !Array.isArray(data)
          ? { correlationId: streamCorrelationId, ...(data as Record<string, unknown>) }
          : { correlationId: streamCorrelationId, data };
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
    if (job.type === "segment" && job.lessonVersionId) {
      const version = await prisma.lessonVersion.findUnique({
        where: { id: job.lessonVersionId }
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
    if (job.type === "render_slide" && job.lessonVersionId && job.templateId) {
      const total = await prisma.block.count({
        where: { lessonVersionId: job.lessonVersionId }
      });
      expectedSlides = total;
      sendEvent("start", {
        versionId: job.lessonVersionId,
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
      } else if (job.lessonVersionId) {
        const total = await prisma.block.count({
          where: { lessonVersionId: job.lessonVersionId }
        });
        expectedAudio = total;
        sendEvent("start", {
          versionId: job.lessonVersionId,
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
      } else if (job.lessonVersionId) {
        const total = await prisma.block.count({
          where: { lessonVersionId: job.lessonVersionId }
        });
        expectedImages = total;
        sendEvent("start", {
          versionId: job.lessonVersionId,
          blockCount: total,
          mode: "image",
          templateId: job.templateId ?? null
        });
      }
    }
    if (job.type === "concat_video" && job.lessonVersionId) {
      const total = await prisma.block.count({
        where: { lessonVersionId: job.lessonVersionId }
      });
      expectedClips = total;
      sendEvent("start", {
        versionId: job.lessonVersionId,
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
          sendEvent("error", { message: "job not found" });
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
          sendEvent("done", { job: canceled });
          reply.raw.end();
          return;
        }
        if (current.status !== lastStatus) {
          lastStatus = current.status;
          sendEvent("status", { job: current });
        }
        if (current.type === "segment" && current.lessonVersionId) {
          const blocks = await prisma.block.findMany({
            where: { lessonVersionId: current.lessonVersionId },
            orderBy: { index: "asc" }
          });
          blocks.forEach((block) => {
            const previous = blockStates.get(block.id);
            if (!previous) {
              blockStates.set(block.id, block.status ?? "");
              if (block.status === "segment_error") {
                sendEvent("block_error", { block });
              } else {
                sendEvent("block", { block, blockMs: block.segmentMs ?? null });
              }
            } else if (previous !== (block.status ?? "")) {
              blockStates.set(block.id, block.status ?? "");
              if (block.status === "segment_error") {
                sendEvent("block_error", { block });
              } else {
                sendEvent("block", { block, blockMs: block.segmentMs ?? null });
              }
            }
          });
          if (blocks.length !== lastBlockCount) {
            lastBlockCount = blocks.length;
            sendEvent("progress", {
              index: lastBlockCount,
              total: expectedBlocks ?? lastBlockCount
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
                sendEvent("block", { block, blockMs: block.segmentMs ?? null });
              }
            }
            sendEvent("progress", { index: 1, total: 1 });
          }
        }
        if (current.type === "render_slide" && current.lessonVersionId && current.templateId) {
          if (expectedSlides === null) {
            expectedSlides = await prisma.block.count({
              where: { lessonVersionId: current.lessonVersionId }
            });
          }
          const rendered = await prisma.asset.count({
            where: {
              kind: "slide_png",
              templateId: current.templateId,
              block: { lessonVersionId: current.lessonVersionId }
            }
          });
          if (rendered !== lastSlideCount) {
            lastSlideCount = rendered;
            sendEvent("progress", {
              index: rendered,
              total: expectedSlides ?? rendered
            });
          }
        }
        if (current.type === "tts") {
          if (expectedAudio === null) {
            if (current.blockId) {
              expectedAudio = 1;
            } else if (current.lessonVersionId) {
              expectedAudio = await prisma.block.count({
                where: { lessonVersionId: current.lessonVersionId }
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
                sendEvent("audio_block", {
                  blockId: asset.blockId,
                  blockIndex: asset.block?.index ?? null,
                  path: asset.path
                });
              }
            }
          } else if (current.lessonVersionId) {
            generated = await prisma.asset.count({
              where: {
                kind: "audio_raw",
                block: { lessonVersionId: current.lessonVersionId },
                createdAt: { gte: current.createdAt }
              }
            });
            const audioAssets = await prisma.asset.findMany({
              where: {
                kind: "audio_raw",
                block: { lessonVersionId: current.lessonVersionId },
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
                sendEvent("audio_block", {
                  blockId: asset.blockId,
                  blockIndex: asset.block?.index ?? null,
                  path: asset.path
                });
              }
            }
          }
          if (generated !== lastAudioCount) {
            lastAudioCount = generated;
            sendEvent("progress", {
              index: generated,
              total: expectedAudio ?? generated
            });
          }
        }
        if (current.type === "image") {
          if (expectedImages === null) {
            if (current.blockId) {
              expectedImages = 1;
            } else if (current.lessonVersionId) {
              expectedImages = await prisma.block.count({
                where: { lessonVersionId: current.lessonVersionId }
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
          } else if (current.lessonVersionId) {
            generated = await prisma.asset.count({
              where: {
                kind: "image_raw",
                block: { lessonVersionId: current.lessonVersionId },
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
                sendEvent("image", {
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
          } else if (current.lessonVersionId) {
            const assets = await prisma.asset.findMany({
              where: {
                kind: "image_raw",
                block: { lessonVersionId: current.lessonVersionId },
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
              sendEvent("image", {
                blockId: asset.blockId,
                url: `/blocks/${asset.blockId}/image/raw`
              });
            }
            if (current.templateId) {
              const slides = await prisma.asset.findMany({
                where: {
                  kind: "slide_png",
                  templateId: current.templateId,
                  block: { lessonVersionId: current.lessonVersionId },
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
            sendEvent("progress", {
              index: generated,
              total: expectedImages ?? generated
            });
          }
        }
        if (current.type === "concat_video" && current.lessonVersionId) {
          if (expectedClips === null) {
            expectedClips = await prisma.block.count({
              where: { lessonVersionId: current.lessonVersionId }
            });
          }
          const rendered = await prisma.asset.count({
            where: {
              kind: "clip_mp4",
              block: { lessonVersionId: current.lessonVersionId },
              createdAt: { gte: current.createdAt }
            }
          });
          if (rendered !== lastClipCount) {
            lastClipCount = rendered;
            sendEvent("progress", {
              index: rendered,
              total: expectedClips ?? rendered
            });
          }
          if (!finalVideoSent) {
            const finalAsset = await prisma.asset.findFirst({
              where: {
                kind: "final_mp4",
                block: { lessonVersionId: current.lessonVersionId },
                createdAt: { gte: current.createdAt }
              },
              orderBy: { createdAt: "desc" }
            });
            if (finalAsset?.path && fs.existsSync(finalAsset.path)) {
              finalVideoSent = true;
              sendEvent("final_video", {
                url: `/lesson-versions/${current.lessonVersionId}/final-video`
              });
            }
          }
        }
        if (current.status === "succeeded" || current.status === "failed" || current.status === "canceled") {
          sendEvent("done", { job: current, blockCount: lastBlockCount });
          reply.raw.end();
          return;
        }
      } catch (err) {
        sendEvent("error", { message: (err as Error).message });
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

fastify.addHook("onClose", async () => {
  await prisma.$disconnect();
});

const start = async () => {
  await fastify.listen({ port: config.apiPort, host: config.apiHost });
};

const isDirectExecution = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
})();

if (isDirectExecution && process.env.VIZLEC_SKIP_API_LISTEN !== "true") {
  start().catch((err) => {
    fastify.log.error(err, "Failed to start API");
    process.exit(1);
  });
}

export { fastify };
