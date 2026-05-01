import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { after, before } from "node:test";
import type { FastifyInstance } from "fastify";
import { createPrismaClient, type PrismaClient } from "@vizlec/db";
import { createApiTestRuntime } from "./utils/api-test-runtime.ts";

const runtime = createApiTestRuntime("vizlec-inventory-reconciliation-");

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

test("dashboard inventory reconciliation: detecta divergencia base x disco, recalcula metricas e permanece idempotente", async () => {
  const bootstrapRes = await app.inject({
    method: "POST",
    url: "/auth/bootstrap-admin",
    payload: {
      name: "Owner Inventory Recon",
      email: "owner-inventory-recon@vizlec.test",
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

  const agent = await prisma.agent.create({
    data: { workspaceId, label: "agent-reconciliation", status: "online" }
  });

  const course = await prisma.course.create({
    data: { workspaceId, name: "Curso Reconciliacao" }
  });
  const moduleRow = await prisma.module.create({
    data: { workspaceId, courseId: course.id, name: "Modulo 1", order: 1 }
  });
  const lesson = await prisma.lesson.create({
    data: { workspaceId, moduleId: moduleRow.id, order: 1, title: "Aula 1" }
  });
  const version = await prisma.lessonVersion.create({
    data: { workspaceId, lessonId: lesson.id, scriptText: "texto" }
  });
  const blockA = await prisma.block.create({
    data: {
      workspaceId,
      lessonVersionId: version.id,
      index: 1,
      sourceText: "bloco A",
      ttsText: "bloco A",
      wordCount: 2,
      durationEstimateS: 4,
      audioDurationS: 4
    }
  });
  const blockB = await prisma.block.create({
    data: {
      workspaceId,
      lessonVersionId: version.id,
      index: 2,
      sourceText: "bloco B",
      ttsText: "bloco B",
      wordCount: 2,
      durationEstimateS: 6,
      audioDurationS: 6
    }
  });

  const existingAudioPath = path.join(runtime.dataDir, "courses", "lesson-a.wav");
  fs.mkdirSync(path.dirname(existingAudioPath), { recursive: true });
  fs.writeFileSync(existingAudioPath, Buffer.alloc(10, 7));
  const missingAudioPath = path.join(runtime.dataDir, "courses", "lesson-b-missing.wav");

  await prisma.asset.create({
    data: {
      workspaceId,
      blockId: blockA.id,
      kind: "audio_raw",
      path: existingAudioPath
    }
  });
  await prisma.asset.create({
    data: {
      workspaceId,
      blockId: blockB.id,
      kind: "audio_raw",
      path: missingAudioPath
    }
  });

  const snapshotRes = await app.inject({
    method: "POST",
    url: "/internal/inventory/snapshot",
    headers: { "x-internal-token": "test-internal-token" },
    payload: {
      workspaceId,
      agentId: agent.id,
      snapshot: {
        audioCount: 1,
        durationSeconds: 4,
        diskUsageBytes: 6
      }
    }
  });
  assert.equal(snapshotRes.statusCode, 200);

  const metricsRes1 = await app.inject({
    method: "GET",
    url: "/dashboard/metrics?range=7d",
    headers: { cookie }
  });
  assert.equal(metricsRes1.statusCode, 200);
  const metrics1 = metricsRes1.json() as {
    totals: { audioCount: number; contentSeconds: number; storageUsedBytes: number };
    inventoryReconciliation: {
      source: string;
      mismatchDetected: boolean;
      inconsistencyEvents: number;
      workerSnapshot: { audioCount: number; durationSeconds: number; diskUsageBytes: number } | null;
      baseline: { audioCount: number; durationSeconds: number; diskUsageBytes: number };
      diff: { audioCount: number; durationSeconds: number; diskUsageBytes: number };
    };
  };

  assert.equal(metrics1.totals.audioCount, 1);
  assert.equal(metrics1.totals.contentSeconds, 4);
  assert.equal(metrics1.totals.storageUsedBytes, 6);
  assert.equal(metrics1.inventoryReconciliation.source, "worker_snapshot");
  assert.equal(metrics1.inventoryReconciliation.mismatchDetected, true);
  assert.equal(metrics1.inventoryReconciliation.inconsistencyEvents, 1);
  assert.deepEqual(metrics1.inventoryReconciliation.workerSnapshot, {
    audioCount: 1,
    durationSeconds: 4,
    diskUsageBytes: 6
  });
  assert.equal(metrics1.inventoryReconciliation.baseline.audioCount, 2);
  assert.equal(metrics1.inventoryReconciliation.baseline.durationSeconds, 10);
  assert.equal(metrics1.inventoryReconciliation.baseline.diskUsageBytes, 10);
  assert.equal(metrics1.inventoryReconciliation.diff.audioCount, 1);
  assert.equal(metrics1.inventoryReconciliation.diff.durationSeconds, 6);
  assert.equal(metrics1.inventoryReconciliation.diff.diskUsageBytes, 4);

  const metricsRes2 = await app.inject({
    method: "GET",
    url: "/dashboard/metrics?range=7d",
    headers: { cookie }
  });
  assert.equal(metricsRes2.statusCode, 200);
  const metrics2 = metricsRes2.json() as {
    inventoryReconciliation: { mismatchDetected: boolean; inconsistencyEvents: number };
  };
  assert.equal(metrics2.inventoryReconciliation.mismatchDetected, true);
  assert.equal(metrics2.inventoryReconciliation.inconsistencyEvents, 1);
});
