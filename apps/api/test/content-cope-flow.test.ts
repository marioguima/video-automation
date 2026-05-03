import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { createApiTestRuntime } from "./utils/api-test-runtime.ts";

const runtime = createApiTestRuntime("vizlec-content-cope-");

let app: FastifyInstance;
let sessionCookie = "";

before(async () => {
  runtime.resetDatabase();
  runtime.configureEnv();

  const mod = await import("../src/index.ts");
  app = mod.fastify as FastifyInstance;
  await app.ready();

  const bootstrapRes = await app.inject({
    method: "POST",
    url: "/auth/bootstrap-admin",
    payload: {
      name: "Content Owner",
      email: "content-owner@vizlec.test",
      password: "StrongPass123!"
    }
  });
  assert.equal(bootstrapRes.statusCode, 201);
  const cookie = bootstrapRes.headers["set-cookie"];
  assert.ok(cookie, "Expected auth cookie after bootstrap");
  sessionCookie = Array.isArray(cookie) ? cookie[0] : cookie;
});

after(async () => {
  if (app) {
    await app.close();
  }
  runtime.cleanup();
});

test("content project flow accepts generic destination-driven projects", async () => {
  const projectRes = await app.inject({
    method: "POST",
    url: "/content-projects",
    headers: { cookie: sessionCookie },
    payload: {
      name: "Projeto sem tipo inicial",
      description: "Projeto guiado por destinos e formatos",
      metadata: {
        defaultDestinations: ["youtube", "instagram_reels"],
        defaultAspectRatios: ["16:9", "9:16"]
      }
    }
  });
  assert.equal(projectRes.statusCode, 201);
  const project = projectRes.json() as {
    metadata: { defaultDestinations?: string[]; defaultAspectRatios?: string[] };
  };
  assert.equal("kind" in project, false);
  assert.deepEqual(project.metadata.defaultDestinations, ["youtube", "instagram_reels"]);
  assert.deepEqual(project.metadata.defaultAspectRatios, ["16:9", "9:16"]);
});

test("content project flow updates project metadata", async () => {
  const projectRes = await app.inject({
    method: "POST",
    url: "/content-projects",
    headers: { cookie: sessionCookie },
    payload: {
      name: "Projeto editavel",
      description: "Versao inicial",
      metadata: {
        defaultDestinations: ["youtube"],
        defaultAspectRatios: ["16:9"]
      }
    }
  });
  assert.equal(projectRes.statusCode, 201);
  const project = projectRes.json() as { id: string };

  const patchRes = await app.inject({
    method: "PATCH",
    url: `/content-projects/${project.id}`,
    headers: { cookie: sessionCookie },
    payload: {
      name: "Projeto editado",
      description: "Versao revisada",
      status: "active",
      metadata: {
        defaultDestinations: ["youtube", "instagram_reels"],
        defaultAspectRatios: ["16:9", "9:16"]
      }
    }
  });
  assert.equal(patchRes.statusCode, 200);
  const patched = patchRes.json() as {
    name: string;
    description: string;
    status: string;
    metadata: { defaultDestinations?: string[]; defaultAspectRatios?: string[] };
  };
  assert.equal(patched.name, "Projeto editado");
  assert.equal(patched.description, "Versao revisada");
  assert.equal(patched.status, "active");
  assert.deepEqual(patched.metadata.defaultDestinations, ["youtube", "instagram_reels"]);
  assert.deepEqual(patched.metadata.defaultAspectRatios, ["16:9", "9:16"]);
});

test("content item flow saves without project and can be associated to multiple projects", async () => {
  const unassociatedRes = await app.inject({
    method: "POST",
    url: "/content-items",
    headers: { cookie: sessionCookie },
    payload: {
      kind: "content",
      title: "Conteudo independente",
      sourceText: "Texto salvo na biblioteca sem depender de projeto."
    }
  });
  assert.equal(unassociatedRes.statusCode, 201);
  const item = unassociatedRes.json() as { id: string; projectIds: string[] };
  assert.equal(Object.prototype.hasOwnProperty.call(item, "projectId"), false);
  assert.deepEqual(item.projectIds, []);

  const firstProjectRes = await app.inject({
    method: "POST",
    url: "/content-projects",
    headers: { cookie: sessionCookie },
    payload: { name: "Projeto A" }
  });
  const secondProjectRes = await app.inject({
    method: "POST",
    url: "/content-projects",
    headers: { cookie: sessionCookie },
    payload: { name: "Projeto B" }
  });
  assert.equal(firstProjectRes.statusCode, 201);
  assert.equal(secondProjectRes.statusCode, 201);
  const firstProject = firstProjectRes.json() as { id: string };
  const secondProject = secondProjectRes.json() as { id: string };

  const patchRes = await app.inject({
    method: "PATCH",
    url: `/content-items/${item.id}`,
    headers: { cookie: sessionCookie },
    payload: {
      projectIds: [firstProject.id, secondProject.id]
    }
  });
  assert.equal(patchRes.statusCode, 200);
  const patched = patchRes.json() as { id: string; projectIds: string[] };
  assert.equal(Object.prototype.hasOwnProperty.call(patched, "projectId"), false);
  assert.deepEqual(patched.projectIds, [firstProject.id, secondProject.id]);

  for (const project of [firstProject, secondProject]) {
    const projectItemsRes = await app.inject({
      method: "GET",
      url: `/content-projects/${project.id}/items`,
      headers: { cookie: sessionCookie }
    });
    assert.equal(projectItemsRes.statusCode, 200);
    assert.equal(
      (projectItemsRes.json() as Array<{ id: string }>).some((row) => row.id === item.id),
      true
    );
  }

  const listProjectsRes = await app.inject({
    method: "GET",
    url: "/content-projects",
    headers: { cookie: sessionCookie }
  });
  assert.equal(listProjectsRes.statusCode, 200);
  const listedProjects = listProjectsRes.json() as Array<{ id: string; itemsCount: number }>;
  assert.equal(listedProjects.find((project) => project.id === firstProject.id)?.itemsCount, 1);
  assert.equal(listedProjects.find((project) => project.id === secondProject.id)?.itemsCount, 1);

  const deleteFirstProjectRes = await app.inject({
    method: "DELETE",
    url: `/content-projects/${firstProject.id}`,
    headers: { cookie: sessionCookie }
  });
  assert.equal(deleteFirstProjectRes.statusCode, 200);

  const allItemsRes = await app.inject({
    method: "GET",
    url: "/content-items",
    headers: { cookie: sessionCookie }
  });
  assert.equal(allItemsRes.statusCode, 200);
  const stillAssociated = (allItemsRes.json() as Array<{ id: string; projectIds: string[] }>).find(
    (row) => row.id === item.id
  );
  assert.ok(stillAssociated);
  assert.equal(Object.prototype.hasOwnProperty.call(stillAssociated, "projectId"), false);
  assert.deepEqual(stillAssociated.projectIds, [secondProject.id]);
});

test("content project flow rejects project kind classification", async () => {
  const projectRes = await app.inject({
    method: "POST",
    url: "/content-projects",
    headers: { cookie: sessionCookie },
    payload: {
      kind: "youtube_channel",
      name: "Tipo antigo"
    }
  });
  assert.equal(projectRes.statusCode, 400);
  assert.equal((projectRes.json() as { error: string }).error, "project kind is not supported");

  const listRes = await app.inject({
    method: "GET",
    url: "/content-projects?kind=youtube_channel",
    headers: { cookie: sessionCookie }
  });
  assert.equal(listRes.statusCode, 400);
  assert.equal((listRes.json() as { error: string }).error, "project kind is not supported");
});

test("content project flow creates technical backing and deterministic blocks", async () => {
  const projectRes = await app.inject({
    method: "POST",
    url: "/content-projects",
    headers: { cookie: sessionCookie },
    payload: {
      name: "Serie COPE",
      description: "Conteudos reaproveitaveis",
      language: "pt-BR"
    }
  });
  assert.equal(projectRes.statusCode, 201);
  const project = projectRes.json() as { id: string; name: string };
  assert.equal("kind" in project, false);

  const itemRes = await app.inject({
    method: "POST",
    url: `/content-projects/${project.id}/items`,
    headers: { cookie: sessionCookie },
    payload: {
      kind: "content",
      title: "Como planejar conteudo COPE",
      sourceText:
        "COPE significa criar uma vez e publicar em varios lugares. Primeiro, definimos a mensagem central. Depois, adaptamos formato, duracao e proporcao para cada destino sem perder o foco do conteudo.",
      orientation: "horizontal"
    }
  });
  assert.equal(itemRes.statusCode, 201);
  const item = itemRes.json() as {
    id: string;
    metadata: { backing?: { lessonId?: string; lessonVersionId?: string } };
    backing?: { lessonId: string; lessonVersionId: string };
  };
  assert.ok(item.backing?.lessonId);
  assert.equal(item.metadata.backing?.lessonId, item.backing.lessonId);

  const patchRes = await app.inject({
    method: "PATCH",
    url: `/content-items/${item.id}`,
    headers: { cookie: sessionCookie },
    payload: {
      status: "script",
      metadata: {
        destinations: ["youtube", "tiktok"],
        aspectRatios: ["16:9", "9:16"],
        productionStage: "script",
        plannedPublishAt: "2026-05-05"
      }
    }
  });
  assert.equal(patchRes.statusCode, 200);
  const patchedItem = patchRes.json() as {
    metadata: {
      backing?: { lessonId?: string };
      destinations?: string[];
      aspectRatios?: string[];
      productionStage?: string;
    };
  };
  assert.equal(patchedItem.metadata.backing?.lessonId, item.backing.lessonId);
  assert.deepEqual(patchedItem.metadata.destinations, ["youtube", "tiktok"]);
  assert.deepEqual(patchedItem.metadata.aspectRatios, ["16:9", "9:16"]);
  assert.equal(patchedItem.metadata.productionStage, "script");

  const segmentRes = await app.inject({
    method: "POST",
    url: `/content-items/${item.id}/segment`,
    headers: { cookie: sessionCookie },
    payload: {
      purge: true,
      autoQueue: {
        audio: false,
        image: false
      }
    }
  });
  assert.equal(segmentRes.statusCode, 201);
  const segmentBody = segmentRes.json() as {
    backing: { lessonId: string; lessonVersionId: string };
    blocksCount: number;
    job: { type: string; status: string };
  };
  assert.equal(segmentBody.backing.lessonId, item.backing.lessonId);
  assert.equal(segmentBody.job.type, "segment");
  assert.ok(segmentBody.blocksCount > 0);

  const blocksRes = await app.inject({
    method: "GET",
    url: `/content-items/${item.id}/blocks`,
    headers: { cookie: sessionCookie }
  });
  assert.equal(blocksRes.statusCode, 200);
  const blocksBody = blocksRes.json() as {
    backing: { lessonVersionId: string };
    blocks: Array<{ id: string; sourceText: string; status?: string; animationPromptJson?: string | null }>;
  };
  assert.equal(blocksBody.backing.lessonVersionId, item.backing.lessonVersionId);
  assert.equal(blocksBody.blocks.length, segmentBody.blocksCount);
  assert.ok(blocksBody.blocks[0]?.sourceText.length > 0);

  const blockId = blocksBody.blocks[0]?.id;
  assert.ok(blockId);
  const animationPatchRes = await app.inject({
    method: "PATCH",
    url: `/blocks/${blockId}`,
    headers: { cookie: sessionCookie },
    payload: {
      animationPrompt: {
        prompt: "Slow push-in over the generated COPE planning scene.",
        motion: "subtle parallax and gentle ambient movement",
        camera: "slow push-in",
        duration_hint: "4-6 seconds"
      },
      directionNotes: {
        notes: "Use the scene to show planning continuity between formats."
      },
      soundEffectPrompt: {
        prompt: "Soft interface confirmation tone under the transition.",
        timing: "at the start of the scene",
        avoid: "loud impacts"
      }
    }
  });
  assert.equal(animationPatchRes.statusCode, 200);
  const patchedBlock = animationPatchRes.json() as {
    animationPromptJson?: string | null;
    directionNotesJson?: string | null;
    soundEffectPromptJson?: string | null;
  };
  assert.ok(patchedBlock.animationPromptJson?.includes("Slow push-in"));
  assert.ok(patchedBlock.directionNotesJson?.includes("planning continuity"));
  assert.ok(patchedBlock.soundEffectPromptJson?.includes("confirmation tone"));
});

test("content project flow deletes project while preserving content and technical backing", async () => {
  const projectRes = await app.inject({
    method: "POST",
    url: "/content-projects",
    headers: { cookie: sessionCookie },
    payload: {
      name: "Projeto para excluir",
      description: "Conteudo temporario"
    }
  });
  assert.equal(projectRes.statusCode, 201);
  const project = projectRes.json() as { id: string };

  const itemRes = await app.inject({
    method: "POST",
    url: `/content-projects/${project.id}/items`,
    headers: { cookie: sessionCookie },
    payload: {
      kind: "content",
      title: "Conteudo descartavel",
      sourceText: "Texto curto para criar o backing tecnico do item."
    }
  });
  assert.equal(itemRes.statusCode, 201);
  const item = itemRes.json() as {
    id: string;
    backing?: { courseId?: string };
  };
  assert.ok(item.backing?.courseId);

  const deleteRes = await app.inject({
    method: "DELETE",
    url: `/content-projects/${project.id}`,
    headers: { cookie: sessionCookie }
  });
  assert.equal(deleteRes.statusCode, 200);
  const deleted = deleteRes.json() as {
    ok: boolean;
    detachedItems: number;
    deletedItems: number;
    deletedBackingCourses: number;
  };
  assert.equal(deleted.ok, true);
  assert.equal(deleted.detachedItems, 1);
  assert.equal(deleted.deletedItems, 0);
  assert.equal(deleted.deletedBackingCourses, 0);

  const listRes = await app.inject({
    method: "GET",
    url: "/content-projects",
    headers: { cookie: sessionCookie }
  });
  assert.equal(listRes.statusCode, 200);
  assert.equal((listRes.json() as Array<{ id: string }>).some((listedProject) => listedProject.id === project.id), false);

  const itemsRes = await app.inject({
    method: "GET",
    url: `/content-projects/${project.id}/items`,
    headers: { cookie: sessionCookie }
  });
  assert.equal(itemsRes.statusCode, 404);

  const blocksRes = await app.inject({
    method: "GET",
    url: `/content-items/${item.id}/blocks`,
    headers: { cookie: sessionCookie }
  });
  assert.equal(blocksRes.statusCode, 200);

  const allItemsRes = await app.inject({
    method: "GET",
    url: "/content-items",
    headers: { cookie: sessionCookie }
  });
  assert.equal(allItemsRes.statusCode, 200);
  const detachedItem = (allItemsRes.json() as Array<{ id: string; projectIds: string[] }>).find(
    (row) => row.id === item.id
  );
  assert.ok(detachedItem);
  assert.equal(Object.prototype.hasOwnProperty.call(detachedItem, "projectId"), false);
  assert.deepEqual(detachedItem.projectIds, []);

  const db = new Database(runtime.dbPath, { readonly: true });
  try {
    const contentItemRow = db.prepare('SELECT id FROM "ContentItem" WHERE id = ?').get(item.id) as
      | { id: string }
      | undefined;
    const courseRow = db.prepare('SELECT id FROM "Course" WHERE id = ?').get(item.backing.courseId);
    assert.ok(contentItemRow);
    assert.ok(courseRow);
  } finally {
    db.close();
  }
});
