import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import type { FastifyInstance } from "fastify";
import { createPrismaClient, type PrismaClient } from "@vizlec/db";
import { createApiTestRuntime } from "./utils/api-test-runtime.ts";

const runtime = createApiTestRuntime("vizlec-generation-queue-guard-");

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

test("generation queue endpoints enforce clientId(agentId) workspace guard", async () => {
  const bootstrapRes = await app.inject({
    method: "POST",
    url: "/auth/bootstrap-admin",
    payload: {
      name: "Owner Queue",
      email: "owner-queue@vizlec.test",
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
      name: "Course Queue",
      status: "draft"
    }
  });
  const moduleItem = await prisma.module.create({
    data: {
      workspaceId: meBody.scope.workspaceId,
      courseId: course.id,
      name: "Module Queue",
      order: 1
    }
  });
  const lesson = await prisma.lesson.create({
    data: {
      workspaceId: meBody.scope.workspaceId,
      moduleId: moduleItem.id,
      order: 1,
      title: "Lesson Queue"
    }
  });
  const version = await prisma.lessonVersion.create({
    data: {
      workspaceId: meBody.scope.workspaceId,
      lessonId: lesson.id,
      scriptText: "texto de teste para fila",
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
      status: "ready",
      onScreenJson: JSON.stringify({ title: "Titulo", bullets: ["A", "B"] }),
      imagePromptJson: JSON.stringify({
        block_prompt: "prompt",
        avoid: "none",
        seed_hint: "seed",
        seed: 123
      })
    }
  });

  const assertAllowedStatus = (statusCode: number) => {
    assert.ok(statusCode === 200 || statusCode === 201, `expected 200/201, got ${statusCode}`);
  };

  const segmentAllowed = await app.inject({
    method: "POST",
    url: `/lesson-versions/${version.id}/segment`,
    headers: { cookie: sessionCookie },
    payload: { clientId: agentA.id, requestId: "seg-a" }
  });
  assertAllowedStatus(segmentAllowed.statusCode);

  const segmentDenied = await app.inject({
    method: "POST",
    url: `/lesson-versions/${version.id}/segment`,
    headers: { cookie: sessionCookie },
    payload: { clientId: agentB.id, requestId: "seg-b" }
  });
  assert.equal(segmentDenied.statusCode, 403);
  assert.equal((segmentDenied.json() as { error: string }).error, "agent_workspace_mismatch");

  const lessonTtsAllowed = await app.inject({
    method: "POST",
    url: `/lesson-versions/${version.id}/tts`,
    headers: { cookie: sessionCookie },
    payload: { clientId: agentA.id, requestId: "tts-lesson-a" }
  });
  assertAllowedStatus(lessonTtsAllowed.statusCode);
  const lessonTtsJob = lessonTtsAllowed.json() as { id: string };
  assert.ok(lessonTtsJob.id);

  const lessonTtsDenied = await app.inject({
    method: "POST",
    url: `/lesson-versions/${version.id}/tts`,
    headers: { cookie: sessionCookie },
    payload: { clientId: agentB.id, requestId: "tts-lesson-b" }
  });
  assert.equal(lessonTtsDenied.statusCode, 403);
  assert.equal((lessonTtsDenied.json() as { error: string }).error, "agent_workspace_mismatch");

  const blockTtsAllowed = await app.inject({
    method: "POST",
    url: `/blocks/${block.id}/tts`,
    headers: { cookie: sessionCookie },
    payload: { clientId: agentA.id, requestId: "tts-block-a" }
  });
  assertAllowedStatus(blockTtsAllowed.statusCode);

  const blockTtsDenied = await app.inject({
    method: "POST",
    url: `/blocks/${block.id}/tts`,
    headers: { cookie: sessionCookie },
    payload: { clientId: agentB.id, requestId: "tts-block-b" }
  });
  assert.equal(blockTtsDenied.statusCode, 403);
  assert.equal((blockTtsDenied.json() as { error: string }).error, "agent_workspace_mismatch");

  const blockImageAllowed = await app.inject({
    method: "POST",
    url: `/blocks/${block.id}/image`,
    headers: { cookie: sessionCookie },
    payload: { clientId: agentA.id, requestId: "img-block-a" }
  });
  assertAllowedStatus(blockImageAllowed.statusCode);

  const blockImageDenied = await app.inject({
    method: "POST",
    url: `/blocks/${block.id}/image`,
    headers: { cookie: sessionCookie },
    payload: { clientId: agentB.id, requestId: "img-block-b" }
  });
  assert.equal(blockImageDenied.statusCode, 403);
  assert.equal((blockImageDenied.json() as { error: string }).error, "agent_workspace_mismatch");

  const lessonImagesAllowed = await app.inject({
    method: "POST",
    url: `/lesson-versions/${version.id}/images`,
    headers: { cookie: sessionCookie },
    payload: { clientId: agentA.id, requestId: "img-lesson-a" }
  });
  assert.equal(lessonImagesAllowed.statusCode, 503);
  assert.equal((lessonImagesAllowed.json() as { error: string }).error, "agent_offline");

  const lessonImagesDenied = await app.inject({
    method: "POST",
    url: `/lesson-versions/${version.id}/images`,
    headers: { cookie: sessionCookie },
    payload: { clientId: agentB.id, requestId: "img-lesson-b" }
  });
  assert.equal(lessonImagesDenied.statusCode, 403);
  assert.equal((lessonImagesDenied.json() as { error: string }).error, "agent_workspace_mismatch");

  const finalVideoAllowed = await app.inject({
    method: "POST",
    url: `/lesson-versions/${version.id}/final-video`,
    headers: { cookie: sessionCookie },
    payload: { clientId: agentA.id, requestId: "video-a" }
  });
  assert.equal(finalVideoAllowed.statusCode, 503);
  assert.equal((finalVideoAllowed.json() as { error: string }).error, "agent_offline");

  const finalVideoDenied = await app.inject({
    method: "POST",
    url: `/lesson-versions/${version.id}/final-video`,
    headers: { cookie: sessionCookie },
    payload: { clientId: agentB.id, requestId: "video-b" }
  });
  assert.equal(finalVideoDenied.statusCode, 403);
  assert.equal((finalVideoDenied.json() as { error: string }).error, "agent_workspace_mismatch");

  const cancelAllowed = await app.inject({
    method: "POST",
    url: `/jobs/${lessonTtsJob.id}/cancel`,
    headers: { cookie: sessionCookie },
    payload: { clientId: agentA.id }
  });
  assert.equal(cancelAllowed.statusCode, 200);

  const anotherJob = await app.inject({
    method: "POST",
    url: `/lesson-versions/${version.id}/tts`,
    headers: { cookie: sessionCookie },
    payload: { clientId: agentA.id, requestId: "job-to-cancel" }
  });
  assertAllowedStatus(anotherJob.statusCode);
  const anotherJobBody = anotherJob.json() as { id: string };
  assert.ok(anotherJobBody.id);

  const cancelDenied = await app.inject({
    method: "POST",
    url: `/jobs/${anotherJobBody.id}/cancel`,
    headers: { cookie: sessionCookie },
    payload: { clientId: agentB.id }
  });
  assert.equal(cancelDenied.statusCode, 403);
  assert.equal((cancelDenied.json() as { error: string }).error, "agent_workspace_mismatch");
});
