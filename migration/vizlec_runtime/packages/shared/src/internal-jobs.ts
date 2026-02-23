export type JobEventLifecycle = "started" | "running" | "finished";
export type JobEventPhase = "cleanup" | "generation";

export type InternalJobEventPayload = {
  jobId: string;
  lifecycle?: JobEventLifecycle;
  phase?: JobEventPhase;
  progressPercent?: number;
};

export function normalizeProgressPercent(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(1, Math.min(99, Math.trunc(value)));
}

export function normalizeJobEventLifecycle(value: unknown): JobEventLifecycle | undefined {
  return value === "started" || value === "running" || value === "finished" ? value : undefined;
}

export function normalizeJobEventPhase(value: unknown): JobEventPhase | undefined {
  return value === "cleanup" || value === "generation" ? value : undefined;
}

