import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import type { FastifyInstance } from "fastify";
import { createPrismaClient, type PrismaClient } from "@vizlec/db";
import { createApiTestRuntime } from "./utils/api-test-runtime.ts";

const runtime = createApiTestRuntime("vizlec-generation-cancel-guard-");

let app: FastifyInstance;
let prisma: PrismaClient;

before(async () => {
  runtime.resetDatabase();
  runtime.configureEnv();

  const mod = await import("../src/index.ts");
  app = mod.fastify as FastifyInstance;
  await app.ready();
  prisma = createPrismaClient();
});

after(async () => {
  if (app) {
    await app.close();
  }
  if (prisma) {
    await prisma.$disconnect();
  }
  runtime.cleanup();
});

test("generation cancel endpoints validate clientId(agentId) by workspace", async () => {
  const bootstrapRes = await app.inject({
    method: "POST",
    url: "/auth/bootstrap-admin",
    payload: {
      name: "Owner Cancel",
      email: "owner-cancel@vizlec.test",
      password: "StrongPass123!"
    }
  });
  assert.equal(bootstrapRes.statusCode, 201);
  const setCookie = bootstrapRes.headers["set-cookie"];
  assert.ok(setCookie);
  const sessionCookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;

  const meRes = await app.inject({
    method: "GET",
    url: "/auth/me",
    headers: { cookie: sessionCookie }
  });
  assert.equal(meRes.statusCode, 200);
  const meBody = meRes.json() as { scope: { workspaceId: string } };

  const workspaceB = await prisma.workspace.create({
    data: { name: "Workspace B" }
  });
  const agentA = await prisma.agent.create({
    data: { workspaceId: meBody.scope.workspaceId, label: "agent-a", status: "online" }
  });
  const agentB = await prisma.agent.create({
    data: { workspaceId: workspaceB.id, label: "agent-b", status: "online" }
  });

  const course = await prisma.course.create({
    data: {
      workspaceId: meBody.scope.workspaceId,
      name: "Course Cancel",
      status: "draft"
    }
  });
  const moduleItem = await prisma.module.create({
    data: {
      workspaceId: meBody.scope.workspaceId,
      courseId: course.id,
      name: "Module Cancel",
      order: 1
    }
  });
  const lesson = await prisma.lesson.create({
    data: {
      workspaceId: meBody.scope.workspaceId,
      moduleId: moduleItem.id,
      order: 1,
      title: "Lesson Cancel"
    }
  });

  const lessonAllowed = await app.inject({
    method: "POST",
    url: `/lessons/${lesson.id}/generation/audio/cancel`,
    headers: { cookie: sessionCookie },
    payload: { clientId: agentA.id }
  });
  assert.equal(lessonAllowed.statusCode, 200);

  const lessonDenied = await app.inject({
    method: "POST",
    url: `/lessons/${lesson.id}/generation/audio/cancel`,
    headers: { cookie: sessionCookie },
    payload: { clientId: agentB.id }
  });
  assert.equal(lessonDenied.statusCode, 403);
  assert.equal((lessonDenied.json() as { error: string }).error, "agent_workspace_mismatch");

  const moduleAllowed = await app.inject({
    method: "POST",
    url: `/modules/${moduleItem.id}/generation/audio/cancel`,
    headers: { cookie: sessionCookie },
    payload: { clientId: agentA.id }
  });
  assert.equal(moduleAllowed.statusCode, 200);

  const moduleDenied = await app.inject({
    method: "POST",
    url: `/modules/${moduleItem.id}/generation/audio/cancel`,
    headers: { cookie: sessionCookie },
    payload: { clientId: agentB.id }
  });
  assert.equal(moduleDenied.statusCode, 403);
  assert.equal((moduleDenied.json() as { error: string }).error, "agent_workspace_mismatch");

  const courseAllowed = await app.inject({
    method: "POST",
    url: `/courses/${course.id}/generation/audio/cancel`,
    headers: { cookie: sessionCookie },
    payload: { clientId: agentA.id }
  });
  assert.equal(courseAllowed.statusCode, 200);

  const courseDenied = await app.inject({
    method: "POST",
    url: `/courses/${course.id}/generation/audio/cancel`,
    headers: { cookie: sessionCookie },
    payload: { clientId: agentB.id }
  });
  assert.equal(courseDenied.statusCode, 403);
  assert.equal((courseDenied.json() as { error: string }).error, "agent_workspace_mismatch");
});

