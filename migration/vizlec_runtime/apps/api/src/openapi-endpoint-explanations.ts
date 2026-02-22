export type EndpointExecutionInventory = {
  owner: string;
  sourceOfTruth: string;
  callerOrigin: string;
  internalRouting: string;
  fallbackStrategy: string;
};

export const endpointExecutionInventoryByRoute: Record<string, EndpointExecutionInventory> = {
  "DELETE /courses/:courseId": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "DELETE /lessons/:lessonId": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "DELETE /modules/:moduleId": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "GET /auth/bootstrap-status": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "GET /auth/context": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "GET /auth/invite/:token": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "GET /auth/me": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "GET /blocks/:blockId/audio/raw": { owner: "worker-owned", sourceOfTruth: "edge_filesystem", callerOrigin: "frontend_web_http", internalRouting: "api_to_worker_ws_rpc", fallbackStrategy: "provider_unavailable_or_agent_offline_com_retry" },
  "GET /blocks/:blockId/image/raw": { owner: "worker-owned", sourceOfTruth: "edge_filesystem", callerOrigin: "frontend_web_http", internalRouting: "api_to_worker_ws_rpc", fallbackStrategy: "provider_unavailable_or_agent_offline_com_retry" },
  "GET /blocks/:blockId/slide": { owner: "worker-owned", sourceOfTruth: "edge_filesystem", callerOrigin: "frontend_web_http", internalRouting: "api_to_worker_ws_rpc", fallbackStrategy: "provider_unavailable_or_agent_offline_com_retry" },
  "GET /courses": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "GET /courses/:courseId/build-status": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "GET /courses/:courseId/modules": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "GET /dashboard/metrics": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "GET /health": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "ops_monitoring", internalRouting: "control_plane_healthcheck", fallbackStrategy: "erro_controlado_com_auditoria" },
  "GET /integrations/comfyui/workflows": { owner: "worker-owned", sourceOfTruth: "edge_provider", callerOrigin: "frontend_web_http", internalRouting: "api_to_worker_ws_rpc", fallbackStrategy: "provider_unavailable_or_agent_offline_com_retry" },
  "GET /integrations/ollama/health": { owner: "worker-owned", sourceOfTruth: "edge_provider", callerOrigin: "frontend_web_http", internalRouting: "api_to_worker_ws_rpc", fallbackStrategy: "provider_unavailable_or_agent_offline_com_retry" },
  "GET /integrations/xtts/health": { owner: "worker-owned", sourceOfTruth: "edge_provider", callerOrigin: "frontend_web_http", internalRouting: "api_to_worker_ws_rpc", fallbackStrategy: "provider_unavailable_or_agent_offline_com_retry" },
  "GET /jobs/:jobId": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "GET /jobs/:jobId/stream": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_sse", internalRouting: "control_plane_sse_stream", fallbackStrategy: "erro_controlado_com_auditoria" },
  "GET /lesson-versions/:versionId/audios": { owner: "worker-owned", sourceOfTruth: "edge_filesystem", callerOrigin: "frontend_web_http", internalRouting: "api_to_worker_ws_rpc", fallbackStrategy: "provider_unavailable_or_agent_offline_com_retry" },
  "GET /lesson-versions/:versionId/blocks": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "GET /lesson-versions/:versionId/final-video": { owner: "worker-owned", sourceOfTruth: "edge_filesystem", callerOrigin: "frontend_web_http", internalRouting: "api_to_worker_ws_rpc", fallbackStrategy: "provider_unavailable_or_agent_offline_com_retry" },
  "GET /lesson-versions/:versionId/images": { owner: "worker-owned", sourceOfTruth: "edge_filesystem", callerOrigin: "frontend_web_http", internalRouting: "api_to_worker_ws_rpc", fallbackStrategy: "provider_unavailable_or_agent_offline_com_retry" },
  "GET /lesson-versions/:versionId/job-state": { owner: "worker-owned", sourceOfTruth: "edge_filesystem", callerOrigin: "frontend_web_http", internalRouting: "api_to_worker_ws_rpc", fallbackStrategy: "provider_unavailable_or_agent_offline_com_retry" },
  "GET /lesson-versions/:versionId/segment-preview": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "GET /lesson-versions/:versionId/slides": { owner: "worker-owned", sourceOfTruth: "edge_filesystem", callerOrigin: "frontend_web_http", internalRouting: "api_to_worker_ws_rpc", fallbackStrategy: "provider_unavailable_or_agent_offline_com_retry" },
  "GET /lessons/:lessonId": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "GET /lessons/:lessonId/versions": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "GET /modules/:moduleId/lessons": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "GET /notifications": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "GET /settings": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "GET /slide-templates": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "GET /team/invitations": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "GET /tts/provider": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "GET /tts/voices": { owner: "worker-owned", sourceOfTruth: "edge_provider", callerOrigin: "frontend_web_http", internalRouting: "api_to_worker_ws_rpc", fallbackStrategy: "provider_unavailable_or_agent_offline_com_retry" },
  "GET /ws": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_ws", internalRouting: "frontend_ws_session_channel", fallbackStrategy: "erro_controlado_com_auditoria" },
  "GET /ws/agent-control": { owner: "control-plane-owned", sourceOfTruth: "control_plane_runtime", callerOrigin: "worker_agent_ws", internalRouting: "worker_ws_session_channel", fallbackStrategy: "erro_controlado_com_auditoria" },
  "PATCH /blocks/:blockId": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "PATCH /courses/:courseId": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "PATCH /courses/:courseId/structure/reorder": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "PATCH /lesson-versions/:versionId/preferences": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "PATCH /lessons/:lessonId": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "PATCH /modules/:moduleId": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "PATCH /settings": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "POST /auth/bootstrap-admin": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "POST /auth/invite/accept": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "POST /auth/login": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "POST /auth/logout": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "POST /auth/register": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "POST /blocks/:blockId/image": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "api_queue_db_then_worker_http_poke_legacy", fallbackStrategy: "erro_controlado_com_auditoria" },
  "POST /blocks/:blockId/segment/retry": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "api_queue_db_then_worker_http_poke_legacy", fallbackStrategy: "erro_controlado_com_auditoria" },
  "POST /blocks/:blockId/tts": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "api_queue_db_then_worker_http_poke_legacy", fallbackStrategy: "erro_controlado_com_auditoria" },
  "POST /courses": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "POST /courses/:courseId/generation/:phase/cancel": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "api_queue_db_then_worker_http_poke_legacy", fallbackStrategy: "erro_controlado_com_auditoria" },
  "POST /courses/:courseId/modules": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "POST /imports/rollback": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "POST /integrations/comfyui/health": { owner: "worker-owned", sourceOfTruth: "edge_provider", callerOrigin: "frontend_web_http", internalRouting: "api_to_worker_ws_rpc", fallbackStrategy: "provider_unavailable_or_agent_offline_com_retry" },
  "POST /integrations/comfyui/workflows/import": { owner: "worker-owned", sourceOfTruth: "edge_provider", callerOrigin: "frontend_web_http", internalRouting: "api_to_worker_ws_rpc", fallbackStrategy: "provider_unavailable_or_agent_offline_com_retry" },
  "POST /internal/inventory/delta": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "worker_agent_http", internalRouting: "worker_to_api_internal_http_push", fallbackStrategy: "erro_controlado_com_auditoria" },
  "POST /internal/inventory/snapshot": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "worker_agent_http", internalRouting: "worker_to_api_internal_http_push", fallbackStrategy: "erro_controlado_com_auditoria" },
  "POST /internal/jobs/event": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "worker_agent_http", internalRouting: "worker_to_api_internal_http_push", fallbackStrategy: "erro_controlado_com_auditoria" },
  "POST /jobs/:jobId/cancel": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "api_queue_db_then_worker_http_poke_legacy", fallbackStrategy: "erro_controlado_com_auditoria" },
  "POST /lesson-versions/:versionId/assets": { owner: "worker-owned", sourceOfTruth: "edge_filesystem", callerOrigin: "frontend_web_http", internalRouting: "api_to_worker_ws_rpc", fallbackStrategy: "provider_unavailable_or_agent_offline_com_retry" },
  "POST /lesson-versions/:versionId/assets/image": { owner: "worker-owned", sourceOfTruth: "edge_filesystem", callerOrigin: "frontend_web_http", internalRouting: "api_to_worker_ws_rpc", fallbackStrategy: "provider_unavailable_or_agent_offline_com_retry" },
  "POST /lesson-versions/:versionId/final-video": { owner: "worker-owned", sourceOfTruth: "edge_filesystem", callerOrigin: "frontend_web_http", internalRouting: "api_queue_db_then_worker_http_poke_legacy", fallbackStrategy: "provider_unavailable_or_agent_offline_com_retry" },
  "POST /lesson-versions/:versionId/images": { owner: "worker-owned", sourceOfTruth: "edge_filesystem", callerOrigin: "frontend_web_http", internalRouting: "api_queue_db_then_worker_http_poke_legacy", fallbackStrategy: "provider_unavailable_or_agent_offline_com_retry" },
  "POST /lesson-versions/:versionId/segment": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "api_queue_db_then_worker_http_poke_legacy", fallbackStrategy: "erro_controlado_com_auditoria" },
  "POST /lesson-versions/:versionId/slides": { owner: "worker-owned", sourceOfTruth: "edge_filesystem", callerOrigin: "frontend_web_http", internalRouting: "api_to_worker_ws_rpc", fallbackStrategy: "provider_unavailable_or_agent_offline_com_retry" },
  "POST /lesson-versions/:versionId/tts": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "api_queue_db_then_worker_http_poke_legacy", fallbackStrategy: "erro_controlado_com_auditoria" },
  "POST /lessons/:lessonId/generation/:phase/cancel": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "api_queue_db_then_worker_http_poke_legacy", fallbackStrategy: "erro_controlado_com_auditoria" },
  "POST /lessons/:lessonId/versions": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "POST /modules/:moduleId/generation/:phase/cancel": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "api_queue_db_then_worker_http_poke_legacy", fallbackStrategy: "erro_controlado_com_auditoria" },
  "POST /modules/:moduleId/lessons": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "POST /notifications/:notificationId/read": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "POST /notifications/read-all": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "POST /system/hard-cleanup": { owner: "worker-owned", sourceOfTruth: "edge_runtime", callerOrigin: "frontend_web_http", internalRouting: "api_to_worker_ws_rpc", fallbackStrategy: "provider_unavailable_or_agent_offline_com_retry" },
  "POST /system/free-space": { owner: "worker-owned", sourceOfTruth: "edge_filesystem", callerOrigin: "frontend_web_http", internalRouting: "api_to_worker_ws_rpc", fallbackStrategy: "provider_unavailable_or_agent_offline_com_retry" },
  "POST /team/invitations": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "POST /team/invitations/:invitationId/regenerate-content": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "POST /team/invitations/:invitationId/revoke": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "POST /agent-control/pairing-token": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "frontend_web_http", internalRouting: "control_plane_local_handler", fallbackStrategy: "erro_controlado_com_auditoria" },
  "POST /agent-control/validate-worker": { owner: "control-plane-owned", sourceOfTruth: "control_plane_db", callerOrigin: "edge_installer_or_worker", internalRouting: "pairing_bootstrap_control_plane", fallbackStrategy: "erro_controlado_com_auditoria" },
};

const inventoryLabelMap: Record<string, string> = {
  "control-plane-owned": "Executado no servidor central da API.",
  "worker-owned": "Executado na maquina do cliente (worker/edge).",
  "control_plane_db": "A fonte oficial dos dados e o banco central do control plane.",
  "control_plane_runtime": "A fonte oficial e o estado em memoria de sessoes/canal do control plane.",
  "edge_provider": "A fonte oficial e o provider local do cliente (Ollama/ComfyUI/TTS).",
  "edge_filesystem": "A fonte oficial e o filesystem local do cliente com artefatos gerados.",
  "edge_runtime": "A fonte oficial e o estado operacional local do worker.",
  "frontend_web_http": "Chamado pelo frontend web via HTTP (fetch).",
  "frontend_web_sse": "Consumido pelo frontend web via stream SSE (EventSource).",
  "frontend_web_ws": "Consumido pelo frontend web via WebSocket.",
  "worker_agent_http": "Chamado pelo worker em endpoints internos da API.",
  "worker_agent_ws": "Usado pelo worker no canal WebSocket de controle.",
  "edge_installer_or_worker": "Chamado no fluxo de instalacao/pareamento do agente.",
  "ops_monitoring": "Chamado por monitoramento operacional/health-check.",
  "control_plane_local_handler": "Processado localmente no handler da API (regras e banco central).",
  "api_to_worker_ws_rpc": "A API delega a execucao para o worker via WS RPC.",
  "api_queue_db_then_worker_http_poke_legacy": "A API enfileira no banco e aciona o worker pelo mecanismo legado de poke.",
  "worker_to_api_internal_http_push": "O worker envia eventos/snapshots para endpoint interno da API.",
  "worker_ws_session_channel": "Canal de sessao WebSocket do agente para controle.",
  "frontend_ws_session_channel": "Canal WebSocket de notificacoes/sinalizacao para frontend.",
  "control_plane_sse_stream": "Canal SSE de acompanhamento em tempo real de progresso/status de job.",
  "control_plane_healthcheck": "Endpoint de health check do plano de controle.",
  "pairing_bootstrap_control_plane": "Fluxo de pareamento e provisionamento de credenciais do agente.",
  "erro_controlado_com_auditoria": "Retorna erro padronizado e registra auditoria/log operacional.",
  "provider_unavailable_or_agent_offline_com_retry": "Sinaliza indisponibilidade de provider/agente e adota politica de retry/reconexao.",
};

function label(code: string): string {
  return inventoryLabelMap[code] ?? code;
}

export function buildEndpointPurposeExplanation(params: {
  method: string;
  path: string;
  summary?: string;
  description?: string;
}): string {
  const methodUpper = params.method.toUpperCase();
  const key = `${methodUpper} ${params.path}`;
  const inventory = endpointExecutionInventoryByRoute[key];

  const originalDescription = (params.description ?? "").trim();
  const summary = (params.summary ?? "").trim();
  const action = summary || `Operacao ${methodUpper} em ${params.path}`;

  const whatItDoes = originalDescription.length > 0 ? originalDescription : `${action}.`;
  let whyItExists = "Existe para expor essa capacidade de forma consistente e rastreavel para o fluxo da plataforma.";

  if (inventory) {
    if (inventory.owner === "worker-owned") {
      whyItExists = "Existe para orquestrar recursos que vivem no edge/worker, mantendo a API como plano de controle e o processamento perto dos providers/arquivos locais.";
    } else if (inventory.internalRouting === "worker_to_api_internal_http_push") {
      whyItExists = "Existe para receber sinais internos do worker (eventos/snapshot) e consolidar estado/auditoria no control plane.";
    } else if (inventory.internalRouting === "pairing_bootstrap_control_plane") {
      whyItExists = "Existe para o bootstrap seguro de agentes, com validacao e provisionamento controlado de credenciais.";
    } else if (inventory.internalRouting === "control_plane_sse_stream") {
      whyItExists = "Existe para permitir acompanhamento em tempo real de jobs sem polling agressivo no frontend.";
    } else if (inventory.internalRouting === "frontend_ws_session_channel") {
      whyItExists = "Existe para publicar eventos em tempo real para a interface sem depender apenas de requisicoes HTTP.";
    } else if (inventory.internalRouting === "worker_ws_session_channel") {
      whyItExists = "Existe para manter um canal de controle bidirecional entre API e worker com baixa latencia.";
    } else if (inventory.internalRouting === "control_plane_healthcheck") {
      whyItExists = "Existe para monitoramento operacional, automacao de liveness/readiness e diagnostico rapido.";
    } else if (inventory.internalRouting === "api_queue_db_then_worker_http_poke_legacy") {
      whyItExists = "Existe para iniciar processamento assincrono confiavel: registra intencao no banco e aciona o worker para execucao.";
    } else if (inventory.internalRouting === "api_to_worker_ws_rpc") {
      whyItExists = "Existe para consultar/executar operacoes no worker de forma sincrona via WS RPC, preservando a API como facade unica.";
    } else {
      whyItExists = "Existe para centralizar regras de negocio e garantir consistencia dos dados no control plane.";
    }
  }

  if (!inventory) {
    return [whatItDoes, "", `**Por que existe**: ${whyItExists}`].join("\n");
  }

  return [
    whatItDoes,
    "",
    `**Por que existe**: ${whyItExists}`,
    "",
    "**Inventario de execucao**",
    `- Dono de execucao: \`${inventory.owner}\` (${label(inventory.owner)})`,
    `- Origem da verdade: \`${inventory.sourceOfTruth}\` (${label(inventory.sourceOfTruth)})`,
    `- Origem chamadora: \`${inventory.callerOrigin}\` (${label(inventory.callerOrigin)})`,
    `- Encaminhamento interno: \`${inventory.internalRouting}\` (${label(inventory.internalRouting)})`,
    `- Estrategia de fallback/erro: \`${inventory.fallbackStrategy}\` (${label(inventory.fallbackStrategy)})`
  ].join("\n");
}
