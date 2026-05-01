import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { URL } from "node:url";
import type { FastifyInstance } from "fastify";
import { createPrismaClient, type PrismaClient } from "@vizlec/db";
import { createApiTestRuntime } from "./utils/api-test-runtime.ts";

// Teste da Camada 1 do item 6.8.2.4:
// - Course precisa nascer com workspaceId do usuário autenticado;
// - Invitation precisa nascer e ser listada no workspace do usuário autenticado;
// - usuário de um workspace não pode operar recursos (course/invitation) de outro workspace;
// - ao aceitar convite, o novo usuário deve ser vinculado ao workspace do convite.
const runtime = createApiTestRuntime("vizlec-workspace-layer1-");

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

test("layer1 workspace ownership: course + invitation are isolated per workspace", async () => {
  // 1) Bootstrap do admin principal (workspace A).
  const bootstrapRes = await app.inject({
    method: "POST",
    url: "/auth/bootstrap-admin",
    payload: {
      name: "Owner Layer1",
      email: "owner-layer1@vizlec.test",
      password: "StrongPass123!"
    }
  });
  assert.equal(bootstrapRes.statusCode, 201);
  const cookie = Array.isArray(bootstrapRes.headers["set-cookie"])
    ? bootstrapRes.headers["set-cookie"][0]
    : bootstrapRes.headers["set-cookie"];
  assert.ok(cookie);

  // 2) Descobre escopo do usuário logado (workspace A).
  const meRes = await app.inject({
    method: "GET",
    url: "/auth/me",
    headers: { cookie }
  });
  assert.equal(meRes.statusCode, 200);
  const meBody = meRes.json() as { user: { id: string }; scope: { workspaceId: string } };
  const workspaceA = meBody.scope.workspaceId;

  // 3) Monta workspace B para simular "outro tenant".
  const workspaceB = await prisma.workspace.create({
    data: { name: "Workspace B Layer1" }
  });
  const inviterB = await prisma.user.create({
    data: {
      name: "Inviter B",
      email: "inviter-b-layer1@vizlec.test",
      passwordHash: "hash-b",
      role: "admin"
    }
  });
  await prisma.workspaceMembership.create({
    data: {
      workspaceId: workspaceB.id,
      userId: inviterB.id,
      role: "admin"
    }
  });

  // 4) Cria curso via API autenticada (workspace A) e valida persistência do workspaceId.
  const createCourseRes = await app.inject({
    method: "POST",
    url: "/courses",
    headers: { cookie },
    payload: {
      name: "Curso A",
      status: "draft"
    }
  });
  assert.equal(createCourseRes.statusCode, 201);
  const createdCourse = createCourseRes.json() as { id: string; workspaceId: string };
  assert.equal(createdCourse.workspaceId, workspaceA);

  // 5) Cria curso "estrangeiro" direto no banco (workspace B).
  const foreignCourse = await prisma.course.create({
    data: {
      workspaceId: workspaceB.id,
      name: "Curso B",
      status: "draft"
    }
  });

  // 6) Listagem /courses do workspace A não pode trazer curso do workspace B.
  const listCoursesRes = await app.inject({
    method: "GET",
    url: "/courses",
    headers: { cookie }
  });
  assert.equal(listCoursesRes.statusCode, 200);
  const listedCourses = listCoursesRes.json() as Array<{ id: string; workspaceId: string }>;
  const listedIds = new Set(listedCourses.map((item) => item.id));
  assert.ok(listedIds.has(createdCourse.id), "course do workspace A deve aparecer");
  assert.ok(!listedIds.has(foreignCourse.id), "course do workspace B não pode aparecer");

  // 7) Acesso por ID de outro workspace deve responder 404.
  const foreignCourseRead = await app.inject({
    method: "GET",
    url: `/courses/${foreignCourse.id}/build-status`,
    headers: { cookie }
  });
  assert.equal(foreignCourseRead.statusCode, 404);

  // 8) Cria convite via API autenticada (workspace A) e valida workspaceId persistido.
  const createInvitationRes = await app.inject({
    method: "POST",
    url: "/team/invitations",
    headers: { cookie },
    payload: {
      email: "invite-a-layer1@vizlec.test",
      role: "member"
    }
  });
  assert.equal(createInvitationRes.statusCode, 201);
  const invitationBody = createInvitationRes.json() as {
    invitation: { id: string };
    inviteLink: string;
  };

  const invitationInDb = await prisma.invitation.findUnique({
    where: { id: invitationBody.invitation.id },
    select: { workspaceId: true }
  });
  assert.equal(invitationInDb?.workspaceId, workspaceA);

  // 9) Cria convite "estrangeiro" no workspace B para validar isolamento da listagem/operações.
  const foreignInvitation = await prisma.invitation.create({
    data: {
      workspaceId: workspaceB.id,
      inviteeName: "Foreign Invite",
      email: "invite-b-layer1@vizlec.test",
      role: "member",
      tokenHash: "foreign-token-hash-layer1",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      invitedByUserId: inviterB.id
    }
  });

  const listInvitationsRes = await app.inject({
    method: "GET",
    url: "/team/invitations",
    headers: { cookie }
  });
  assert.equal(listInvitationsRes.statusCode, 200);
  const listedInvitations = (listInvitationsRes.json() as { items: Array<{ id: string }> }).items;
  const listedInvitationIds = new Set(listedInvitations.map((item) => item.id));
  assert.ok(listedInvitationIds.has(invitationBody.invitation.id));
  assert.ok(!listedInvitationIds.has(foreignInvitation.id));

  // 10) Operações de convite fora do workspace devem falhar com 404.
  const foreignRevokeRes = await app.inject({
    method: "POST",
    url: `/team/invitations/${foreignInvitation.id}/revoke`,
    headers: { cookie }
  });
  assert.equal(foreignRevokeRes.statusCode, 404);

  // 11) Aceite do convite deve criar membership no mesmo workspace do convite (workspace A).
  const token = new URL(invitationBody.inviteLink).searchParams.get("invite");
  assert.ok(token, "token de convite deve existir no inviteLink");

  const acceptRes = await app.inject({
    method: "POST",
    url: "/auth/invite/accept",
    payload: {
      token,
      name: "Invitee Layer1",
      password: "StrongPass123!"
    }
  });
  assert.equal(acceptRes.statusCode, 200);
  const acceptedUser = acceptRes.json() as { user: { id: string; email: string } };
  assert.equal(acceptedUser.user.email, "invite-a-layer1@vizlec.test");

  const acceptedMembership = await prisma.workspaceMembership.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: workspaceA,
        userId: acceptedUser.user.id
      }
    }
  });
  assert.ok(
    acceptedMembership,
    "aceite do convite precisa vincular usuário no workspace do convite"
  );
});
