export const WORKER_AGENT_COMMANDS = [
  "comfy_workflows_list",
  "comfy_workflow_import",
  "tts_voices_list",
  "worker_queue_wake",
  "system_hard_cleanup",
  "system_free_space_plan",
  "system_free_space_execute",
  "inventory_snapshot_collect",
  "block_image_raw_get",
  "block_audio_raw_get",
  "block_slide_get",
  "lesson_version_final_video_get",
  "lesson_version_final_video_post",
  "lesson_version_transcription_post",
  "lesson_version_images_post",
  "lesson_version_slides_post",
  "lesson_version_assets_post",
  "lesson_version_assets_image_post",
  "lesson_version_audios_list",
  "lesson_version_subtitles_list",
  "lesson_version_images_list",
  "lesson_version_slides_list",
  "lesson_version_job_state"
] as const;

export type WorkerAgentCommandName = (typeof WORKER_AGENT_COMMANDS)[number];

export type AgentControlCommandName = "ollama_health" | "xtts_health" | "comfyui_health";

export type AgentControlIntegrationProvider = "ollama" | "xtts" | "comfyui";

export type AgentIntegrationConfig = {
  llmBaseUrl?: string;
  comfyuiBaseUrl?: string;
  ttsBaseUrl?: string;
};

export type AgentHelloMessage = {
  type: "agent_hello";
  messageId: string;
  payload: {
    workspaceId: string;
    agentId: string;
    label?: string | null;
    machineFingerprint?: string | null;
  };
};

export type AgentHeartbeatMessage = {
  type: "agent_heartbeat";
  messageId: string;
  payload: { workspaceId: string; agentId: string };
};

export type AgentIntegrationHealthRequestMessage = {
  type: "integration_health_request";
  messageId: string;
  payload: {
    provider: AgentControlIntegrationProvider;
    options?: Record<string, unknown>;
    correlationId?: string;
  };
};

export type AgentIntegrationHealthResponseMessage = {
  type: "integration_health_response";
  messageId: string;
  inReplyTo: string;
  payload: {
    provider: AgentControlIntegrationProvider;
    statusCode: number;
    data: Record<string, unknown>;
  };
};

export type AgentErrorMessage = {
  type: "agent_error";
  messageId: string;
  inReplyTo?: string;
  payload: { code: string; message: string };
};

export type WorkerCommandRequestMessage = {
  type: "worker_command_request";
  messageId: string;
  payload: {
    command: WorkerAgentCommandName;
    params?: Record<string, unknown>;
    correlationId?: string;
  };
};

export type WorkerCommandResponseMessage = {
  type: "worker_command_response";
  messageId: string;
  inReplyTo: string;
  payload: {
    command: WorkerAgentCommandName;
    statusCode: number;
    data: Record<string, unknown>;
  };
};

export type AgentHelloAckMessage = {
  type: "agent_hello_ack";
  messageId: string;
  inReplyTo?: string;
  payload?: {
    ok?: boolean;
    agentId?: string;
    integrationConfig?: AgentIntegrationConfig;
  };
};

export type AgentControlIncomingMessage =
  | AgentHelloMessage
  | AgentHeartbeatMessage
  | AgentIntegrationHealthResponseMessage
  | AgentErrorMessage
  | WorkerCommandResponseMessage;

export type AgentControlOutgoingMessage =
  | AgentIntegrationHealthRequestMessage
  | WorkerCommandRequestMessage;
