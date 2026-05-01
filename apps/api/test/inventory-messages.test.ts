import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import type { FastifyInstance } from "fastify";
import { createPrismaClient, type PrismaClient } from "@vizlec/db";
import { createApiTestRuntime } from "./utils/api-test-runtime.ts";

// Runtime compartilhado:
// - cria banco temporário por teste
// - configura env para a API rodar in-memory (fastify.inject)
// - limpa artefatos ao final
const runtime = createApiTestRuntime("vizlec-inventory-messages-");

let app: FastifyInstance;
let prisma: PrismaClient;

before(async () => {
  // 1) Reseta banco para estado limpo e previsível.
  runtime.resetDatabase();
  // 2) Configura variáveis de ambiente usadas pela API no teste.
  runtime.configureEnv();

  // 3) Carrega a API sem abrir porta HTTP real.
  const mod = await import("../src/index.ts");
  app = mod.fastify as FastifyInstance;
  await app.ready();
  // 4) Prisma auxiliar para montar dados de cenário (workspaces/agentes).
  prisma = createPrismaClient();
});

after(async () => {
  // Encerra recursos para evitar lock de arquivo no SQLite (especialmente no Windows).
  if (app) {
    await app.close();
  }
  if (prisma) {
    await prisma.$disconnect();
  }
  runtime.cleanup();
});

// Objetivo do teste:
// validar o contrato interno de inventário:
// - inventory_snapshot cria estado base para um agente;
// - inventory_delta atualiza estado base por soma de deltas;
// - guard de workspace bloqueia agente de outro workspace.
//
// O endpoint é interno (worker -> control plane), por isso usa x-internal-token.
//
// Importante sobre "quem envia":
// - Em produção, quem envia POST para /internal/inventory/snapshot e /internal/inventory/delta
//   é o worker/edge (máquina do cliente), nunca o navegador do usuário final.
// - Neste teste NÃO subimos o worker real; usamos app.inject(...) para simular
//   a chamada HTTP que o worker faria. Ou seja, este teste representa o comportamento
//   do worker sem depender de processo externo.
test("inventory messages: snapshot creates base state and delta updates it with workspace guard", async () => {
  // Cria admin inicial e sessão autenticada.
  const bootstrapRes = await app.inject({
    method: "POST",
    url: "/auth/bootstrap-admin",
    payload: {
      name: "Owner Inventory",
      email: "owner-inventory@vizlec.test",
      password: "StrongPass123!"
    }
  });
  assert.equal(bootstrapRes.statusCode, 201);
  const cookie = Array.isArray(bootstrapRes.headers["set-cookie"])
    ? bootstrapRes.headers["set-cookie"][0]
    : bootstrapRes.headers["set-cookie"];
  assert.ok(cookie);

  // Descobre o workspace do admin (workspace A), criado automaticamente no bootstrap.
  const meRes = await app.inject({
    method: "GET",
    url: "/auth/me",
    headers: { cookie }
  });
  assert.equal(meRes.statusCode, 200);
  const meBody = meRes.json() as { scope: { workspaceId: string } };
  const workspaceA = meBody.scope.workspaceId;

  // Prepara cenário A/B:
  // - agentA no workspace do usuário logado (A)
  // - agentB em workspace diferente (B)
  const workspaceB = await prisma.workspace.create({
    data: { name: "Workspace B" }
  });
  const agentA = await prisma.agent.create({
    data: { workspaceId: workspaceA, label: "agent-a", status: "online" }
  });
  const agentB = await prisma.agent.create({
    data: { workspaceId: workspaceB.id, label: "agent-b", status: "online" }
  });

  // Simulação da chamada do worker:
  // worker publica snapshot completo para inicializar o estado no control plane.
  const snapshotRes = await app.inject({
    method: "POST",
    url: "/internal/inventory/snapshot",
    headers: { "x-internal-token": "test-internal-token" },
    payload: {
      workspaceId: workspaceA,
      agentId: agentA.id,
      snapshot: {
        audioCount: 2,
        durationSeconds: 11.5,
      diskUsageBytes: 1200
      }
    }
  });
  // Snapshot deve criar estado inicial do inventário do agentA.
  assert.equal(snapshotRes.statusCode, 200);
  const snapshotBody = snapshotRes.json() as {
    ok: boolean;
    inventory: { audioCount: number; durationSeconds: number; diskUsageBytes: number };
  };
  assert.equal(snapshotBody.ok, true);
  assert.equal(snapshotBody.inventory.audioCount, 2);
  assert.equal(snapshotBody.inventory.durationSeconds, 11.5);
  assert.equal(snapshotBody.inventory.diskUsageBytes, 1200);

  // Delta deve ser aplicado sobre o snapshot existente.
  // Esperado:
  // audioCount: 2 + 1 = 3
  // durationSeconds: 11.5 + 3.5 = 15
  // diskUsageBytes: 1200 + 300 = 1500
  // Simulação da chamada do worker:
  // worker publica apenas o delta (diferença) desde o último snapshot.
  const deltaRes = await app.inject({
    method: "POST",
    url: "/internal/inventory/delta",
    headers: { "x-internal-token": "test-internal-token" },
    payload: {
      workspaceId: workspaceA,
      agentId: agentA.id,
      delta: {
        audioCountDelta: 1,
        durationSecondsDelta: 3.5,
        diskUsageBytesDelta: 300
      }
    }
  });
  assert.equal(deltaRes.statusCode, 200);
  const deltaBody = deltaRes.json() as {
    ok: boolean;
    inventory: { audioCount: number; durationSeconds: number; diskUsageBytes: number };
  };
  assert.equal(deltaBody.ok, true);
  assert.equal(deltaBody.inventory.audioCount, 3);
  assert.equal(deltaBody.inventory.durationSeconds, 15);
  assert.equal(deltaBody.inventory.diskUsageBytes, 1500);

  // Segurança: tentativa de publicar snapshot com workspaceA usando agentB (workspaceB)
  // deve falhar com agent_workspace_mismatch.
  // Simulação de tentativa inválida (como se um worker/agente de outro workspace
  // enviasse dados com workspace incompatível). A API deve bloquear.
  const mismatchRes = await app.inject({
    method: "POST",
    url: "/internal/inventory/snapshot",
    headers: { "x-internal-token": "test-internal-token" },
    payload: {
      workspaceId: workspaceA,
      agentId: agentB.id,
      snapshot: {
        audioCount: 1,
        durationSeconds: 1,
        diskUsageBytes: 1
      }
    }
  });
  assert.equal(mismatchRes.statusCode, 403);
  assert.equal((mismatchRes.json() as { error: string }).error, "agent_workspace_mismatch");
});
