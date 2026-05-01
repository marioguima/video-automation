import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import WebSocket from "ws";
import type { FastifyInstance } from "fastify";
import { createPrismaClient, type PrismaClient } from "@vizlec/db";
import { createApiTestRuntime } from "./utils/api-test-runtime.ts";

const runtime = createApiTestRuntime("vizlec-worker-ws-command-path-");

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

  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  baseUrl = address;
});

after(async () => {
  if (wsAgent && wsAgent.readyState === WebSocket.OPEN) {
    wsAgent.close();
  }
  if (app) await app.close();
  if (prisma) await prisma.$disconnect();
  runtime.cleanup();
});

test("6.8.2.6.7 cenário A/D: enqueue wake via WS e hard-cleanup online/offline", async () => {
  const bootstrapRes = await app.inject({
    method: "POST",
    url: "/auth/bootstrap-admin",
    payload: {
      name: "Owner WS Command Path",
      email: "owner-ws-command-path@vizlec.test",
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
  const meBody = meRes.json() as { scope: { workspaceId: string } };
  const workspaceId = meBody.scope.workspaceId;

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
      label: "agent-ws-command-path",
      machineFingerprint: "ws-command-path-test"
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
        label: "agent-ws-command-path"
      }
    })
  );
  const helloAck = await waitForMessage(wsAgent);
  assert.equal(helloAck.type, "agent_hello_ack");

  const course = await prisma.course.create({
    data: {
      workspaceId,
      name: "Course WS Wake",
      status: "draft"
    }
  });
  const moduleItem = await prisma.module.create({
    data: {
      workspaceId,
      courseId: course.id,
      name: "Module WS Wake",
      order: 1
    }
  });
  const lesson = await prisma.lesson.create({
    data: {
      workspaceId,
      moduleId: moduleItem.id,
      order: 1,
      title: "Lesson WS Wake"
    }
  });
  const version = await prisma.lessonVersion.create({
    data: {
      workspaceId,
      lessonId: lesson.id,
      scriptText: "texto para validar wake via ws",
      speechRateWps: 2.5
    }
  });

  // Cenário A: enqueue de job precisa acordar worker por WS (sem HTTP interno).
  const wakeRequestPromise = waitForMessage(wsAgent);
  const segmentResPromise = app.inject({
    method: "POST",
    url: `/lesson-versions/${version.id}/segment`,
    headers: { cookie },
    payload: {
      clientId: workerCreds.AGENT_ID,
      requestId: "seg-ws-wake"
    }
  });
  const wakeRequest = await wakeRequestPromise;
  assert.equal(wakeRequest.type, "worker_command_request");
  assert.equal(
    (wakeRequest.payload as { command?: string }).command,
    "worker_queue_wake"
  );
  wsAgent.send(
    JSON.stringify({
      type: "worker_command_response",
      messageId: "resp-wake-1",
      inReplyTo: wakeRequest.messageId,
      payload: {
        command: "worker_queue_wake",
        statusCode: 202,
        data: { ok: true }
      }
    })
  );
  const segmentRes = await segmentResPromise;
  assert.equal(segmentRes.statusCode, 201);

  // Garante queue vazia antes do hard-cleanup remoto.
  await prisma.job.updateMany({
    where: {
      workspaceId,
      status: { in: ["pending", "running"] }
    },
    data: {
      status: "canceled",
      error: "test cleanup",
      canceledAt: new Date(),
      leaseExpiresAt: new Date()
    }
  });

  // Cenário D (online): hard-cleanup via WS com agente conectado.
  const hardCleanupRequestPromise = waitForMessage(wsAgent);
  const hardCleanupResPromise = app.inject({
    method: "POST",
    url: "/system/hard-cleanup",
    headers: { cookie },
    payload: { reason: "scenario-d-online" }
  });
  const hardCleanupRequest = await hardCleanupRequestPromise;
  assert.equal(hardCleanupRequest.type, "worker_command_request");
  assert.equal(
    (hardCleanupRequest.payload as { command?: string }).command,
    "system_hard_cleanup"
  );
  wsAgent.send(
    JSON.stringify({
      type: "worker_command_response",
      messageId: "resp-hard-cleanup-online",
      inReplyTo: hardCleanupRequest.messageId,
      payload: {
        command: "system_hard_cleanup",
        statusCode: 200,
        data: { ok: true, skipped: false }
      }
    })
  );
  const hardCleanupOnlineRes = await hardCleanupResPromise;
  assert.equal(hardCleanupOnlineRes.statusCode, 200);
  assert.equal((hardCleanupOnlineRes.json() as { ok: boolean }).ok, true);

  // Cenário D (offline): sem sessão de agente, endpoint retorna erro controlado.
  wsAgent.close();
  await waitForClose(wsAgent);
  wsAgent = null;

  let observedOffline = false;
  for (let i = 0; i < 50; i += 1) {
    const agent = await prisma.agent.findUnique({
      where: { id: workerCreds.AGENT_ID },
      select: { status: true }
    });
    if (agent?.status === "offline") {
      observedOffline = true;
      break;
    }
    await sleep(100);
  }
  assert.equal(observedOffline, true);

  const hardCleanupOfflineRes = await app.inject({
    method: "POST",
    url: "/system/hard-cleanup",
    headers: { cookie },
    payload: { reason: "scenario-d-offline" }
  });
  assert.equal(hardCleanupOfflineRes.statusCode, 503);
  assert.equal(
    (hardCleanupOfflineRes.json() as { error: string }).error,
    "agent_offline"
  );
});
