export const WS_EVENT = {
  JOB_UPDATE: "job_update",
  NOTIFICATION: "notification",
  ENTITY_CHANGED: "entity_changed",
  INVENTORY_RECONCILED: "inventory_reconciled"
} as const;

export type WsEventName = (typeof WS_EVENT)[keyof typeof WS_EVENT];

export const JOB_STREAM_EVENT = {
  PROGRESS: "progress",
  BLOCK: "block",
  AUDIO_BLOCK: "audio_block",
  IMAGE: "image",
  FINAL_VIDEO: "final_video",
  WARNING: "warning",
  ERROR: "error",
  DONE: "done"
} as const;

export type JobStreamEventName = (typeof JOB_STREAM_EVENT)[keyof typeof JOB_STREAM_EVENT];

