export const WS_EVENT = {
  JOB_UPDATE: 'job_update',
  ENTITY_CHANGED: 'entity_changed',
  NOTIFICATION: 'notification',
  INVENTORY_RECONCILED: 'inventory_reconciled'
} as const;

export const JOB_STREAM_EVENT = {
  BLOCK: 'block',
  AUDIO_BLOCK: 'audio_block',
  IMAGE: 'image',
  PROGRESS: 'progress',
  FINAL_VIDEO: 'final_video',
  DONE: 'done',
  ERROR: 'error'
} as const;

export type WsEventName = (typeof WS_EVENT)[keyof typeof WS_EVENT];
export type JobStreamEventName = (typeof JOB_STREAM_EVENT)[keyof typeof JOB_STREAM_EVENT];

export type VizlecWsEnvelope<TPayload = Record<string, unknown>> = {
  event?: WsEventName | string;
  payload?: TPayload;
};

export function readVizlecWsDetail<TPayload = Record<string, unknown>>(
  event: Event
): VizlecWsEnvelope<TPayload> | null {
  const detail = (event as CustomEvent<VizlecWsEnvelope<TPayload>>).detail;
  if (!detail || typeof detail !== 'object') return null;
  return detail;
}
