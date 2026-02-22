import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { createApiTestRuntime } from "./utils/api-test-runtime.ts";

const runtime = createApiTestRuntime("vizlec-auth-scope-");

let app: FastifyInstance;

before(async () => {
  // Prepara banco isolado e configura ambiente da API para execução in-memory.
  runtime.resetDatabase();
  runtime.configureEnv();

  // Carrega a API e aguarda ela ficar pronta para receber requisições in-memory.
  const mod = await import("../src/index.ts");
  app = mod.fastify as FastifyInstance;
  await app.ready();
});

after(async () => {
  // Encerra Fastify e remove artefatos temporários do teste.
  if (app) {
    await app.close();
  }
  runtime.cleanup();
});

// Fluxo E2E do escopo de autenticação:
// bootstrap -> sessão válida -> contexto -> novo login -> mesmo workspace.
test("auth scope flow: bootstrap -> me/context -> login keeps same workspace", async () => {
  const email = "owner-auth-scope@vizlec.test";
  const password = "StrongPass123!";

  // 1) Cria primeiro admin (bootstrap) e inicia sessão.
  const bootstrapRes = await app.inject({
    method: "POST",
    url: "/auth/bootstrap-admin",
    payload: {
      name: "Owner Scope",
      email,
      password
    }
  });

  assert.equal(bootstrapRes.statusCode, 201);
  const bootstrapCookie = bootstrapRes.headers["set-cookie"];
  assert.ok(bootstrapCookie, "Expected auth cookie after bootstrap");
  // Reaproveita cookie real para simular o mesmo caminho de autenticação do navegador.
  const sessionCookie = Array.isArray(bootstrapCookie) ? bootstrapCookie[0] : bootstrapCookie;

  // 2) Consulta /auth/me e valida se escopo foi criado corretamente.
  const meRes = await app.inject({
    method: "GET",
    url: "/auth/me",
    headers: { cookie: sessionCookie }
  });
  assert.equal(meRes.statusCode, 200);
  const meBody = meRes.json() as {
    user: { id: string; email: string; role: string };
    scope: { workspaceId: string; membershipRole: string };
  };
  assert.ok(meBody.user.id.length > 0);
  assert.equal(meBody.user.email, email);
  assert.equal(meBody.user.role, "owner");
  assert.ok(meBody.scope.workspaceId.length > 0);
  assert.equal(meBody.scope.membershipRole, "admin");

  // Validação explícita no banco: confirma que o workspace foi criado de fato
  // e que existe o vínculo user -> workspace em WorkspaceMembership.
  const db = new Database(runtime.dbPath, { readonly: true });
  try {
    const workspace = db
      .prepare('SELECT id FROM "Workspace" WHERE id = ? LIMIT 1')
      .get(meBody.scope.workspaceId) as { id: string } | undefined;
    assert.ok(workspace, "Workspace should exist in database");

    const membership = db
      .prepare(
        'SELECT workspaceId, userId, role FROM "WorkspaceMembership" WHERE workspaceId = ? AND userId = ? LIMIT 1'
      )
      .get(meBody.scope.workspaceId, meBody.user.id) as
      | { workspaceId: string; userId: string; role: string }
      | undefined;
    assert.ok(membership, "WorkspaceMembership should exist in database");
    assert.equal(membership?.role, "admin");
  } finally {
    db.close();
  }

  // 3) Consulta /auth/context.
  // Diferente de /auth/me (que só valida sessão + usuário), /auth/context retorna
  // o "contexto operacional" do usuário autenticado:
  // - scope: qual workspace está vinculado a essa sessão;
  // - agents: quais agentes pertencem a esse workspace.
  // Esse endpoint é o que prepara a UI para saber "quem sou" e "qual agente posso usar".
  const contextRes = await app.inject({
    method: "GET",
    url: "/auth/context",
    headers: { cookie: sessionCookie }
  });
  assert.equal(contextRes.statusCode, 200);
  const contextBody = contextRes.json() as {
    scope: { workspaceId: string; membershipRole: string };
    agents: Array<unknown>;
  };
  assert.equal(contextBody.scope.workspaceId, meBody.scope.workspaceId);
  assert.equal(contextBody.scope.membershipRole, meBody.scope.membershipRole);
  assert.deepEqual(contextBody.agents, []);

  // 4) Faz login novamente para validar persistência do vínculo usuário -> workspace.
  const loginRes = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password }
  });
  assert.equal(loginRes.statusCode, 200);
  const loginCookie = loginRes.headers["set-cookie"];
  assert.ok(loginCookie, "Expected auth cookie after login");
  const loginSessionCookie = Array.isArray(loginCookie) ? loginCookie[0] : loginCookie;

  // 5) Após novo login, /auth/context deve manter o mesmo workspace, provando
  // que o vínculo identidade -> workspace é persistente e não muda a cada sessão.
  const contextAfterLoginRes = await app.inject({
    method: "GET",
    url: "/auth/context",
    headers: { cookie: loginSessionCookie }
  });
  assert.equal(contextAfterLoginRes.statusCode, 200);
  const contextAfterLoginBody = contextAfterLoginRes.json() as {
    scope: { workspaceId: string };
  };
  assert.equal(contextAfterLoginBody.scope.workspaceId, meBody.scope.workspaceId);
});
