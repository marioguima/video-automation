import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import type { FastifyInstance } from "fastify";
import { createPrismaClient, type PrismaClient } from "@vizlec/db";
import { createApiTestRuntime } from "./utils/api-test-runtime.ts";

// Teste das camadas 2/3/4 do item 6.8.2.4:
// - Module/Lesson/LessonVersion/Block/Asset/Job/Notification precisam carregar workspaceId;
// - operações de leitura/escrita em rotas de domínio não podem atravessar workspace;
// - listagens por workspace não podem retornar dados "estrangeiros".
const runtime = createApiTestRuntime("vizlec-workspace-layer234-");

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
  if (app) await app.close();
  if (prisma) await prisma.$disconnect();
  runtime.cleanup();
});

test("layer2/3/4 workspace ownership: module/lesson/version/block/job/notification are isolated", async () => {
  const bootstrapRes = await app.inject({
    method: "POST",
    url: "/auth/bootstrap-admin",
    payload: {
      name: "Owner Layer234",
      email: "owner-layer234@vizlec.test",
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
  const workspaceA = meBody.scope.workspaceId;

  const workspaceB = await prisma.workspace.create({
    data: { name: "Workspace B Layer234" }
  });
  const userB = await prisma.user.create({
    data: {
      name: "User B",
      email: "user-b-layer234@vizlec.test",
      passwordHash: "hash-b",
      role: "admin"
    }
  });
  await prisma.workspaceMembership.create({
    data: {
      workspaceId: workspaceB.id,
      userId: userB.id,
      role: "admin"
    }
  });

  const courseARes = await app.inject({
    method: "POST",
    url: "/courses",
    headers: { cookie },
    payload: {
      name: "Curso A Layer234",
      status: "draft"
    }
  });
  assert.equal(courseARes.statusCode, 201);
  const courseA = courseARes.json() as { id: string; workspaceId: string };
  assert.equal(courseA.workspaceId, workspaceA);

  const courseB = await prisma.course.create({
    data: {
      workspaceId: workspaceB.id,
      name: "Curso B Layer234",
      status: "draft"
    }
  });

  const moduleARes = await app.inject({
    method: "POST",
    url: `/courses/${courseA.id}/modules`,
    headers: { cookie },
    payload: { name: "Modulo A", order: 1 }
  });
  assert.equal(moduleARes.statusCode, 201);
  const moduleA = moduleARes.json() as { id: string; workspaceId: string };
  assert.equal(moduleA.workspaceId, workspaceA);

  const moduleB = await prisma.module.create({
    data: {
      workspaceId: workspaceB.id,
      courseId: courseB.id,
      name: "Modulo B",
      order: 1
    }
  });

  const crossLessonCreate = await app.inject({
    method: "POST",
    url: `/modules/${moduleB.id}/lessons`,
    headers: { cookie },
    payload: { title: "Licao indevida" }
  });
  assert.equal(crossLessonCreate.statusCode, 404);

  const lessonARes = await app.inject({
    method: "POST",
    url: `/modules/${moduleA.id}/lessons`,
    headers: { cookie },
    payload: { title: "Licao A" }
  });
  assert.equal(lessonARes.statusCode, 201);
  const lessonA = lessonARes.json() as { id: string; workspaceId: string };
  assert.equal(lessonA.workspaceId, workspaceA);

  const versionARes = await app.inject({
    method: "POST",
    url: `/lessons/${lessonA.id}/versions`,
    headers: { cookie },
    payload: {
      scriptText: "Texto da licao A",
      speechRateWps: 2.5
    }
  });
  assert.equal(versionARes.statusCode, 201);
  const versionA = versionARes.json() as { id: string };
  const versionAInDb = await prisma.lessonVersion.findUnique({
    where: { id: versionA.id },
    select: { workspaceId: true }
  });
  assert.equal(versionAInDb?.workspaceId, workspaceA);

  const lessonB = await prisma.lesson.create({
    data: {
      workspaceId: workspaceB.id,
      moduleId: moduleB.id,
      order: 1,
      title: "Licao B"
    }
  });
  const versionB = await prisma.lessonVersion.create({
    data: {
      workspaceId: workspaceB.id,
      lessonId: lessonB.id,
      scriptText: "Texto da licao B",
      speechRateWps: 2.5
    }
  });
  const blockB = await prisma.block.create({
    data: {
      workspaceId: workspaceB.id,
      lessonVersionId: versionB.id,
      index: 1,
      sourceText: "Bloco B",
      ttsText: "Bloco B",
      wordCount: 2,
      durationEstimateS: 1.0,
      status: "segmentation_done"
    }
  });
  const agentB = await prisma.agent.create({
    data: {
      workspaceId: workspaceB.id,
      label: "agent-b-layer234",
      status: "online"
    }
  });
  const foreignJob = await prisma.job.create({
    data: {
      workspaceId: workspaceB.id,
      scope: "lesson",
      lessonVersionId: versionB.id,
      type: "segment",
      status: "pending",
      clientId: agentB.id
    }
  });
  await prisma.notification.create({
    data: {
      workspaceId: workspaceB.id,
      title: "Notif B",
      message: "Workspace B only",
      type: "job",
      read: false,
      jobId: foreignJob.id,
      lessonId: lessonB.id,
      lessonVersionId: versionB.id
    }
  });

  const blocksRes = await app.inject({
    method: "GET",
    url: `/lesson-versions/${versionB.id}/blocks`,
    headers: { cookie }
  });
  assert.equal(blocksRes.statusCode, 200);
  const listedBlocks = blocksRes.json() as Array<{ id: string }>;
  assert.ok(!listedBlocks.some((item) => item.id === blockB.id));

  const notificationsRes = await app.inject({
    method: "GET",
    url: "/notifications",
    headers: { cookie }
  });
  assert.equal(notificationsRes.statusCode, 200);
  const listedNotifications = (notificationsRes.json() as { items: Array<{ title: string }> }).items;
  assert.ok(!listedNotifications.some((item) => item.title === "Notif B"));

  const foreignJobRead = await app.inject({
    method: "GET",
    url: `/jobs/${foreignJob.id}`,
    headers: { cookie }
  });
  assert.equal(foreignJobRead.statusCode, 403);
});
