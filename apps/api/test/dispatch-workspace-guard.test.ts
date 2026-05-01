import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import type { FastifyInstance } from "fastify";
import { createPrismaClient, type PrismaClient } from "@vizlec/db";
import { createApiTestRuntime } from "./utils/api-test-runtime.ts";

// Reaproveita utilitário comum de testes:
// - banco temporário isolado
// - env da API para execução in-memory
// - limpeza de artefatos após teste
const runtime = createApiTestRuntime("vizlec-dispatch-guard-");

let app: FastifyInstance;
let prisma: PrismaClient;

before(async () => {
  // 1) Zera o banco do cenário.
  runtime.resetDatabase();
  // 2) Configura variáveis de ambiente de teste.
  runtime.configureEnv();

  // 3) Carrega a API sem abrir porta (usa fastify.inject()).
  const mod = await import("../src/index.ts");
  app = mod.fastify as FastifyInstance;
  await app.ready();
  // 4) Cliente Prisma para montar dados de cenário diretamente no DB.
  prisma = createPrismaClient();
});

after(async () => {
  // Encerra recursos para evitar lock de arquivo SQLite no Windows.
  if (app) {
    await app.close();
  }
  if (prisma) {
    await prisma.$disconnect();
  }
  runtime.cleanup();
});

// Objetivo do teste:
// validar isolamento de dispatch por workspace via agent/clientId.
//
// O que este teste prova:
// - usuário do workspace A consegue despachar para agent A;
// - usuário do workspace A NÃO consegue despachar para agent B (workspace diferente);
// - usuário do workspace A NÃO consegue ler job associado ao agent B.
//
// Observação importante sobre o modelo atual:
// as entidades do domínio já carregam workspaceId próprio.
// Este teste permanece focado no guard de dispatch por agent/clientId.
test("dispatch guard: user from workspace A cannot dispatch/read jobs from workspace B agent", async () => {
  // Bootstrap cria o primeiro admin e, no backend, garante um workspace padrão.
  const bootstrapRes = await app.inject({
    method: "POST",
    url: "/auth/bootstrap-admin",
    payload: {
      name: "Owner A",
      email: "owner-a@vizlec.test",
      password: "StrongPass123!"
    }
  });
  assert.equal(bootstrapRes.statusCode, 201);
  // Captura cookie de sessão para simular navegador autenticado.
  const setCookie = bootstrapRes.headers["set-cookie"];
  assert.ok(setCookie);
  const sessionCookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;

  // /auth/me retorna o scope (workspace do usuário logado).
  const meRes = await app.inject({
    method: "GET",
    url: "/auth/me",
    headers: { cookie: sessionCookie }
  });
  assert.equal(meRes.statusCode, 200);
  const meBody = meRes.json() as {
    user: { id: string };
    scope: { workspaceId: string };
  };

  // Monta um segundo workspace (B) com um usuário diferente.
  // Isso cria o cenário A/B de isolamento.
  const workspaceB = await prisma.workspace.create({
    data: { name: "Workspace B" }
  });
  const userB = await prisma.user.create({
    data: {
      name: "User B",
      email: "user-b@vizlec.test",
      passwordHash: "hash-b",
      role: "member"
    }
  });
  await prisma.workspaceMembership.create({
    data: {
      workspaceId: workspaceB.id,
      userId: userB.id,
      role: "member"
    }
  });

  // Cria dois agents:
  // - agentA pertence ao workspace do usuário logado (A)
  // - agentB pertence ao workspace B
  const agentA = await prisma.agent.create({
    data: {
      workspaceId: meBody.scope.workspaceId,
      label: "agent-a",
      status: "online"
    }
  });
  const agentB = await prisma.agent.create({
    data: {
      workspaceId: workspaceB.id,
      label: "agent-b",
      status: "online"
    }
  });

  // Cria árvore mínima de domínio para existir um block e poder chamar
  // /blocks/:blockId/segment/retry.
  //
  // Observação: apesar de Course já nascer com workspaceId, o objetivo aqui é
  // validar o guard de dispatch por agent/clientId (não o isolamento completo
  // da árvore de conteúdo, que será fechado nas próximas camadas).
  const course = await prisma.course.create({
    data: {
      workspaceId: meBody.scope.workspaceId,
      name: "Course Test",
      status: "draft"
    }
  });
  const moduleItem = await prisma.module.create({
    data: {
      workspaceId: meBody.scope.workspaceId,
      courseId: course.id,
      name: "Module Test",
      order: 1
    }
  });
  const lesson = await prisma.lesson.create({
    data: {
      workspaceId: meBody.scope.workspaceId,
      moduleId: moduleItem.id,
      order: 1,
      title: "Lesson Test"
    }
  });
  const version = await prisma.lessonVersion.create({
    data: {
      workspaceId: meBody.scope.workspaceId,
      lessonId: lesson.id,
      scriptText: "texto de teste",
      speechRateWps: 2.5
    }
  });
  const block = await prisma.block.create({
    data: {
      workspaceId: meBody.scope.workspaceId,
      lessonVersionId: version.id,
      index: 0,
      sourceText: "bloco teste",
      ttsText: "bloco teste",
      wordCount: 2,
      durationEstimateS: 1,
      status: "ready"
    }
  });

  // Caso permitido: usuário A despacha usando agentA (mesmo workspace).
  const allowedDispatch = await app.inject({
    method: "POST",
    url: `/blocks/${block.id}/segment/retry`,
    headers: { cookie: sessionCookie },
    payload: { clientId: agentA.id, requestId: "req-workspace-a" }
  });
  assert.equal(allowedDispatch.statusCode, 201);
  const allowedJob = allowedDispatch.json() as { id: string; clientId: string };
  assert.equal(allowedJob.clientId, agentA.id);

  // Caso bloqueado: usuário A tenta despachar usando agentB (workspace diferente).
  const deniedDispatch = await app.inject({
    method: "POST",
    url: `/blocks/${block.id}/segment/retry`,
    headers: { cookie: sessionCookie },
    payload: { clientId: agentB.id, requestId: "req-workspace-b" }
  });
  assert.equal(deniedDispatch.statusCode, 403);
  assert.equal((deniedDispatch.json() as { error: string }).error, "agent_workspace_mismatch");

  // Cria job vinculado ao agentB para validar leitura cross-workspace.
  const foreignJob = await prisma.job.create({
    data: {
      workspaceId: meBody.scope.workspaceId,
      scope: "block",
      lessonVersionId: version.id,
      blockId: block.id,
      type: "segment_block",
      status: "pending",
      clientId: agentB.id
    }
  });

  // Leitura bloqueada: usuário A não pode ler job de agent do workspace B.
  const deniedRead = await app.inject({
    method: "GET",
    url: `/jobs/${foreignJob.id}`,
    headers: { cookie: sessionCookie }
  });
  assert.equal(deniedRead.statusCode, 403);
  assert.equal((deniedRead.json() as { error: string }).error, "agent_workspace_mismatch");
});
