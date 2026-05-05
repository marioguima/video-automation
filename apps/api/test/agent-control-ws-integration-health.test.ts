import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import WebSocket from "ws";
import type { FastifyInstance } from "fastify";
import { createPrismaClient, type PrismaClient } from "@vizlec/db";
import { createApiTestRuntime } from "./utils/api-test-runtime.ts";

// Este runtime cria um ambiente isolado para teste de API:
// - banco temporário
// - variáveis de ambiente de teste
// - limpeza no final
const runtime = createApiTestRuntime("vizlec-agent-control-ws-");

let app: FastifyInstance;
let prisma: PrismaClient;
let baseUrl = "";
let wsAgent: WebSocket | null = null;

// Aguarda o WebSocket conectar.
// Se não conectar em 5s, o teste falha com timeout explícito.
function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("ws_open_timeout")), 5000);
    socket.once("open", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// Aguarda exatamente a próxima mensagem recebida no WebSocket.
// O teste usa isso para validar a sequência do protocolo (request/reply).
function waitForMessage(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("ws_message_timeout")), 5000);
    socket.once("message", (raw) => {
      clearTimeout(timer);
      try {
        resolve(
          JSON.parse(typeof raw === "string" ? raw : raw.toString("utf8")) as Record<
            string,
            unknown
          >
        );
      } catch (err) {
        reject(err);
      }
    });
  });
}

before(async () => {
  // 1) Reinicia o banco de teste para estado conhecido (sem dados de execuções anteriores).
  runtime.resetDatabase();
  // 2) Injeta variáveis de ambiente específicas do cenário de teste.
  runtime.configureEnv();
  // 3) Define segredo do canal agent-control para emissão/validação de token por agente.
  process.env.AGENT_CONTROL_TOKEN_SECRET = "test-agent-control-secret";
  // 3.1) Reduz timeout de request WS para acelerar cenários de falha por timeout.
  process.env.AGENT_CONTROL_REQUEST_TIMEOUT_MS = "200";

  // 4) Sobe a API real (módulo principal), em memória, para testar fluxo de ponta a ponta.
  const mod = await import("../src/index.ts");
  app = mod.fastify as FastifyInstance;
  await app.ready();
  prisma = createPrismaClient();

  // 5) Escuta em porta efêmera (port: 0) para evitar conflito com outros serviços locais.
  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  baseUrl = address;
});

after(async () => {
  // Fecha WebSocket e recursos de teste para não deixar processo pendurado.
  if (wsAgent && wsAgent.readyState === WebSocket.OPEN) {
    wsAgent.close();
  }
  if (app) await app.close();
  if (prisma) await prisma.$disconnect();
  runtime.cleanup();
});

test(
  "agent-control ws: integration health endpoints delegate to connected agent",
  { concurrency: false },
  async () => {
  // PASSO A: cria admin via bootstrap para obter sessão autenticada.
  const bootstrapRes = await app.inject({
    method: "POST",
    url: "/auth/bootstrap-admin",
    payload: {
      name: "Owner Agent WS",
      email: "owner-agent-ws@vizlec.test",
      password: "StrongPass123!"
    }
  });
  assert.equal(bootstrapRes.statusCode, 201);

  // O cookie de sessão será usado em todas as chamadas autenticadas seguintes.
  const cookie = Array.isArray(bootstrapRes.headers["set-cookie"])
    ? bootstrapRes.headers["set-cookie"][0]
    : bootstrapRes.headers["set-cookie"];
  assert.ok(cookie);

  // PASSO B: consulta /auth/me para descobrir o workspace do admin criado.
  // Esse workspace é o escopo de isolamento de dados/comandos do teste.
  const meRes = await app.inject({
    method: "GET",
    url: "/auth/me",
    headers: { cookie }
  });
  assert.equal(meRes.statusCode, 200);
  const meBody = meRes.json() as { scope: { workspaceId: string } };
  const workspaceId = meBody.scope.workspaceId;

  // PASSO C: captura as URLs atuais em /settings para restaurar ao final do teste.
  const settingsRes = await app.inject({
    method: "GET",
    url: "/settings",
    headers: { cookie }
  });
  assert.equal(settingsRes.statusCode, 200);
  const originalSettings = settingsRes.json() as {
    llm?: { providers?: { ollama?: { baseUrl?: string } } };
    comfy?: { baseUrl?: string };
    tts?: { baseUrl?: string };
  };
  const originalLlmBaseUrl = String(originalSettings.llm?.providers?.ollama?.baseUrl ?? "");
  const originalComfyBaseUrl = String(originalSettings.comfy?.baseUrl ?? "");
  const originalTtsBaseUrl = String(originalSettings.tts?.baseUrl ?? "");
  let settingsOverridden = false;

  try {
    // PASSO C.1: altera /settings para URLs específicas de integração.
    // Isso valida, depois, se a API envia esse snapshot no hello_ack.
    const patchSettingsRes = await app.inject({
      method: "PATCH",
      url: "/settings",
      headers: { cookie },
      payload: {
        llm: {
          providers: {
            ollama: { baseUrl: "http://127.0.0.1:11435" }
          }
        },
        comfy: { baseUrl: "http://127.0.0.1:8189" },
        tts: { baseUrl: "http://127.0.0.1:8021" }
      }
    });
    assert.equal(patchSettingsRes.statusCode, 200);
    settingsOverridden = true;

    // PASSO D: gera pairing token autenticado (simula botão "Adicionar máquina").
    const pairingRes = await app.inject({
      method: "POST",
      url: "/agent-control/pairing-token",
      headers: { cookie }
    });
    assert.equal(pairingRes.statusCode, 201);
    const pairingToken = (pairingRes.json() as { pairingToken: string }).pairingToken;

    // PASSO E: valida worker com pairing token e recebe credenciais do agente.
    const validateWorkerRes = await app.inject({
      method: "POST",
      url: "/agent-control/validate-worker",
      payload: {
        pairingToken,
        label: "agent-ws",
        machineFingerprint: "machine-fingerprint-ws-test"
      }
    });
    assert.equal(validateWorkerRes.statusCode, 200);
    const workerCreds = validateWorkerRes.json() as {
      AGENT_CONTROL_TOKEN: string;
      WORKSPACE_ID: string;
      AGENT_ID: string;
    };
    const workspaceIdFromProvision = workerCreds.WORKSPACE_ID;
    const agentId = workerCreds.AGENT_ID;
    const agentControlToken = workerCreds.AGENT_CONTROL_TOKEN;
    assert.equal(workspaceIdFromProvision, workspaceId);

    // PASSO F: abre conexão WS simulando o worker/edge do cliente.
    // A autenticação agora usa Authorization Bearer no handshake.
    wsAgent = new WebSocket(
      `${baseUrl.replace(/^http/, "ws")}/ws/agent-control`,
      {
        headers: {
          Authorization: `Bearer ${agentControlToken}`
        }
      }
    );
    await waitForOpen(wsAgent);

    // PASSO G: envia agent_hello (handshake lógico do agente no canal).
    // Esse passo registra sessão em memória e marca agente online no backend.
    wsAgent.send(
      JSON.stringify({
        type: "agent_hello",
        messageId: "hello-1",
        payload: {
          workspaceId: workspaceIdFromProvision,
          agentId,
          label: "agent-ws"
        }
      })
    );

    // A API deve responder com agent_hello_ack.
    const helloAck = await waitForMessage(wsAgent);
    assert.equal(helloAck.type, "agent_hello_ack");

    // Além do ACK, validamos o snapshot de configuração de integrações
    // enviado pela API para o worker no início da sessão.
    const integrationConfig = (
      helloAck.payload as {
        integrationConfig?: { llmBaseUrl?: string; comfyuiBaseUrl?: string; ttsBaseUrl?: string };
      }
    )?.integrationConfig;
    assert.equal(integrationConfig?.llmBaseUrl, "http://127.0.0.1:11435");
    assert.equal(integrationConfig?.comfyuiBaseUrl, "http://127.0.0.1:8189");
    assert.equal(integrationConfig?.ttsBaseUrl, "http://127.0.0.1:8021");

    // PASSO H.0.1: endpoint /integrations/comfyui/workflows (worker-owned)
    const workflowsRequestPromise = waitForMessage(wsAgent);
    const workflowsApiPromise = app.inject({
      method: "GET",
      url: "/integrations/comfyui/workflows",
      headers: { cookie }
    });
    const workflowsRequest = await workflowsRequestPromise;
    assert.equal(workflowsRequest.type, "worker_command_request");
    assert.equal(
      (workflowsRequest.payload as { command: string }).command,
      "comfy_workflows_list"
    );
    wsAgent.send(
      JSON.stringify({
        type: "worker_command_response",
        messageId: "resp-workflows-list",
        inReplyTo: workflowsRequest.messageId,
        payload: {
          command: "comfy_workflows_list",
          statusCode: 200,
          data: {
            workflowFile: "vantage-z-image-turbo-api.json",
            availableWorkflows: ["vantage-z-image-turbo-api.json"]
          }
        }
      })
    );
    const workflowsRes = await workflowsApiPromise;
    assert.equal(workflowsRes.statusCode, 200);
    assert.equal(
      (workflowsRes.json() as { workflowFile: string }).workflowFile,
      "vantage-z-image-turbo-api.json"
    );

    // PASSO H.0.2: endpoint /integrations/comfyui/workflows/import (worker-owned)
    const importRequestPromise = waitForMessage(wsAgent);
    const importApiPromise = app.inject({
      method: "POST",
      url: "/integrations/comfyui/workflows/import",
      headers: { cookie },
      payload: { fileName: "test-workflow.json", workflow: { "1": { class_type: "SaveImage" } } }
    });
    const importRequest = await importRequestPromise;
    assert.equal(importRequest.type, "worker_command_request");
    assert.equal(
      (importRequest.payload as { command: string }).command,
      "comfy_workflow_import"
    );
    wsAgent.send(
      JSON.stringify({
        type: "worker_command_response",
        messageId: "resp-workflows-import",
        inReplyTo: importRequest.messageId,
        payload: {
          command: "comfy_workflow_import",
          statusCode: 201,
          data: {
            workflowFile: "test-workflow.json",
            availableWorkflows: ["test-workflow.json", "vantage-z-image-turbo-api.json"]
          }
        }
      })
    );
    const importRes = await importApiPromise;
    assert.equal(importRes.statusCode, 201);
    assert.equal((importRes.json() as { workflowFile: string }).workflowFile, "test-workflow.json");

    // PASSO H.0.3: endpoint /tts/voices (worker-owned)
    const voicesRequestPromise = waitForMessage(wsAgent);
    const voicesApiPromise = app.inject({
      method: "GET",
      url: "/tts/voices",
      headers: { cookie }
    });
    const voicesRequest = await voicesRequestPromise;
    assert.equal(voicesRequest.type, "worker_command_request");
    assert.equal((voicesRequest.payload as { command: string }).command, "tts_voices_list");
    wsAgent.send(
      JSON.stringify({
        type: "worker_command_response",
        messageId: "resp-voices",
        inReplyTo: voicesRequest.messageId,
        payload: {
          command: "tts_voices_list",
          statusCode: 200,
          data: {
            voices: [{ id: "voice-1", label: "Voice 1", description: null, preview_url: null }],
            items: [{ id: "voice-1", label: "Voice 1", description: null, preview_url: null }],
            speakers: ["voice-1"]
          }
        }
      })
    );
    const voicesRes = await voicesApiPromise;
    assert.equal(voicesRes.statusCode, 200);
    assert.equal((voicesRes.json() as { voices: Array<{ id: string }> }).voices[0]?.id, "voice-1");

    // PASSO H.0.4: endpoint /system/hard-cleanup (worker-owned)
    const hardCleanupRequestPromise = waitForMessage(wsAgent);
    const hardCleanupApiPromise = app.inject({
      method: "POST",
      url: "/system/hard-cleanup",
      headers: { cookie },
      payload: { reason: "test" }
    });
    const hardCleanupRequest = await hardCleanupRequestPromise;
    assert.equal(hardCleanupRequest.type, "worker_command_request");
    assert.equal(
      (hardCleanupRequest.payload as { command: string }).command,
      "system_hard_cleanup"
    );
    wsAgent.send(
      JSON.stringify({
        type: "worker_command_response",
        messageId: "resp-hard-cleanup",
        inReplyTo: hardCleanupRequest.messageId,
        payload: {
          command: "system_hard_cleanup",
          statusCode: 200,
          data: { ok: true, skipped: false }
        }
      })
    );
    const hardCleanupRes = await hardCleanupApiPromise;
    assert.equal(hardCleanupRes.statusCode, 200);
    assert.equal((hardCleanupRes.json() as { ok: boolean }).ok, true);

    // PASSO H.0.5: endpoint /lesson-versions/:versionId/slides (worker-owned edge_filesystem)
    const slidesRequestPromise = waitForMessage(wsAgent);
    const slidesApiPromise = app.inject({
      method: "GET",
      url: "/lesson-versions/version-1/slides?templateId=template-1",
      headers: { cookie }
    });
    const slidesRequest = await slidesRequestPromise;
    assert.equal(slidesRequest.type, "worker_command_request");
    assert.equal(
      (slidesRequest.payload as { command: string }).command,
      "lesson_version_slides_list"
    );
    assert.equal(
      (slidesRequest.payload as { params?: { versionId?: string } }).params?.versionId,
      "version-1"
    );
    assert.equal(
      (slidesRequest.payload as { params?: { templateId?: string } }).params?.templateId,
      "template-1"
    );
    wsAgent.send(
      JSON.stringify({
        type: "worker_command_response",
        messageId: "resp-slides-list",
        inReplyTo: slidesRequest.messageId,
        payload: {
          command: "lesson_version_slides_list",
          statusCode: 200,
          data: {
            templateId: "template-1",
            blocks: [{ blockId: "block-1", index: 0, exists: true }]
          }
        }
      })
    );
    const slidesRes = await slidesApiPromise;
    assert.equal(slidesRes.statusCode, 200);
    assert.equal(
      (slidesRes.json() as { blocks: Array<{ exists: boolean }> }).blocks[0]?.exists,
      true
    );

    // PASSO H.0.6: endpoint /lesson-versions/:versionId/audios (worker-owned edge_filesystem)
    const audiosRequestPromise = waitForMessage(wsAgent);
    const audiosApiPromise = app.inject({
      method: "GET",
      url: "/lesson-versions/version-1/audios",
      headers: { cookie }
    });
    const audiosRequest = await audiosRequestPromise;
    assert.equal(audiosRequest.type, "worker_command_request");
    assert.equal(
      (audiosRequest.payload as { command: string }).command,
      "lesson_version_audios_list"
    );
    wsAgent.send(
      JSON.stringify({
        type: "worker_command_response",
        messageId: "resp-audios-list",
        inReplyTo: audiosRequest.messageId,
        payload: {
          command: "lesson_version_audios_list",
          statusCode: 200,
          data: {
            blocks: [{ blockId: "block-1", index: 0, exists: true, url: "/blocks/block-1/audio/raw" }]
          }
        }
      })
    );
    const audiosRes = await audiosApiPromise;
    assert.equal(audiosRes.statusCode, 200);
    assert.equal(
      (audiosRes.json() as { blocks: Array<{ url: string | null }> }).blocks[0]?.url,
      "/blocks/block-1/audio/raw"
    );

    // PASSO H.0.7: endpoint /lesson-versions/:versionId/images (worker-owned edge_filesystem)
    const imagesRequestPromise = waitForMessage(wsAgent);
    const imagesApiPromise = app.inject({
      method: "GET",
      url: "/lesson-versions/version-1/images",
      headers: { cookie }
    });
    const imagesRequest = await imagesRequestPromise;
    assert.equal(imagesRequest.type, "worker_command_request");
    assert.equal(
      (imagesRequest.payload as { command: string }).command,
      "lesson_version_images_list"
    );
    wsAgent.send(
      JSON.stringify({
        type: "worker_command_response",
        messageId: "resp-images-list",
        inReplyTo: imagesRequest.messageId,
        payload: {
          command: "lesson_version_images_list",
          statusCode: 200,
          data: {
            blocks: [{ blockId: "block-1", index: 0, exists: true, url: "/blocks/block-1/image/raw" }]
          }
        }
      })
    );
    const imagesRes = await imagesApiPromise;
    assert.equal(imagesRes.statusCode, 200);
    assert.equal(
      (imagesRes.json() as { blocks: Array<{ url: string | null }> }).blocks[0]?.url,
      "/blocks/block-1/image/raw"
    );

    // PASSO H.0.8: endpoint /lesson-versions/:versionId/job-state (worker-owned edge_filesystem)
    const jobStateRequestPromise = waitForMessage(wsAgent);
    const jobStateApiPromise = app.inject({
      method: "GET",
      url: "/lesson-versions/version-1/job-state",
      headers: { cookie }
    });
    const jobStateRequest = await jobStateRequestPromise;
    assert.equal(jobStateRequest.type, "worker_command_request");
    assert.equal(
      (jobStateRequest.payload as { command: string }).command,
      "lesson_version_job_state"
    );
    wsAgent.send(
      JSON.stringify({
        type: "worker_command_response",
        messageId: "resp-job-state",
        inReplyTo: jobStateRequest.messageId,
        payload: {
          command: "lesson_version_job_state",
          statusCode: 200,
          data: {
            lessonVersionId: "version-1",
            finalVideoReady: false,
            queue: { segment: 0, tts: 0, image: 0 }
          }
        }
      })
    );
    const jobStateRes = await jobStateApiPromise;
    assert.equal(jobStateRes.statusCode, 200);
    assert.equal(
      (jobStateRes.json() as { lessonVersionId: string }).lessonVersionId,
      "version-1"
    );

    // PASSO H.0.8.1: endpoint /lesson-versions/:versionId/slides (POST worker-owned)
    const slidesPostRequestPromise = waitForMessage(wsAgent);
    const slidesPostApiPromise = app.inject({
      method: "POST",
      url: "/lesson-versions/version-1/slides",
      headers: { cookie },
      payload: { templateId: "template-1", requestId: "req-slides-post" }
    });
    const slidesPostRequest = await slidesPostRequestPromise;
    assert.equal(slidesPostRequest.type, "worker_command_request");
    assert.equal(
      (slidesPostRequest.payload as { command: string }).command,
      "lesson_version_slides_post"
    );
    wsAgent.send(
      JSON.stringify({
        type: "worker_command_response",
        messageId: "resp-slides-post",
        inReplyTo: slidesPostRequest.messageId,
        payload: {
          command: "lesson_version_slides_post",
          statusCode: 201,
          data: { id: "job-slide-1", type: "render_slide", status: "pending" }
        }
      })
    );
    const slidesPostRes = await slidesPostApiPromise;
    assert.equal(slidesPostRes.statusCode, 201);
    assert.equal((slidesPostRes.json() as { id: string }).id, "job-slide-1");

    // PASSO H.0.8.2: endpoint /lesson-versions/:versionId/assets (POST worker-owned)
    const assetsPostRequestPromise = waitForMessage(wsAgent);
    const assetsPostApiPromise = app.inject({
      method: "POST",
      url: "/lesson-versions/version-1/assets",
      headers: { cookie },
      payload: { requestId: "req-assets-post" }
    });
    const assetsPostRequest = await assetsPostRequestPromise;
    assert.equal(assetsPostRequest.type, "worker_command_request");
    assert.equal(
      (assetsPostRequest.payload as { command: string }).command,
      "lesson_version_assets_post"
    );
    wsAgent.send(
      JSON.stringify({
        type: "worker_command_response",
        messageId: "resp-assets-post",
        inReplyTo: assetsPostRequest.messageId,
        payload: {
          command: "lesson_version_assets_post",
          statusCode: 201,
          data: { id: "job-assets-1", type: "render_slide", status: "pending" }
        }
      })
    );
    const assetsPostRes = await assetsPostApiPromise;
    assert.equal(assetsPostRes.statusCode, 201);
    assert.equal((assetsPostRes.json() as { id: string }).id, "job-assets-1");

    // PASSO H.0.8.3: endpoint /lesson-versions/:versionId/assets/image (POST worker-owned)
    const assetsImagePostRequestPromise = waitForMessage(wsAgent);
    const assetsImagePostApiPromise = app.inject({
      method: "POST",
      url: "/lesson-versions/version-1/assets/image",
      headers: { cookie },
      payload: { requestId: "req-assets-image-post" }
    });
    const assetsImagePostRequest = await assetsImagePostRequestPromise;
    assert.equal(assetsImagePostRequest.type, "worker_command_request");
    assert.equal(
      (assetsImagePostRequest.payload as { command: string }).command,
      "lesson_version_assets_image_post"
    );
    wsAgent.send(
      JSON.stringify({
        type: "worker_command_response",
        messageId: "resp-assets-image-post",
        inReplyTo: assetsImagePostRequest.messageId,
        payload: {
          command: "lesson_version_assets_image_post",
          statusCode: 201,
          data: { id: "job-assets-image-1", type: "render_slide", status: "pending" }
        }
      })
    );
    const assetsImagePostRes = await assetsImagePostApiPromise;
    assert.equal(assetsImagePostRes.statusCode, 201);
    assert.equal((assetsImagePostRes.json() as { id: string }).id, "job-assets-image-1");

    // PASSO H.0.8.4: endpoint /lesson-versions/:versionId/images (POST worker-owned)
    const imagesPostRequestPromise = waitForMessage(wsAgent);
    const imagesPostApiPromise = app.inject({
      method: "POST",
      url: "/lesson-versions/version-1/images",
      headers: { cookie },
      payload: { requestId: "req-images-post" }
    });
    const imagesPostRequest = await imagesPostRequestPromise;
    assert.equal(imagesPostRequest.type, "worker_command_request");
    assert.equal(
      (imagesPostRequest.payload as { command: string }).command,
      "lesson_version_images_post"
    );
    wsAgent.send(
      JSON.stringify({
        type: "worker_command_response",
        messageId: "resp-images-post",
        inReplyTo: imagesPostRequest.messageId,
        payload: {
          command: "lesson_version_images_post",
          statusCode: 201,
          data: { id: "job-images-1", type: "image", status: "pending" }
        }
      })
    );
    const imagesPostRes = await imagesPostApiPromise;
    assert.equal(imagesPostRes.statusCode, 201);
    assert.equal((imagesPostRes.json() as { id: string }).id, "job-images-1");

    // PASSO H.0.8.5: endpoint /lesson-versions/:versionId/final-video (POST worker-owned)
    const finalVideoPostRequestPromise = waitForMessage(wsAgent);
    const finalVideoPostApiPromise = app.inject({
      method: "POST",
      url: "/lesson-versions/version-1/final-video",
      headers: { cookie },
      payload: { requestId: "req-final-video-post" }
    });
    const finalVideoPostRequest = await finalVideoPostRequestPromise;
    assert.equal(finalVideoPostRequest.type, "worker_command_request");
    assert.equal(
      (finalVideoPostRequest.payload as { command: string }).command,
      "lesson_version_final_video_post"
    );
    wsAgent.send(
      JSON.stringify({
        type: "worker_command_response",
        messageId: "resp-final-video-post",
        inReplyTo: finalVideoPostRequest.messageId,
        payload: {
          command: "lesson_version_final_video_post",
          statusCode: 201,
          data: { id: "job-final-video-1", type: "concat_video", status: "pending" }
        }
      })
    );
    const finalVideoPostRes = await finalVideoPostApiPromise;
    assert.equal(finalVideoPostRes.statusCode, 201);
    assert.equal((finalVideoPostRes.json() as { id: string }).id, "job-final-video-1");

    // PASSO H.0.9: endpoint /blocks/:blockId/image/raw (worker-owned edge_filesystem)
    const blockImageRequestPromise = waitForMessage(wsAgent);
    const blockImageApiPromise = app.inject({
      method: "GET",
      url: "/blocks/block-1/image/raw",
      headers: { cookie }
    });
    const blockImageRequest = await blockImageRequestPromise;
    assert.equal(blockImageRequest.type, "worker_command_request");
    assert.equal(
      (blockImageRequest.payload as { command: string }).command,
      "block_image_raw_get"
    );
    wsAgent.send(
      JSON.stringify({
        type: "worker_command_response",
        messageId: "resp-block-image",
        inReplyTo: blockImageRequest.messageId,
        payload: {
          command: "block_image_raw_get",
          statusCode: 200,
          data: {
            contentType: "image/png",
            bodyBase64: Buffer.from("fake-image").toString("base64"),
            contentLength: 10
          }
        }
      })
    );
    const blockImageRes = await blockImageApiPromise;
    assert.equal(blockImageRes.statusCode, 200);
    assert.equal(blockImageRes.headers["content-type"], "image/png");
    assert.equal(blockImageRes.body, "fake-image");

    // PASSO H.0.10: endpoint /blocks/:blockId/audio/raw com Range (worker-owned edge_filesystem)
    const blockAudioRequestPromise = waitForMessage(wsAgent);
    const blockAudioApiPromise = app.inject({
      method: "GET",
      url: "/blocks/block-1/audio/raw",
      headers: { cookie, range: "bytes=0-3" }
    });
    const blockAudioRequest = await blockAudioRequestPromise;
    assert.equal(blockAudioRequest.type, "worker_command_request");
    assert.equal(
      (blockAudioRequest.payload as { command: string }).command,
      "block_audio_raw_get"
    );
    assert.equal(
      (blockAudioRequest.payload as { params?: { range?: string } }).params?.range,
      "bytes=0-3"
    );
    wsAgent.send(
      JSON.stringify({
        type: "worker_command_response",
        messageId: "resp-block-audio",
        inReplyTo: blockAudioRequest.messageId,
        payload: {
          command: "block_audio_raw_get",
          statusCode: 206,
          data: {
            contentType: "audio/mpeg",
            bodyBase64: Buffer.from("abcd").toString("base64"),
            contentLength: 4,
            contentRange: "bytes 0-3/10"
          }
        }
      })
    );
    const blockAudioRes = await blockAudioApiPromise;
    assert.equal(blockAudioRes.statusCode, 206);
    assert.equal(blockAudioRes.headers["content-type"], "audio/mpeg");
    assert.equal(blockAudioRes.headers["content-range"], "bytes 0-3/10");
    assert.equal(blockAudioRes.body, "abcd");

    // PASSO H.0.11: endpoint /blocks/:blockId/slide (worker-owned edge_filesystem)
    const blockSlideRequestPromise = waitForMessage(wsAgent);
    const blockSlideApiPromise = app.inject({
      method: "GET",
      url: "/blocks/block-1/slide?templateId=template-1",
      headers: { cookie }
    });
    const blockSlideRequest = await blockSlideRequestPromise;
    assert.equal(blockSlideRequest.type, "worker_command_request");
    assert.equal(
      (blockSlideRequest.payload as { command: string }).command,
      "block_slide_get"
    );
    wsAgent.send(
      JSON.stringify({
        type: "worker_command_response",
        messageId: "resp-block-slide",
        inReplyTo: blockSlideRequest.messageId,
        payload: {
          command: "block_slide_get",
          statusCode: 200,
          data: {
            contentType: "image/png",
            bodyBase64: Buffer.from("fake-slide").toString("base64"),
            contentLength: 10
          }
        }
      })
    );
    const blockSlideRes = await blockSlideApiPromise;
    assert.equal(blockSlideRes.statusCode, 200);
    assert.equal(blockSlideRes.headers["content-type"], "image/png");
    assert.equal(blockSlideRes.body, "fake-slide");

    // PASSO H.0.12: endpoint /lesson-versions/:versionId/final-video (worker-owned edge_filesystem)
    const finalVideoRequestPromise = waitForMessage(wsAgent);
    const finalVideoApiPromise = app.inject({
      method: "GET",
      url: "/lesson-versions/version-1/final-video",
      headers: { cookie }
    });
    const finalVideoRequest = await finalVideoRequestPromise;
    assert.equal(finalVideoRequest.type, "worker_command_request");
    assert.equal(
      (finalVideoRequest.payload as { command: string }).command,
      "lesson_version_final_video_get"
    );
    wsAgent.send(
      JSON.stringify({
        type: "worker_command_response",
        messageId: "resp-final-video",
        inReplyTo: finalVideoRequest.messageId,
        payload: {
          command: "lesson_version_final_video_get",
          statusCode: 200,
          data: {
            contentType: "video/mp4",
            bodyBase64: Buffer.from("fake-video").toString("base64"),
            contentLength: 10
          }
        }
      })
    );
    const finalVideoRes = await finalVideoApiPromise;
    assert.equal(finalVideoRes.statusCode, 200);
    assert.equal(finalVideoRes.headers["content-type"], "video/mp4");
    assert.equal(finalVideoRes.body, "fake-video");

    // PASSO H.1: endpoint /integrations/ollama/health
    // O fluxo esperado é:
    // - API recebe chamada HTTP autenticada
    // - API envia integration_health_request para o agente WS
    // - Agente responde integration_health_response
    // - API devolve resposta HTTP para o cliente web
    const ollamaRequestPromise = waitForMessage(wsAgent);
    const ollamaApiPromise = app.inject({
      method: "GET",
      url: `/integrations/ollama/health?agentId=${agentId}`,
      headers: { cookie }
    });
    const ollamaRequest = await ollamaRequestPromise;
    assert.equal(ollamaRequest.type, "integration_health_request");
    // Confirma que a API pediu o provider correto ao agente.
    assert.equal((ollamaRequest.payload as { provider: string }).provider, "ollama");

    // Simula resposta do worker local para Ollama saudável.
    wsAgent.send(
      JSON.stringify({
        type: "integration_health_response",
        messageId: "resp-ollama",
        inReplyTo: ollamaRequest.messageId,
        payload: {
          provider: "ollama",
          statusCode: 200,
          data: { ok: true, baseUrl: "http://127.0.0.1:11434", models: ["llama3.2:3b"] }
        }
      })
    );
    const ollamaRes = await ollamaApiPromise;
    // A API deve repassar sucesso (200) para o chamador HTTP.
    assert.equal(ollamaRes.statusCode, 200);
    assert.equal((ollamaRes.json() as { ok: boolean }).ok, true);

    // PASSO H.2: endpoint /integrations/xtts/health
    // Mesmo fluxo WS, mas agora simulando provider indisponível.
    const xttsRequestPromise = waitForMessage(wsAgent);
    const xttsApiPromise = app.inject({
      method: "GET",
      url: `/integrations/xtts/health?agentId=${agentId}`,
      headers: { cookie }
    });
    const xttsRequest = await xttsRequestPromise;
    // Confirma provider pedido ao agente.
    assert.equal((xttsRequest.payload as { provider: string }).provider, "xtts");

    // Simula falha do provider no lado cliente/worker.
    wsAgent.send(
      JSON.stringify({
        type: "integration_health_response",
        messageId: "resp-xtts",
        inReplyTo: xttsRequest.messageId,
        payload: {
          provider: "xtts",
          statusCode: 503,
          data: { ok: false, error: "provider_unavailable" }
        }
      })
    );
    const xttsRes = await xttsApiPromise;
    // API deve traduzir para erro funcional de indisponibilidade.
    assert.equal(xttsRes.statusCode, 503);
    assert.equal((xttsRes.json() as { error: string }).error, "provider_unavailable");

    // PASSO H.3: endpoint /integrations/comfyui/health
    // Testa fluxo WS em endpoint POST com payload adicional (baseUrl).
    const comfyRequestPromise = waitForMessage(wsAgent);
    const comfyApiPromise = app.inject({
      method: "POST",
      url: "/integrations/comfyui/health",
      headers: { cookie },
      payload: { agentId, baseUrl: "http://127.0.0.1:8188" }
    });
    const comfyRequest = await comfyRequestPromise;
    // Confirma provider pedido ao agente.
    assert.equal((comfyRequest.payload as { provider: string }).provider, "comfyui");

    // Simula retorno saudável do ComfyUI local.
    wsAgent.send(
      JSON.stringify({
        type: "integration_health_response",
        messageId: "resp-comfy",
        inReplyTo: comfyRequest.messageId,
        payload: {
          provider: "comfyui",
          statusCode: 200,
          data: { ok: true, baseUrl: "http://127.0.0.1:8188" }
        }
      })
    );
    const comfyRes = await comfyApiPromise;
    // A API devolve sucesso para o cliente HTTP.
    assert.equal(comfyRes.statusCode, 200);
    assert.equal((comfyRes.json() as { ok: boolean }).ok, true);

    // Resultado final do teste:
    // - a delegação via WS funciona para os três providers;
    // - o hello_ack já carrega snapshot de configuração inicial;
    // - o roteamento respeita o agente conectado do workspace.
  } finally {
    if (settingsOverridden) {
      const restoreSettingsRes = await app.inject({
        method: "PATCH",
        url: "/settings",
        headers: { cookie },
        payload: {
          llm: { baseUrl: originalLlmBaseUrl },
          comfy: { baseUrl: originalComfyBaseUrl },
          tts: { baseUrl: originalTtsBaseUrl }
        }
      });
      assert.equal(restoreSettingsRes.statusCode, 200);
    }
  }
  }
);

test(
  "agent-control ws: integration health failure scenarios are mapped with controlled errors",
  { concurrency: false },
  async () => {
    // PASSO A: reutiliza admin já bootstrapado no teste anterior.
    if (wsAgent && wsAgent.readyState === WebSocket.OPEN) {
      await new Promise<void>((resolve) => {
        wsAgent?.once("close", () => resolve());
        wsAgent?.close();
      });
      wsAgent = null;
    }
    const loginRes = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "owner-agent-ws@vizlec.test",
        password: "StrongPass123!"
      }
    });
    assert.equal(loginRes.statusCode, 200);
    const cookie = Array.isArray(loginRes.headers["set-cookie"])
      ? loginRes.headers["set-cookie"][0]
      : loginRes.headers["set-cookie"];
    assert.ok(cookie);

    // PASSO B: gera token de pareamento e valida worker.
    const pairingRes = await app.inject({
      method: "POST",
      url: "/agent-control/pairing-token",
      headers: { cookie }
    });
    assert.equal(pairingRes.statusCode, 201);
    const pairingToken = (pairingRes.json() as { pairingToken: string }).pairingToken;

    const validateWorkerRes = await app.inject({
      method: "POST",
      url: "/agent-control/validate-worker",
      payload: {
        pairingToken,
        label: "agent-ws-failures",
        machineFingerprint: "machine-fingerprint-ws-failures"
      }
    });
    assert.equal(validateWorkerRes.statusCode, 200);
    const workerCreds = validateWorkerRes.json() as {
      AGENT_CONTROL_TOKEN: string;
      WORKSPACE_ID: string;
      AGENT_ID: string;
    };
    const agentId = workerCreds.AGENT_ID;
    const agentControlToken = workerCreds.AGENT_CONTROL_TOKEN;

    // PASSO C: conecta agente WS e registra agent_hello.
    wsAgent = new WebSocket(`${baseUrl.replace(/^http/, "ws")}/ws/agent-control`, {
      headers: { Authorization: `Bearer ${agentControlToken}` }
    });
    await waitForOpen(wsAgent);

    wsAgent.send(
      JSON.stringify({
        type: "agent_hello",
        messageId: "hello-failures-1",
        payload: {
          workspaceId: workerCreds.WORKSPACE_ID,
          agentId,
          label: "agent-ws-failures"
        }
      })
    );
    const helloAck = await waitForMessage(wsAgent);
    assert.equal(helloAck.type, "agent_hello_ack");

    // Cenário A: ollama indisponível deve retornar 503 controlado.
    const ollamaRequestPromise = waitForMessage(wsAgent);
    const ollamaApiPromise = app.inject({
      method: "GET",
      url: `/integrations/ollama/health?agentId=${agentId}`,
      headers: { cookie }
    });
    const ollamaRequest = await ollamaRequestPromise;
    assert.equal(ollamaRequest.type, "integration_health_request");
    assert.equal((ollamaRequest.payload as { provider: string }).provider, "ollama");
    wsAgent.send(
      JSON.stringify({
        type: "integration_health_response",
        messageId: "resp-ollama-unavailable",
        inReplyTo: ollamaRequest.messageId,
        payload: {
          provider: "ollama",
          statusCode: 503,
          data: { ok: false, error: "provider_unavailable" }
        }
      })
    );
    const ollamaRes = await ollamaApiPromise;
    assert.equal(ollamaRes.statusCode, 503);
    assert.equal((ollamaRes.json() as { error: string }).error, "provider_unavailable");

    // Cenário B: xtts indisponível deve retornar 503 controlado.
    const xttsRequestPromise = waitForMessage(wsAgent);
    const xttsApiPromise = app.inject({
      method: "GET",
      url: `/integrations/xtts/health?agentId=${agentId}`,
      headers: { cookie }
    });
    const xttsRequest = await xttsRequestPromise;
    assert.equal(xttsRequest.type, "integration_health_request");
    assert.equal((xttsRequest.payload as { provider: string }).provider, "xtts");
    wsAgent.send(
      JSON.stringify({
        type: "integration_health_response",
        messageId: "resp-xtts-unavailable",
        inReplyTo: xttsRequest.messageId,
        payload: {
          provider: "xtts",
          statusCode: 503,
          data: { ok: false, error: "provider_unavailable" }
        }
      })
    );
    const xttsRes = await xttsApiPromise;
    assert.equal(xttsRes.statusCode, 503);
    assert.equal((xttsRes.json() as { error: string }).error, "provider_unavailable");

    // Cenário C.1: comfyui com erro de validação deve preservar 400.
    const comfyBadRequestPromise = waitForMessage(wsAgent);
    const comfyBadApiPromise = app.inject({
      method: "POST",
      url: "/integrations/comfyui/health",
      headers: { cookie },
      payload: { agentId, baseUrl: "http://127.0.0.1:8188" }
    });
    const comfyBadRequest = await comfyBadRequestPromise;
    assert.equal(comfyBadRequest.type, "integration_health_request");
    assert.equal((comfyBadRequest.payload as { provider: string }).provider, "comfyui");
    wsAgent.send(
      JSON.stringify({
        type: "integration_health_response",
        messageId: "resp-comfy-bad-request",
        inReplyTo: comfyBadRequest.messageId,
        payload: {
          provider: "comfyui",
          statusCode: 400,
          data: { ok: false, error: "invalid_base_url" }
        }
      })
    );
    const comfyBadRes = await comfyBadApiPromise;
    assert.equal(comfyBadRes.statusCode, 400);
    assert.equal((comfyBadRes.json() as { error: string }).error, "invalid_base_url");

    // Cenário C.2: comfyui indisponível deve retornar 503.
    const comfyUnavailableRequestPromise = waitForMessage(wsAgent);
    const comfyUnavailableApiPromise = app.inject({
      method: "POST",
      url: "/integrations/comfyui/health",
      headers: { cookie },
      payload: { agentId, baseUrl: "http://127.0.0.1:8188" }
    });
    const comfyUnavailableRequest = await comfyUnavailableRequestPromise;
    assert.equal(comfyUnavailableRequest.type, "integration_health_request");
    assert.equal(
      (comfyUnavailableRequest.payload as { provider: string }).provider,
      "comfyui"
    );
    wsAgent.send(
      JSON.stringify({
        type: "integration_health_response",
        messageId: "resp-comfy-unavailable",
        inReplyTo: comfyUnavailableRequest.messageId,
        payload: {
          provider: "comfyui",
          statusCode: 503,
          data: { ok: false, error: "provider_unavailable" }
        }
      })
    );
    const comfyUnavailableRes = await comfyUnavailableApiPromise;
    assert.equal(comfyUnavailableRes.statusCode, 503);
    assert.equal(
      (comfyUnavailableRes.json() as { error: string }).error,
      "provider_unavailable"
    );

    // Cenário E: timeout de resposta do agente deve retornar erro controlado.
    const timeoutRequestPromise = waitForMessage(wsAgent);
    const timeoutApiPromise = app.inject({
      method: "GET",
      url: `/integrations/ollama/health?agentId=${agentId}`,
      headers: { cookie }
    });
    const timeoutRequest = await timeoutRequestPromise;
    assert.equal(timeoutRequest.type, "integration_health_request");
    assert.equal((timeoutRequest.payload as { provider: string }).provider, "ollama");
    const timeoutRes = await timeoutApiPromise;
    assert.equal(timeoutRes.statusCode, 503);
    assert.equal((timeoutRes.json() as { error: string }).error, "agent_response_timeout");

    // Cenário D: agente offline (sem sessão WS) deve retornar 503 agent_offline.
    await new Promise<void>((resolve) => {
      (wsAgent as WebSocket).once("close", () => resolve());
      (wsAgent as WebSocket).close();
    });
    wsAgent = null;
    await new Promise((resolve) => setTimeout(resolve, 25));

    const offlineRes = await app.inject({
      method: "GET",
      url: `/integrations/xtts/health?agentId=${agentId}`,
      headers: { cookie }
    });
    assert.equal(offlineRes.statusCode, 503);
    assert.equal((offlineRes.json() as { error: string }).error, "agent_offline");
  }
);
