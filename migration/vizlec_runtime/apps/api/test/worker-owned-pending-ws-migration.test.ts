import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import WebSocket from "ws";
import type { FastifyInstance } from "fastify";
import { createPrismaClient, type PrismaClient } from "@vizlec/db";
import { createApiTestRuntime } from "./utils/api-test-runtime.ts";

const runtime = createApiTestRuntime("vizlec-worker-owned-pending-ws-");

let app: FastifyInstance;
let prisma: PrismaClient;
let baseUrl = "";
let wsAgent: WebSocket | null = null;

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

function waitForClose(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (socket.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    socket.once("close", () => resolve());
  });
}

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

before(async () => {
  runtime.resetDatabase();
  runtime.configureEnv();
  process.env.AGENT_CONTROL_TOKEN_SECRET = "test-agent-control-secret";

  const mod = await import("../src/index.ts");
  app = mod.fastify as FastifyInstance;
  await app.ready();
  prisma = createPrismaClient();
  baseUrl = await app.listen({ port: 0, host: "127.0.0.1" });
});

after(async () => {
  if (wsAgent && wsAgent.readyState === WebSocket.OPEN) {
    wsAgent.close();
  }
  if (app) await app.close();
  if (prisma) await prisma.$disconnect();
  runtime.cleanup();
});

test("6.8.2.6.4: POST images/final-video delegam via WS com mapeamento de status e fallback offline", async () => {
  // Objetivo do teste:
  // 1) validar delegacao WS dos endpoints pendentes worker-owned (images e final-video);
  // 2) validar propagacao de status upstream 201/400/404;
  // 3) validar fallback 503 com agent_offline sem sessao WS.
  const bootstrapRes = await app.inject({
    method: "POST",
    url: "/auth/bootstrap-admin",
    payload: {
      name: "Owner Pending WS",
      email: "owner-pending-ws@vizlec.test",
      password: "StrongPass123!"
    }
  });
  assert.equal(bootstrapRes.statusCode, 201);
  const cookie = Array.isArray(bootstrapRes.headers["set-cookie"])
    ? bootstrapRes.headers["set-cookie"][0]
    : bootstrapRes.headers["set-cookie"];
  assert.ok(cookie);

  const meRes = await app.inject({
    method: "GET",
    url: "/auth/me",
    headers: { cookie }
  });
  assert.equal(meRes.statusCode, 200);
  const workspaceId = (meRes.json() as { scope: { workspaceId: string } }).scope.workspaceId;

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
      label: "agent-pending-ws",
      machineFingerprint: "pending-ws-test"
    }
  });
  assert.equal(validateWorkerRes.statusCode, 200);
  const workerCreds = validateWorkerRes.json() as {
    AGENT_CONTROL_TOKEN: string;
    WORKSPACE_ID: string;
    AGENT_ID: string;
  };
  assert.equal(workerCreds.WORKSPACE_ID, workspaceId);

  wsAgent = new WebSocket(`${baseUrl.replace(/^http/, "ws")}/ws/agent-control`, {
    headers: {
      Authorization: `Bearer ${workerCreds.AGENT_CONTROL_TOKEN}`
    }
  });
  await waitForOpen(wsAgent);

  wsAgent.send(
    JSON.stringify({
      type: "agent_hello",
      messageId: "hello-1",
      payload: {
        workspaceId: workerCreds.WORKSPACE_ID,
        agentId: workerCreds.AGENT_ID,
        label: "agent-pending-ws"
      }
    })
  );
  const helloAck = await waitForMessage(wsAgent);
  assert.equal(helloAck.type, "agent_hello_ack");

  // Cenário A: images online com 201.
  const imagesReqPromise = waitForMessage(wsAgent);
  const imagesApiPromise = app.inject({
    method: "POST",
    url: "/lesson-versions/version-1/images",
    headers: { cookie },
    payload: { clientId: workerCreds.AGENT_ID, requestId: "req-images-201" }
  });
  const imagesReq = await imagesReqPromise;
  assert.equal(imagesReq.type, "worker_command_request");
  assert.equal(
    (imagesReq.payload as { command: string }).command,
    "lesson_version_images_post"
  );
  wsAgent.send(
    JSON.stringify({
      type: "worker_command_response",
      messageId: "resp-images-201",
      inReplyTo: imagesReq.messageId,
      payload: {
        command: "lesson_version_images_post",
        statusCode: 201,
        data: { id: "job-images-201", status: "pending" }
      }
    })
  );
  const imagesRes = await imagesApiPromise;
  assert.equal(imagesRes.statusCode, 201);

  // Cenário B: final-video online com 201.
  const finalReqPromise = waitForMessage(wsAgent);
  const finalApiPromise = app.inject({
    method: "POST",
    url: "/lesson-versions/version-1/final-video",
    headers: { cookie },
    payload: { clientId: workerCreds.AGENT_ID, requestId: "req-final-201" }
  });
  const finalReq = await finalReqPromise;
  assert.equal(finalReq.type, "worker_command_request");
  assert.equal(
    (finalReq.payload as { command: string }).command,
    "lesson_version_final_video_post"
  );
  wsAgent.send(
    JSON.stringify({
      type: "worker_command_response",
      messageId: "resp-final-201",
      inReplyTo: finalReq.messageId,
      payload: {
        command: "lesson_version_final_video_post",
        statusCode: 201,
        data: { id: "job-final-201", status: "pending" }
      }
    })
  );
  const finalRes = await finalApiPromise;
  assert.equal(finalRes.statusCode, 201);

  // Cenário D: erro upstream 404/400 propagado.
  const images404ReqPromise = waitForMessage(wsAgent);
  const images404ApiPromise = app.inject({
    method: "POST",
    url: "/lesson-versions/version-1/images",
    headers: { cookie },
    payload: { clientId: workerCreds.AGENT_ID, requestId: "req-images-404" }
  });
  const images404Req = await images404ReqPromise;
  wsAgent.send(
    JSON.stringify({
      type: "worker_command_response",
      messageId: "resp-images-404",
      inReplyTo: images404Req.messageId,
      payload: {
        command: "lesson_version_images_post",
        statusCode: 404,
        data: { error: "lesson version not found" }
      }
    })
  );
  const images404Res = await images404ApiPromise;
  assert.equal(images404Res.statusCode, 404);

  const final400ReqPromise = waitForMessage(wsAgent);
  const final400ApiPromise = app.inject({
    method: "POST",
    url: "/lesson-versions/version-1/final-video",
    headers: { cookie },
    payload: { clientId: workerCreds.AGENT_ID, requestId: "req-final-400" }
  });
  const final400Req = await final400ReqPromise;
  wsAgent.send(
    JSON.stringify({
      type: "worker_command_response",
      messageId: "resp-final-400",
      inReplyTo: final400Req.messageId,
      payload: {
        command: "lesson_version_final_video_post",
        statusCode: 400,
        data: { error: "no blocks available to render final video" }
      }
    })
  );
  const final400Res = await final400ApiPromise;
  assert.equal(final400Res.statusCode, 400);

  // Cenário C: agente offline retorna 503 controlado.
  wsAgent.close();
  await waitForClose(wsAgent);
  wsAgent = null;
  await sleep(50);

  const imagesOfflineRes = await app.inject({
    method: "POST",
    url: "/lesson-versions/version-1/images",
    headers: { cookie },
    payload: { clientId: workerCreds.AGENT_ID, requestId: "req-images-offline" }
  });
  assert.equal(imagesOfflineRes.statusCode, 503);
  assert.equal((imagesOfflineRes.json() as { error: string }).error, "agent_offline");

  const finalOfflineRes = await app.inject({
    method: "POST",
    url: "/lesson-versions/version-1/final-video",
    headers: { cookie },
    payload: { clientId: workerCreds.AGENT_ID, requestId: "req-final-offline" }
  });
  assert.equal(finalOfflineRes.statusCode, 503);
  assert.equal((finalOfflineRes.json() as { error: string }).error, "agent_offline");
});

