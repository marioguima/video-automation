import { spawn, execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { EventEmitter } from "node:events";

import WebSocket from "ws";

import {
  buildBlockMetaPrompt,
  buildDeterministicBlocks,
  buildFallbackMeta,
  normalizeBlockMetaResponse,
  sanitizeNarratedScriptText,
  ollamaChat,
  ollamaHealth,
  ensureDataDir,
  getConfig,
  loadRootEnv,
  loadVoiceIndex,
  findVoiceById,
  resolveVoicePath,
  blockAudioDir,
  blockClipDir,
  blockImageRawDir,
  lessonFinalDir,
  blockSlideDir,
  ensureDir,
  type BlockDraft,
  type BlockMeta,
  type OnScreen
} from "@vizlec/shared";
import { createPrismaClient } from "@vizlec/db";

import { renderImageSlidePng, renderTextSlidePng } from "./slideRenderer.js";
import {
  buildInventoryDelta,
  collectAudioInventorySnapshot,
  type InventorySnapshot
} from "./inventory-collector.js";
import {
  buildAgentControlBootstrapPresence,
  buildMissingIdentitySkipPayload,
  hasCompleteAgentControlIdentity,
  shouldFailStartupWithoutIdentity
} from "./agent-control-bootstrap.js";

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

const prisma = createPrismaClient();
const internalJobsEventToken = process.env.INTERNAL_JOBS_EVENT_TOKEN?.trim() ?? "";

if (!internalJobsEventToken) {
  throw new Error("Missing INTERNAL_JOBS_EVENT_TOKEN");
}

type JobRecord = {
  id: string;
  scope: string;
  lessonVersionId: string | null;
  blockId: string | null;
  type: string;
  status: string;
  attempts: number;
  error: string | null;
  inputHash: string | null;
  priority: number;
  clientId: string | null;
  requestId: string | null;
  metaJson?: string | null;
  leaseExpiresAt: Date | null;
  canceledAt: Date | null;
  templateId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type SlideTemplateRecord = {
  id: string;
  label: string;
  kind: string;
  fileName: string;
  isActive: boolean;
};

type ComfyWorkflowNode = {
  inputs?: Record<string, unknown>;
  class_type?: string;
  _meta?: { title?: string };
};

type ComfyWorkflow = Record<string, ComfyWorkflowNode>;

type ImagePrompt = {
  block_prompt?: string;
  avoid?: string;
  seed_hint?: string;
  seed?: number;
};

const parsedMaxAttempts = Number(process.env.JOB_MAX_ATTEMPTS);
const MAX_ATTEMPTS = Number.isFinite(parsedMaxAttempts) ? parsedMaxAttempts : 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logJobEvent(event: string, job: JobRecord, extra: Record<string, unknown> = {}): void {
  const correlationId = job.requestId?.trim() || null;
  const payload: Record<string, unknown> = {
    event,
    job_id: job.id,
    block_id: job.blockId,
    lesson_version_id: job.lessonVersionId,
    type: job.type,
    attempts: job.attempts,
    ...extra
  };
  if (correlationId) {
    payload.correlationId = correlationId;
  }
  console.log(JSON.stringify(payload));
  // Push only lifecycle-level job updates to API WS bridge.
  const shouldNotifyApi =
    event === "job_started" ||
    event === "job_failed_retrying" ||
    event === "job_succeeded" ||
    event === "job_failed" ||
    event === "job_canceled";
  if (shouldNotifyApi) {
    void (async () => {
      const resolvedCorrelationId = correlationId || (await ensureJobCorrelationId(job));
      const lifecycle = mapLifecycleFromLogEvent(event) ?? undefined;
      await notifyApiJobEvent(job.id, resolvedCorrelationId, {
        lifecycle
      });
    })();
  }
}

function localIsoNow(): string {
  const date = new Date();
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const pad = (value: number) => String(Math.trunc(Math.abs(value))).padStart(2, "0");
  const offsetHours = pad(offsetMinutes / 60);
  const offsetMins = pad(offsetMinutes % 60);
  const base = date.toISOString().replace("Z", "");
  return `${base}${sign}${offsetHours}:${offsetMins}`;
}

function getWorkerLogPath(): string {
  const root = config.dataDir ?? process.cwd();
  return path.join(root, "worker-actions.log");
}

function logWorkerAction(message: string, meta: Record<string, unknown> = {}): void {
  const payload = {
    ts: localIsoNow(),
    message,
    ...meta
  };
  const line = JSON.stringify(payload);
  console.log(line);
  fs.promises.appendFile(getWorkerLogPath(), `${line}\n`).catch(() => null);
}

function startActionTimer(name: string, meta: Record<string, unknown> = {}): () => void {
  const startedAt = Date.now();
  logWorkerAction(`${name}_started`, meta);
  return () => {
    const durationMs = Date.now() - startedAt;
    logWorkerAction(`${name}_completed`, { ...meta, duration_ms: durationMs });
  };
}

function logSystemMetrics(message: string, meta: Record<string, unknown> = {}): void {
  const mem = process.memoryUsage();
  logWorkerAction(message, {
    ...meta,
    rss_mb: Math.round(mem.rss / 1024 / 1024),
    heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
    heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
    external_mb: Math.round(mem.external / 1024 / 1024),
    system_free_mb: Math.round(os.freemem() / 1024 / 1024),
    system_total_mb: Math.round(os.totalmem() / 1024 / 1024)
  });
  void logNvidiaSmiMetrics(message, meta);
}

async function logNvidiaSmiMetrics(
  message: string,
  meta: Record<string, unknown> = {}
): Promise<void> {
  if (nvidiaSmiAvailability === "unavailable") return;
  try {
    const raw = await execFileText("nvidia-smi", [
      "--query-gpu=name,driver_version,memory.used,memory.total,utilization.gpu,temperature.gpu,power.draw,power.limit",
      "--format=csv,noheader,nounits"
    ]);
    nvidiaSmiAvailability = "available";
    const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const gpus = lines.map((line, index) => {
      const parts = line.split(",").map((part) => part.trim());
      return {
        index,
        name: parts[0] ?? "",
        driver_version: parts[1] ?? "",
        memory_used_mb: Number(parts[2] ?? "0"),
        memory_total_mb: Number(parts[3] ?? "0"),
        utilization_gpu_pct: Number(parts[4] ?? "0"),
        temperature_c: Number(parts[5] ?? "0"),
        power_draw_w: Number(parts[6] ?? "0"),
        power_limit_w: Number(parts[7] ?? "0")
      };
    });
    logWorkerAction(`${message}_gpu`, {
      ...meta,
      gpus
    });
  } catch (err) {
    nvidiaSmiAvailability = "unavailable";
    if (!didWarnNoNvidiaSmi) {
      didWarnNoNvidiaSmi = true;
      logWorkerAction("gpu_metrics_unavailable", {
        error: serializeError(err),
        hint: "Install NVIDIA drivers/tools or ensure nvidia-smi is in PATH to log GPU metrics."
      });
    }
  }
}

async function logNvidiaSmiMetricsSnapshot(): Promise<
  Array<{ index: number; memory_used_mb: number }>
> {
  if (nvidiaSmiAvailability === "unavailable") return [];
  try {
    const raw = await execFileText("nvidia-smi", [
      "--query-gpu=memory.used",
      "--format=csv,noheader,nounits"
    ]);
    nvidiaSmiAvailability = "available";
    const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    return lines.map((line, index) => ({
      index,
      memory_used_mb: Number(line || "0")
    }));
  } catch {
    nvidiaSmiAvailability = "unavailable";
    return [];
  }
}

function serializeError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

type TtsSettings = {
  voiceId?: string;
  language?: string;
};

function loadTtsSettings(): TtsSettings {
  try {
    if (!fs.existsSync(config.ttsSettingsPath)) {
      return {};
    }
    const raw = fs.readFileSync(config.ttsSettingsPath, "utf8");
    const parsed = JSON.parse(raw) as TtsSettings;
    return {
      voiceId: typeof parsed.voiceId === "string" ? parsed.voiceId : undefined,
      language: typeof parsed.language === "string" ? parsed.language : undefined
    };
  } catch {
    return {};
  }
}


const WORKER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VIDEO_AUTOMATION_ROOT = path.resolve(WORKER_ROOT, "..", "..", "..", "..");
const CINEMATIC_FINAL_RENDER_SCRIPT = path.join(WORKER_ROOT, "scripts", "render_cinematic_final.py");
const MAX_MIX_GAIN = Math.pow(10, 6 / 20);
const QWEN_TTS_SCRIPT = path.join(WORKER_ROOT, "scripts", "qwen_tts_generate.py");
const CHATTERBOX_TTS_SCRIPT = path.join(WORKER_ROOT, "scripts", "chatterbox_tts_generate.py");
const COMFY_WORKFLOWS_DIR = path.join(WORKER_ROOT, "workflows");
const DEFAULT_COMFY_WORKFLOW_FILE = "vantage-z-image-turbo-api.json";
const comfyWorkflowTemplateCache = new Map<string, { workflow: ComfyWorkflow; mtimeMs: number }>();
let didWarnComfyManagerOnce = false;
let nvidiaSmiAvailability: "unknown" | "available" | "unavailable" = "unknown";
let didWarnNoNvidiaSmi = false;
let lastAssetGenerationAt = Date.now();
let didIdleUnloadAfterLastAsset = false;

async function runProcess(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    logPrefix?: string;
    onStdoutLine?: (line: string) => void;
    onStderrLine?: (line: string) => void;
  } = {}
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: options.cwd
    });
    let stdout = "";
    let stderr = "";
    let stdoutBuffer = "";
    let stderrBuffer = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (options.onStdoutLine) {
          options.onStdoutLine(line);
        }
        if (options.logPrefix && line.trim().length > 0 && !line.startsWith("__VIZLEC_RESULT__")) {
          console.log(`[${options.logPrefix}] ${line}`);
        }
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      stderrBuffer += chunk;
      const lines = stderrBuffer.split(/\r?\n/);
      stderrBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (options.onStderrLine) {
          options.onStderrLine(line);
        }
        if (options.logPrefix && line.trim().length > 0 && !line.startsWith("__VIZLEC_RESULT__")) {
          console.error(`[${options.logPrefix}] ${line}`);
        }
      }
    });
    child.on("error", (err) => {
      reject(err);
    });
    child.on("close", (code) => {
      if (stdoutBuffer.trim().length > 0) {
        if (options.onStdoutLine) {
          options.onStdoutLine(stdoutBuffer);
        }
        if (options.logPrefix && !stdoutBuffer.startsWith("__VIZLEC_RESULT__")) {
          console.log(`[${options.logPrefix}] ${stdoutBuffer}`);
        }
      }
      if (stderrBuffer.trim().length > 0) {
        if (options.onStderrLine) {
          options.onStderrLine(stderrBuffer);
        }
        if (options.logPrefix && !stderrBuffer.startsWith("__VIZLEC_RESULT__")) {
          console.error(`[${options.logPrefix}] ${stderrBuffer}`);
        }
      }
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const error = new Error(
          `Command failed (${command} ${args.join(" ")}): ${stderr || stdout}`.trim()
        );
        reject(error);
      }
    });
  });
}

async function execFileText(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { encoding: "utf8" }, (err, stdout) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

async function renderCinematicFinalVideoWithPython(options: {
  outputPath: string;
  mediaFiles: string[];
  audioFiles: string[];
  durations: number[];
  job: JobRecord;
}): Promise<void> {
  const pythonCommand =
    process.env.VIZLEC_RENDER_PYTHON?.trim() ||
    process.env.PYTHON_EXECUTABLE?.trim() ||
    "python";
  const payload = {
    project_root: VIDEO_AUTOMATION_ROOT,
    output_path: options.outputPath,
    media_files: options.mediaFiles,
    audio_files: options.audioFiles,
    durations: options.durations,
    width: 1920,
    height: 1080,
    fps: 30,
    motion_preset: "D_zoom_cinematic",
    zoom_transition_preset: "T6_inertial_ref",
    transition: "XF3b_flash_white_occluded_6f",
    transition_duration: 0.2,
    subtitle_enabled: String(process.env.VIZLEC_SUBTITLES_ENABLED ?? "1").trim() !== "0",
    subtitle_template_id: "subtitle-yellow-bold-bottom-v1",
    subtitle_language: (process.env.VIZLEC_SUBTITLE_LANGUAGE ?? "pt").trim() || "pt",
    subtitle_model: (process.env.VIZLEC_SUBTITLE_WHISPER_MODEL ?? "").trim() || undefined,
    subtitle_device: (process.env.VIZLEC_SUBTITLE_WHISPER_DEVICE ?? "").trim() || undefined,
    subtitle_compute_type:
      (process.env.VIZLEC_SUBTITLE_WHISPER_COMPUTE_TYPE ?? "").trim() || undefined,
    subtitle_vad_filter: String(process.env.VIZLEC_SUBTITLE_VAD_FILTER ?? "1").trim() !== "0",
    subtitle_word_timestamps:
      String(process.env.VIZLEC_SUBTITLE_WORD_TIMESTAMPS ?? "1").trim() !== "0",
    render_mode: (process.env.VIZLEC_CINEMATIC_RENDER_MODE ?? "quality").trim().toLowerCase()
  };
  const tmpPayloadPath = path.join(
    os.tmpdir(),
    `vizlec_cinematic_payload_${options.job.id}_${Date.now()}.json`
  );
  await fs.promises.writeFile(tmpPayloadPath, JSON.stringify(payload, null, 2), "utf8");
  let clipProgress = 0;
  try {
    await runProcess(
      pythonCommand,
      [CINEMATIC_FINAL_RENDER_SCRIPT, tmpPayloadPath],
      {
        cwd: VIDEO_AUTOMATION_ROOT,
        logPrefix: "video:cinematic",
        onStdoutLine: (line) => {
          const match = line.match(/^__VIZLEC_RESULT__\s+clip_start\s+(\d+)\s+(\d+)$/);
          if (match) {
            const current = Number(match[1]);
            const total = Number(match[2]);
            if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) return;
            const pct = Math.max(1, Math.min(90, Math.trunc((current / total) * 90)));
            if (pct <= clipProgress) return;
            clipProgress = pct;
            void notifyRunningProgress(options.job, pct);
            return;
          }
          if (/^__VIZLEC_RESULT__\s+subtitle_start$/.test(line)) {
            void notifyRunningProgress(options.job, Math.max(clipProgress, 4));
            return;
          }
          if (/^__VIZLEC_RESULT__\s+subtitle_ready\b/.test(line)) {
            void notifyRunningProgress(options.job, Math.max(clipProgress, 10));
            return;
          }
          if (/^__VIZLEC_RESULT__\s+subtitle_burn_start$/.test(line)) {
            void notifyRunningProgress(options.job, Math.max(clipProgress, 93));
            return;
          }
          if (/^__VIZLEC_RESULT__\s+subtitle_burn_done$/.test(line)) {
            void notifyRunningProgress(options.job, Math.max(clipProgress, 97));
          }
        }
      }
    );
  } finally {
    await fs.promises.unlink(tmpPayloadPath).catch(() => null);
  }
}

async function ensureMemoryForSubtitleTranscription(job: JobRecord): Promise<void> {
  logJobEvent("model_switch_prepare", job, {
    target: "subtitle_transcription",
    action: "unload_generation_models"
  });
  await releaseAllGenerationModels({
    reason: "switch_to_subtitle_transcription",
    job
  });
}

type HttpJsonOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  timeoutMs?: number;
  headers?: Record<string, string>;
};

async function requestJson<T>(url: string, options: HttpJsonOptions = {}): Promise<T> {
  const parsed = new URL(url);
  const client = parsed.protocol === "https:" ? https : http;
  const method = options.method ?? (options.body ? "POST" : "GET");
  const payload = options.body ? JSON.stringify(options.body) : "";
  const headers: Record<string, string> = {
    Accept: "application/json"
  };
  if (options.headers) {
    Object.assign(headers, options.headers);
  }
  if (payload) {
    headers["Content-Type"] = "application/json";
    headers["Content-Length"] = Buffer.byteLength(payload).toString();
  }

  return new Promise((resolve, reject) => {
    const req = client.request(
      {
        method,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        headers
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          const isOk = status >= 200 && status < 300;
          if (!raw) {
            if (isOk) {
              resolve(undefined as T);
              return;
            }
            reject(new Error(`HTTP ${status} from ${url}`));
            return;
          }
          try {
            const parsedJson = JSON.parse(raw) as T;
            if (isOk) {
              resolve(parsedJson);
              return;
            }
            reject(new Error(`HTTP ${status} from ${url}: ${raw}`));
          } catch (err) {
            if (isOk) {
              reject(new Error(`Invalid JSON response from ${url}`));
              return;
            }
            reject(new Error(`HTTP ${status} from ${url}: ${raw}`));
          }
        });
      }
    );

    if (options.timeoutMs && options.timeoutMs > 0) {
      req.setTimeout(options.timeoutMs, () => {
        req.destroy(new Error(`Request timeout after ${options.timeoutMs}ms`));
      });
    }

    req.on("error", (err) => {
      reject(err);
    });

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

const apiBaseUrl = normalizeBaseUrl(
  process.env.API_BASE_URL ?? `http://127.0.0.1:${config.apiPort}`
);

function deriveWsUrlFromHttpBase(baseUrl: string): string {
  const parsed = new URL(baseUrl);
  parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "") + "/ws/agent-control";
  return parsed.toString();
}

const agentControlToken =
  process.env.AGENT_CONTROL_TOKEN?.trim() || internalJobsEventToken;
let agentWorkspaceId = process.env.WORKSPACE_ID?.trim() ?? "";
let agentId = process.env.AGENT_ID?.trim() ?? "";
const agentLabel = process.env.AGENT_LABEL?.trim() ?? null;
const agentMachineFingerprint = process.env.MACHINE_FINGERPRINT?.trim() ?? null;
const workerRequireWsOnStartup =
  (process.env.WORKER_REQUIRE_WS_ON_STARTUP ?? "false").trim().toLowerCase() === "true";
const parsedWorkerWsStartupTimeoutMs = Number(process.env.WORKER_WS_STARTUP_TIMEOUT_MS ?? 45000);
const workerWsStartupTimeoutMs =
  Number.isFinite(parsedWorkerWsStartupTimeoutMs) && parsedWorkerWsStartupTimeoutMs > 0
    ? Math.max(5000, Math.min(300000, parsedWorkerWsStartupTimeoutMs))
    : 45000;
const workerInventoryRootDir = path.join(config.dataDir, "courses");
const workerInventoryScanIntervalMs = Number(
  process.env.WORKER_INVENTORY_SCAN_INTERVAL_MS ?? 30000
);
const workerAcceptControlPlaneIntegrationBaseUrl =
  (process.env.WORKER_ACCEPT_CONTROL_PLANE_INTEGRATION_BASEURL ?? "false")
    .trim()
    .toLowerCase() === "true";
const inventoryDurationCache = new Map<
  string,
  { sizeBytes: number; mtimeMs: number; durationSeconds: number }
>();
let lastInventorySnapshot: InventorySnapshot | null = null;
let inventoryScanInFlight = false;
let inventoryScanPending = false;
let inventoryScanTimer: NodeJS.Timeout | null = null;
let agentControlSocketConnected = false;
let agentControlHelloAckReceived = false;
const agentControlStartupBus = new EventEmitter();
agentControlStartupBus.setMaxListeners(0);

function hasAgentControlIdentityConfigured(): boolean {
  const presence = buildAgentControlBootstrapPresence({
    apiBaseUrl,
    agentControlToken,
    workspaceId: agentWorkspaceId,
    agentId
  });
  return hasCompleteAgentControlIdentity(presence);
}

function markAgentControlReady(): void {
  if (agentControlHelloAckReceived) return;
  agentControlHelloAckReceived = true;
  agentControlStartupBus.emit("ready");
}

async function waitForAgentControlReady(timeoutMs: number): Promise<boolean> {
  if (agentControlHelloAckReceived) return true;
  return new Promise((resolve) => {
    const onReady = () => {
      cleanup();
      resolve(true);
    };
    const cleanup = () => {
      clearTimeout(timer);
      agentControlStartupBus.off("ready", onReady);
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);
    agentControlStartupBus.on("ready", onReady);
  });
}

function hasWorkerIdentityForInventory(): boolean {
  return Boolean(apiBaseUrl && agentWorkspaceId && agentId);
}

async function collectWorkerInventorySnapshot(): Promise<InventorySnapshot> {
  return collectAudioInventorySnapshot(workerInventoryRootDir, {
    durationCache: inventoryDurationCache,
    probeDurationSeconds: probeAudioDuration
  });
}

type WorkerSnapshotAssetRef = {
  assetId: string;
  courseId: string;
  moduleId: string;
  lessonId: string;
  lessonVersionId: string;
  blockId: string;
  kind: string;
  path: string;
  sizeBytes: number;
  durationSeconds?: number;
};

async function collectWorkerSnapshotAssetRefs(): Promise<WorkerSnapshotAssetRef[]> {
  if (!agentWorkspaceId) return [];
  const assets = await prisma.asset.findMany({
    where: { workspaceId: agentWorkspaceId },
    select: {
      id: true,
      blockId: true,
      kind: true,
      path: true,
      block: {
        select: {
          lessonVersionId: true,
          audioDurationS: true,
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
      }
    }
  });
  const refs: WorkerSnapshotAssetRef[] = [];
  for (const asset of assets) {
    const rawPath = asset.path?.trim();
    if (!rawPath) continue;
    const resolvedPath = path.resolve(rawPath);
    let sizeBytes = 0;
    try {
      const stat = fs.statSync(resolvedPath);
      if (!stat.isFile()) continue;
      sizeBytes = Math.max(0, Math.trunc(stat.size));
    } catch {
      continue;
    }
    refs.push({
      assetId: asset.id,
      courseId: asset.block.lessonVersion.lesson.module.courseId,
      moduleId: asset.block.lessonVersion.lesson.moduleId,
      lessonId: asset.block.lessonVersion.lessonId,
      lessonVersionId: asset.block.lessonVersionId,
      blockId: asset.blockId,
      kind: asset.kind,
      path: resolvedPath,
      sizeBytes,
      durationSeconds:
        asset.kind === "audio_raw" && typeof asset.block.audioDurationS === "number"
          ? asset.block.audioDurationS
          : undefined
    });
  }
  return refs;
}

type FreeSpaceCandidate = { path: string; sizeBytes: number; reason: "orphan_file_no_asset_ref" };

function listFilesRecursive(rootDir: string, output: string[] = []): string[] {
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return output;
  }
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      listFilesRecursive(fullPath, output);
      continue;
    }
    if (entry.isFile()) {
      output.push(fullPath);
    }
  }
  return output;
}

async function buildWorkerFreeSpacePlan(maxItems?: number): Promise<{
  ok: boolean;
  rootDir: string;
  scannedFiles: number;
  referencedFiles: number;
  candidateCount: number;
  candidateBytes: number;
  candidates: FreeSpaceCandidate[];
}> {
  const rootDir = path.resolve(workerInventoryRootDir);
  const files = listFilesRecursive(rootDir, []);
  if (!agentWorkspaceId) {
    return {
      ok: true,
      rootDir,
      scannedFiles: files.length,
      referencedFiles: 0,
      candidateCount: 0,
      candidateBytes: 0,
      candidates: []
    };
  }
  const dbAssets = await prisma.asset.findMany({
    where: { workspaceId: agentWorkspaceId },
    select: { path: true }
  });
  const referenced = new Set(
    dbAssets
      .map((asset) => asset.path?.trim())
      .filter((value): value is string => Boolean(value))
      .map((value) => path.resolve(value))
  );
  const candidates: FreeSpaceCandidate[] = [];
  let candidateBytes = 0;
  let candidateCount = 0;
  const cap =
    typeof maxItems === "number" && Number.isFinite(maxItems)
      ? Math.max(1, Math.min(5000, Math.trunc(maxItems)))
      : 500;
  for (const filePath of files) {
    const resolved = path.resolve(filePath);
    if (referenced.has(resolved)) continue;
    candidateCount += 1;
    let sizeBytes = 0;
    try {
      sizeBytes = Math.max(0, Math.trunc(fs.statSync(resolved).size));
    } catch {
      continue;
    }
    candidateBytes += sizeBytes;
    if (candidates.length < cap) {
      candidates.push({
        path: resolved,
        sizeBytes,
        reason: "orphan_file_no_asset_ref"
      });
    }
  }
  return {
    ok: true,
    rootDir,
    scannedFiles: files.length,
    referencedFiles: referenced.size,
    candidateCount,
    candidateBytes,
    candidates
  };
}

async function executeWorkerFreeSpace(maxItems?: number): Promise<{
  ok: boolean;
  planned: number;
  deleted: number;
  failed: number;
  reclaimedBytes: number;
  failures: Array<{ path: string; error: string }>;
}> {
  const plan = await buildWorkerFreeSpacePlan(maxItems);
  let deleted = 0;
  let failed = 0;
  let reclaimedBytes = 0;
  const failures: Array<{ path: string; error: string }> = [];
  for (const candidate of plan.candidates) {
    try {
      fs.unlinkSync(candidate.path);
      deleted += 1;
      reclaimedBytes += candidate.sizeBytes;
    } catch (err) {
      failed += 1;
      failures.push({
        path: candidate.path,
        error: serializeError(err)
      });
    }
  }
  return {
    ok: true,
    planned: plan.candidates.length,
    deleted,
    failed,
    reclaimedBytes,
    failures
  };
}

async function publishInventorySnapshot(snapshot: InventorySnapshot): Promise<void> {
  if (!hasWorkerIdentityForInventory()) return;
  const assetRefs = await collectWorkerSnapshotAssetRefs();
  await requestJson(`${apiBaseUrl}/internal/inventory/snapshot`, {
    method: "POST",
    timeoutMs: 15000,
    headers: {
      "x-internal-token": internalJobsEventToken
    },
    body: {
      workspaceId: agentWorkspaceId,
      agentId,
      snapshot: {
        audioCount: snapshot.audioCount,
        durationSeconds: snapshot.durationSeconds,
        diskUsageBytes: snapshot.diskUsageBytes,
        assetRefs,
        updatedAt: new Date().toISOString()
      }
    }
  });
}

async function publishInventoryDelta(delta: {
  audioCountDelta: number;
  durationSecondsDelta: number;
  diskUsageBytesDelta: number;
}): Promise<void> {
  if (!hasWorkerIdentityForInventory()) return;
  await requestJson(`${apiBaseUrl}/internal/inventory/delta`, {
    method: "POST",
    timeoutMs: 15000,
    headers: {
      "x-internal-token": internalJobsEventToken
    },
    body: {
      workspaceId: agentWorkspaceId,
      agentId,
      delta: {
        audioCountDelta: delta.audioCountDelta,
        durationSecondsDelta: delta.durationSecondsDelta,
        diskUsageBytesDelta: delta.diskUsageBytesDelta,
        updatedAt: new Date().toISOString()
      }
    }
  });
}

async function runInventoryScan(reason: string, forceSnapshot = false): Promise<void> {
  if (!hasWorkerIdentityForInventory()) return;
  if (inventoryScanInFlight) {
    inventoryScanPending = true;
    return;
  }
  inventoryScanInFlight = true;
  try {
    const current = await collectWorkerInventorySnapshot();
    if (forceSnapshot || !lastInventorySnapshot) {
      await publishInventorySnapshot(current);
      logWorkerAction("inventory_snapshot_published", {
        reason,
        audio_count: current.audioCount,
        duration_seconds: current.durationSeconds,
        disk_usage_bytes: current.diskUsageBytes
      });
      lastInventorySnapshot = current;
      return;
    }

    const diff = buildInventoryDelta(lastInventorySnapshot, current);
    if (!diff.changed) return;

    const hasDeletionSignal =
      diff.delta.audioCountDelta < 0 ||
      diff.delta.durationSecondsDelta < 0 ||
      diff.delta.diskUsageBytesDelta < 0;
    if (hasDeletionSignal) {
      await publishInventorySnapshot(current);
      logWorkerAction("inventory_snapshot_published", {
        reason: `${reason}:deletion_detected`,
        audio_count: current.audioCount,
        duration_seconds: current.durationSeconds,
        disk_usage_bytes: current.diskUsageBytes
      });
      lastInventorySnapshot = current;
      return;
    }

    await publishInventoryDelta(diff.delta);
    logWorkerAction("inventory_delta_published", {
      reason,
      audio_count_delta: diff.delta.audioCountDelta,
      duration_seconds_delta: diff.delta.durationSecondsDelta,
      disk_usage_bytes_delta: diff.delta.diskUsageBytesDelta
    });
    lastInventorySnapshot = current;
  } catch (err) {
    logWorkerAction("inventory_scan_failed", {
      reason,
      error: serializeError(err)
    });
  } finally {
    inventoryScanInFlight = false;
    if (inventoryScanPending) {
      inventoryScanPending = false;
      void runInventoryScan("pending_rescan");
    }
  }
}

function ensureInventoryPeriodicScanStarted(): void {
  if (inventoryScanTimer) return;
  if (!Number.isFinite(workerInventoryScanIntervalMs) || workerInventoryScanIntervalMs <= 0) {
    return;
  }
  inventoryScanTimer = setInterval(() => {
    void runInventoryScan("periodic_scan");
  }, workerInventoryScanIntervalMs);
  inventoryScanTimer.unref?.();
}

type AgentControlRequest =
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
          | "inventory_snapshot_collect"
          | "block_image_raw_get"
          | "block_audio_raw_get"
          | "block_slide_get"
          | "lesson_version_final_video_get"
          | "lesson_version_final_video_post"
          | "lesson_version_slides_post"
          | "lesson_version_assets_post"
          | "lesson_version_assets_image_post"
          | "lesson_version_images_post"
          | "lesson_version_audios_list"
          | "lesson_version_images_list"
          | "lesson_version_slides_list"
          | "lesson_version_job_state";
        params?: Record<string, unknown>;
        correlationId?: string;
      };
    };

type AgentHelloAckMessage = {
  type: "agent_hello_ack";
  messageId: string;
  inReplyTo?: string;
  payload?: {
    ok?: boolean;
    agentId?: string;
    integrationConfig?: {
      llmBaseUrl?: string;
      comfyuiBaseUrl?: string;
      ttsBaseUrl?: string;
    };
  };
};

function createAgentControlResponseMessage(params: {
  inReplyTo: string;
  provider: "ollama" | "xtts" | "comfyui";
  statusCode: number;
  data: Record<string, unknown>;
}): string {
  return JSON.stringify({
    type: "integration_health_response",
    messageId: randomUUID(),
    inReplyTo: params.inReplyTo,
    payload: {
      provider: params.provider,
      statusCode: params.statusCode,
      data: params.data
    }
  });
}

function createWorkerCommandResponseMessage(params: {
  inReplyTo: string;
  command:
    | "comfy_workflows_list"
    | "comfy_workflow_import"
    | "tts_voices_list"
    | "worker_queue_wake"
    | "system_hard_cleanup"
    | "system_free_space_plan"
    | "system_free_space_execute"
    | "inventory_snapshot_collect"
    | "block_image_raw_get"
    | "block_audio_raw_get"
    | "block_slide_get"
    | "lesson_version_final_video_get"
    | "lesson_version_final_video_post"
    | "lesson_version_slides_post"
    | "lesson_version_assets_post"
    | "lesson_version_assets_image_post"
    | "lesson_version_images_post"
    | "lesson_version_audios_list"
    | "lesson_version_images_list"
    | "lesson_version_slides_list"
    | "lesson_version_job_state";
  statusCode: number;
  data: Record<string, unknown>;
}): string {
  return JSON.stringify({
    type: "worker_command_response",
    messageId: randomUUID(),
    inReplyTo: params.inReplyTo,
    payload: {
      command: params.command,
      statusCode: params.statusCode,
      data: params.data
    }
  });
}

function createAgentErrorMessage(params: {
  inReplyTo?: string;
  code: string;
  message: string;
}): string {
  return JSON.stringify({
    type: "agent_error",
    messageId: randomUUID(),
    inReplyTo: params.inReplyTo,
    payload: {
      code: params.code,
      message: params.message
    }
  });
}

type VoiceOption = {
  id: string;
  label: string;
  description: string | null;
  preview_url?: string | null;
};

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
    return { ok: false, error: "Workflow must be a non-empty JSON object in ComfyUI API format." };
  }
  const hasPromptNode = hasComfyNode(
    parsed,
    (node) => node.class_type === "CLIPTextEncode" && typeof node.inputs?.text === "string"
  );
  if (!hasPromptNode) {
    return { ok: false, error: "Workflow missing CLIPTextEncode node with text input." };
  }
  const hasSeedNode = hasComfyNode(
    parsed,
    (node) => node.class_type === "KSampler" && Boolean(node.inputs && "seed" in node.inputs)
  );
  if (!hasSeedNode) {
    return { ok: false, error: "Workflow missing KSampler node with seed input." };
  }
  const hasSaveNode = hasComfyNode(parsed, (node) => node.class_type === "SaveImage");
  if (!hasSaveNode) {
    return { ok: false, error: "Workflow missing SaveImage node." };
  }
  return { ok: true };
}

function listComfyWorkflowFiles(): string[] {
  if (!fs.existsSync(COMFY_WORKFLOWS_DIR)) {
    fs.mkdirSync(COMFY_WORKFLOWS_DIR, { recursive: true });
  }
  return fs
    .readdirSync(COMFY_WORKFLOWS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "en"));
}

function resolveConfiguredWorkflowFile(current: AppSettings): string {
  const configured = current.comfy?.workflowFile;
  const workflows = listComfyWorkflowFiles();
  if (configured && isSafeWorkflowFileName(configured) && workflows.includes(configured)) {
    return configured;
  }
  return workflows.includes(DEFAULT_COMFY_WORKFLOW_FILE)
    ? DEFAULT_COMFY_WORKFLOW_FILE
    : workflows[0] ?? DEFAULT_COMFY_WORKFLOW_FILE;
}

async function fetchXttsVoices(baseUrl: string): Promise<VoiceOption[]> {
  const normalize = (input: string): string => input.trim().replace(/\/+$/, "");
  const root = normalize(baseUrl);
  const mapVoices = (payload: unknown): VoiceOption[] => {
    if (!payload || typeof payload !== "object") return [];
    const value = payload as Record<string, unknown>;
    const voicesRaw = Array.isArray(value.voices) ? value.voices : [];
    const voices: VoiceOption[] = [];
    for (const item of voicesRaw) {
      if (!item || typeof item !== "object") continue;
      const voice = item as Record<string, unknown>;
      const id = String(voice.voice_id ?? voice.name ?? "").trim();
      if (!id) continue;
      const label = String(voice.name ?? voice.label ?? voice.voice_id ?? id).trim() || id;
      const description =
        typeof voice.description === "string"
          ? voice.description
          : typeof voice.locale === "string"
            ? voice.locale
            : null;
      const previewUrl =
        typeof voice.preview_url === "string"
          ? voice.preview_url
          : typeof voice.preview === "string"
            ? voice.preview
            : null;
      voices.push({ id, label, description, preview_url: previewUrl });
    }
    return voices;
  };

  const endpoints = [`${root}/voices`, `${root}/speakers`];
  for (const endpoint of endpoints) {
    try {
      const payload = await requestJson<unknown>(endpoint, { method: "GET", timeoutMs: 5000 });
      const voices = mapVoices(payload);
      voices.sort((a, b) => a.id.localeCompare(b.id));
      return voices;
    } catch {
      // try next endpoint
    }
  }
  return [];
}

async function resolveOllamaHealth(): Promise<{ statusCode: number; data: Record<string, unknown> }> {
  const settings = readAppSettings();
  const baseUrl = settings.llm?.baseUrl ?? config.ollamaBaseUrl;
  const status = await ollamaHealth(baseUrl);
  return {
    statusCode: status.ok ? 200 : 503,
    data: {
      ok: status.ok,
      baseUrl,
      models: status.models,
      error: status.ok ? undefined : "ollama_unavailable"
    }
  };
}

async function resolveXttsHealth(): Promise<{ statusCode: number; data: Record<string, unknown> }> {
  const settings = readAppSettings();
  const baseUrl = normalizeBaseUrl(settings.tts?.baseUrl ?? config.xttsApiBaseUrl);
  const timeoutMs = Math.max(2000, Math.min(config.xttsApiRequestTimeoutMs, 15000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/health`, { signal: controller.signal });
    if (!response.ok) {
      return {
        statusCode: 503,
        data: { ok: false, baseUrl, error: `HTTP ${response.status}` }
      };
    }
    return {
      statusCode: 200,
      data: { ok: true, baseUrl }
    };
  } catch (err) {
    return {
      statusCode: 503,
      data: { ok: false, baseUrl, error: serializeError(err) }
    };
  } finally {
    clearTimeout(timer);
  }
}

async function resolveComfyuiHealth(
  options?: Record<string, unknown>
): Promise<{ statusCode: number; data: Record<string, unknown> }> {
  const settings = readAppSettings();
  const baseUrlOverride =
    typeof options?.baseUrl === "string" ? options.baseUrl.trim() : "";
  const rawBaseUrl = baseUrlOverride || settings.comfy?.baseUrl || config.comfyuiBaseUrl;
  if (!rawBaseUrl) {
    return {
      statusCode: 400,
      data: { ok: false, error: "baseUrl is required" }
    };
  }
  const baseUrl = normalizeBaseUrl(rawBaseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${baseUrl}/system_stats`, {
      signal: controller.signal
    });
    if (!response.ok) {
      return {
        statusCode: 503,
        data: { ok: false, baseUrl, error: `HTTP ${response.status}` }
      };
    }
    return {
      statusCode: 200,
      data: { ok: true, baseUrl }
    };
  } catch (err) {
    return {
      statusCode: 503,
      data: { ok: false, baseUrl, error: serializeError(err) }
    };
  } finally {
    clearTimeout(timer);
  }
}

async function handleAgentControlRequest(
  request: AgentControlRequest
): Promise<{ provider: "ollama" | "xtts" | "comfyui"; statusCode: number; data: Record<string, unknown> }> {
  const correlationId =
    (typeof request.payload.correlationId === "string" && request.payload.correlationId.trim()) ||
    request.messageId;
  if (request.type !== "integration_health_request") {
    throw new Error("unsupported_request_type");
  }
  logWorkerAction("agent_integration_health_request", {
    correlationId,
    workspaceId: agentWorkspaceId || null,
    agentId: agentId || null,
    route: request.payload.provider,
    provider: request.payload.provider
  });
  if (request.payload.provider === "ollama") {
    const result = await resolveOllamaHealth();
    logWorkerAction("agent_integration_health_response", {
      correlationId,
      workspaceId: agentWorkspaceId || null,
      agentId: agentId || null,
      route: request.payload.provider,
      provider: "ollama",
      statusCode: result.statusCode,
      result: result.data
    });
    return { provider: "ollama", ...result };
  }
  if (request.payload.provider === "xtts") {
    const result = await resolveXttsHealth();
    logWorkerAction("agent_integration_health_response", {
      correlationId,
      workspaceId: agentWorkspaceId || null,
      agentId: agentId || null,
      route: request.payload.provider,
      provider: "xtts",
      statusCode: result.statusCode,
      result: result.data
    });
    return { provider: "xtts", ...result };
  }
  const result = await resolveComfyuiHealth(request.payload.options);
  logWorkerAction("agent_integration_health_response", {
    correlationId,
    workspaceId: agentWorkspaceId || null,
    agentId: agentId || null,
    route: request.payload.provider,
    provider: "comfyui",
    statusCode: result.statusCode,
    result: result.data
  });
  return { provider: "comfyui", ...result };
}

async function handleWorkerCommandRequest(
  request: Extract<AgentControlRequest, { type: "worker_command_request" }>
): Promise<{
  command:
    | "comfy_workflows_list"
    | "comfy_workflow_import"
    | "tts_voices_list"
    | "worker_queue_wake"
    | "system_hard_cleanup"
    | "system_free_space_plan"
    | "system_free_space_execute"
    | "inventory_snapshot_collect"
    | "block_image_raw_get"
    | "block_audio_raw_get"
    | "block_slide_get"
    | "lesson_version_final_video_get"
    | "lesson_version_final_video_post"
    | "lesson_version_slides_post"
    | "lesson_version_assets_post"
    | "lesson_version_assets_image_post"
    | "lesson_version_images_post"
    | "lesson_version_audios_list"
    | "lesson_version_images_list"
    | "lesson_version_slides_list"
    | "lesson_version_job_state";
  statusCode: number;
  data: Record<string, unknown>;
}> {
  if (request.payload.command === "comfy_workflows_list") {
    const current = readAppSettings();
    const workflows = listComfyWorkflowFiles();
    return {
      command: "comfy_workflows_list",
      statusCode: 200,
      data: {
        workflowFile: resolveConfiguredWorkflowFile(current),
        availableWorkflows: workflows
      }
    };
  }

  if (request.payload.command === "comfy_workflow_import") {
    const params = request.payload.params ?? {};
    const requestedName = typeof params.fileName === "string" ? params.fileName : "";
    const overwrite = params.overwrite === true;
    const workflow = (params as { workflow?: unknown }).workflow;
    if (workflow === undefined) {
      return {
        command: "comfy_workflow_import",
        statusCode: 400,
        data: { error: "workflow is required" }
      };
    }
    const fileName = sanitizeWorkflowFileName(requestedName);
    if (!isSafeWorkflowFileName(fileName)) {
      return {
        command: "comfy_workflow_import",
        statusCode: 400,
        data: { error: "Invalid workflow file name" }
      };
    }
    const validation = validateComfyWorkflowMinimum(workflow);
    if (!validation.ok) {
      return {
        command: "comfy_workflow_import",
        statusCode: 400,
        data: { error: validation.error }
      };
    }
    const targetPath = resolveWorkflowFilePath(fileName);
    if (fs.existsSync(targetPath) && !overwrite) {
      return {
        command: "comfy_workflow_import",
        statusCode: 409,
        data: { error: `Workflow already exists: ${fileName}` }
      };
    }
    fs.writeFileSync(targetPath, JSON.stringify(workflow, null, 2), "utf8");
    const current = readAppSettings();
    writeAppSettings({
      ...current,
      comfy: {
        ...(current.comfy ?? {}),
        workflowFile: fileName
      }
    });
    return {
      command: "comfy_workflow_import",
      statusCode: overwrite ? 200 : 201,
      data: {
        workflowFile: fileName,
        availableWorkflows: listComfyWorkflowFiles()
      }
    };
  }

  if (request.payload.command === "system_hard_cleanup") {
    const reason =
      typeof request.payload.params?.reason === "string"
        ? request.payload.params.reason
        : "manual";
    await releaseAllGenerationModels({ reason: `remote_hard_cleanup:${reason}` });
    return {
      command: "system_hard_cleanup",
      statusCode: 200,
      data: { ok: true, skipped: false }
    };
  }

  if (request.payload.command === "system_free_space_plan") {
    const maxItems =
      typeof request.payload.params?.maxItems === "number" &&
      Number.isFinite(request.payload.params.maxItems)
        ? request.payload.params.maxItems
        : undefined;
    const reason =
      typeof request.payload.params?.reason === "string"
        ? request.payload.params.reason
        : "manual";
    const plan = await buildWorkerFreeSpacePlan(maxItems);
    logWorkerAction("worker_free_space_plan", {
      reason,
      workspaceId: agentWorkspaceId || null,
      scanned_files: plan.scannedFiles,
      candidate_count: plan.candidateCount,
      candidate_bytes: plan.candidateBytes
    });
    return {
      command: "system_free_space_plan",
      statusCode: 200,
      data: plan
    };
  }

  if (request.payload.command === "system_free_space_execute") {
    const maxItems =
      typeof request.payload.params?.maxItems === "number" &&
      Number.isFinite(request.payload.params.maxItems)
        ? request.payload.params.maxItems
        : undefined;
    const reason =
      typeof request.payload.params?.reason === "string"
        ? request.payload.params.reason
        : "manual";
    const result = await executeWorkerFreeSpace(maxItems);
    await runInventoryScan(`free_space_execute:${reason}`, true);
    logWorkerAction("worker_free_space_execute", {
      reason,
      workspaceId: agentWorkspaceId || null,
      planned: result.planned,
      deleted: result.deleted,
      failed: result.failed,
      reclaimed_bytes: result.reclaimedBytes
    });
    return {
      command: "system_free_space_execute",
      statusCode: 200,
      data: result
    };
  }

  if (request.payload.command === "worker_queue_wake") {
    const reason =
      typeof request.payload.params?.reason === "string"
        ? request.payload.params.reason
        : "remote_request";
    requestWorkerWake(`agent_control:${reason}`);
    return {
      command: "worker_queue_wake",
      statusCode: 202,
      data: { ok: true }
    };
  }

  if (request.payload.command === "inventory_snapshot_collect") {
    const reason =
      typeof request.payload.params?.reason === "string"
        ? request.payload.params.reason
        : "remote_request";
    await runInventoryScan(reason, true);
    return {
      command: "inventory_snapshot_collect",
      statusCode: 200,
      data: { ok: true }
    };
  }

  if (request.payload.command === "block_image_raw_get") {
    const blockId =
      typeof request.payload.params?.blockId === "string"
        ? request.payload.params.blockId.trim()
        : "";
    if (!blockId) {
      return {
        command: "block_image_raw_get",
        statusCode: 400,
        data: { error: "blockId is required" }
      };
    }
    const block = await resolveBlockContext(blockId);
    if (!block || !block.lessonVersion?.lesson?.module?.course) {
      return {
        command: "block_image_raw_get",
        statusCode: 404,
        data: { error: "block not found" }
      };
    }
    const asset = await prisma.asset.findFirst({
      where: { blockId, kind: "image_raw" },
      orderBy: { createdAt: "desc" }
    });
    const imagePath = asset?.path ?? null;
    if (!imagePath || !fs.existsSync(imagePath)) {
      return {
        command: "block_image_raw_get",
        statusCode: 404,
        data: { error: "image not found" }
      };
    }
    const body = await fs.promises.readFile(imagePath);
    return {
      command: "block_image_raw_get",
      statusCode: 200,
      data: {
        contentType: mimeTypeForImage(path.extname(imagePath).toLowerCase()),
        bodyBase64: body.toString("base64"),
        contentLength: body.length
      }
    };
  }

  if (request.payload.command === "block_audio_raw_get") {
    const blockId =
      typeof request.payload.params?.blockId === "string"
        ? request.payload.params.blockId.trim()
        : "";
    const range =
      typeof request.payload.params?.range === "string"
        ? request.payload.params.range.trim()
        : "";
    if (!blockId) {
      return {
        command: "block_audio_raw_get",
        statusCode: 400,
        data: { error: "blockId is required" }
      };
    }
    const block = await resolveBlockContext(blockId);
    if (!block || !block.lessonVersion?.lesson?.module?.course) {
      return {
        command: "block_audio_raw_get",
        statusCode: 404,
        data: { error: "block not found" }
      };
    }
    const asset = await prisma.asset.findFirst({
      where: { blockId, kind: "audio_raw" },
      orderBy: { createdAt: "desc" }
    });
    const audioPath = asset?.path ?? null;
    if (!audioPath || !fs.existsSync(audioPath)) {
      return {
        command: "block_audio_raw_get",
        statusCode: 404,
        data: { error: "audio not found" }
      };
    }
    const stat = await fs.promises.stat(audioPath);
    const total = stat.size;
    const contentType = mimeTypeForAudio(path.extname(audioPath).toLowerCase());

    if (!range) {
      const body = await fs.promises.readFile(audioPath);
      return {
        command: "block_audio_raw_get",
        statusCode: 200,
        data: {
          contentType,
          bodyBase64: body.toString("base64"),
          contentLength: body.length
        }
      };
    }

    const match = /^bytes=(\d*)-(\d*)$/i.exec(range);
    if (!match) {
      return {
        command: "block_audio_raw_get",
        statusCode: 416,
        data: { contentRange: `bytes */${total}` }
      };
    }

    const rawStart = match[1];
    const rawEnd = match[2];
    let start = rawStart ? Number(rawStart) : Number.NaN;
    let end = rawEnd ? Number(rawEnd) : Number.NaN;

    if (Number.isNaN(start)) {
      const suffixLength = Number(rawEnd);
      if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
        return {
          command: "block_audio_raw_get",
          statusCode: 416,
          data: { contentRange: `bytes */${total}` }
        };
      }
      start = Math.max(0, total - suffixLength);
      end = total - 1;
    } else if (Number.isNaN(end)) {
      end = total - 1;
    }

    start = Math.max(0, start);
    end = Math.min(total - 1, end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) {
      return {
        command: "block_audio_raw_get",
        statusCode: 416,
        data: { contentRange: `bytes */${total}` }
      };
    }
    const body = await fs.promises.readFile(audioPath);
    const slice = body.subarray(start, end + 1);
    return {
      command: "block_audio_raw_get",
      statusCode: 206,
      data: {
        contentType,
        bodyBase64: slice.toString("base64"),
        contentLength: slice.length,
        contentRange: `bytes ${start}-${end}/${total}`
      }
    };
  }

  if (request.payload.command === "block_slide_get") {
    return {
      command: "block_slide_get",
      statusCode: 410,
      data: { error: "slides_disabled_in_mvp" }
    };
  }

  if (request.payload.command === "lesson_version_final_video_get") {
    const versionId =
      typeof request.payload.params?.versionId === "string"
        ? request.payload.params.versionId.trim()
        : "";
    if (!versionId) {
      return {
        command: "lesson_version_final_video_get",
        statusCode: 400,
        data: { error: "versionId is required" }
      };
    }
    const version = await prisma.lessonVersion.findUnique({
      where: { id: versionId }
    });
    if (!version) {
      return {
        command: "lesson_version_final_video_get",
        statusCode: 404,
        data: { error: "lesson version not found" }
      };
    }
    const asset = await prisma.asset.findFirst({
      where: {
        kind: "final_mp4",
        block: { lessonVersionId: versionId }
      },
      orderBy: { createdAt: "desc" }
    });
    const videoPath = asset?.path ?? null;
    if (!videoPath || !fs.existsSync(videoPath)) {
      return {
        command: "lesson_version_final_video_get",
        statusCode: 404,
        data: { error: "final video not found" }
      };
    }
    const body = await fs.promises.readFile(videoPath);
    return {
      command: "lesson_version_final_video_get",
      statusCode: 200,
      data: {
        contentType: "video/mp4",
        bodyBase64: body.toString("base64"),
        contentLength: body.length
      }
    };
  }

  const enqueueFinalVideoJob = async (params: {
    versionId: string;
    templateId: string | null;
    clientId: string | null;
    requestId: string | null;
  }): Promise<{
    command: "lesson_version_final_video_post";
    statusCode: 200 | 201 | 400 | 404;
    data: Record<string, unknown>;
  }> => {
    const { versionId, clientId, requestId } = params;
    const version = await prisma.lessonVersion.findUnique({
      where: { id: versionId },
      include: {
        blocks: { select: { id: true } }
      }
    });
    if (!version) {
      return {
        command: "lesson_version_final_video_post",
        statusCode: 404,
        data: { error: "lesson version not found" }
      };
    }
    if (version.blocks.length === 0) {
      return {
        command: "lesson_version_final_video_post",
        statusCode: 400,
        data: { error: "no blocks available to render final video" }
      };
    }
    if (requestId) {
      const existingByRequest = await prisma.job.findFirst({
        where: { requestId },
        orderBy: { createdAt: "desc" }
      });
      if (existingByRequest) {
        if (existingByRequest.status === "pending") {
          requestWorkerWake("enqueue_final_video:existing_by_request");
        }
        return {
          command: "lesson_version_final_video_post",
          statusCode: 200,
          data: existingByRequest as unknown as Record<string, unknown>
        };
      }
    }
    const existing = await prisma.job.findFirst({
      where: {
        workspaceId: version.workspaceId,
        lessonVersionId: versionId,
        type: "concat_video",
        status: { in: ["pending", "running"] }
      },
      orderBy: { createdAt: "desc" }
    });
    if (existing && !(clientId && existing.clientId && existing.clientId !== clientId)) {
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
          requestWorkerWake("enqueue_final_video:reset_stale");
          return {
            command: "lesson_version_final_video_post",
            statusCode: 200,
            data: resetJob as unknown as Record<string, unknown>
          };
        }
      }
      if (existing.status === "pending") {
        requestWorkerWake("enqueue_final_video:existing_pending");
      }
      return {
        command: "lesson_version_final_video_post",
        statusCode: 200,
        data: existing as unknown as Record<string, unknown>
      };
    }

    const job = await prisma.job.create({
      data: {
        workspaceId: version.workspaceId,
        scope: "lesson",
        lessonVersionId: versionId,
        type: "concat_video",
        status: "pending",
        clientId,
        requestId,
        // Final video MVP in this sandbox is image-only (no slide/template dependency).
        templateId: null
      }
    });
    requestWorkerWake("enqueue_final_video:created");
    return {
      command: "lesson_version_final_video_post",
      statusCode: 201,
      data: job as unknown as Record<string, unknown>
    };
  };

  const enqueueRenderSlideJob = async (params: {
    versionId: string;
    templateId: string;
    clientId: string | null;
    requestId: string | null;
  }): Promise<{
    command: "lesson_version_slides_post" | "lesson_version_assets_post" | "lesson_version_assets_image_post";
    statusCode: 200 | 201 | 404;
    data: Record<string, unknown>;
  }> => {
    const wakeWorkerForPendingSlides = (reason: string): void => {
      requestWorkerWake(`enqueue_render_slide:${reason}`);
    };
    const { versionId, templateId, clientId, requestId } = params;
    const versionScope = await prisma.lessonVersion.findUnique({
      where: { id: versionId },
      select: { workspaceId: true }
    });
    if (!versionScope) {
      return {
        command:
          request.payload.command === "lesson_version_assets_post"
            ? "lesson_version_assets_post"
            : request.payload.command === "lesson_version_assets_image_post"
              ? "lesson_version_assets_image_post"
              : "lesson_version_slides_post",
        statusCode: 404,
        data: { error: "lesson version not found" }
      };
    }
    if (requestId) {
      const existingByRequest = await prisma.job.findFirst({
        where: { requestId },
        orderBy: { createdAt: "desc" }
      });
      if (existingByRequest) {
        if (existingByRequest.status === "pending") {
          wakeWorkerForPendingSlides("existing_by_request");
        }
        return {
          command:
            request.payload.command === "lesson_version_assets_post"
              ? "lesson_version_assets_post"
              : request.payload.command === "lesson_version_assets_image_post"
                ? "lesson_version_assets_image_post"
                : "lesson_version_slides_post",
          statusCode: 200,
          data: existingByRequest as unknown as Record<string, unknown>
        };
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
      if (!(clientId && existing.clientId && existing.clientId !== clientId)) {
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
            wakeWorkerForPendingSlides("reset_stale");
            return {
              command:
                request.payload.command === "lesson_version_assets_post"
                  ? "lesson_version_assets_post"
                  : request.payload.command === "lesson_version_assets_image_post"
                    ? "lesson_version_assets_image_post"
                    : "lesson_version_slides_post",
              statusCode: 200,
              data: resetJob as unknown as Record<string, unknown>
            };
          }
        }
        if (existing.status === "pending") {
          wakeWorkerForPendingSlides("existing_pending");
        }
        return {
          command:
            request.payload.command === "lesson_version_assets_post"
              ? "lesson_version_assets_post"
              : request.payload.command === "lesson_version_assets_image_post"
                ? "lesson_version_assets_image_post"
                : "lesson_version_slides_post",
          statusCode: 200,
          data: existing as unknown as Record<string, unknown>
        };
      }
    }

    const job = await prisma.job.create({
      data: {
        workspaceId: versionScope.workspaceId,
        scope: "lesson",
        lessonVersionId: versionId,
        type: "render_slide",
        status: "pending",
        templateId,
        clientId,
        requestId
      }
    });
    wakeWorkerForPendingSlides("created");
    return {
      command:
        request.payload.command === "lesson_version_assets_post"
          ? "lesson_version_assets_post"
          : request.payload.command === "lesson_version_assets_image_post"
            ? "lesson_version_assets_image_post"
            : "lesson_version_slides_post",
      statusCode: 201,
      data: job as unknown as Record<string, unknown>
    };
  };

  if (request.payload.command === "lesson_version_slides_post") {
    return {
      command: "lesson_version_slides_post",
      statusCode: 410,
      data: { error: "slides_disabled_in_mvp" }
    };
  }

  if (request.payload.command === "lesson_version_final_video_post") {
    const versionId =
      typeof request.payload.params?.versionId === "string"
        ? request.payload.params.versionId.trim()
        : "";
    const _templateIdIgnoredInMvp =
      typeof request.payload.params?.templateId === "string"
        ? request.payload.params.templateId.trim()
        : null;
    const clientId =
      typeof request.payload.params?.clientId === "string"
        ? request.payload.params.clientId.trim()
        : null;
    const requestId =
      typeof request.payload.params?.requestId === "string"
        ? request.payload.params.requestId.trim()
        : null;
    if (!versionId) {
      return {
        command: "lesson_version_final_video_post",
        statusCode: 400,
        data: { error: "lesson version not found" }
      };
    }
    return enqueueFinalVideoJob({ versionId, templateId: null, clientId, requestId });
  }

  const enqueueLessonImageJob = async (params: {
    versionId: string;
    templateId: string | null;
    clientId: string | null;
    requestId: string | null;
    releaseMemory?: boolean;
    freeMemory?: boolean;
  }): Promise<{
    command: "lesson_version_images_post";
    statusCode: 200 | 201 | 404;
    data: Record<string, unknown>;
  }> => {
    const { versionId, templateId, clientId, requestId, releaseMemory, freeMemory } = params;
    const versionScope = await prisma.lessonVersion.findUnique({
      where: { id: versionId },
      select: { workspaceId: true }
    });
    if (!versionScope) {
      return {
        command: "lesson_version_images_post",
        statusCode: 404,
        data: { error: "lesson version not found" }
      };
    }
    if (requestId) {
      const existingByRequest = await prisma.job.findFirst({
        where: { requestId },
        orderBy: { createdAt: "desc" }
      });
      if (existingByRequest) {
        if (existingByRequest.status === "pending") {
          requestWorkerWake("enqueue_image:existing_by_request");
        }
        return {
          command: "lesson_version_images_post",
          statusCode: 200,
          data: existingByRequest as unknown as Record<string, unknown>
        };
      }
    }
    const existing = await prisma.job.findFirst({
      where: {
        workspaceId: versionScope.workspaceId,
        lessonVersionId: versionId,
        blockId: null,
        type: "image",
        templateId: templateId ?? null,
        status: { in: ["pending", "running"] }
      },
      orderBy: { createdAt: "desc" }
    });
    if (existing && !(clientId && existing.clientId && existing.clientId !== clientId)) {
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
          requestWorkerWake("enqueue_image:reset_stale");
          return {
            command: "lesson_version_images_post",
            statusCode: 200,
            data: resetJob as unknown as Record<string, unknown>
          };
        }
      }
      if (existing.status === "pending") {
        requestWorkerWake("enqueue_image:existing_pending");
      }
      return {
        command: "lesson_version_images_post",
        statusCode: 200,
        data: existing as unknown as Record<string, unknown>
      };
    }
    const job = await prisma.job.create({
      data: {
        workspaceId: versionScope.workspaceId,
        scope: "lesson",
        lessonVersionId: versionId,
        type: "image",
        status: "pending",
        clientId,
        requestId,
        templateId: templateId ?? null,
        metaJson:
          releaseMemory === undefined && freeMemory === undefined
            ? null
            : JSON.stringify({
                image: {
                  releaseMemory,
                  freeMemory
                }
              })
      }
    });
    requestWorkerWake("enqueue_image:created");
    return {
      command: "lesson_version_images_post",
      statusCode: 201,
      data: job as unknown as Record<string, unknown>
    };
  };

  if (request.payload.command === "lesson_version_assets_post") {
    const versionId =
      typeof request.payload.params?.versionId === "string"
        ? request.payload.params.versionId.trim()
        : "";
    const clientId =
      typeof request.payload.params?.clientId === "string"
        ? request.payload.params.clientId.trim()
        : null;
    const requestId =
      typeof request.payload.params?.requestId === "string"
        ? request.payload.params.requestId.trim()
        : null;
    if (!versionId) {
      return {
        command: "lesson_version_assets_post",
        statusCode: 400,
        data: { error: "lesson version not found" }
      };
    }
    const version = await prisma.lessonVersion.findUnique({ where: { id: versionId } });
    if (!version) {
      return {
        command: "lesson_version_assets_post",
        statusCode: 404,
        data: { error: "lesson version not found" }
      };
    }
    const template = await resolveDefaultSlideTemplate("text");
    if (!template) {
      return {
        command: "lesson_version_assets_post",
        statusCode: 404,
        data: { error: "default text template not found" }
      };
    }
    return enqueueRenderSlideJob({
      versionId,
      templateId: template.id,
      clientId,
      requestId
    });
  }

  if (request.payload.command === "lesson_version_assets_image_post") {
    const versionId =
      typeof request.payload.params?.versionId === "string"
        ? request.payload.params.versionId.trim()
        : "";
    const clientId =
      typeof request.payload.params?.clientId === "string"
        ? request.payload.params.clientId.trim()
        : null;
    const requestId =
      typeof request.payload.params?.requestId === "string"
        ? request.payload.params.requestId.trim()
        : null;
    if (!versionId) {
      return {
        command: "lesson_version_assets_image_post",
        statusCode: 400,
        data: { error: "lesson version not found" }
      };
    }
    const version = await prisma.lessonVersion.findUnique({ where: { id: versionId } });
    if (!version) {
      return {
        command: "lesson_version_assets_image_post",
        statusCode: 404,
        data: { error: "lesson version not found" }
      };
    }
    const template = await resolveDefaultSlideTemplate("image");
    if (!template) {
      return {
        command: "lesson_version_assets_image_post",
        statusCode: 404,
        data: { error: "default image template not found" }
      };
    }
    return enqueueRenderSlideJob({
      versionId,
      templateId: template.id,
      clientId,
      requestId
    });
  }

  if (request.payload.command === "lesson_version_images_post") {
    const versionId =
      typeof request.payload.params?.versionId === "string"
        ? request.payload.params.versionId.trim()
        : "";
    const templateId =
      typeof request.payload.params?.templateId === "string"
        ? request.payload.params.templateId.trim()
        : null;
    const clientId =
      typeof request.payload.params?.clientId === "string"
        ? request.payload.params.clientId.trim()
        : null;
    const requestId =
      typeof request.payload.params?.requestId === "string"
        ? request.payload.params.requestId.trim()
        : null;
    const releaseMemory =
      typeof request.payload.params?.releaseMemory === "boolean"
        ? request.payload.params.releaseMemory
        : undefined;
    const freeMemory =
      typeof request.payload.params?.freeMemory === "boolean"
        ? request.payload.params.freeMemory
        : undefined;
    if (!versionId) {
      return {
        command: "lesson_version_images_post",
        statusCode: 404,
        data: { error: "lesson version not found" }
      };
    }
    if (templateId) {
      const template = await prisma.slideTemplate.findUnique({ where: { id: templateId } });
      if (!template || !template.isActive) {
        return {
          command: "lesson_version_images_post",
          statusCode: 404,
          data: { error: "template not found" }
        };
      }
    }
    return enqueueLessonImageJob({
      versionId,
      templateId,
      clientId,
      requestId,
      releaseMemory,
      freeMemory
    });
  }

  if (request.payload.command === "lesson_version_audios_list") {
    const versionId =
      typeof request.payload.params?.versionId === "string"
        ? request.payload.params.versionId.trim()
        : "";
    if (!versionId) {
      return {
        command: "lesson_version_audios_list",
        statusCode: 400,
        data: { error: "versionId is required" }
      };
    }
    const version = await prisma.lessonVersion.findUnique({
      where: { id: versionId }
    });
    if (!version) {
      return {
        command: "lesson_version_audios_list",
        statusCode: 404,
        data: { error: "lesson version not found" }
      };
    }
    const blocks = await prisma.block.findMany({
      where: { lessonVersionId: versionId },
      select: { id: true, index: true },
      orderBy: { index: "asc" }
    });
    const audioAssets = await prisma.asset.findMany({
      where: { kind: "audio_raw", block: { lessonVersionId: versionId } },
      orderBy: { createdAt: "desc" },
      distinct: ["blockId"],
      select: { blockId: true, path: true }
    });
    const audioUrls = new Map<string, string>();
    for (const asset of audioAssets) {
      if (!asset.path || !fs.existsSync(asset.path)) continue;
      audioUrls.set(asset.blockId, `/blocks/${asset.blockId}/audio/raw`);
    }
    return {
      command: "lesson_version_audios_list",
      statusCode: 200,
      data: {
        blocks: blocks.map((block) => {
          const url = audioUrls.get(block.id) ?? null;
          return {
            blockId: block.id,
            index: block.index,
            exists: Boolean(url),
            url
          };
        })
      }
    };
  }

  if (request.payload.command === "lesson_version_images_list") {
    const versionId =
      typeof request.payload.params?.versionId === "string"
        ? request.payload.params.versionId.trim()
        : "";
    if (!versionId) {
      return {
        command: "lesson_version_images_list",
        statusCode: 400,
        data: { error: "versionId is required" }
      };
    }
    const version = await prisma.lessonVersion.findUnique({
      where: { id: versionId }
    });
    if (!version) {
      return {
        command: "lesson_version_images_list",
        statusCode: 404,
        data: { error: "lesson version not found" }
      };
    }
    const blocks = await prisma.block.findMany({
      where: { lessonVersionId: versionId },
      select: { id: true, index: true },
      orderBy: { index: "asc" }
    });
    const imageAssets = await prisma.asset.findMany({
      where: { kind: "image_raw", block: { lessonVersionId: versionId } },
      orderBy: { createdAt: "desc" },
      distinct: ["blockId"],
      select: { blockId: true, path: true }
    });
    const imageUrls = new Map<string, string>();
    for (const asset of imageAssets) {
      if (!asset.path || !fs.existsSync(asset.path)) continue;
      imageUrls.set(asset.blockId, `/blocks/${asset.blockId}/image/raw`);
    }
    return {
      command: "lesson_version_images_list",
      statusCode: 200,
      data: {
        blocks: blocks.map((block) => {
          const url = imageUrls.get(block.id) ?? null;
          return {
            blockId: block.id,
            index: block.index,
            exists: Boolean(url),
            url
          };
        })
      }
    };
  }

  if (request.payload.command === "lesson_version_slides_list") {
    return {
      command: "lesson_version_slides_list",
      statusCode: 410,
      data: { error: "slides_disabled_in_mvp" }
    };
  }

  if (request.payload.command === "lesson_version_job_state") {
    const versionId =
      typeof request.payload.params?.versionId === "string"
        ? request.payload.params.versionId.trim()
        : "";
    if (!versionId) {
      return {
        command: "lesson_version_job_state",
        statusCode: 400,
        data: { error: "versionId is required" }
      };
    }
    const version = await prisma.lessonVersion.findUnique({
      where: { id: versionId }
    });
    if (!version) {
      return {
        command: "lesson_version_job_state",
        statusCode: 404,
        data: { error: "lesson version not found" }
      };
    }

    const totalBlocks = await prisma.block.count({
      where: { lessonVersionId: versionId }
    });
    const activeJobs = await prisma.job.findMany({
      where: {
        lessonVersionId: versionId,
        status: { in: ["pending", "running"] }
      },
      orderBy: { createdAt: "desc" }
    });
    const finalVideoAssets = await prisma.asset.findMany({
      where: {
        kind: "final_mp4",
        block: { lessonVersionId: versionId }
      },
      orderBy: { createdAt: "desc" },
      select: { path: true }
    });
    const hasInvalidatingGeneration = activeJobs.some(
      (job) =>
        job.type === "segment" ||
        job.type === "segment_block" ||
        job.type === "tts" ||
        job.type === "image" ||
        job.type === "comfyui_image" ||
        job.type === "render_slide"
    );
    const finalVideoReady =
      finalVideoAssets.some((asset) => asset.path && fs.existsSync(asset.path)) &&
      !hasInvalidatingGeneration;

    const toPhase = (status: string): "idle" | "waiting" | "running" =>
      status === "running" ? "running" : status === "pending" ? "waiting" : "idle";

    const idleState = (total = totalBlocks) => ({
      active: false,
      jobId: null,
      status: "idle" as const,
      phase: "idle" as const,
      current: 0,
      total
    });

    const pickLatestLessonJob = (type: string) =>
      activeJobs.find((job) => job.type === type && !job.blockId) ?? null;

    const ttsBatchJob = pickLatestLessonJob("tts");
    const imageBatchJob = pickLatestLessonJob("image");
    const segmentJob = pickLatestLessonJob("segment");
    const slidesJob = pickLatestLessonJob("render_slide");
    const finalVideoJob = pickLatestLessonJob("concat_video");

    const readSegmentAutoQueue = (
      raw: string | null | undefined
    ): { audio: boolean; image: boolean } => {
      if (!raw) return { audio: false, image: false };
      try {
        const parsed = JSON.parse(raw) as { autoQueue?: { audio?: boolean; image?: boolean } };
        return {
          audio: Boolean(parsed?.autoQueue?.audio),
          image: Boolean(parsed?.autoQueue?.image)
        };
      } catch {
        return { audio: false, image: false };
      }
    };

    const autoQueuePlan = readSegmentAutoQueue(segmentJob?.metaJson);

    const [tts, image, segment, slides, finalVideo] = await Promise.all([
      (async () => {
        if (!ttsBatchJob) {
          if (
            segmentJob &&
            segmentJob.status !== "succeeded" &&
            segmentJob.status !== "failed" &&
            segmentJob.status !== "canceled" &&
            autoQueuePlan.audio
          ) {
            const generatedCount = await prisma.asset.count({
              where: {
                kind: "audio_raw",
                block: { lessonVersionId: versionId },
                createdAt: { gte: segmentJob.createdAt }
              }
            });
            let expectedTotal = totalBlocks;
            try {
              expectedTotal = buildDeterministicBlocks(version.scriptText, version.speechRateWps).length;
            } catch {
              expectedTotal = totalBlocks;
            }
            return {
              active: true,
              jobId: null,
              status: "pending",
              phase: "waiting" as const,
              current: generatedCount,
              total: expectedTotal
            };
          }
          return idleState();
        }
        const generatedCount = await prisma.asset.count({
          where: {
            kind: "audio_raw",
            block: { lessonVersionId: versionId },
            createdAt: { gte: ttsBatchJob.createdAt }
          }
        });
        return {
          active: true,
          jobId: ttsBatchJob.id,
          status: ttsBatchJob.status,
          phase: toPhase(ttsBatchJob.status),
          current: generatedCount,
          total: totalBlocks
        };
      })(),
      (async () => {
        if (!imageBatchJob) {
          if (
            segmentJob &&
            segmentJob.status !== "succeeded" &&
            segmentJob.status !== "failed" &&
            segmentJob.status !== "canceled" &&
            autoQueuePlan.image
          ) {
            const generatedCount = await prisma.asset.count({
              where: {
                kind: "image_raw",
                block: { lessonVersionId: versionId },
                createdAt: { gte: segmentJob.createdAt }
              }
            });
            let expectedTotal = totalBlocks;
            try {
              expectedTotal = buildDeterministicBlocks(version.scriptText, version.speechRateWps).length;
            } catch {
              expectedTotal = totalBlocks;
            }
            return {
              active: true,
              jobId: null,
              status: "pending",
              phase: "waiting" as const,
              current: generatedCount,
              total: expectedTotal
            };
          }
          return idleState();
        }
        const generatedCount = await prisma.asset.count({
          where: {
            kind: "image_raw",
            block: { lessonVersionId: versionId },
            createdAt: { gte: imageBatchJob.createdAt }
          }
        });
        return {
          active: true,
          jobId: imageBatchJob.id,
          status: imageBatchJob.status,
          phase: toPhase(imageBatchJob.status),
          current: generatedCount,
          total: totalBlocks
        };
      })(),
      (async () => {
        if (!segmentJob) return idleState();
        let expectedTotal = totalBlocks;
        try {
          expectedTotal = buildDeterministicBlocks(version.scriptText, version.speechRateWps).length;
        } catch {
          expectedTotal = totalBlocks;
        }
        const generatedCount = await prisma.block.count({
          where: {
            lessonVersionId: versionId,
            createdAt: { gte: segmentJob.createdAt }
          }
        });
        return {
          active: true,
          jobId: segmentJob.id,
          status: segmentJob.status,
          phase: toPhase(segmentJob.status),
          current: generatedCount,
          total: expectedTotal
        };
      })(),
      (async () => {
        if (!slidesJob) return idleState();
        const whereBase = {
          kind: "slide_png",
          block: { lessonVersionId: versionId },
          createdAt: { gte: slidesJob.createdAt }
        } as const;
        const generatedCount = await prisma.asset.count({
          where: slidesJob.templateId ? { ...whereBase, templateId: slidesJob.templateId } : whereBase
        });
        return {
          active: true,
          jobId: slidesJob.id,
          status: slidesJob.status,
          phase: toPhase(slidesJob.status),
          current: generatedCount,
          total: totalBlocks
        };
      })(),
      (async () => {
        if (!finalVideoJob) return idleState();
        const generatedCount = await prisma.asset.count({
          where: {
            kind: "clip_mp4",
            block: { lessonVersionId: versionId },
            createdAt: { gte: finalVideoJob.createdAt }
          }
        });
        return {
          active: true,
          jobId: finalVideoJob.id,
          status: finalVideoJob.status,
          phase: toPhase(finalVideoJob.status),
          current: generatedCount,
          total: totalBlocks
        };
      })()
    ]);

    const blockJobs = {
      segment: activeJobs
        .filter((job) => job.type === "segment_block" && Boolean(job.blockId))
        .map((job) => ({
          jobId: job.id,
          blockId: job.blockId as string,
          status: job.status,
          phase: toPhase(job.status)
        })),
      tts: activeJobs
        .filter((job) => job.type === "tts" && Boolean(job.blockId))
        .map((job) => ({
          jobId: job.id,
          blockId: job.blockId as string,
          status: job.status,
          phase: toPhase(job.status)
        })),
      image: activeJobs
        .filter((job) => job.type === "image" && Boolean(job.blockId))
        .map((job) => ({
          jobId: job.id,
          blockId: job.blockId as string,
          status: job.status,
          phase: toPhase(job.status)
        }))
    };

    return {
      command: "lesson_version_job_state",
      statusCode: 200,
      data: {
        lessonVersionId: versionId,
        finalVideoReady,
        segment,
        tts,
        image,
        slides,
        finalVideo,
        blockJobs,
        queue: {
          segment: blockJobs.segment.length,
          tts: blockJobs.tts.length,
          image: blockJobs.image.length
        }
      }
    };
  }

  const provider = config.ttsProvider.toLowerCase();
  let voices: VoiceOption[] = [];
  if (provider === "xtts" || provider === "xtts_api") {
    const settings = readAppSettings();
    const baseUrl = settings.tts?.baseUrl ?? config.xttsApiBaseUrl;
    voices = await fetchXttsVoices(baseUrl);
  } else {
    const index = loadVoiceIndex(config.ttsVoicesIndex);
    voices = index.voices.map((voice) => ({
      id: voice.id,
      label: voice.label ?? voice.id,
      description: voice.description ?? null,
      preview_url: null
    }));
  }
  return {
    command: "tts_voices_list",
    statusCode: 200,
    data: {
      voices,
      items: voices,
      speakers: voices.map((voice) => voice.id)
    }
  };
}

async function startAgentControlChannel(): Promise<boolean> {
  const presence = buildAgentControlBootstrapPresence({
    apiBaseUrl,
    agentControlToken,
    workspaceId: agentWorkspaceId,
    agentId
  });
  if (!hasCompleteAgentControlIdentity(presence)) {
    const payload = buildMissingIdentitySkipPayload(presence);
    logWorkerAction("agent_control_connection_failed", payload);
    logWorkerAction("agent_control_skipped", payload);
    return false;
  }

  const wsUrl = deriveWsUrlFromHttpBase(apiBaseUrl);
  const connect = () => {
    const socket = new WebSocket(wsUrl, {
      headers: {
        Authorization: `Bearer ${agentControlToken}`
      }
    });
    let heartbeatTimer: NodeJS.Timeout | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;

    const cleanup = () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    socket.on("open", () => {
      agentControlSocketConnected = true;
      logWorkerAction("agent_control_connected", {
        ws_url: wsUrl,
        workspace_id: agentWorkspaceId,
        agent_id: agentId
      });
      socket.send(
        JSON.stringify({
          type: "agent_hello",
          messageId: randomUUID(),
          payload: {
            workspaceId: agentWorkspaceId,
            agentId,
            label: agentLabel,
            machineFingerprint: agentMachineFingerprint
          }
        })
      );
      heartbeatTimer = setInterval(() => {
        try {
          socket.send(
            JSON.stringify({
              type: "agent_heartbeat",
              messageId: randomUUID(),
              payload: {
                workspaceId: agentWorkspaceId,
                agentId
              }
            })
          );
        } catch {
          // ignore transient send issues
        }
      }, 15000);
      heartbeatTimer.unref?.();
    });

    socket.on("message", async (raw) => {
      let parsedMessage: Record<string, unknown> | null = null;
      try {
        parsedMessage = JSON.parse(
          typeof raw === "string" ? raw : raw.toString("utf8")
        ) as Record<string, unknown>;
      } catch {
        // ignore malformed control messages
      }
      if (!parsedMessage || typeof parsedMessage.type !== "string") return;

      if (parsedMessage.type === "agent_hello_ack") {
        const helloAck = parsedMessage as AgentHelloAckMessage;
        const integrationConfig = helloAck.payload?.integrationConfig;
        if (integrationConfig) {
          applyAgentIntegrationConfigSnapshot(integrationConfig);
        }
        markAgentControlReady();
        ensureInventoryPeriodicScanStarted();
        void runInventoryScan("agent_hello_ack", true);
        return;
      }

      if (typeof parsedMessage.messageId !== "string") {
        return;
      }

      if (
        parsedMessage.type !== "integration_health_request" &&
        parsedMessage.type !== "worker_command_request"
      ) {
        return;
      }

      const message = parsedMessage as AgentControlRequest;
      const startedAt = Date.now();
      const correlationId =
        (typeof message.payload?.correlationId === "string" && message.payload.correlationId.trim()) ||
        message.messageId;
      try {
        if (message.type === "integration_health_request") {
          const result = await handleAgentControlRequest(message);
          logWorkerAction("agent_control_request_completed", {
            correlationId,
            workspaceId: agentWorkspaceId || null,
            agentId: agentId || null,
            route: message.payload.provider,
            statusCode: result.statusCode,
            elapsedMs: Date.now() - startedAt
          });
          socket.send(
            createAgentControlResponseMessage({
              inReplyTo: message.messageId,
              provider: result.provider,
              statusCode: result.statusCode,
              data: result.data
            })
          );
        } else {
          const result = await handleWorkerCommandRequest(message);
          logWorkerAction("agent_control_request_completed", {
            correlationId,
            workspaceId: agentWorkspaceId || null,
            agentId: agentId || null,
            route: message.payload.command,
            command: message.payload.command,
            statusCode: result.statusCode,
            elapsedMs: Date.now() - startedAt
          });
          socket.send(
            createWorkerCommandResponseMessage({
              inReplyTo: message.messageId,
              command: result.command,
              statusCode: result.statusCode,
              data: result.data
            })
          );
        }
      } catch (err) {
        socket.send(
          createAgentErrorMessage({
            inReplyTo: message.messageId,
            code: "agent_execution_error",
            message: serializeError(err)
          })
        );
        logWorkerAction("agent_control_request_failed", {
          correlationId,
          workspaceId: agentWorkspaceId || null,
          agentId: agentId || null,
          route: message.type === "integration_health_request" ? message.payload.provider : message.payload.command,
          statusCode: 503,
          elapsedMs: Date.now() - startedAt,
          error: serializeError(err)
        });
      }
    });

    socket.on("close", () => {
      cleanup();
      agentControlSocketConnected = false;
      agentControlHelloAckReceived = false;
      logWorkerAction("agent_control_disconnected", { ws_url: wsUrl });
      reconnectTimer = setTimeout(connect, 5000);
      reconnectTimer.unref?.();
    });

    socket.on("error", (err) => {
      logWorkerAction("agent_control_error", {
        ws_url: wsUrl,
        error: serializeError(err)
      });
    });
  };

  connect();
  return true;
}

async function ensureJobCorrelationId(job: JobRecord): Promise<string> {
  const existing = job.requestId?.trim() || "";
  if (existing) return existing;
  const generated = `corr-${randomUUID()}`;
  const updated = await prisma.job.updateMany({
    where: { id: job.id, requestId: null },
    data: { requestId: generated }
  });
  if (updated.count > 0) {
    job.requestId = generated;
    return generated;
  }
  const persisted = await prisma.job.findUnique({
    where: { id: job.id },
    select: { requestId: true }
  });
  const resolved = persisted?.requestId?.trim() || generated;
  job.requestId = resolved;
  return resolved;
}

type JobEventLifecycle = "started" | "running" | "finished";
type JobEventPhase = "cleanup" | "generation";

type NotifyApiJobEventOptions = {
  lifecycle?: JobEventLifecycle;
  phase?: JobEventPhase;
  progressPercent?: number;
};

async function notifyApiJobEvent(
  jobId: string,
  correlationId: string,
  options: NotifyApiJobEventOptions = {}
): Promise<void> {
  if (!apiBaseUrl) return;
  const resolvedCorrelationId = correlationId.trim();
  if (!resolvedCorrelationId) {
    throw new Error(`notifyApiJobEvent called without correlationId for job ${jobId}`);
  }
  const progressPercent =
    typeof options.progressPercent === "number" && Number.isFinite(options.progressPercent)
      ? Math.max(1, Math.min(99, Math.trunc(options.progressPercent)))
      : undefined;
  try {
    const headers: Record<string, string> = {
      "X-Internal-Token": internalJobsEventToken,
      "X-Correlation-Id": resolvedCorrelationId
    };
    await requestJson(`${apiBaseUrl}/internal/jobs/event`, {
      method: "POST",
      body: {
        jobId,
        lifecycle: options.lifecycle,
        phase: options.phase,
        progressPercent
      },
      timeoutMs: 5000,
      headers
    });
  } catch (err) {
    logWorkerAction("api_job_event_failed", {
      correlationId: resolvedCorrelationId,
      job_id: jobId,
      error: serializeError(err),
      api_base_url: apiBaseUrl
    });
  }
}

type HttpBinaryOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  timeoutMs?: number;
};

async function requestBinary(url: string, options: HttpBinaryOptions = {}): Promise<Buffer> {
  const parsed = new URL(url);
  const client = parsed.protocol === "https:" ? https : http;
  const method = options.method ?? (options.body ? "POST" : "GET");
  const payload = options.body ? JSON.stringify(options.body) : "";
  const headers: Record<string, string> = {
    Accept: "*/*"
  };
  if (payload) {
    headers["Content-Type"] = "application/json";
    headers["Content-Length"] = Buffer.byteLength(payload).toString();
  }

  return new Promise((resolve, reject) => {
    const req = client.request(
      {
        method,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        headers
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const isOk = status >= 200 && status < 300;
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on("end", () => {
          const body = Buffer.concat(chunks);
          if (isOk) {
            resolve(body);
            return;
          }
          reject(new Error(`HTTP ${status} from ${url}: ${body.toString("utf8")}`));
        });
      }
    );

    if (options.timeoutMs && options.timeoutMs > 0) {
      req.setTimeout(options.timeoutMs, () => {
        req.destroy(new Error(`Request timeout after ${options.timeoutMs}ms`));
      });
    }

    req.on("error", (err) => {
      reject(err);
    });

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

async function requestComfyUnload(options: {
  job?: JobRecord;
  baseUrl: string;
  freeMemory?: boolean;
  reason: string;
}): Promise<void> {
  const { job, baseUrl, freeMemory, reason } = options;
  try {
    const unloadTimer = startActionTimer("comfy_unload", {
      base_url: baseUrl,
      free_memory: Boolean(freeMemory),
      reason
    });
    await requestJson(`${normalizeBaseUrl(baseUrl)}/api/free`, {
      method: "POST",
      body: {
        unload_models: true,
        free_memory: Boolean(freeMemory)
      },
      timeoutMs: 20000
    });
    unloadTimer();
    if (job) {
      logJobEvent("comfy_unload_requested", job, {
        base_url: baseUrl,
        free_memory: Boolean(freeMemory),
        reason
      });
    } else {
      logWorkerAction("comfy_unload_requested", {
        base_url: baseUrl,
        free_memory: Boolean(freeMemory),
        reason
      });
    }

    if (nvidiaSmiAvailability !== "unavailable") {
      const before = await logNvidiaSmiMetricsSnapshot();
      let lastTotal = before.reduce((sum, gpu) => sum + gpu.memory_used_mb, 0);
      logWorkerAction("gpu_unload_snapshot", {
        stage: "before",
        total_used_mb: lastTotal,
        gpus: before
      });
      for (let i = 1; i <= 12; i += 1) {
        await sleep(5000);
        const after = await logNvidiaSmiMetricsSnapshot();
        if (after.length === 0) break;
        const totalUsed = after.reduce((sum, gpu) => sum + gpu.memory_used_mb, 0);
        logWorkerAction("gpu_unload_snapshot", {
          stage: "after",
          sample: i,
          elapsed_s: i * 5,
          total_used_mb: totalUsed,
          gpus: after
        });
        if (totalUsed < lastTotal) {
          logWorkerAction("gpu_unload_snapshot_stop", {
            reason: "memory_decreased",
            previous_mb: lastTotal,
            current_mb: totalUsed,
            elapsed_s: i * 5
          });
          break;
        }
        lastTotal = totalUsed;
      }
    }
  } catch (err) {
    const message = serializeError(err);
    const lower = message.toLowerCase();
    const likelyMissingManager =
      lower.includes("404") ||
      lower.includes("not found") ||
      lower.includes("cannot post") ||
      lower.includes("failed to fetch");
    const managerHelpUrl = "https://docs.runcomfy.com/instance-proxy-endpoints";
    if (likelyMissingManager && !didWarnComfyManagerOnce) {
      didWarnComfyManagerOnce = true;
      if (job) {
        logJobEvent("comfy_unload_hint", job, {
          base_url: baseUrl,
          hint:
            "ComfyUI Manager is required for /api/free. Install ComfyUI-Manager and restart ComfyUI.",
          help_url: managerHelpUrl
        });
      } else {
        logWorkerAction("comfy_unload_hint", {
          base_url: baseUrl,
          hint:
            "ComfyUI Manager is required for /api/free. Install ComfyUI-Manager and restart ComfyUI.",
          help_url: managerHelpUrl
        });
      }
    }
    if (job) {
      logJobEvent("comfy_unload_failed", job, {
        base_url: baseUrl,
        free_memory: Boolean(freeMemory),
        reason,
        error: message,
        hint: likelyMissingManager
          ? "ComfyUI Manager is required for /api/free. Install ComfyUI-Manager and restart ComfyUI."
          : "Check ComfyUI base URL and Manager installation.",
        help_url: likelyMissingManager ? managerHelpUrl : undefined
      });
    } else {
      logWorkerAction("comfy_unload_failed", {
        base_url: baseUrl,
        free_memory: Boolean(freeMemory),
        reason,
        error: message,
        hint: likelyMissingManager
          ? "ComfyUI Manager is required for /api/free. Install ComfyUI-Manager and restart ComfyUI."
          : "Check ComfyUI base URL and Manager installation.",
        help_url: likelyMissingManager ? managerHelpUrl : undefined
      });
    }
  }
}

type ComfyPromptResponse = {
  prompt_id?: string;
  number?: number;
  node_errors?: Record<string, unknown>;
};

type ComfyHistoryEntry = {
  outputs?: Record<
    string,
    {
      images?: Array<{
        filename: string;
        subfolder?: string;
        type?: string;
      }>;
    }
  >;
  status?: { status?: string; message?: string };
};

type ComfyImageInfo = {
  filename: string;
  subfolder?: string;
  type?: string;
};

type AppSettings = {
  llm?: { provider?: string; baseUrl?: string; model?: string; timeoutMs?: number };
  comfy?: {
    baseUrl?: string;
    promptTimeoutMs?: number;
    generationTimeoutMs?: number;
    viewTimeoutMs?: number;
    masterPrompt?: string;
    workflowFile?: string;
  };
  memory?: {
    idleUnloadMs?: number;
  };
  tts?: {
    baseUrl?: string | null;
    language?: string | null;
    defaultVoiceId?: string | null;
  };
};

type JobMeta = {
  image?: {
    releaseMemory?: boolean;
    freeMemory?: boolean;
  };
  tts?: {
    releaseMemory?: boolean;
    voiceId?: string;
    language?: string;
  };
};

function parseJobMeta(raw: string | null | undefined): JobMeta | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as JobMeta;
  } catch {
    return null;
  }
}

function isLikelyTimeoutError(err: unknown): boolean {
  const message = serializeError(err).toLowerCase();
  return message.includes("timeout") || message.includes("timed out") || message.includes("abort");
}

function isLikelyOutOfMemoryError(err: unknown): boolean {
  const message = serializeError(err).toLowerCase();
  return (
    message.includes("out of memory") ||
    message.includes("cuda out of memory") ||
    message.includes("cublas_status_alloc_failed") ||
    message.includes("insufficient memory") ||
    message.includes("cannot allocate memory") ||
    message.includes("failed to allocate")
  );
}

async function requestOllamaUnload(options: {
  job?: JobRecord;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  reason: string;
}): Promise<void> {
  const { model, baseUrl, timeoutMs, reason } = options;
  try {
    await ollamaChat({
      baseUrl,
      model,
      messages: [{ role: "user", content: " " }],
      temperature: 0,
      timeoutMs,
      keepAlive: 0
    });
    if (options.job) {
      logJobEvent("llm_unload_requested", options.job, { model, base_url: baseUrl, reason });
    } else {
      logWorkerAction("llm_unload_requested", { model, base_url: baseUrl, reason });
    }
  } catch (err) {
    if (options.job) {
      logJobEvent("llm_unload_failed", options.job, {
        model,
        base_url: baseUrl,
        reason,
        error: serializeError(err)
      });
    } else {
      logWorkerAction("llm_unload_failed", {
        model,
        base_url: baseUrl,
        reason,
        error: serializeError(err)
      });
    }
  }
}

function asComfyImageInfo(value: unknown): ComfyImageInfo | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.filename !== "string") return null;
  const subfolder = typeof record.subfolder === "string" ? record.subfolder : undefined;
  const type = typeof record.type === "string" ? record.type : undefined;
  return { filename: record.filename, subfolder, type };
}

function readAppSettings(): AppSettings {
  try {
    if (fs.existsSync(config.appSettingsPath)) {
      const raw = fs.readFileSync(config.appSettingsPath, "utf8");
      const parsed = JSON.parse(raw) as AppSettings;
      return parsed ?? {};
    }
  } catch {
    return {};
  }
  try {
    if (!fs.existsSync(config.comfySettingsPath)) {
      return {};
    }
    const raw = fs.readFileSync(config.comfySettingsPath, "utf8");
    const parsed = JSON.parse(raw) as { baseUrl?: string; promptTimeoutMs?: number; generationTimeoutMs?: number; viewTimeoutMs?: number };
    return { comfy: parsed };
  } catch {
    return {};
  }
}

function mapLifecycleFromLogEvent(event: string): JobEventLifecycle | null {
  if (event === "job_started") return "started";
  if (event === "job_succeeded" || event === "job_failed" || event === "job_canceled") return "finished";
  return null;
}

async function notifyRunningPhase(job: JobRecord, phase: JobEventPhase): Promise<void> {
  const correlationId = await ensureJobCorrelationId(job);
  await notifyApiJobEvent(job.id, correlationId, {
    lifecycle: "running",
    phase
  });
}

async function notifyRunningProgress(job: JobRecord, progressPercent: number): Promise<void> {
  const correlationId = await ensureJobCorrelationId(job);
  await notifyApiJobEvent(job.id, correlationId, {
    lifecycle: "running",
    phase: "generation",
    progressPercent
  });
}

function writeAppSettings(next: AppSettings): void {
  fs.writeFileSync(config.appSettingsPath, JSON.stringify(next, null, 2), "utf8");
}

function applyAgentIntegrationConfigSnapshot(
  integrationConfig: NonNullable<NonNullable<AgentHelloAckMessage["payload"]>["integrationConfig"]>
): void {
  if (!workerAcceptControlPlaneIntegrationBaseUrl) {
    logWorkerAction("agent_control_integration_config_ignored", {
      reason: "WORKER_ACCEPT_CONTROL_PLANE_INTEGRATION_BASEURL=false",
      received_llm_base_url: integrationConfig.llmBaseUrl ?? null,
      received_comfyui_base_url: integrationConfig.comfyuiBaseUrl ?? null,
      received_tts_base_url: integrationConfig.ttsBaseUrl ?? null
    });
    return;
  }
  const current = readAppSettings();
  const next: AppSettings = {
    ...current,
    llm: {
      ...(current.llm ?? {}),
      baseUrl:
        typeof integrationConfig.llmBaseUrl === "string" &&
        integrationConfig.llmBaseUrl.trim().length > 0
          ? integrationConfig.llmBaseUrl.trim()
          : current.llm?.baseUrl
    },
    comfy: {
      ...(current.comfy ?? {}),
      baseUrl:
        typeof integrationConfig.comfyuiBaseUrl === "string" &&
        integrationConfig.comfyuiBaseUrl.trim().length > 0
          ? integrationConfig.comfyuiBaseUrl.trim()
          : current.comfy?.baseUrl
    },
    tts: {
      ...(current.tts ?? {}),
      baseUrl:
        typeof integrationConfig.ttsBaseUrl === "string" &&
        integrationConfig.ttsBaseUrl.trim().length > 0
          ? integrationConfig.ttsBaseUrl.trim()
          : current.tts?.baseUrl
    }
  };
  writeAppSettings(next);
  logWorkerAction("agent_control_integration_config_applied", {
    llm_base_url: next.llm?.baseUrl ?? null,
    comfyui_base_url: next.comfy?.baseUrl ?? null,
    tts_base_url: next.tts?.baseUrl ?? null
  });
}

function getComfyBaseUrlFromSettings(): string {
  const appSettings = readAppSettings();
  return normalizeBaseUrl(appSettings.comfy?.baseUrl ?? config.comfyuiBaseUrl);
}

function getIdleModelUnloadMs(): number {
  const appSettings = readAppSettings();
  const configured = appSettings.memory?.idleUnloadMs;
  if (configured === undefined) {
    return 15 * 60 * 1000;
  }
  if (!Number.isFinite(configured) || configured < 0) {
    return 15 * 60 * 1000;
  }
  return Math.trunc(configured);
}

function buildComfyPrompt(masterPrompt: string | undefined, blockPrompt: string): string {
  const master = masterPrompt?.trim();
  const block = blockPrompt.trim();
  if (master && block) return `${master}\n${block}`;
  if (master) return master;
  return block;
}

function buildComfyWsUrl(baseUrl: string, clientId: string): string {
  const parsed = new URL(baseUrl);
  parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "") + "/ws";
  parsed.searchParams.set("clientId", clientId);
  return parsed.toString();
}

async function openComfyWebSocket(baseUrl: string, clientId: string): Promise<WebSocket> {
  const wsUrl = buildComfyWsUrl(baseUrl, clientId);
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const onOpen = () => {
      cleanup();
      resolve(ws);
    };
    const cleanup = () => {
      ws.off("error", onError);
      ws.off("open", onOpen);
    };
    ws.on("error", onError);
    ws.on("open", onOpen);
  });
}

type ComfyWsMessage = {
  type?: string;
  data?: any;
};

async function waitForComfyImageViaWs(options: {
  baseUrl: string;
  promptId: string;
  saveNodeId: string;
  clientId: string;
  timeoutMs: number;
}): Promise<{ filename: string; subfolder?: string; type?: string }> {
  const { baseUrl, promptId, saveNodeId, clientId, timeoutMs } = options;
  const doneTimer = startActionTimer("comfy_ws_wait", {
    prompt_id: promptId,
    save_node_id: saveNodeId
  });
  const ws = await openComfyWebSocket(baseUrl, clientId);
  let done = false;
  let fallbackToHistory = false;

  try {
    const image = await new Promise<ComfyImageInfo>((resolve, reject) => {
      const timeout = setTimeout(() => {
        fallbackToHistory = true;
        cleanup();
        reject(new Error(`ComfyUI timed out waiting for prompt ${promptId}`));
      }, timeoutMs);

      const handleMessage = (raw: WebSocket.RawData) => {
        try {
          const text = typeof raw === "string" ? raw : raw.toString("utf8");
          const message = JSON.parse(text) as ComfyWsMessage;
          const type = message?.type;
          if (type === "executed") {
            const node = message?.data?.node as string | undefined;
            if (node === saveNodeId) {
              const imageInfo = asComfyImageInfo(message?.data?.output?.images?.[0]);
              if (imageInfo) {
                done = true;
                cleanup();
                resolve(imageInfo);
              }
            }
          }
          if (type === "execution_error") {
            done = true;
            cleanup();
            reject(new Error(message?.data?.exception_message ?? "ComfyUI execution error"));
          }
          if (type === "execution_success") {
            done = true;
            cleanup();
            fallbackToHistory = true;
            reject(new Error("COMFY_FALLBACK"));
          }
        } catch {
          // ignore malformed messages
        }
      };

      const handleError = (err: Error) => {
        if (done) return;
        cleanup();
        reject(err);
      };

      const handleClose = () => {
        if (done) return;
        cleanup();
        reject(new Error("ComfyUI websocket closed"));
      };

      const cleanup = () => {
        clearTimeout(timeout);
        ws.off("message", handleMessage);
        ws.off("error", handleError);
        ws.off("close", handleClose);
        try {
          ws.close();
        } catch {
          // ignore
        }
      };

      ws.on("message", handleMessage);
      ws.on("error", handleError);
      ws.on("close", handleClose);
    });
    doneTimer();
    return image;
  } catch (err) {
    if (fallbackToHistory || (err instanceof Error && err.message === "COMFY_FALLBACK")) {
      const historyTimer = startActionTimer("comfy_history_fetch", { prompt_id: promptId });
      const history = await requestJson<Record<string, ComfyHistoryEntry>>(
        `${baseUrl}/history/${promptId}`,
        { method: "GET", timeoutMs: 20000 }
      );
      historyTimer();
      const entry = history?.[promptId];
      const image = asComfyImageInfo(entry?.outputs?.[saveNodeId]?.images?.[0]);
      if (image) {
        doneTimer();
        return image;
      }
      const status = entry?.status?.status;
      if (status === "error") {
        doneTimer();
        throw new Error(entry?.status?.message ?? "ComfyUI failed to generate image");
      }
    }
    doneTimer();
    throw err;
  }
}

async function runComfyImageGeneration(options: {
  prompt: string;
  seed: number;
  clientId?: string | null;
  timeoutMs?: number;
}): Promise<{ buffer: Buffer; filename: string }> {
  const { prompt, seed, clientId, timeoutMs } = options;
  const appSettings = readAppSettings();
  const comfySettings = appSettings.comfy ?? {};
  const baseUrl = normalizeBaseUrl(comfySettings.baseUrl ?? config.comfyuiBaseUrl);
  const resolvedClientId = clientId ?? randomUUID();
  const requestTimeoutMs =
    timeoutMs ??
    comfySettings.promptTimeoutMs ??
    config.comfyPromptTimeoutMs ??
    60000;
  const generationTimeoutMs =
    timeoutMs ??
    comfySettings.generationTimeoutMs ??
    config.comfyGenerationTimeoutMs ??
    300000;
  const viewTimeoutMs =
    timeoutMs ??
    comfySettings.viewTimeoutMs ??
    config.comfyViewTimeoutMs ??
    60000;
  logSystemMetrics("system_metrics_before_prompt", {
    base_url: baseUrl
  });
  logWorkerAction("comfy_prompt_build", {
    base_url: baseUrl,
    seed,
    prompt_chars: prompt.length
  });
  const { workflow, saveNodeId } = buildComfyWorkflow(prompt, seed, comfySettings.workflowFile);
  const promptBody = { prompt: workflow, client_id: resolvedClientId };
  const promptBodyBytes = Buffer.byteLength(JSON.stringify(promptBody));
  logWorkerAction("comfy_prompt_payload", {
    base_url: baseUrl,
    save_node_id: saveNodeId,
    payload_bytes: promptBodyBytes
  });
  const promptTimer = startActionTimer("comfy_prompt_submit", {
    base_url: baseUrl,
    save_node_id: saveNodeId
  });
  const response = await requestJson<ComfyPromptResponse>(`${baseUrl}/prompt`, {
    method: "POST",
    body: promptBody,
    timeoutMs: requestTimeoutMs
  });
  promptTimer();
  const promptId = response?.prompt_id;
  if (!promptId) {
    throw new Error("ComfyUI did not return prompt_id");
  }
  logWorkerAction("comfy_prompt_accepted", {
    prompt_id: promptId,
    save_node_id: saveNodeId
  });
  const imageInfo = await waitForComfyImageViaWs({
    baseUrl,
    promptId,
    saveNodeId,
    clientId: resolvedClientId,
    timeoutMs: generationTimeoutMs
  });
  logWorkerAction("comfy_image_ready", {
    prompt_id: promptId,
    filename: imageInfo.filename
  });
  logSystemMetrics("system_metrics_before_download", {
    prompt_id: promptId
  });
  const imageUrl = new URL(`${baseUrl}/view`);
  imageUrl.searchParams.set("filename", imageInfo.filename);
  if (imageInfo.subfolder) {
    imageUrl.searchParams.set("subfolder", imageInfo.subfolder);
  }
  imageUrl.searchParams.set("type", imageInfo.type ?? "output");
  const viewTimer = startActionTimer("comfy_image_download", {
    prompt_id: promptId,
    filename: imageInfo.filename
  });
  const buffer = await requestBinary(imageUrl.toString(), {
    method: "GET",
    timeoutMs: viewTimeoutMs
  });
  viewTimer();
  logSystemMetrics("system_metrics_after_download", {
    prompt_id: promptId,
    bytes: buffer.length
  });
  return { buffer, filename: imageInfo.filename };
}

function normalizeTtsRequestText(text: string): string {
  const ellipsisToken = "__VIZLEC_ELLIPSIS__";
  return sanitizeNarratedScriptText(text)
    .replace(/\.{3}/g, ellipsisToken)
    .replace(/\./g, ";")
    .replace(new RegExp(ellipsisToken, "g"), "...");
}

async function isXttsApiAvailable(baseUrl: string): Promise<boolean> {
  try {
    await requestJson(`${normalizeBaseUrl(baseUrl)}/speakers_list`, {
      method: "GET",
      timeoutMs: 2000
    });
    return true;
  } catch {
    return false;
  }
}

async function waitForXttsApiReady(baseUrl: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isXttsApiAvailable(baseUrl)) {
      return;
    }
    await sleep(1000);
  }
  throw new Error(`XTTS API did not become ready within ${timeoutMs}ms`);
}

function attachChildLogger(child: ReturnType<typeof spawn>, prefix: string): void {
  if (child.stdout) {
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      const lines = String(chunk).split(/\r?\n/);
      for (const line of lines) {
        if (!line.trim()) continue;
        console.log(`[${prefix}] ${line}`);
      }
    });
  }
  if (child.stderr) {
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      const lines = String(chunk).split(/\r?\n/);
      for (const line of lines) {
        if (!line.trim()) continue;
        console.error(`[${prefix}] ${line}`);
      }
    });
  }
}

let xttsApiProcess: ReturnType<typeof spawn> | null = null;
let xttsApiStartPromise: Promise<void> | null = null;

async function startXttsApiServer(): Promise<void> {
  const baseUrl = normalizeBaseUrl(config.xttsApiBaseUrl);
  const parsed = new URL(baseUrl);
  const host = parsed.hostname;
  const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
  ensureDir(config.xttsApiModelDir);
  ensureDir(config.xttsApiOutputDir);
  ensureDir(config.xttsApiSpeakerDir);

  const args = [
    "-m",
    "xtts_api_server",
    "--host",
    host,
    "--port",
    String(port),
    "--device",
    config.xttsApiDevice,
    "--speaker-folder",
    config.xttsApiSpeakerDir,
    "--output",
    config.xttsApiOutputDir,
    "--model-folder",
    config.xttsApiModelDir,
    "--model-source",
    config.xttsApiModelSource,
    "--version",
    config.xttsApiModelVersion
  ];

  if (config.xttsApiUseCache) {
    args.push("--use-cache");
  }
  if (config.xttsApiLowVram) {
    args.push("--lowvram");
  }
  if (config.xttsApiDeepspeed) {
    args.push("--deepspeed");
  }

  const cwd = config.xttsApiServerDir?.trim().length ? config.xttsApiServerDir : undefined;
  const child = spawn(config.xttsApiPython, args, {
    cwd,
    stdio: config.xttsApiDetach ? "ignore" : "pipe",
    detached: config.xttsApiDetach
  });
  if (!config.xttsApiDetach) {
    attachChildLogger(child, "xtts-api");
  } else {
    child.unref();
  }
  xttsApiProcess = child;
}

async function ensureXttsApiServer(): Promise<void> {
  const baseUrl = normalizeBaseUrl(config.xttsApiBaseUrl);
  if (await isXttsApiAvailable(baseUrl)) {
    return;
  }
  if (!config.xttsApiAutostart) {
    throw new Error(`XTTS API not reachable at ${baseUrl}`);
  }
  if (xttsApiStartPromise) {
    return xttsApiStartPromise;
  }
  xttsApiStartPromise = (async () => {
    await startXttsApiServer();
    await waitForXttsApiReady(baseUrl, config.xttsApiStartTimeoutMs);
  })();
  try {
    await xttsApiStartPromise;
  } finally {
    xttsApiStartPromise = null;
  }
}

async function releaseXttsResources(options: {
  job?: JobRecord;
  reason: string;
  force?: boolean;
}): Promise<void> {
  const provider = config.ttsProvider.toLowerCase();
  if (provider !== "xtts" && provider !== "xtts_api") {
    return;
  }
  if (!options.force) {
    const jobMeta = parseJobMeta(options.job?.metaJson);
    const releaseMemory = jobMeta?.tts?.releaseMemory === true;
    if (!releaseMemory) return;
  }

  const baseUrl = normalizeBaseUrl(config.xttsApiBaseUrl);
  const timeoutMs =
    config.xttsApiRequestTimeoutMs && config.xttsApiRequestTimeoutMs > 0
      ? config.xttsApiRequestTimeoutMs
      : 30000;

  try {
    if (options.job) {
      logJobEvent("xtts_unload_requested", options.job, {
        reason: options.reason,
        base_url: baseUrl,
        strategy: "api_release_memory"
      });
    } else {
      logWorkerAction("xtts_unload_requested", {
        reason: options.reason,
        base_url: baseUrl,
        strategy: "api_release_memory"
      });
    }
    const response = await requestJson<{ released?: boolean; shutdown_scheduled?: boolean }>(
      `${baseUrl}/release_memory`,
      {
        method: "POST",
        body: { shutdown: false },
        timeoutMs
      }
    );
    if (options.job) {
      logJobEvent("xtts_unload_completed", options.job, {
        reason: options.reason,
        base_url: baseUrl,
        strategy: "api_release_memory",
        released: response?.released ?? null,
        shutdown_scheduled: response?.shutdown_scheduled ?? null
      });
    } else {
      logWorkerAction("xtts_unload_completed", {
        reason: options.reason,
        base_url: baseUrl,
        strategy: "api_release_memory",
        released: response?.released ?? null,
        shutdown_scheduled: response?.shutdown_scheduled ?? null
      });
    }
    return;
  } catch (err) {
    if (options.job) {
      logJobEvent("xtts_unload_failed", options.job, {
        reason: options.reason,
        base_url: baseUrl,
        strategy: "api_release_memory",
        error: serializeError(err)
      });
    } else {
      logWorkerAction("xtts_unload_failed", {
        reason: options.reason,
        base_url: baseUrl,
        strategy: "api_release_memory",
        error: serializeError(err)
      });
    }
  }

  if (config.xttsApiDetach || !xttsApiProcess) {
    if (options.job) {
      logJobEvent("xtts_unload_skipped", options.job, {
        reason: options.reason,
        detail: config.xttsApiDetach
          ? "api release failed and xttsApiDetach=true"
          : "api release failed and no xtts process to stop"
      });
    } else {
      logWorkerAction("xtts_unload_skipped", {
        reason: options.reason,
        detail: config.xttsApiDetach
          ? "api release failed and xttsApiDetach=true"
          : "api release failed and no xtts process to stop"
      });
    }
    return;
  }

  try {
    if (options.job) {
      logJobEvent("xtts_unload_requested", options.job, {
        reason: options.reason,
        strategy: "process_kill_fallback"
      });
    } else {
      logWorkerAction("xtts_unload_requested", {
        reason: options.reason,
        strategy: "process_kill_fallback"
      });
    }
    xttsApiProcess.kill();
    xttsApiProcess = null;
    if (options.job) {
      logJobEvent("xtts_unload_completed", options.job, {
        reason: options.reason,
        strategy: "process_kill_fallback"
      });
    } else {
      logWorkerAction("xtts_unload_completed", {
        reason: options.reason,
        strategy: "process_kill_fallback"
      });
    }
  } catch (err) {
    if (options.job) {
      logJobEvent("xtts_unload_failed", options.job, {
        reason: options.reason,
        strategy: "process_kill_fallback",
        error: serializeError(err)
      });
    } else {
      logWorkerAction("xtts_unload_failed", {
        reason: options.reason,
        strategy: "process_kill_fallback",
        error: serializeError(err)
      });
    }
  }
}

async function probeAudioDuration(filePath: string): Promise<number | null> {
  try {
    const output = await execFileText("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=nk=1:nw=1",
      filePath
    ]);
    const value = Number(output);
    if (Number.isFinite(value)) {
      return Number(value.toFixed(3));
    }
  } catch {
    return null;
  }
  return null;
}

async function clearAudioAssetsForBlocks(blockIds: string[]): Promise<void> {
  if (blockIds.length === 0) return;
  const assets = await prisma.asset.findMany({
    where: {
      kind: "audio_raw",
      blockId: { in: blockIds }
    }
  });
  await prisma.asset.deleteMany({
    where: {
      kind: "audio_raw",
      blockId: { in: blockIds }
    }
  });
  await prisma.block.updateMany({
    where: { id: { in: blockIds } },
    data: { audioDurationS: null }
  });
  for (const asset of assets) {
    if (asset.path && fs.existsSync(asset.path)) {
      await fs.promises.unlink(asset.path).catch(() => null);
    }
  }
}

async function clearImageAssetsForBlocks(blockIds: string[]): Promise<void> {
  if (blockIds.length === 0) return;
  const cleanupTimer = startActionTimer("image_assets_cleanup", {
    block_count: blockIds.length
  });
  const assets = await prisma.asset.findMany({
    where: {
      kind: { in: ["image_raw", "slide_png"] },
      blockId: { in: blockIds }
    }
  });
  logWorkerAction("image_assets_cleanup_assets_found", {
    block_count: blockIds.length,
    asset_count: assets.length
  });
  await prisma.asset.deleteMany({
    where: {
      kind: { in: ["image_raw", "slide_png"] },
      blockId: { in: blockIds }
    }
  });
  let deletedCount = 0;
  let missingCount = 0;
  let totalBytes = 0;
  for (const asset of assets) {
    if (asset.path && fs.existsSync(asset.path)) {
      try {
        const stat = await fs.promises.stat(asset.path).catch(() => null);
        if (stat?.size) {
          totalBytes += stat.size;
        }
        await fs.promises.unlink(asset.path);
        deletedCount += 1;
        logWorkerAction("image_asset_deleted", {
          path: asset.path,
          kind: asset.kind,
          bytes: stat?.size ?? null
        });
      } catch (err) {
        logWorkerAction("image_asset_delete_failed", {
          path: asset.path,
          kind: asset.kind,
          error: serializeError(err)
        });
      }
    } else {
      missingCount += 1;
      if (asset.path) {
        logWorkerAction("image_asset_missing", {
          path: asset.path,
          kind: asset.kind
        });
      }
    }
  }
  logWorkerAction("image_assets_cleanup_summary", {
    block_count: blockIds.length,
    asset_count: assets.length,
    deleted_count: deletedCount,
    missing_count: missingCount,
    total_bytes: totalBytes
  });
  cleanupTimer();
}

async function clearFinalVideoAssetsForVersion(
  lessonVersionId: string,
  options: { reason: string; job?: JobRecord }
): Promise<void> {
  const assets = await prisma.asset.findMany({
    where: {
      kind: "final_mp4",
      block: { lessonVersionId }
    }
  });
  if (assets.length === 0) {
    if (options.job) {
      logJobEvent("final_video_invalidate_skipped", options.job, {
        lesson_version_id: lessonVersionId,
        reason: options.reason
      });
    } else {
      logWorkerAction("final_video_invalidate_skipped", {
        lesson_version_id: lessonVersionId,
        reason: options.reason
      });
    }
    return;
  }

  await prisma.asset.deleteMany({
    where: {
      kind: "final_mp4",
      block: { lessonVersionId }
    }
  });

  let deletedCount = 0;
  let missingCount = 0;
  for (const asset of assets) {
    if (asset.path && fs.existsSync(asset.path)) {
      await fs.promises.unlink(asset.path).catch(() => null);
      deletedCount += 1;
    } else {
      missingCount += 1;
    }
  }

  if (options.job) {
    logJobEvent("final_video_invalidated", options.job, {
      lesson_version_id: lessonVersionId,
      reason: options.reason,
      asset_count: assets.length,
      deleted_count: deletedCount,
      missing_count: missingCount
    });
  } else {
    logWorkerAction("final_video_invalidated", {
      lesson_version_id: lessonVersionId,
      reason: options.reason,
      asset_count: assets.length,
      deleted_count: deletedCount,
      missing_count: missingCount
    });
  }
}

type QwenTtsResult = {
  id?: string;
  output_path: string;
  sample_rate?: number;
  num_samples?: number;
  duration_s?: number;
};

async function runQwenTtsBatch(items: { id: string; text: string; outputPath: string }[]) {
  if (!fs.existsSync(QWEN_TTS_SCRIPT)) {
    throw new Error(`Qwen TTS runner not found at ${QWEN_TTS_SCRIPT}`);
  }
  const payload = {
    model: config.qwenTtsModel,
    task: config.qwenTtsTask,
    speaker: config.qwenTtsSpeaker,
    language: config.qwenTtsLanguage,
    instruct: config.qwenTtsInstruct,
    device: config.qwenTtsDevice,
    dtype: config.qwenTtsDtype,
    attn_implementation: config.qwenTtsAttnImplementation,
    items: items.map((item) => ({
      id: item.id,
      text: normalizeTtsRequestText(item.text),
      output_path: item.outputPath
    }))
  };
  const tmpDir = path.join(os.tmpdir(), "vizlec-tts");
  ensureDir(tmpDir);
  const base = `tts-${Date.now()}-${randomUUID()}`;
  const inputPath = path.join(tmpDir, `${base}.json`);
  const outputPath = path.join(tmpDir, `${base}-out.json`);
  await fs.promises.writeFile(inputPath, JSON.stringify(payload), "utf8");
  try {
    await runProcess(
      config.qwenTtsPython,
      [QWEN_TTS_SCRIPT, "--input", inputPath, "--output", outputPath],
      { logPrefix: "tts:qwen" }
    );
    const raw = await fs.promises.readFile(outputPath, "utf8");
    const parsed = JSON.parse(raw) as { results?: QwenTtsResult[] };
    return parsed.results ?? [];
  } finally {
    await fs.promises.unlink(inputPath).catch(() => null);
    await fs.promises.unlink(outputPath).catch(() => null);
  }
}

type ChatterboxTtsResult = {
  id?: string;
  output_path: string;
  sample_rate?: number;
  num_samples?: number;
  duration_s?: number;
};

async function runChatterboxTtsBatch(options: {
  items: { id: string; text: string; outputPath: string }[];
  voicePath: string;
  languageId: string;
  onResult?: (result: ChatterboxTtsResult) => void;
}) {
  if (!fs.existsSync(CHATTERBOX_TTS_SCRIPT)) {
    throw new Error(`Chatterbox TTS runner not found at ${CHATTERBOX_TTS_SCRIPT}`);
  }
  const payload = {
    device: config.chatterboxDevice,
    language_id: options.languageId,
    audio_prompt_path: options.voicePath,
    exaggeration: config.chatterboxExaggeration,
    temperature: config.chatterboxTemperature,
    cfg_weight: config.chatterboxCfgWeight,
    items: options.items.map((item) => ({
      id: item.id,
      text: normalizeTtsRequestText(item.text),
      output_path: item.outputPath
    }))
  };
  const tmpDir = path.join(os.tmpdir(), "vizlec-tts");
  ensureDir(tmpDir);
  const base = `tts-${Date.now()}-${randomUUID()}`;
  const inputPath = path.join(tmpDir, `${base}.json`);
  const outputPath = path.join(tmpDir, `${base}-out.json`);
  await fs.promises.writeFile(inputPath, JSON.stringify(payload), "utf8");
  try {
    const resultPrefix = "__VIZLEC_RESULT__";
    await runProcess(
      config.chatterboxPython,
      [CHATTERBOX_TTS_SCRIPT, "--input", inputPath, "--output", outputPath],
      {
        logPrefix: "tts:chatterbox",
        onStdoutLine: (line) => {
          if (!line.startsWith(resultPrefix)) return;
          const raw = line.slice(resultPrefix.length);
          try {
            const parsed = JSON.parse(raw) as ChatterboxTtsResult;
            options.onResult?.(parsed);
          } catch {
            // ignore malformed lines
          }
        }
      }
    );
    const raw = await fs.promises.readFile(outputPath, "utf8");
    const parsed = JSON.parse(raw) as { results?: ChatterboxTtsResult[] };
    return parsed.results ?? [];
  } finally {
    await fs.promises.unlink(inputPath).catch(() => null);
    await fs.promises.unlink(outputPath).catch(() => null);
  }
}

type XttsApiResult = {
  id?: string;
  output_path: string;
  duration_s?: number;
};

function resolveXttsSpeakerRef(voiceId: string): string {
  const trimmed = voiceId.trim();
  if (!trimmed) {
    throw new Error("xtts voice id is empty");
  }
  return trimmed;
}

async function runXttsApiTtsBatch(options: {
  items: { id: string; text: string; outputPath: string }[];
  speakerRef: string;
  languageId: string;
  onResult?: (result: XttsApiResult) => void | Promise<void>;
  beforeItem?: () => void | Promise<void>;
}): Promise<XttsApiResult[]> {
  await ensureXttsApiServer();
  const baseUrl = normalizeBaseUrl(config.xttsApiBaseUrl);
  const results: XttsApiResult[] = [];
  for (const item of options.items) {
    if (options.beforeItem) {
      await options.beforeItem();
    }
    const audioPayload = {
      text: normalizeTtsRequestText(item.text),
      speaker_wav: options.speakerRef,
      language: options.languageId
    };
    const audio = await requestBinary(`${baseUrl}/tts_to_audio/`, {
      method: "POST",
      body: audioPayload,
      timeoutMs: config.xttsApiRequestTimeoutMs
    });
    await fs.promises.writeFile(item.outputPath, audio);
    const outputPath = item.outputPath;

    const result = {
      id: item.id,
      output_path: outputPath
    };
    results.push(result);
    if (options.onResult) {
      await options.onResult(result);
    }
  }
  return results;
}


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

function parseOnScreenJson(raw: string | null): OnScreen | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as OnScreen;
    if (typeof parsed?.title !== "string") return null;
    if (!Array.isArray(parsed?.bullets)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseImagePromptJson(raw: string | null): ImagePrompt | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ImagePrompt;
    if (typeof parsed?.block_prompt !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function isSafeWorkflowFileName(fileName: string): boolean {
  return /^[a-zA-Z0-9._-]+\.json$/.test(fileName);
}

function resolveComfyWorkflowFile(workflowFile: string | undefined): string {
  const trimmed = workflowFile?.trim();
  if (!trimmed || !isSafeWorkflowFileName(trimmed)) {
    return DEFAULT_COMFY_WORKFLOW_FILE;
  }
  return trimmed;
}

function loadComfyWorkflowTemplate(workflowFile: string | undefined): ComfyWorkflow {
  const targetFile = resolveComfyWorkflowFile(workflowFile);
  const workflowPath = path.join(COMFY_WORKFLOWS_DIR, targetFile);
  if (!fs.existsSync(workflowPath)) {
    throw new Error(`Comfy workflow not found at ${workflowPath}`);
  }
  const stats = fs.statSync(workflowPath);
  const cached = comfyWorkflowTemplateCache.get(workflowPath);
  if (cached && cached.mtimeMs === stats.mtimeMs) {
    return cached.workflow;
  }
  const raw = fs.readFileSync(workflowPath, "utf8");
  const parsed = JSON.parse(raw) as ComfyWorkflow;
  comfyWorkflowTemplateCache.set(workflowPath, { workflow: parsed, mtimeMs: stats.mtimeMs });
  return parsed;
}

function findComfyNodeId(
  workflow: ComfyWorkflow,
  predicate: (node: ComfyWorkflowNode) => boolean
): string | null {
  for (const [id, node] of Object.entries(workflow)) {
    if (predicate(node)) return id;
  }
  return null;
}

function buildComfyWorkflow(prompt: string, seed: number, workflowFile: string | undefined): {
  workflow: ComfyWorkflow;
  saveNodeId: string;
} {
  const template = loadComfyWorkflowTemplate(workflowFile);
  const workflow = JSON.parse(JSON.stringify(template)) as ComfyWorkflow;

  const promptNodeId = findComfyNodeId(
    workflow,
    (node) => node.class_type === "CLIPTextEncode" && typeof node.inputs?.text === "string"
  );
  if (!promptNodeId) {
    throw new Error("Comfy workflow missing CLIPTextEncode text node");
  }
  (workflow[promptNodeId].inputs ??= {}).text = prompt;

  const seedNodeId = findComfyNodeId(
    workflow,
    (node) => node.class_type === "KSampler" && Boolean(node.inputs && "seed" in node.inputs)
  );
  if (!seedNodeId) {
    throw new Error("Comfy workflow missing KSampler seed node");
  }
  (workflow[seedNodeId].inputs ??= {}).seed = seed;

  const saveNodeId = findComfyNodeId(
    workflow,
    (node) => node.class_type === "SaveImage"
  );
  if (!saveNodeId) {
    throw new Error("Comfy workflow missing SaveImage node");
  }

  return { workflow, saveNodeId };
}

async function resolveSlideTemplateById(templateId: string): Promise<SlideTemplateRecord | null> {
  return prisma.slideTemplate.findUnique({ where: { id: templateId } }) as Promise<
    SlideTemplateRecord | null
  >;
}

async function resolveDefaultSlideTemplate(kind: string): Promise<SlideTemplateRecord | null> {
  return prisma.slideTemplate.findFirst({
    where: { isActive: true, kind },
    orderBy: { createdAt: "asc" }
  }) as Promise<SlideTemplateRecord | null>;
}

async function resolveAnyActiveSlideTemplate(): Promise<SlideTemplateRecord | null> {
  return prisma.slideTemplate.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" }
  }) as Promise<SlideTemplateRecord | null>;
}

async function resolveTemplateForImageJob(job: JobRecord): Promise<SlideTemplateRecord | null> {
  if (job.templateId?.trim()) {
    const selected = await resolveSlideTemplateById(job.templateId.trim());
    if (!selected || !selected.isActive) {
      throw new Error(`slide template not found: ${job.templateId}`);
    }
    return selected;
  }
  const preferred = await resolveDefaultSlideTemplate("image");
  if (preferred) return preferred;
  return resolveAnyActiveSlideTemplate();
}

function findFirstImageFile(dirPath: string): string | null {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".webp") {
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

async function clearSlideAssetsForVersionTemplate(
  lessonVersionId: string,
  templateId: string,
  options: { reason: string; job?: JobRecord }
): Promise<void> {
  const assets = await prisma.asset.findMany({
    where: {
      kind: "slide_png",
      templateId,
      block: { lessonVersionId }
    }
  });
  if (assets.length === 0) {
    if (options.job) {
      logJobEvent("slide_invalidate_skipped", options.job, {
        lesson_version_id: lessonVersionId,
        template_id: templateId,
        reason: options.reason
      });
    }
    return;
  }

  await prisma.asset.deleteMany({
    where: {
      kind: "slide_png",
      templateId,
      block: { lessonVersionId }
    }
  });

  let deletedCount = 0;
  let missingCount = 0;
  for (const asset of assets) {
    if (asset.path && fs.existsSync(asset.path)) {
      await fs.promises.unlink(asset.path).catch(() => null);
      deletedCount += 1;
    } else {
      missingCount += 1;
    }
  }

  if (options.job) {
    logJobEvent("slide_invalidated", options.job, {
      lesson_version_id: lessonVersionId,
      template_id: templateId,
      reason: options.reason,
      asset_count: assets.length,
      deleted_count: deletedCount,
      missing_count: missingCount
    });
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

async function loadImageDataUrl(imagePath: string): Promise<string | null> {
  try {
    const ext = path.extname(imagePath).toLowerCase();
    const buffer = await fs.promises.readFile(imagePath);
    const mime = mimeTypeForImage(ext);
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

async function renderSlideForSingleBlock(options: {
  job: JobRecord;
  template: SlideTemplateRecord;
  block: {
    id: string;
    index: number;
    onScreenJson: string | null;
    workspaceId: string;
  };
  courseId: string;
  moduleId: string;
  lessonId: string;
  versionId: string;
}): Promise<void> {
  const { job, template, block, courseId, moduleId, lessonId, versionId } = options;
  const onScreen = parseOnScreenJson(block.onScreenJson);
  if (!onScreen) {
    throw new Error(`block ${block.index} missing onScreenJson`);
  }
  const bullets = (onScreen.bullets ?? []).filter(Boolean).slice(0, 5);
  const slideDir = blockSlideDir(courseId, moduleId, lessonId, versionId, block.index);
  ensureDir(slideDir);
  const outputPath = path.join(slideDir, template.fileName);

  let imagePath: string | null = null;
  let imageSource = "none";
  let imageLoaded: boolean | null = null;

  if (template.kind === "image" || template.kind === "text") {
    const imageAsset = await prisma.asset.findFirst({
      where: { blockId: block.id, kind: "image_raw" },
      orderBy: { createdAt: "desc" }
    });
    if (imageAsset?.path && fs.existsSync(imageAsset.path)) {
      imagePath = imageAsset.path;
      imageSource = "asset";
    }
  }

  if (template.kind === "image") {
    const imageDataUrl = imagePath ? await loadImageDataUrl(imagePath) : null;
    let imageUrl = imageDataUrl;
    if (!imageUrl && imagePath) {
      imageUrl = `http://127.0.0.1:${config.apiPort}/blocks/${block.id}/image/raw?v=${Date.now()}`;
      imageSource = "api_raw";
    } else if (imageUrl) {
      imageSource = "asset_data_url";
    }
    if (!imageUrl && imagePath) {
      imageUrl = pathToFileURL(imagePath).toString();
      imageSource = "asset_file_url";
    }
    imageLoaded = await renderImageSlidePng(
      { title: onScreen.title, bullets, imageUrl },
      outputPath
    );
    if (!imageLoaded && imagePath) {
      const fileRetryUrl = pathToFileURL(imagePath).toString();
      imageLoaded = await renderImageSlidePng(
        { title: onScreen.title, bullets, imageUrl: fileRetryUrl },
        outputPath
      );
      if (imageLoaded) {
        imageSource = "asset_file_url_retry";
      }
    }
    if (!imageLoaded && imagePath) {
      const retryUrl = `http://127.0.0.1:${config.apiPort}/blocks/${block.id}/image/raw?v=${Date.now()}`;
      imageLoaded = await renderImageSlidePng(
        { title: onScreen.title, bullets, imageUrl: retryUrl },
        outputPath
      );
      if (imageLoaded) {
        imageSource = "api_raw_retry";
      }
    }
  } else if (template.kind === "text") {
    const imageDataUrl = imagePath ? await loadImageDataUrl(imagePath) : null;
    let imageUrl = imageDataUrl;
    if (!imageUrl && imagePath) {
      imageUrl = `http://127.0.0.1:${config.apiPort}/blocks/${block.id}/image/raw?v=${Date.now()}`;
      imageSource = "api_raw";
    } else if (imageUrl) {
      imageSource = "asset_data_url";
    }
    if (!imageUrl && imagePath) {
      imageUrl = pathToFileURL(imagePath).toString();
      imageSource = "asset_file_url";
    }
    imageLoaded = await renderTextSlidePng({ title: onScreen.title, bullets, imageUrl }, outputPath);
    if (!imageLoaded && imagePath) {
      const fileRetryUrl = pathToFileURL(imagePath).toString();
      imageLoaded = await renderTextSlidePng(
        { title: onScreen.title, bullets, imageUrl: fileRetryUrl },
        outputPath
      );
      if (imageLoaded) {
        imageSource = "asset_file_url_retry";
      }
    }
    if (!imageLoaded && imagePath) {
      const retryUrl = `http://127.0.0.1:${config.apiPort}/blocks/${block.id}/image/raw?v=${Date.now()}`;
      imageLoaded = await renderTextSlidePng({ title: onScreen.title, bullets, imageUrl: retryUrl }, outputPath);
      if (imageLoaded) {
        imageSource = "api_raw_retry";
      }
    }
  } else {
    throw new Error(`Unsupported template kind: ${template.kind}`);
  }

  await prisma.asset.deleteMany({
    where: { blockId: block.id, kind: "slide_png", templateId: template.id }
  });
  await prisma.asset.create({
    data: {
      workspaceId: block.workspaceId,
      blockId: block.id,
      kind: "slide_png",
      path: outputPath,
      templateId: template.id,
      metaJson: JSON.stringify({
        templateId: template.id,
        templateLabel: template.label,
        templateKind: template.kind,
        imagePath: imagePath ?? null,
        imageSource,
        imageLoaded
      })
    }
  });

  logJobEvent("image_block_slide_saved", job, {
    block_index: block.index,
    template_id: template.id,
    path: outputPath,
    image_found: Boolean(imagePath),
    image_loaded: imageLoaded,
    image_source: imageSource
  });
}

async function renderSlidesForTemplate(options: {
  job: JobRecord;
  template: SlideTemplateRecord;
}): Promise<void> {
  const { job, template } = options;
  if (!job.lessonVersionId) {
    throw new Error("render_slide job missing lessonVersionId");
  }
  await assertLeaseValid(job.id);
  const version = await prisma.lessonVersion.findUnique({
    where: { id: job.lessonVersionId },
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
  });
  if (!version?.lesson?.module?.course) {
    throw new Error("lesson context not found");
  }
  const course = version.lesson.module.course;
  const moduleRecord = version.lesson.module;
  const lesson = version.lesson;
  const blocks = await prisma.block.findMany({
    where: { lessonVersionId: version.id },
    orderBy: { index: "asc" }
  });
  if (blocks.length === 0) {
    throw new Error("no blocks found for lesson version");
  }
  await clearSlideAssetsForVersionTemplate(version.id, template.id, {
    reason: "render_slide_regeneration",
    job
  });
  await notifyRunningPhase(job, "cleanup");

  logJobEvent("render_slide_started", job, {
    template_id: template.id,
    template_label: template.label,
    template_kind: template.kind,
    block_count: blocks.length
  });
  await notifyRunningPhase(job, "generation");

  let failures = 0;
  for (const block of blocks) {
    await assertLeaseValid(job.id);
    const onScreen =
      parseOnScreenJson(block.onScreenJson) ?? buildFallbackMeta(block.sourceText, block.index).onScreen;
    const bullets = (onScreen.bullets ?? []).filter(Boolean).slice(0, 5);
    const slideDir = blockSlideDir(
      course.id,
      moduleRecord.id,
      lesson.id,
      version.id,
      block.index
    );
    ensureDir(slideDir);
    const outputPath = path.join(slideDir, template.fileName);

    let imagePath: string | null = null;
    let imageSource = "none";
    let imageLoaded: boolean | null = null;

    if (template.kind === "image" || template.kind === "text") {
      const imageAsset = await prisma.asset.findFirst({
        where: { blockId: block.id, kind: "image_raw" },
        orderBy: { createdAt: "desc" }
      });
      if (imageAsset?.path && fs.existsSync(imageAsset.path)) {
        imagePath = imageAsset.path;
        imageSource = "asset";
      }
    }

    try {
      if (template.kind === "image") {
        const imageDataUrl = imagePath ? await loadImageDataUrl(imagePath) : null;
        let imageUrl = imageDataUrl;
        if (!imageUrl && imagePath) {
          imageUrl = `http://127.0.0.1:${config.apiPort}/blocks/${block.id}/image/raw?v=${Date.now()}`;
          imageSource = "api_raw";
        } else if (imageUrl) {
          imageSource = "asset_data_url";
        }
        if (!imageUrl && imagePath) {
          imageUrl = pathToFileURL(imagePath).toString();
          imageSource = "asset_file_url";
        }
        imageLoaded = await renderImageSlidePng(
          { title: onScreen.title, bullets, imageUrl },
          outputPath
        );
        if (!imageLoaded && imagePath) {
          const fileRetryUrl = pathToFileURL(imagePath).toString();
          imageLoaded = await renderImageSlidePng(
            { title: onScreen.title, bullets, imageUrl: fileRetryUrl },
            outputPath
          );
          if (imageLoaded) {
            imageSource = "asset_file_url_retry";
          }
        }
        if (!imageLoaded && imagePath) {
          const retryUrl = `http://127.0.0.1:${config.apiPort}/blocks/${block.id}/image/raw?v=${Date.now()}`;
          imageLoaded = await renderImageSlidePng(
            { title: onScreen.title, bullets, imageUrl: retryUrl },
            outputPath
          );
          if (imageLoaded) {
            imageSource = "api_raw_retry";
          }
        }
      } else if (template.kind === "text") {
        const imageDataUrl = imagePath ? await loadImageDataUrl(imagePath) : null;
        let imageUrl = imageDataUrl;
        if (!imageUrl && imagePath) {
          imageUrl = `http://127.0.0.1:${config.apiPort}/blocks/${block.id}/image/raw?v=${Date.now()}`;
          imageSource = "api_raw";
        } else if (imageUrl) {
          imageSource = "asset_data_url";
        }
        if (!imageUrl && imagePath) {
          imageUrl = pathToFileURL(imagePath).toString();
          imageSource = "asset_file_url";
        }
        imageLoaded = await renderTextSlidePng({ title: onScreen.title, bullets, imageUrl }, outputPath);
        if (!imageLoaded && imagePath) {
          const fileRetryUrl = pathToFileURL(imagePath).toString();
          imageLoaded = await renderTextSlidePng(
            { title: onScreen.title, bullets, imageUrl: fileRetryUrl },
            outputPath
          );
          if (imageLoaded) {
            imageSource = "asset_file_url_retry";
          }
        }
        if (!imageLoaded && imagePath) {
          const retryUrl = `http://127.0.0.1:${config.apiPort}/blocks/${block.id}/image/raw?v=${Date.now()}`;
          imageLoaded = await renderTextSlidePng({ title: onScreen.title, bullets, imageUrl: retryUrl }, outputPath);
          if (imageLoaded) {
            imageSource = "api_raw_retry";
          }
        }
      } else {
        throw new Error(`Unsupported template kind: ${template.kind}`);
      }

      await prisma.asset.deleteMany({
        where: { blockId: block.id, kind: "slide_png", templateId: template.id }
      });
      await prisma.asset.create({
        data: {
          workspaceId: block.workspaceId,
          blockId: block.id,
          kind: "slide_png",
          path: outputPath,
          templateId: template.id,
          metaJson: JSON.stringify({
            templateId: template.id,
            templateLabel: template.label,
            templateKind: template.kind,
            imagePath: imagePath ?? null,
            imageSource,
            imageLoaded
          })
        }
      });
      logJobEvent("render_slide_saved", job, {
        block_index: block.index,
        template_id: template.id,
        path: outputPath,
        image_found: Boolean(imagePath),
        image_loaded: imageLoaded,
        image_source: imageSource
      });
    } catch (err) {
      failures += 1;
      logJobEvent("render_slide_failed", job, {
        block_index: block.index,
        template_id: template.id,
        error: serializeError(err)
      });
    }
  }

  if (failures > 0) {
    throw new Error(`render_slide failed for ${failures} blocks`);
  }
  logJobEvent("render_slide_completed", job, {
    template_id: template.id,
    block_count: blocks.length
  });
}

function toConcatFileEntry(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/").replace(/'/g, "'\\''");
  return `file '${normalized}'`;
}

function parseFfmpegTimestampToSeconds(value: string): number | null {
  const match = value.trim().match(/^(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }
  return hours * 3600 + minutes * 60 + seconds;
}

function resolveWorkerBgmLibraryPath(relativePath: string | null | undefined): string | null {
  const raw = typeof relativePath === "string" ? relativePath.trim() : "";
  if (!raw) return null;
  const normalized = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("\0")) return null;
  const base = path.resolve(config.dataDir, "bgm_library");
  const resolved = path.resolve(base, normalized);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) return null;
  return resolved;
}

async function applyBgmMixToFinalVideo(options: {
  finalVideoPath: string;
  bgmPath: string;
  bgmVolume: number;
  voiceVolume: number;
  masterVolume: number;
  job: JobRecord;
}): Promise<void> {
  const { finalVideoPath, bgmPath, bgmVolume, voiceVolume, masterVolume, job } = options;
  const tmpOutput = `${finalVideoPath}.bgm_mix.tmp.mp4`;
  await runProcess(
    "ffmpeg",
    [
      "-y",
      "-stream_loop",
      "-1",
      "-i",
      bgmPath,
      "-i",
      finalVideoPath,
      "-filter_complex",
      `[0:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,volume=${bgmVolume.toFixed(4)}[bgm];` +
      `[1:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,volume=${voiceVolume.toFixed(4)}[tts];` +
      `[tts][bgm]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mix];` +
      `[mix]volume=${masterVolume.toFixed(4)}[aout]`,
      "-map",
      "1:v:0",
      "-map",
      "[aout]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-b:a",
      "256k",
      "-shortest",
      "-movflags",
      "+faststart",
      tmpOutput
    ],
    { logPrefix: "video:bgm_mix" }
  );
  await fs.promises.rename(tmpOutput, finalVideoPath);
  logJobEvent("concat_video_bgm_mix_applied", job, {
    bgm_path: bgmPath,
    bgm_volume: bgmVolume,
    voice_volume: voiceVolume,
    master_volume: masterVolume,
    output_path: finalVideoPath
  });
}

async function renderFinalVideoForVersion(options: { job: JobRecord }): Promise<void> {
  const { job } = options;
  if (!job.lessonVersionId) {
    throw new Error("concat_video job missing lessonVersionId");
  }
  await assertLeaseValid(job.id);
  const version = await prisma.lessonVersion.findUnique({
    where: { id: job.lessonVersionId },
    include: {
      lesson: {
        include: {
          module: {
            include: {
              course: true
            }
          }
        }
      },
      blocks: { orderBy: { index: "asc" } }
    }
  });
  if (!version?.lesson?.module?.course) {
    throw new Error("lesson version not found");
  }
  if (version.blocks.length === 0) {
    throw new Error("no blocks found for lesson version");
  }
  await clearFinalVideoAssetsForVersion(version.id, {
    reason: "concat_video_regeneration",
    job
  });
  await notifyRunningPhase(job, "cleanup");
  logJobEvent("concat_video_started", job, {
    block_count: version.blocks.length,
    visual_mode: "image_raw_only",
    bgm_path: version.bgmPath ?? null,
    bgm_volume: version.bgmVolume ?? null,
    voice_volume: version.voiceVolume ?? null,
    master_volume: version.masterVolume ?? null
  });
  await notifyRunningPhase(job, "generation");

  const finalDir = lessonFinalDir(
    version.lesson.module.course.id,
    version.lesson.module.id,
    version.lesson.id,
    version.id
  );
  ensureDir(finalDir);
  const outputPath = path.join(finalDir, "final.mp4");
  const mediaFiles: string[] = [];
  const audioFiles: string[] = [];
  const durations: number[] = [];
  const clipPaths: string[] = [];
  const bgmPath = resolveWorkerBgmLibraryPath(version.bgmPath);
  const voiceVolume =
    typeof version.voiceVolume === "number" && Number.isFinite(version.voiceVolume)
      ? Math.max(0, Math.min(MAX_MIX_GAIN, version.voiceVolume))
      : 1;
  const masterVolume =
    typeof version.masterVolume === "number" && Number.isFinite(version.masterVolume)
      ? Math.max(0, Math.min(MAX_MIX_GAIN, version.masterVolume))
      : 1;
  const bgmVolume =
    typeof version.bgmVolume === "number" && Number.isFinite(version.bgmVolume)
      ? Math.max(0, Math.min(MAX_MIX_GAIN, version.bgmVolume))
      : 0;

  for (const block of version.blocks) {
    await assertLeaseValid(job.id);
    const audioAsset = await prisma.asset.findFirst({
      where: { kind: "audio_raw", blockId: block.id },
      orderBy: { createdAt: "desc" }
    });
    if (!audioAsset?.path || !fs.existsSync(audioAsset.path)) {
      throw new Error(`audio not found for block ${block.index}`);
    }
    const imageAsset = await prisma.asset.findFirst({
      where: { kind: "image_raw", blockId: block.id },
      orderBy: { createdAt: "desc" }
    });
    if (!imageAsset?.path || !fs.existsSync(imageAsset.path)) {
      throw new Error(`image not found for block ${block.index}`);
    }
    const duration =
      typeof block.audioDurationS === "number" && Number.isFinite(block.audioDurationS) && block.audioDurationS > 0
        ? block.audioDurationS
        : 3;

    mediaFiles.push(imageAsset.path);
    audioFiles.push(audioAsset.path);
    durations.push(duration);
    logJobEvent("render_clip_saved", job, {
      block_index: block.index,
      path: imageAsset.path,
      cinematic_clip: true
    });
  }

  let usedCinematicBridge = false;
  try {
    await ensureMemoryForSubtitleTranscription(job);
    await renderCinematicFinalVideoWithPython({
      outputPath,
      mediaFiles,
      audioFiles,
      durations,
      job
    });
    usedCinematicBridge = true;
    await notifyRunningProgress(job, 99);
  } catch (err) {
    logJobEvent("concat_video_cinematic_fallback", job, {
      error: serializeError(err)
    });
    const legacyClipPaths: string[] = [];
    for (let idx = 0; idx < version.blocks.length; idx += 1) {
      const block = version.blocks[idx]!;
      const audioPath = audioFiles[idx]!;
      const imagePath = mediaFiles[idx]!;
      const clipDir = blockClipDir(
        version.lesson.module.course.id,
        version.lesson.module.id,
        version.lesson.id,
        version.id,
        block.index
      );
      ensureDir(clipDir);
      const clipPath = path.join(clipDir, "clip.mp4");
      await runProcess(
        "ffmpeg",
        [
          "-y","-loop","1","-framerate","30","-i",imagePath,"-i",audioPath,
          "-c:v","libx264","-preset","veryfast","-crf","20","-pix_fmt","yuv420p",
          "-vf","scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2",
          "-c:a","aac","-b:a","192k","-shortest","-movflags","+faststart",clipPath
        ],
        { logPrefix: `video:clip:${block.index}` }
      );
      await prisma.asset.deleteMany({ where: { blockId: block.id, kind: "clip_mp4" } });
      await prisma.asset.create({
        data: {
          workspaceId: block.workspaceId,
          blockId: block.id,
          kind: "clip_mp4",
          path: clipPath,
          templateId: null,
          metaJson: JSON.stringify({
            sourceAudioPath: audioPath,
            sourceVisualKind: "image_raw",
            sourceVisualPath: imagePath
          })
        }
      });
      legacyClipPaths.push(clipPath);
    }
    const concatFilePath = path.join(finalDir, `concat_${job.id}.txt`);
    await fs.promises.writeFile(
      concatFilePath,
      `${legacyClipPaths.map((clipPath) => toConcatFileEntry(clipPath)).join("\n")}\n`,
      "utf8"
    );
    const totalDurationSeconds = durations.reduce((a, b) => a + b, 0);
    let lastConcatProgress = 0;
    try {
      await runProcess(
        "ffmpeg",
        ["-y","-f","concat","-safe","0","-i",concatFilePath,"-c:v","libx264","-preset","veryfast","-crf","20","-c:a","aac","-b:a","192k","-pix_fmt","yuv420p","-movflags","+faststart",outputPath],
        {
          logPrefix: "video:concat",
          onStderrLine: (line) => {
            if (!(totalDurationSeconds > 0)) return;
            const match = line.match(/time=(\d{2}:\d{2}:\d{2}(?:\.\d+)?)/);
            if (!match) return;
            const currentSeconds = parseFfmpegTimestampToSeconds(match[1] ?? "");
            if (!currentSeconds || currentSeconds <= 0) return;
            const rawPercent = Math.trunc((currentSeconds / totalDurationSeconds) * 100);
            const clampedPercent = Math.max(1, Math.min(99, rawPercent));
            if (clampedPercent <= lastConcatProgress) return;
            lastConcatProgress = clampedPercent;
            void notifyRunningProgress(job, clampedPercent);
          }
        }
      );
    } finally {
      await fs.promises.unlink(concatFilePath).catch(() => null);
    }
    clipPaths.push(...legacyClipPaths);
  }

  if (bgmPath && fs.existsSync(bgmPath) && bgmVolume > 0) {
    await notifyRunningPhase(job, "generation");
    await applyBgmMixToFinalVideo({
      finalVideoPath: outputPath,
      bgmPath,
      bgmVolume,
      voiceVolume,
      masterVolume,
      job
    });
    await notifyRunningProgress(job, 99);
  }

  const subtitleRawJsonPath = path.join(finalDir, "subtitles.raw.json");
  const subtitleCuesJsonPath = path.join(finalDir, "subtitles.cues.json");
  const subtitleSrtPath = path.join(finalDir, "subtitles.srt");
  const subtitleAssPath = path.join(finalDir, "subtitles.default.ass");
  const hasSubtitleOutput = fs.existsSync(subtitleAssPath);

  await prisma.asset.deleteMany({
    where: {
      kind: "final_mp4",
      block: { lessonVersionId: version.id }
    }
  });
  await prisma.asset.create({
    data: {
      workspaceId: version.blocks[0].workspaceId,
      blockId: version.blocks[0].id,
      kind: "final_mp4",
      path: outputPath,
      templateId: null,
      metaJson: JSON.stringify({
        blockCount: version.blocks.length,
        visualMode: usedCinematicBridge ? "cinematic_image_raw_only" : "image_raw_only",
        voiceVolume: voiceVolume !== 1 ? voiceVolume : null,
        masterVolume: masterVolume !== 1 ? masterVolume : null,
        bgmPath: version.bgmPath ?? null,
        bgmVolume: bgmVolume > 0 ? bgmVolume : null,
        subtitleTemplateId: hasSubtitleOutput ? "subtitle-yellow-bold-bottom-v1" : null,
        subtitleSrtPath: fs.existsSync(subtitleSrtPath) ? subtitleSrtPath : null
      })
    }
  });

  const subtitleAssetDefs: Array<{ kind: string; path: string; format: string }> = [
    { kind: "subtitle_raw_json", path: subtitleRawJsonPath, format: "raw_json" },
    { kind: "subtitle_cues_json", path: subtitleCuesJsonPath, format: "cues_json" },
    { kind: "subtitle_srt", path: subtitleSrtPath, format: "srt" },
    { kind: "subtitle_ass", path: subtitleAssPath, format: "ass" }
  ];
  await prisma.asset.deleteMany({
    where: {
      kind: { in: subtitleAssetDefs.map((d) => d.kind) },
      block: { lessonVersionId: version.id }
    }
  });
  for (const def of subtitleAssetDefs) {
    if (!fs.existsSync(def.path)) continue;
    await prisma.asset.create({
      data: {
        workspaceId: version.blocks[0].workspaceId,
        blockId: version.blocks[0].id,
        kind: def.kind,
        path: def.path,
        templateId: "subtitle-yellow-bold-bottom-v1",
        metaJson: JSON.stringify({
          scope: "lesson_version",
          format: def.format,
          templateId: "subtitle-yellow-bold-bottom-v1"
        })
      }
    });
  }

  const manifestPath = path.join(finalDir, "manifest.json");
  await fs.promises.writeFile(
    manifestPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        visualMode: usedCinematicBridge ? "cinematic_image_raw_only" : "image_raw_only",
        voiceVolume: voiceVolume !== 1 ? voiceVolume : null,
        masterVolume: masterVolume !== 1 ? masterVolume : null,
        bgmPath: version.bgmPath ?? null,
        bgmVolume: bgmVolume > 0 ? bgmVolume : null,
        subtitleTemplateId: hasSubtitleOutput ? "subtitle-yellow-bold-bottom-v1" : null,
        subtitleSrtPath: fs.existsSync(subtitleSrtPath) ? subtitleSrtPath : null,
        blockCount: version.blocks.length,
        clips: version.blocks.map((block, idx) => ({
          blockId: block.id,
          blockIndex: block.index,
          path: clipPaths[idx] ?? null
        })),
        outputPath
      },
      null,
      2
    ),
    "utf8"
  );
  await prisma.asset.deleteMany({
    where: {
      kind: "manifest_json",
      block: { lessonVersionId: version.id }
    }
  });
  await prisma.asset.create({
    data: {
      workspaceId: version.blocks[0].workspaceId,
      blockId: version.blocks[0].id,
      kind: "manifest_json",
      path: manifestPath,
      templateId: null
    }
  });
  logJobEvent("concat_video_completed", job, {
    output_path: outputPath,
    block_count: version.blocks.length,
    visual_mode: usedCinematicBridge ? "cinematic_image_raw_only" : "image_raw_only",
    bgm_path: version.bgmPath ?? null,
    bgm_volume: bgmVolume > 0 ? bgmVolume : null,
    voice_volume: voiceVolume !== 1 ? voiceVolume : null,
    master_volume: masterVolume !== 1 ? masterVolume : null,
    subtitles_enabled: hasSubtitleOutput,
    subtitle_template_id: hasSubtitleOutput ? "subtitle-yellow-bold-bottom-v1" : null
  });
}

function isLeaseValidValue(lease: Date | null): boolean {
  if (!lease) return true;
  return lease.getTime() > Date.now();
}

async function assertLeaseValid(jobId: string): Promise<void> {
  const current = await prisma.job.findUnique({
    where: { id: jobId },
    select: { leaseExpiresAt: true }
  });
  if (!current || !isLeaseValidValue(current.leaseExpiresAt)) {
    throw new Error("lease expired");
  }
  const leaseMs = Number(process.env.JOB_LEASE_MS ?? 30000);
  const leaseExpiresAt = new Date(Date.now() + leaseMs);
  await prisma.job.update({
    where: { id: jobId },
    data: { leaseExpiresAt }
  });
}

async function claimNextJob(): Promise<JobRecord | null> {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    await tx.job.updateMany({
      where: {
        status: "running",
        leaseExpiresAt: { not: null, lt: now }
      },
      data: {
        status: "canceled",
        error: "lease expired",
        canceledAt: now
      }
    });
    const runningBlocks = await tx.job.findMany({
      where: { status: "running", blockId: { not: null } },
      select: { blockId: true }
    });
    const blockedIds = runningBlocks
      .map((row) => row.blockId)
      .filter((blockId): blockId is string => typeof blockId === "string");

    const blockFilter =
      blockedIds.length > 0 ? { OR: [{ blockId: null }, { blockId: { notIn: blockedIds } }] } : {};
    const where = {
      status: "pending",
      AND: [blockFilter]
    };

    const candidates = await tx.job.findMany({
      where,
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }]
    });
    if (candidates.length === 0) return null;

    const parseDependencies = (
      raw: string | null | undefined
    ): Array<{ jobId: string; require: "success" | "terminal" }> => {
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw) as {
          dependencies?: Array<{ jobId?: string; require?: "success" | "terminal" }>;
        };
        return (parsed.dependencies ?? [])
          .filter((item): item is { jobId: string; require?: "success" | "terminal" } =>
            Boolean(item?.jobId)
          )
          .map((item) => ({
            jobId: item.jobId,
            require: item.require === "terminal" ? "terminal" : "success"
          }));
      } catch {
        return [];
      }
    };

    const terminalStatuses = new Set(["succeeded", "failed", "canceled"]);
    let selected: JobRecord | null = null;
    for (const candidate of candidates) {
      const dependencies = parseDependencies(candidate.metaJson);
      if (dependencies.length === 0) {
        selected = candidate as JobRecord;
        break;
      }

      const depIds = dependencies.map((dep) => dep.jobId);
      const depJobs = await tx.job.findMany({
        where: { id: { in: depIds } },
        select: { id: true, status: true }
      });
      const depMap = new Map(depJobs.map((dep) => [dep.id, dep.status]));
      let blocked = false;
      let shouldCancel = false;
      let cancelReason = "";

      for (const dep of dependencies) {
        const status = depMap.get(dep.jobId);
        if (!status) {
          blocked = true;
          break;
        }
        if (dep.require === "success") {
          if (status === "succeeded") continue;
          if (status === "failed" || status === "canceled") {
            shouldCancel = true;
            cancelReason = `dependency ${dep.jobId} ${status}`;
            break;
          }
          blocked = true;
          break;
        }
        if (!terminalStatuses.has(status)) {
          blocked = true;
          break;
        }
      }

      if (shouldCancel) {
        await tx.job.updateMany({
          where: { id: candidate.id, status: "pending" },
          data: {
            status: "canceled",
            error: cancelReason,
            canceledAt: now
          }
        });
        continue;
      }

      if (!blocked) {
        selected = candidate as JobRecord;
        break;
      }
    }

    if (!selected) return null;

    const leaseMs = Number(process.env.JOB_LEASE_MS ?? 30000);
    const leaseExpiresAt = new Date(Date.now() + leaseMs);
    const updated = await tx.job.updateMany({
      where: { id: selected.id, status: "pending" },
      data: {
        status: "running",
        attempts: { increment: 1 },
        leaseExpiresAt
      }
    });
    if (updated.count === 0) return null;

    return tx.job.findUnique({ where: { id: selected.id } });
  });
}

async function markJobSuccess(job: JobRecord, durationMs: number): Promise<void> {
  await prisma.job.update({
    where: { id: job.id },
    data: { status: "succeeded", error: null }
  });
  logJobEvent("job_succeeded", job, { duration_ms: durationMs });
}

async function markJobFailure(job: JobRecord, err: unknown, durationMs: number): Promise<void> {
  const error = serializeError(err);
  if (error === "lease expired") {
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "canceled",
        error,
        canceledAt: new Date()
      }
    });
    logJobEvent("job_canceled", job, { duration_ms: durationMs, error });
    return;
  }
  const shouldRetry = job.attempts < MAX_ATTEMPTS;
  await prisma.job.update({
    where: { id: job.id },
    data: {
      status: shouldRetry ? "pending" : "failed",
      error
    }
  });
  logJobEvent(shouldRetry ? "job_failed_retrying" : "job_failed", job, {
    duration_ms: durationMs,
    error
  });
}

async function ensureMemoryForImageGeneration(job: JobRecord): Promise<void> {
  const appSettings = readAppSettings();
  const llmSettings = appSettings.llm ?? {};
  const llmProvider = (llmSettings.provider ?? "ollama").toLowerCase();
  const llmModel = llmSettings.model ?? config.ollamaModel;
  const llmBaseUrl = llmSettings.baseUrl ?? config.ollamaBaseUrl;
  const llmTimeoutMs = llmSettings.timeoutMs ?? config.ollamaTimeoutMs;

  logJobEvent("model_switch_prepare", job, {
    target: "image",
    action: "unload_tts_llm"
  });
  const unloadTasks: Promise<void>[] = [
    releaseXttsResources({
      job,
      reason: "switch_to_image",
      force: true
    })
  ];
  if (llmProvider === "ollama") {
    unloadTasks.push(
      requestOllamaUnload({
        job,
        model: llmModel,
        baseUrl: llmBaseUrl,
        timeoutMs: llmTimeoutMs,
        reason: "switch_to_image"
      })
    );
  }
  await Promise.allSettled(unloadTasks);
}

async function ensureMemoryForTtsGeneration(job: JobRecord): Promise<void> {
  const appSettings = readAppSettings();
  const llmSettings = appSettings.llm ?? {};
  const llmProvider = (llmSettings.provider ?? "ollama").toLowerCase();
  const llmModel = llmSettings.model ?? config.ollamaModel;
  const llmBaseUrl = llmSettings.baseUrl ?? config.ollamaBaseUrl;
  const llmTimeoutMs = llmSettings.timeoutMs ?? config.ollamaTimeoutMs;
  const comfyBaseUrl = getComfyBaseUrlFromSettings();
  logJobEvent("model_switch_prepare", job, {
    target: "tts",
    action: "unload_image_llm",
    base_url: comfyBaseUrl
  });
  const unloadTasks: Promise<void>[] = [
    requestComfyUnload({
      job,
      baseUrl: comfyBaseUrl,
      freeMemory: true,
      reason: "switch_to_tts"
    })
  ];
  if (llmProvider === "ollama") {
    unloadTasks.push(
      requestOllamaUnload({
        job,
        model: llmModel,
        baseUrl: llmBaseUrl,
        timeoutMs: llmTimeoutMs,
        reason: "switch_to_tts"
      })
    );
  }
  await Promise.allSettled(unloadTasks);
}

async function releaseAllGenerationModels(options: {
  reason: string;
  job?: JobRecord;
}): Promise<void> {
  const appSettings = readAppSettings();
  const llmSettings = appSettings.llm ?? {};
  const llmProvider = (llmSettings.provider ?? "ollama").toLowerCase();
  const llmModel = llmSettings.model ?? config.ollamaModel;
  const llmBaseUrl = llmSettings.baseUrl ?? config.ollamaBaseUrl;
  const llmTimeoutMs = llmSettings.timeoutMs ?? config.ollamaTimeoutMs;

  const unloadTasks: Promise<void>[] = [
    releaseXttsResources({
      job: options.job,
      reason: options.reason,
      force: true
    }),
    requestComfyUnload({
      job: options.job,
      baseUrl: getComfyBaseUrlFromSettings(),
      freeMemory: true,
      reason: options.reason
    })
  ];
  if (llmProvider === "ollama") {
    unloadTasks.push(
      requestOllamaUnload({
        job: options.job,
        model: llmModel,
        baseUrl: llmBaseUrl,
        timeoutMs: llmTimeoutMs,
        reason: options.reason
      })
    );
  }
  await Promise.allSettled([
    ...unloadTasks
  ]);
}

function markGenerationActivity(model: "tts" | "image", job: JobRecord): void {
  lastAssetGenerationAt = Date.now();
  didIdleUnloadAfterLastAsset = false;
  logJobEvent("model_activity", job, {
    model,
    ts_ms: lastAssetGenerationAt
  });
}

async function executeWithOomRetry<T>(options: {
  job: JobRecord;
  domain: "tts" | "image";
  operation: () => Promise<T>;
}): Promise<T> {
  try {
    return await options.operation();
  } catch (err) {
    if (!isLikelyOutOfMemoryError(err)) {
      throw err;
    }
    logJobEvent("generation_oom_detected", options.job, {
      domain: options.domain,
      error: serializeError(err)
    });
    await releaseAllGenerationModels({
      reason: `${options.domain}_oom_retry`,
      job: options.job
    });
    logJobEvent("generation_oom_retry", options.job, { domain: options.domain });
    return options.operation();
  }
}

async function generateBlockMeta(options: {
  job: JobRecord;
  block: BlockDraft;
  index: number;
  total: number;
  prevText?: string;
  nextText?: string;
  model: string;
  keepAlive?: string | number;
  releaseAfter?: boolean;
}): Promise<{ meta: BlockMeta; ms: number }> {
  const { job, block, index, total, prevText, nextText, model } = options;
  const appSettings = readAppSettings();
  const llmSettings = appSettings.llm ?? {};
  const baseUrl = llmSettings.baseUrl ?? config.ollamaBaseUrl;
  const timeoutMs = llmSettings.timeoutMs ?? config.ollamaTimeoutMs;
  const prompt = buildBlockMetaPrompt({
    index,
    total,
    sourceText: block.sourceText,
    prevText,
    nextText
  });
  const startedAt = Date.now();
  logJobEvent("segment_block_meta_started", job, {
    block_index: block.index,
    model,
    base_url: baseUrl,
    timeout_ms: timeoutMs,
    chars: prompt.length,
    keep_alive: options.keepAlive ?? null
  });
  logWorkerAction("segment_block_llm_request_started", {
    job_id: job.id,
    block_index: block.index,
    model,
    base_url: baseUrl,
    timeout_ms: timeoutMs,
    chars: prompt.length
  });
  let content: string;
  let generationSucceeded = false;
  let unloadedOnTimeout = false;
  try {
    content = await ollamaChat({
      baseUrl,
      model,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      format: "json",
      temperature: 0.2,
      timeoutMs,
      keepAlive: options.keepAlive
    });
    logWorkerAction("segment_block_llm_request_completed", {
      job_id: job.id,
      block_index: block.index,
      model,
      base_url: baseUrl,
      duration_ms: Date.now() - startedAt,
      response_chars: content.length
    });
  } catch (err) {
    logWorkerAction("segment_block_llm_request_failed", {
      job_id: job.id,
      block_index: block.index,
      model,
      base_url: baseUrl,
      duration_ms: Date.now() - startedAt,
      error: serializeError(err)
    });
    if (isLikelyTimeoutError(err)) {
      await requestOllamaUnload({
        job,
        model,
        baseUrl,
        timeoutMs,
        reason: "timeout"
      });
      unloadedOnTimeout = true;
    }
    throw err;
  }
  try {
    const meta = normalizeBlockMetaResponse(content, block.sourceText, block.index);
    logJobEvent("segment_block_meta_completed", job, {
      block_index: block.index,
      duration_ms: Date.now() - startedAt
    });
    generationSucceeded = true;
    return {
      meta,
      ms: Date.now() - startedAt
    };
  } catch (err) {
    const preview = content.length > 400 ? `${content.slice(0, 400)}...` : content;
    logJobEvent("segment_block_meta_invalid", job, {
      block_index: block.index,
      error: serializeError(err),
      raw_len: content.length,
      raw_preview: preview
    });
    throw err;
  } finally {
    if (options.releaseAfter && !unloadedOnTimeout) {
      await requestOllamaUnload({
        job,
        model,
        baseUrl,
        timeoutMs,
        reason: generationSucceeded ? "completed" : "failed"
      });
    }
  }
}

async function generateBlocksForVersion(options: {
  job: JobRecord;
  versionId: string;
  scriptText: string;
  speechRateWps: number;
  model: string;
}): Promise<{ total: number; failed: number[] }> {
  const { job, versionId, scriptText, speechRateWps, model } = options;
  const versionScope = await prisma.lessonVersion.findUnique({
    where: { id: versionId },
    select: { workspaceId: true }
  });
  if (!versionScope) {
    throw new Error("lesson version not found");
  }
  const appSettings = readAppSettings();
  const drafts = buildDeterministicBlocks(scriptText, speechRateWps);
  await prisma.job.deleteMany({ where: { block: { lessonVersionId: versionId } } });
  const assets = await prisma.asset.findMany({ where: { block: { lessonVersionId: versionId } } });
  for (const asset of assets) {
    if (asset.path && fs.existsSync(asset.path)) {
      await fs.promises.unlink(asset.path).catch(() => null);
    }
  }
  await prisma.asset.deleteMany({ where: { block: { lessonVersionId: versionId } } });
  const existingBlocks = await prisma.block.findMany({
    where: { lessonVersionId: versionId },
    orderBy: [{ index: "asc" }, { createdAt: "asc" }]
  });
  const draftIndexes = new Set(drafts.map((draft) => draft.index));
  const blockIdsByIndex = new Map<number, string[]>();
  existingBlocks.forEach((block) => {
    const list = blockIdsByIndex.get(block.index) ?? [];
    list.push(block.id);
    blockIdsByIndex.set(block.index, list);
  });
  const duplicateBlockIdsToDelete: string[] = [];
  blockIdsByIndex.forEach((ids) => {
    if (ids.length > 1) {
      duplicateBlockIdsToDelete.push(...ids.slice(1));
    }
  });
  if (duplicateBlockIdsToDelete.length > 0) {
    await prisma.block.deleteMany({ where: { id: { in: duplicateBlockIdsToDelete } } });
  }
  const staleBlocksToDelete = existingBlocks
    .filter((block) => !draftIndexes.has(block.index))
    .map((block) => block.id)
    .filter((id) => !duplicateBlockIdsToDelete.includes(id));
  if (staleBlocksToDelete.length > 0) {
    await prisma.block.deleteMany({ where: { id: { in: staleBlocksToDelete } } });
  }

  const failed: number[] = [];
  for (let i = 0; i < drafts.length; i += 1) {
      await assertLeaseValid(job.id);
      const draft = drafts[i];
      const prevText = drafts[i - 1]?.sourceText;
      const nextText = drafts[i + 1]?.sourceText;
      const keepAlive = i === drafts.length - 1 ? 0 : undefined;
      try {
        const result = await generateBlockMeta({
          job,
          block: draft,
          index: draft.index,
          total: drafts.length,
          prevText,
          nextText,
          model,
          keepAlive
        });
        const created = await prisma.block.findFirst({
          where: { lessonVersionId: versionId, index: draft.index },
          select: { id: true, index: true }
        });
        const payload = {
          sourceText: draft.sourceText,
          ttsText: sanitizeNarratedScriptText(draft.sourceText),
          wordCount: draft.wordCount,
          durationEstimateS: draft.durationEstimateS,
          onScreenJson: null,
          imagePromptJson: JSON.stringify(result.meta.imagePrompt),
          segmentMs: Math.round(result.ms),
          segmentError: null,
          status: "segmentation_done"
        };
        const saved = created
          ? await prisma.block.update({
              where: { id: created.id },
              data: payload
            })
          : await prisma.block.create({
              data: {
                workspaceId: versionScope.workspaceId,
                lessonVersionId: versionId,
                index: draft.index,
                ...payload
              }
            });
        logJobEvent("segment_block_saved", job, {
          block_index: saved.index,
          duration_ms: result.ms
        });
      } catch (err) {
        const created = await prisma.block.findFirst({
          where: { lessonVersionId: versionId, index: draft.index },
          select: { id: true, index: true }
        });
        const payload = {
          sourceText: draft.sourceText,
          ttsText: sanitizeNarratedScriptText(draft.sourceText),
          wordCount: draft.wordCount,
          durationEstimateS: draft.durationEstimateS,
          segmentError: serializeError(err),
          onScreenJson: null,
          imagePromptJson: null,
          segmentMs: null,
          status: "segment_error"
        };
        const failedBlock = created
          ? await prisma.block.update({
              where: { id: created.id },
              data: payload
            })
          : await prisma.block.create({
              data: {
                workspaceId: versionScope.workspaceId,
                lessonVersionId: versionId,
                index: draft.index,
                ...payload
              }
            });
        failed.push(draft.index);
        logJobEvent("segment_block_failed", job, {
          block_index: failedBlock.index,
          error: serializeError(err)
        });
      }
    }

  if (failed.length > 0) {
    logJobEvent("segment_retry_start", job, { failed_blocks: failed.length });
    for (let retryIndex = 0; retryIndex < failed.length; retryIndex += 1) {
        const index = failed[retryIndex];
        await assertLeaseValid(job.id);
        const draft = drafts[index - 1];
        if (!draft) continue;
        const prevText = drafts[index - 2]?.sourceText;
        const nextText = drafts[index]?.sourceText;
        try {
          const keepAlive = retryIndex === failed.length - 1 ? 0 : undefined;
          const result = await generateBlockMeta({
            job,
            block: draft,
            index: draft.index,
            total: drafts.length,
            prevText,
            nextText,
            model,
            keepAlive
          });
          await prisma.block.updateMany({
            where: { lessonVersionId: versionId, index: draft.index },
            data: {
              onScreenJson: null,
              imagePromptJson: JSON.stringify(result.meta.imagePrompt),
              segmentMs: Math.round(result.ms),
              segmentError: null,
              status: "segmentation_done"
            }
          });
          logJobEvent("segment_block_retry_saved", job, {
            block_index: draft.index,
            duration_ms: result.ms
          });
        } catch (err) {
          await prisma.block.updateMany({
            where: { lessonVersionId: versionId, index: draft.index },
            data: {
              segmentError: serializeError(err),
              status: "segment_error"
            }
          });
          logJobEvent("segment_block_retry_failed", job, {
            block_index: draft.index,
            error: serializeError(err)
          });
        }
    }
    logJobEvent("segment_retry_done", job, { failed_blocks: failed.length });
  }

  return { total: drafts.length, failed };
}

async function generateQwenAudioForBlocks(options: {
  job: JobRecord;
  blocks: Array<{
    id: string;
    index: number;
    ttsText: string;
    lessonVersionId: string;
    workspaceId: string;
  }>;
  courseId: string;
  moduleId: string;
  lessonId: string;
  versionId: string;
}): Promise<void> {
  const { job, blocks, courseId, moduleId, lessonId, versionId } = options;
  const items: { id: string; text: string; outputPath: string; index: number; workspaceId: string }[] = [];

  for (const block of blocks) {
    const ttsText = block.ttsText?.trim();
    if (!ttsText) continue;
    const audioDir = blockAudioDir(courseId, moduleId, lessonId, versionId, block.index);
    ensureDir(audioDir);
    const outputPath = path.join(audioDir, "audio.wav");
    items.push({ id: block.id, text: ttsText, outputPath, index: block.index, workspaceId: block.workspaceId });
  }

  if (items.length === 0) {
    throw new Error("no tts items to generate");
  }
  await clearAudioAssetsForBlocks(blocks.map((block) => block.id));
  await notifyRunningPhase(job, "cleanup");

  logJobEvent("tts_started", job, {
    provider: "qwen",
    model: config.qwenTtsModel,
    task: config.qwenTtsTask,
    speaker: config.qwenTtsSpeaker,
    language: config.qwenTtsLanguage,
    block_count: items.length
  });
  await notifyRunningPhase(job, "generation");

  const results = await runQwenTtsBatch(items);
  const resultsById = new Map(results.map((result) => [String(result.id ?? ""), result]));
  const resultsByPath = new Map(results.map((result) => [result.output_path, result]));

  for (const item of items) {
    await assertLeaseValid(job.id);
    const result = resultsById.get(item.id) ?? resultsByPath.get(item.outputPath);
    if (!result) {
      throw new Error(`missing tts result for block ${item.index}`);
    }

    const duration =
      (await probeAudioDuration(result.output_path)) ??
      (typeof result.duration_s === "number" ? Number(result.duration_s.toFixed(3)) : null);

    const previousAssets = await prisma.asset.findMany({
      where: { blockId: item.id, kind: "audio_raw" }
    });
    await prisma.asset.deleteMany({ where: { blockId: item.id, kind: "audio_raw" } });
    for (const asset of previousAssets) {
      if (asset.path && asset.path !== result.output_path && fs.existsSync(asset.path)) {
        await fs.promises.unlink(asset.path).catch(() => null);
      }
    }

    await prisma.asset.create({
      data: {
        workspaceId: item.workspaceId,
        blockId: item.id,
        kind: "audio_raw",
        path: result.output_path,
        metaJson: JSON.stringify({
          provider: "qwen",
          model: config.qwenTtsModel,
          task: config.qwenTtsTask,
          speaker: config.qwenTtsSpeaker,
          language: config.qwenTtsLanguage,
          instruct: config.qwenTtsInstruct || null,
          duration_s: duration
        })
      }
    });
    await prisma.block.update({
      where: { id: item.id },
      data: {
        audioDurationS: duration ?? null
      }
    });
    logJobEvent("tts_block_saved", job, {
      block_index: item.index,
      duration_s: duration ?? null,
      path: result.output_path
    });
  }

  logJobEvent("tts_completed", job, { block_count: items.length });
}

async function generateChatterboxAudioForBlocks(options: {
  job: JobRecord;
  blocks: Array<{
    id: string;
    index: number;
    ttsText: string;
    lessonVersionId: string;
    workspaceId: string;
  }>;
  courseId: string;
  moduleId: string;
  lessonId: string;
  versionId: string;
}): Promise<void> {
  const { job, blocks, courseId, moduleId, lessonId, versionId } = options;
  const items: { id: string; text: string; outputPath: string; index: number; workspaceId: string }[] = [];

  for (const block of blocks) {
    const ttsText = block.ttsText?.trim();
    if (!ttsText) continue;
    const audioDir = blockAudioDir(courseId, moduleId, lessonId, versionId, block.index);
    ensureDir(audioDir);
    const outputPath = path.join(audioDir, "audio.wav");
    items.push({ id: block.id, text: ttsText, outputPath, index: block.index, workspaceId: block.workspaceId });
  }

  if (items.length === 0) {
    throw new Error("no tts items to generate");
  }

  await clearAudioAssetsForBlocks(blocks.map((block) => block.id));
  await notifyRunningPhase(job, "cleanup");

  const settings = loadTtsSettings();
  const appSettings = readAppSettings();
  const jobMeta = parseJobMeta(job.metaJson);
  const voiceId =
    jobMeta?.tts?.voiceId?.trim() ||
    settings.voiceId ||
    appSettings.tts?.defaultVoiceId?.trim() ||
    config.chatterboxVoiceId;
  const languageId =
    jobMeta?.tts?.language?.trim() ||
    settings.language ||
    appSettings.tts?.language?.trim() ||
    config.chatterboxLanguage;
  const index = loadVoiceIndex(config.ttsVoicesIndex);
  const voice = findVoiceById(index, voiceId);
  if (!voice) {
    throw new Error(`voice not found: ${voiceId}`);
  }
  const voicePath = resolveVoicePath(config.ttsVoicesDir, voice.file);
  if (!fs.existsSync(voicePath)) {
    throw new Error(`voice file not found: ${voicePath}`);
  }

  logJobEvent("tts_started", job, {
    provider: "chatterbox",
    voice_id: voiceId,
    language: languageId,
    block_count: items.length
  });
  await notifyRunningPhase(job, "generation");

  const itemsById = new Map(items.map((item) => [item.id, item]));
  const itemsByPath = new Map(items.map((item) => [item.outputPath, item]));
  const processed = new Set<string>();
  let pending: Promise<void> = Promise.resolve();
  let pendingError: unknown = null;

  const persistResult = async (result: ChatterboxTtsResult) => {
    const item =
      (result.id ? itemsById.get(String(result.id)) : undefined) ??
      itemsByPath.get(result.output_path);
    if (!item) {
      throw new Error("tts result missing item mapping");
    }
    if (processed.has(item.id)) return;
    processed.add(item.id);
    await assertLeaseValid(job.id);
    const duration =
      (await probeAudioDuration(result.output_path)) ??
      (typeof result.duration_s === "number" ? Number(result.duration_s.toFixed(3)) : null);

    const previousAssets = await prisma.asset.findMany({
      where: { blockId: item.id, kind: "audio_raw" }
    });
    await prisma.asset.deleteMany({ where: { blockId: item.id, kind: "audio_raw" } });
    for (const asset of previousAssets) {
      if (asset.path && asset.path !== result.output_path && fs.existsSync(asset.path)) {
        await fs.promises.unlink(asset.path).catch(() => null);
      }
    }

    await prisma.asset.create({
      data: {
        workspaceId: item.workspaceId,
        blockId: item.id,
        kind: "audio_raw",
        path: result.output_path,
        metaJson: JSON.stringify({
          provider: "chatterbox",
          voice_id: voiceId,
          voice_file: voice.file,
          language: languageId,
          duration_s: duration
        })
      }
    });
    await prisma.block.update({
      where: { id: item.id },
      data: {
        audioDurationS: duration ?? null
      }
    });
    logJobEvent("tts_block_saved", job, {
      block_index: item.index,
      duration_s: duration ?? null,
      path: result.output_path
    });
  };

  const results = await runChatterboxTtsBatch({
    items,
    voicePath,
    languageId,
    onResult: (result) => {
      pending = pending
        .then(async () => {
          if (pendingError) return;
          await persistResult(result);
        })
        .catch((err) => {
          if (!pendingError) {
            pendingError = err;
          }
        });
    }
  });

  await pending;
  if (pendingError) {
    throw pendingError;
  }

  for (const result of results) {
    if (result.id && processed.has(String(result.id))) continue;
    await persistResult(result);
  }

  logJobEvent("tts_completed", job, { block_count: items.length });
}

async function generateXttsAudioForBlocks(options: {
  job: JobRecord;
  blocks: Array<{
    id: string;
    index: number;
    ttsText: string;
    lessonVersionId: string;
    workspaceId: string;
  }>;
  courseId: string;
  moduleId: string;
  lessonId: string;
  versionId: string;
}): Promise<void> {
  const { job, blocks, courseId, moduleId, lessonId, versionId } = options;
  const items: { id: string; text: string; outputPath: string; index: number; workspaceId: string }[] = [];

  for (const block of blocks) {
    const ttsText = block.ttsText?.trim();
    if (!ttsText) continue;
    const audioDir = blockAudioDir(courseId, moduleId, lessonId, versionId, block.index);
    ensureDir(audioDir);
    const outputPath = path.join(audioDir, "audio.wav");
    items.push({ id: block.id, text: ttsText, outputPath, index: block.index, workspaceId: block.workspaceId });
  }

  if (items.length === 0) {
    throw new Error("no tts items to generate");
  }

  await clearAudioAssetsForBlocks(blocks.map((block) => block.id));
  await notifyRunningPhase(job, "cleanup");

  const settings = loadTtsSettings();
  const appSettings = readAppSettings();
  const jobMeta = parseJobMeta(job.metaJson);
  const voiceId =
    jobMeta?.tts?.voiceId?.trim() ||
    settings.voiceId ||
    appSettings.tts?.defaultVoiceId?.trim() ||
    config.xttsVoiceId;
  const languageId =
    jobMeta?.tts?.language?.trim() ||
    settings.language ||
    appSettings.tts?.language?.trim() ||
    config.xttsLanguage;
  const speakerRef = resolveXttsSpeakerRef(voiceId);

  logJobEvent("tts_started", job, {
    provider: "xtts",
    base_url: config.xttsApiBaseUrl,
    voice_id: voiceId,
    language: languageId,
    block_count: items.length
  });
  await notifyRunningPhase(job, "generation");

  const itemsById = new Map(items.map((item) => [item.id, item]));
  const itemsByPath = new Map(items.map((item) => [item.outputPath, item]));
  const processed = new Set<string>();

  const persistResult = async (result: XttsApiResult) => {
    const item =
      (result.id ? itemsById.get(String(result.id)) : undefined) ??
      itemsByPath.get(result.output_path);
    if (!item) {
      throw new Error("tts result missing item mapping");
    }
    if (processed.has(item.id)) return;
    processed.add(item.id);
    await assertLeaseValid(job.id);

    const duration =
      (await probeAudioDuration(result.output_path)) ??
      (typeof result.duration_s === "number" ? Number(result.duration_s.toFixed(3)) : null);

    const previousAssets = await prisma.asset.findMany({
      where: { blockId: item.id, kind: "audio_raw" }
    });
    await prisma.asset.deleteMany({ where: { blockId: item.id, kind: "audio_raw" } });
    for (const asset of previousAssets) {
      if (asset.path && asset.path !== result.output_path && fs.existsSync(asset.path)) {
        await fs.promises.unlink(asset.path).catch(() => null);
      }
    }

    await prisma.asset.create({
      data: {
        workspaceId: item.workspaceId,
        blockId: item.id,
        kind: "audio_raw",
        path: result.output_path,
        metaJson: JSON.stringify({
          provider: "xtts",
          base_url: config.xttsApiBaseUrl,
          voice_id: voiceId,
          language: languageId,
          duration_s: duration
        })
      }
    });
    await prisma.block.update({
      where: { id: item.id },
      data: {
        audioDurationS: duration ?? null
      }
    });
    logJobEvent("tts_block_saved", job, {
      block_index: item.index,
      duration_s: duration ?? null,
      path: result.output_path
    });
  };

  const results = await runXttsApiTtsBatch({
    items,
    speakerRef,
    languageId,
    beforeItem: async () => {
      await assertLeaseValid(job.id);
    },
    onResult: async (result) => {
      await persistResult(result);
    }
  });

  for (const result of results) {
    if (result.id && processed.has(String(result.id))) continue;
    await persistResult(result);
  }

  logJobEvent("tts_completed", job, { block_count: items.length });
}

async function generateComfyImagesForBlocks(options: {
  job: JobRecord;
  blocks: Array<{
    id: string;
    index: number;
    onScreenJson: string | null;
    imagePromptJson: string | null;
    workspaceId: string;
  }>;
  courseId: string;
  moduleId: string;
  lessonId: string;
  versionId: string;
  template: SlideTemplateRecord | null;
}): Promise<void> {
  const { job, blocks, courseId, moduleId, lessonId, versionId, template } = options;
  if (blocks.length === 0) {
    throw new Error("no image items to generate");
  }

  const batchTimer = startActionTimer("image_batch", {
    job_id: job.id,
    block_count: blocks.length
  });
  logSystemMetrics("system_metrics_batch_start", {
    job_id: job.id,
    block_count: blocks.length
  });
  logWorkerAction("image_batch_cleanup_started", {
    job_id: job.id,
    block_count: blocks.length
  });
  await clearImageAssetsForBlocks(blocks.map((block) => block.id));
  await notifyRunningPhase(job, "cleanup");
  logWorkerAction("image_batch_cleanup_completed", {
    job_id: job.id,
    block_count: blocks.length
  });
  logJobEvent("image_generation_started", job, {
    provider: "comfyui",
    base_url: config.comfyuiBaseUrl,
    block_count: blocks.length
  });
  await notifyRunningPhase(job, "generation");

  const appSettings = readAppSettings();
  const masterPrompt = appSettings.comfy?.masterPrompt;

  try {
    for (const block of blocks) {
      await assertLeaseValid(job.id);
      const promptMeta = parseImagePromptJson(block.imagePromptJson);
      const blockPrompt = promptMeta?.block_prompt?.trim();
      if (!blockPrompt) {
        throw new Error(`block ${block.index} missing image prompt`);
      }
      const prompt = buildComfyPrompt(masterPrompt, blockPrompt);
      const seedValue = promptMeta?.seed;
      const seed = Number.isFinite(seedValue)
        ? Math.trunc(seedValue as number)
        : Math.floor(Math.random() * 1e15);

      const blockTimer = startActionTimer("image_block", {
        job_id: job.id,
        block_index: block.index,
        seed
      });
      let result: { buffer: Buffer; filename: string };
      try {
        result = await runComfyImageGeneration({
          prompt,
          seed,
          clientId: job.clientId
        });
      } catch (err) {
        if (isLikelyOutOfMemoryError(err)) {
          logJobEvent("image_block_oom_detected", job, {
            block_index: block.index,
            error: serializeError(err)
          });
          await releaseAllGenerationModels({
            reason: "image_block_oom_retry",
            job
          });
          result = await runComfyImageGeneration({
            prompt,
            seed,
            clientId: job.clientId
          });
        } else if (isLikelyTimeoutError(err)) {
          await requestComfyUnload({
            job,
            baseUrl: getComfyBaseUrlFromSettings(),
            freeMemory: true,
            reason: "timeout"
          });
          throw err;
        } else {
          throw err;
        }
      }
      blockTimer();

      const ext = path.extname(result.filename) || ".png";
      const imageDir = blockImageRawDir(courseId, moduleId, lessonId, versionId, block.index);
      ensureDir(imageDir);
      const outputPath = path.join(imageDir, `image${ext}`);
      logWorkerAction("image_block_write_started", {
        job_id: job.id,
        block_index: block.index,
        path: outputPath
      });
      await fs.promises.writeFile(outputPath, result.buffer);
      logWorkerAction("image_block_write_completed", {
        job_id: job.id,
        block_index: block.index,
        path: outputPath
      });

      await prisma.asset.create({
        data: {
          workspaceId: block.workspaceId,
          blockId: block.id,
          kind: "image_raw",
          path: outputPath,
          metaJson: JSON.stringify({
            provider: "comfyui",
            workflow: "vantage-z-image-turbo-api",
            prompt,
            seed,
            source_filename: result.filename
          })
        }
      });

      logJobEvent("image_block_saved", job, {
        block_index: block.index,
        path: outputPath,
        seed,
        prompt_chars: prompt.length
      });

      // Slides are disabled in MVP: image generation persists only `image_raw`.
    }

    logJobEvent("image_generation_completed", job, { block_count: blocks.length });
  } finally {
    logSystemMetrics("system_metrics_batch_end", {
      job_id: job.id,
      block_count: blocks.length
    });
    batchTimer();
  }
}

async function runJob(job: JobRecord): Promise<void> {
  switch (job.type) {
    case "segment": {
      if (!job.lessonVersionId) {
        throw new Error("segment job missing lessonVersionId");
      }
      await assertLeaseValid(job.id);
      const version = await prisma.lessonVersion.findUnique({
        where: { id: job.lessonVersionId }
      });
      if (!version) {
        throw new Error("lesson version not found");
      }
      const appSettings = readAppSettings();
      const model = appSettings.llm?.model ?? config.ollamaModel;
      const baseUrl = appSettings.llm?.baseUrl ?? config.ollamaBaseUrl;
      const health = await ollamaHealth(baseUrl);
      if (!health.ok) {
        throw new Error(`Ollama unreachable at ${baseUrl}`);
      }
      if (!health.models.includes(model)) {
        throw new Error(
          `Ollama model '${model}' is not available at ${baseUrl}. Available: ${health.models.join(", ")}`
        );
      }
      const existingBlocks = await prisma.block.findMany({
        where: { lessonVersionId: version.id },
        select: { id: true }
      });
      if (existingBlocks.length > 0) {
        await clearImageAssetsForBlocks(existingBlocks.map((block) => block.id));
      }
      await clearFinalVideoAssetsForVersion(version.id, {
        reason: "segment_lesson_regeneration",
        job
      });
      await notifyRunningPhase(job, "generation");
      logJobEvent("segment_started", job, {
        model,
        base_url: baseUrl,
        timeout_ms: appSettings.llm?.timeoutMs ?? config.ollamaTimeoutMs
      });
      logWorkerAction("segment_llm_preflight_ok", {
        job_id: job.id,
        model,
        base_url: baseUrl,
        models_count: health.models.length
      });
      const result = await generateBlocksForVersion({
        job,
        versionId: version.id,
        scriptText: version.scriptText,
        speechRateWps: version.speechRateWps,
        model
      });
      logJobEvent("segment_completed", job, {
        block_count: result.total,
        failed_blocks: result.failed.length
      });

      return;
    }
    case "render_slide": {
      throw new Error("slides_disabled_in_mvp");
      return;
    }
    case "render_slide_text": {
      throw new Error("slides_disabled_in_mvp");
      return;
    }
    case "render_slide_image": {
      throw new Error("slides_disabled_in_mvp");
      return;
    }
    case "segment_block": {
      if (!job.lessonVersionId || !job.blockId) {
        throw new Error("segment_block job missing lessonVersionId or blockId");
      }
      await assertLeaseValid(job.id);
      const version = await prisma.lessonVersion.findUnique({
        where: { id: job.lessonVersionId }
      });
      if (!version) {
        throw new Error("lesson version not found");
      }
      const block = await prisma.block.findUnique({
        where: { id: job.blockId }
      });
      if (!block) {
        throw new Error("block not found");
      }
      await clearImageAssetsForBlocks([block.id]);
      await clearFinalVideoAssetsForVersion(block.lessonVersionId, {
        reason: "segment_block_regeneration",
        job
      });
      await notifyRunningPhase(job, "generation");
      const drafts = buildDeterministicBlocks(version.scriptText, version.speechRateWps);
      const draft = drafts[block.index - 1];
      if (!draft) {
        throw new Error("block index not found in drafts");
      }
      const prevText = drafts[block.index - 2]?.sourceText;
      const nextText = drafts[block.index]?.sourceText;
      const appSettings = readAppSettings();
      const result = await generateBlockMeta({
        job,
        block: draft,
        index: draft.index,
        total: drafts.length,
        prevText,
        nextText,
        model: appSettings.llm?.model ?? config.ollamaModel,
        releaseAfter: false
      });
      await prisma.block.update({
        where: { id: block.id },
        data: {
          onScreenJson: null,
          imagePromptJson: JSON.stringify(result.meta.imagePrompt),
          segmentMs: Math.round(result.ms),
          segmentError: null,
          status: "segmentation_done"
        }
      });
      logJobEvent("segment_block_manual_saved", job, {
        block_index: draft.index,
        duration_ms: result.ms
      });
      return;
    }
    case "image": {
      if (!job.lessonVersionId && !job.blockId) {
        throw new Error("image job missing lessonVersionId or blockId");
      }
      await assertLeaseValid(job.id);
      const slideTemplate = await resolveTemplateForImageJob(job);
      if (job.blockId) {
        const block = await resolveBlockContext(job.blockId);
        if (!block?.lessonVersion?.lesson?.module?.course) {
          throw new Error("block context not found");
        }
        const promptMeta = parseImagePromptJson(block.imagePromptJson);
        const hasPrompt = Boolean(promptMeta?.block_prompt?.trim());
        if (!hasPrompt) {
          logJobEvent("image_generation_skipped", job, {
            reason: "missing_image_prompt",
            scope: "block",
            block_id: block.id,
            block_index: block.index
          });
          return;
        }
        await clearFinalVideoAssetsForVersion(block.lessonVersion.id, {
          reason: "image_block_regeneration",
          job
        });
        await ensureMemoryForImageGeneration(job);
        await executeWithOomRetry({
          job,
          domain: "image",
          operation: () =>
            generateComfyImagesForBlocks({
              job,
              blocks: [
                {
                  id: block.id,
                  index: block.index,
                  onScreenJson: block.onScreenJson,
                  imagePromptJson: block.imagePromptJson,
                  workspaceId: block.workspaceId
                }
              ],
              courseId: block.lessonVersion.lesson.module.course.id,
              moduleId: block.lessonVersion.lesson.module.id,
              lessonId: block.lessonVersion.lesson.id,
              versionId: block.lessonVersion.id,
              template: slideTemplate
            })
        });
        markGenerationActivity("image", job);
        return;
      }
      if (!job.lessonVersionId) {
        throw new Error("image job missing lessonVersionId");
      }
      const version = await prisma.lessonVersion.findUnique({
        where: { id: job.lessonVersionId },
        include: {
          lesson: {
            include: {
              module: {
                include: {
                  course: true
                }
              }
            }
          },
          blocks: { orderBy: { index: "asc" } }
        }
      });
      if (!version?.lesson?.module?.course) {
        throw new Error("lesson version not found");
      }
      const blocksWithPrompt = version.blocks.filter((block) =>
        Boolean(parseImagePromptJson(block.imagePromptJson)?.block_prompt?.trim())
      );
      if (blocksWithPrompt.length === 0) {
        logJobEvent("image_generation_skipped", job, {
          reason: "missing_image_prompt",
          scope: "lesson",
          lesson_version_id: version.id,
          total_blocks: version.blocks.length
        });
        return;
      }
      await clearFinalVideoAssetsForVersion(version.id, {
        reason: "image_lesson_regeneration",
        job
      });
      await ensureMemoryForImageGeneration(job);
      await executeWithOomRetry({
        job,
        domain: "image",
        operation: () =>
          generateComfyImagesForBlocks({
            job,
            blocks: blocksWithPrompt.map((block) => ({
              id: block.id,
              index: block.index,
              onScreenJson: block.onScreenJson,
              imagePromptJson: block.imagePromptJson,
              workspaceId: block.workspaceId
            })),
            courseId: version.lesson.module.course.id,
            moduleId: version.lesson.module.id,
            lessonId: version.lesson.id,
            versionId: version.id,
            template: slideTemplate
          })
      });
      markGenerationActivity("image", job);
      return;
    }
    case "tts": {
      if (!job.lessonVersionId && !job.blockId) {
        throw new Error("tts job missing lessonVersionId or blockId");
      }
      await assertLeaseValid(job.id);
      const provider = config.ttsProvider.toLowerCase();
      const generateForBlocks =
        provider === "chatterbox"
          ? generateChatterboxAudioForBlocks
          : provider === "qwen"
          ? generateQwenAudioForBlocks
          : provider === "xtts" || provider === "xtts_api"
          ? generateXttsAudioForBlocks
          : null;
      if (!generateForBlocks) {
        throw new Error(`unsupported tts provider: ${provider}`);
      }
      if (job.blockId) {
        const block = await resolveBlockContext(job.blockId);
        if (!block?.lessonVersion?.lesson?.module?.course) {
          throw new Error("block context not found");
        }
        if (!block.ttsText?.trim()) {
          logJobEvent("tts_generation_skipped", job, {
            reason: "missing_tts_text",
            scope: "block",
            block_id: block.id,
            block_index: block.index
          });
          return;
        }
        await clearFinalVideoAssetsForVersion(block.lessonVersion.id, {
          reason: "tts_block_regeneration",
          job
        });
        await ensureMemoryForTtsGeneration(job);
        await clearAudioAssetsForBlocks([block.id]);
        await executeWithOomRetry({
          job,
          domain: "tts",
          operation: () =>
            generateForBlocks({
              job,
              blocks: [
                {
                  id: block.id,
                  index: block.index,
                  ttsText: block.ttsText,
                  lessonVersionId: block.lessonVersionId,
                  workspaceId: block.workspaceId
                }
              ],
              courseId: block.lessonVersion.lesson.module.course.id,
              moduleId: block.lessonVersion.lesson.module.id,
              lessonId: block.lessonVersion.lesson.id,
              versionId: block.lessonVersion.id
            })
        });
        markGenerationActivity("tts", job);
        return;
      }
      if (!job.lessonVersionId) {
        throw new Error("tts job missing lessonVersionId");
      }
      const version = await prisma.lessonVersion.findUnique({
        where: { id: job.lessonVersionId },
        include: {
          lesson: {
            include: {
              module: {
                include: {
                  course: true
                }
              }
            }
          },
          blocks: { orderBy: { index: "asc" } }
        }
      });
      if (!version?.lesson?.module?.course) {
        throw new Error("lesson version not found");
      }
      const blocksWithText = version.blocks.filter((block) => Boolean(block.ttsText?.trim()));
      if (blocksWithText.length === 0) {
        logJobEvent("tts_generation_skipped", job, {
          reason: "missing_tts_text",
          scope: "lesson",
          lesson_version_id: version.id,
          total_blocks: version.blocks.length
        });
        return;
      }
      await clearFinalVideoAssetsForVersion(version.id, {
        reason: "tts_lesson_regeneration",
        job
      });
      await ensureMemoryForTtsGeneration(job);
      await clearAudioAssetsForBlocks(blocksWithText.map((block) => block.id));
      await executeWithOomRetry({
        job,
        domain: "tts",
        operation: () =>
          generateForBlocks({
            job,
            blocks: blocksWithText.map((block) => ({
              id: block.id,
              index: block.index,
              ttsText: block.ttsText,
              lessonVersionId: block.lessonVersionId,
              workspaceId: block.workspaceId
            })),
            courseId: version.lesson.module.course.id,
            moduleId: version.lesson.module.id,
            lessonId: version.lesson.id,
            versionId: version.id
          })
      });
      markGenerationActivity("tts", job);
      return;
    }
    case "concat_video": {
      await renderFinalVideoForVersion({ job });
      return;
    }
    default:
      throw new Error(`No handler for job type: ${job.type}`);
  }
}

async function processJob(job: JobRecord): Promise<void> {
  await ensureJobCorrelationId(job);
  logJobEvent("job_started", job);
  if (job.attempts > MAX_ATTEMPTS) {
    await prisma.job.update({
      where: { id: job.id },
      data: { status: "failed", error: "max attempts exceeded" }
    });
    logJobEvent("job_failed", job, { duration_ms: 0, error: "max attempts exceeded" });
    return;
  }
  const leaseMs = Number(process.env.JOB_LEASE_MS ?? 30000);
  const leaseHeartbeatMs = Number(process.env.JOB_LEASE_HEARTBEAT_MS ?? 10000);
  const shouldHeartbeatLease =
    Number.isFinite(leaseHeartbeatMs) && leaseHeartbeatMs > 0 && Number.isFinite(leaseMs) && leaseMs > 0;
  const leaseTimer =
    shouldHeartbeatLease
      ? setInterval(async () => {
          try {
            const leaseExpiresAt = new Date(Date.now() + leaseMs);
            const updated = await prisma.job.updateMany({
              where: { id: job.id, status: "running" },
              data: { leaseExpiresAt }
            });
            if (updated.count === 0 && leaseTimer) {
              clearInterval(leaseTimer);
            }
          } catch (err) {
            console.error(
              JSON.stringify({
                event: "job_lease_heartbeat_failed",
                job_id: job.id,
                error: serializeError(err)
              })
            );
          }
        }, leaseHeartbeatMs)
      : null;
  leaseTimer?.unref?.();
  const startedAt = Date.now();
  try {
    await runJob(job);
    await markJobSuccess(job, Date.now() - startedAt);
  } catch (err) {
    await markJobFailure(job, err, Date.now() - startedAt);
  } finally {
    if (leaseTimer) {
      clearInterval(leaseTimer);
    }
  }
}

const workerSignal = new EventEmitter();
workerSignal.setMaxListeners(0);
let wakeRequested = false;
let idleUnloadTimer: NodeJS.Timeout | null = null;

function requestWorkerWake(reason = "unknown"): void {
  wakeRequested = true;
  logWorkerAction("worker_wake_requested", { reason });
  workerSignal.emit("wake");
}

async function waitForWorkerWake(): Promise<void> {
  if (wakeRequested) {
    wakeRequested = false;
    return;
  }
  await new Promise<void>((resolve) => {
    workerSignal.once("wake", () => resolve());
  });
  wakeRequested = false;
}

async function maybeUnloadIdleModels(): Promise<void> {
  const idleUnloadMs = getIdleModelUnloadMs();
  if (
    idleUnloadMs > 0 &&
    !didIdleUnloadAfterLastAsset &&
    Date.now() - lastAssetGenerationAt >= idleUnloadMs
  ) {
    logWorkerAction("model_idle_unload_started", {
      idle_unload_ms: idleUnloadMs,
      idle_for_ms: Date.now() - lastAssetGenerationAt
    });
    await releaseAllGenerationModels({
      reason: "idle_timeout"
    });
    didIdleUnloadAfterLastAsset = true;
    logWorkerAction("model_idle_unload_completed", {
      idle_unload_ms: idleUnloadMs
    });
  }
}

function scheduleIdleUnloadCheck(): void {
  if (idleUnloadTimer) {
    clearTimeout(idleUnloadTimer);
    idleUnloadTimer = null;
  }
  const idleUnloadMs = getIdleModelUnloadMs();
  if (idleUnloadMs <= 0 || didIdleUnloadAfterLastAsset) return;
  const elapsed = Date.now() - lastAssetGenerationAt;
  const remaining = Math.max(0, idleUnloadMs - elapsed);
  idleUnloadTimer = setTimeout(() => {
    void maybeUnloadIdleModels();
  }, remaining);
  idleUnloadTimer.unref?.();
}

async function drainQueue(): Promise<void> {
  while (true) {
    const job = await claimNextJob();
    if (!job) {
      const [pendingJobs, runningJobs] = await Promise.all([
        prisma.job.count({ where: { status: "pending" } }),
        prisma.job.count({ where: { status: "running" } })
      ]);
      if (pendingJobs > 0 || runningJobs > 0) {
        logWorkerAction("worker_queue_idle_with_jobs", {
          pending_jobs: pendingJobs,
          running_jobs: runningJobs
        });
      }
      await maybeUnloadIdleModels();
      scheduleIdleUnloadCheck();
      return;
    }
    if (idleUnloadTimer) {
      clearTimeout(idleUnloadTimer);
      idleUnloadTimer = null;
    }
    await processJob(job);
  }
}

async function workerEventLoop(): Promise<void> {
  requestWorkerWake("startup");
  while (true) {
    try {
      await waitForWorkerWake();
      await drainQueue();
    } catch (err) {
      console.error(
        JSON.stringify({
          event: "worker_loop_error",
          error: serializeError(err)
        })
      );
      scheduleIdleUnloadCheck();
    }
  }
}

function startHealthServer(port: number): http.Server {
  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          workerPort: port,
          dataDir: config.dataDir,
          cwd: process.cwd()
        })
      );
      return;
    }
    if (req.url === "/ready") {
      const ready = agentControlHelloAckReceived;
      const statusCode = ready ? 200 : 503;
      res.writeHead(statusCode, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: ready,
          requireWsOnStartup: workerRequireWsOnStartup,
          hasAgentControlIdentity: hasAgentControlIdentityConfigured(),
          wsConnected: agentControlSocketConnected,
          agentHelloAck: agentControlHelloAckReceived
        })
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`worker health listening at http://127.0.0.1:${port}/health`);
  });
  return server;
}

workerEventLoop().catch(async (err) => {
  console.error("Worker failed to start", err);
  await prisma.$disconnect();
  process.exit(1);
});

const healthServer = startHealthServer(config.workerPort);
void (async () => {
  const wsBootStarted = await startAgentControlChannel();
  const shouldFailMissingIdentity = shouldFailStartupWithoutIdentity({
    workerRequireWsOnStartup,
    hasIdentity: hasAgentControlIdentityConfigured()
  });
  if (!shouldFailMissingIdentity && !workerRequireWsOnStartup) return;
  if (!wsBootStarted && shouldFailMissingIdentity) {
    logWorkerAction("worker_startup_failed", {
      reason: "ws_required_but_missing_identity_or_token"
    });
    healthServer.close();
    await prisma.$disconnect();
    process.exit(1);
    return;
  }
  if (!workerRequireWsOnStartup) return;
  const isReady = await waitForAgentControlReady(workerWsStartupTimeoutMs);
  if (isReady) return;
  logWorkerAction("worker_startup_failed", {
    reason: "ws_startup_timeout",
    timeout_ms: workerWsStartupTimeoutMs
  });
  healthServer.close();
  await prisma.$disconnect();
  process.exit(1);
})();

process.on("SIGINT", async () => {
  healthServer.close();
  await prisma.$disconnect();
  process.exit(0);
});
