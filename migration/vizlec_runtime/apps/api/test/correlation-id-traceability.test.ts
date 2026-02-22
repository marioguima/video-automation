import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import WebSocket from "ws";
import type { FastifyInstance } from "fastify";
import { createPrismaClient, type PrismaClient } from "@vizlec/db";
import { createApiTestRuntime } from "./utils/api-test-runtime.ts";

const runtime = createApiTestRuntime("vizlec-correlation-id-");

let app: FastifyInstance;
let prisma: PrismaClient;
let baseUrl = "";
let wsAgent: WebSocket | null = null;
let cookie = "";
let workspaceId = "";
let agentId = "";

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
  runtime.resetDatabase();
  runtime.configureEnv();
  process.env.AGENT_CONTROL_TOKEN_SECRET = "test-agent-control-secret";
  process.env.AGENT_CONTROL_REQUEST_TIMEOUT_MS = "120";

  const mod = await import("../src/index.ts");
  app = mod.fastify as FastifyInstance;
  await app.ready();
  prisma = createPrismaClient();

  baseUrl = await app.listen({ port: 0, host: "127.0.0.1" });

  const bootstrapRes = await app.inject({
    method: "POST",
    url: "/auth/bootstrap-admin",
    payload: {
      name: "Owner Correlation",
      email: "owner-correlation@vizlec.test",
      password: "StrongPass123!"
    }
  });
  assert.equal(bootstrapRes.statusCode, 201);

  cookie = Array.isArray(bootstrapRes.headers["set-cookie"])
    ? bootstrapRes.headers["set-cookie"][0] ?? ""
    : (bootstrapRes.headers["set-cookie"] ?? "");
  assert.ok(cookie);

  const meRes = await app.inject({
    method: "GET",
    url: "/auth/me",
    headers: { cookie }
  });
  assert.equal(meRes.statusCode, 200);
  workspaceId = (meRes.json() as { scope: { workspaceId: string } }).scope.workspaceId;

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
      label: "agent-correlation",
      machineFingerprint: "machine-correlation"
    }
  });
  assert.equal(validateWorkerRes.statusCode, 200);
  const workerCreds = validateWorkerRes.json() as {
    AGENT_CONTROL_TOKEN: string;
    WORKSPACE_ID: string;
    AGENT_ID: string;
  };
  agentId = workerCreds.AGENT_ID;
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
      messageId: "hello-correlation",
      payload: {
        workspaceId,
        agentId,
        label: "agent-correlation"
      }
    })
  );
  const helloAck = await waitForMessage(wsAgent);
  assert.equal(helloAck.type, "agent_hello_ack");
});

after(async () => {
  if (wsAgent && wsAgent.readyState === WebSocket.OPEN) {
    wsAgent.close();
  }
  if (app) await app.close();
  if (prisma) await prisma.$disconnect();
  runtime.cleanup();
});

test("correlation id is propagated in HTTP->WS and preserved on timeout", async () => {
  assert.ok(wsAgent);

  const correlationIdOk = "corr-health-xtts-001";
  const xttsRequestPromise = waitForMessage(wsAgent as WebSocket);
  const xttsApiPromise = app.inject({
    method: "GET",
    url: `/integrations/xtts/health?agentId=${agentId}`,
    headers: {
      cookie,
      "x-correlation-id": correlationIdOk
    }
  });

  const xttsRequest = await xttsRequestPromise;
  assert.equal(xttsRequest.type, "integration_health_request");
  assert.equal(
    (xttsRequest.payload as { correlationId?: string }).correlationId,
    correlationIdOk
  );

  (wsAgent as WebSocket).send(
    JSON.stringify({
      type: "integration_health_response",
      messageId: "resp-corr-ok",
      inReplyTo: xttsRequest.messageId,
      payload: {
        provider: "xtts",
        statusCode: 200,
        data: { ok: true, baseUrl: "http://127.0.0.1:8020" }
      }
    })
  );

  const xttsRes = await xttsApiPromise;
  assert.equal(xttsRes.statusCode, 200);
  assert.equal(xttsRes.headers["x-correlation-id"], correlationIdOk);

  const correlationIdTimeout = "corr-health-ollama-timeout-001";
  const timeoutRequestPromise = waitForMessage(wsAgent as WebSocket);
  const timeoutApiPromise = app.inject({
    method: "GET",
    url: `/integrations/ollama/health?agentId=${agentId}`,
    headers: {
      cookie,
      "x-correlation-id": correlationIdTimeout
    }
  });

  const timeoutRequest = await timeoutRequestPromise;
  assert.equal(timeoutRequest.type, "integration_health_request");
  assert.equal(
    (timeoutRequest.payload as { correlationId?: string }).correlationId,
    correlationIdTimeout
  );

  const timeoutRes = await timeoutApiPromise;
  assert.equal(timeoutRes.statusCode, 503);
  assert.equal(timeoutRes.headers["x-correlation-id"], correlationIdTimeout);
  assert.equal(
    (timeoutRes.json() as { error?: string }).error,
    "agent_response_timeout"
  );
});
