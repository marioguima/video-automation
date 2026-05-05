import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import type { FastifyInstance } from "fastify";
import { createApiTestRuntime } from "./utils/api-test-runtime.ts";

const runtime = createApiTestRuntime("vizlec-settings-stage-strategies-");

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
      name: "Settings Owner",
      email: "settings-owner@vizlec.test",
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

test("settings flow persists stage-first llm strategies and exposes effective chains", async () => {
  const patchRes = await app.inject({
    method: "PATCH",
    url: "/settings",
    headers: { cookie: sessionCookie },
    payload: {
      llm: {
        providers: {
          ollama: {
            provider: "ollama",
            displayName: "Ollama local",
            baseUrl: "http://127.0.0.1:11434",
            timeoutMs: 600000
          },
          gemini: {
            provider: "gemini",
            displayName: "Google Gemini",
            baseUrl: "https://generativelanguage.googleapis.com/v1beta",
            apiKey: "gemini-test-key",
            timeoutMs: 600000
          },
          groq: {
            provider: "openai",
            displayName: "Groq",
            baseUrl: "https://api.groq.com/openai/v1",
            apiKey: "groq-test-key",
            timeoutMs: 120000
          }
        },
        stages: {
          structure: {
            priorities: [
              {
                providerId: "groq",
                model: "llama-3.3-70b-versatile",
                fallbackModel: "openai/gpt-oss-120b"
              },
              {
                providerId: "gemini",
                model: "gemma-4-27b-it",
                fallbackModel: "gemma-4-26b-a4b-it"
              }
            ]
          },
          block: {
            priorities: [
              {
                providerId: "gemini",
                model: "gemma-4-26b-a4b-it",
                fallbackModel: "gemma-4-27b-it"
              },
              {
                providerId: "ollama",
                model: "llama3.2:3b",
                fallbackModel: "llama3.1:8b"
              }
            ]
          }
        }
      }
    }
  });
  assert.equal(patchRes.statusCode, 200);

  const getRes = await app.inject({
    method: "GET",
    url: "/settings",
    headers: { cookie: sessionCookie }
  });
  assert.equal(getRes.statusCode, 200);
  const settings = getRes.json() as {
    llm: {
      providers: Record<string, { baseUrl?: string; timeoutMs?: number; apiKey?: string }>;
      stages: {
        structure: { priorities: Array<{ providerId: string; model?: string; fallbackModel?: string }> };
        block: { priorities: Array<{ providerId: string; model?: string; fallbackModel?: string }> };
      };
      effective: {
        structureChain: Array<{ providerId: string; provider: string; model: string; fallbackModel: string | null }>;
        blockChain: Array<{ providerId: string; provider: string; model: string; fallbackModel: string | null }>;
        structurePrimary: { providerId: string; provider: string; model: string; fallbackModel: string | null } | null;
        blockPrimary: { providerId: string; provider: string; model: string; fallbackModel: string | null } | null;
        structureAttempts: number;
        blockAttempts: number;
      };
    };
  };

  assert.equal(settings.llm.providers.groq.baseUrl, "https://api.groq.com/openai/v1");
  assert.equal(settings.llm.providers.gemini.baseUrl, "https://generativelanguage.googleapis.com/v1beta");
  assert.equal(settings.llm.stages.structure.priorities.length, 2);
  assert.equal(settings.llm.stages.block.priorities.length, 2);
  assert.equal(settings.llm.stages.structure.priorities[0]?.providerId, "groq");
  assert.equal(settings.llm.stages.structure.priorities[1]?.providerId, "gemini");
  assert.equal(settings.llm.stages.block.priorities[0]?.providerId, "gemini");
  assert.equal(settings.llm.stages.block.priorities[1]?.providerId, "ollama");

  assert.equal(settings.llm.effective.structurePrimary?.providerId, "groq");
  assert.equal(settings.llm.effective.structurePrimary?.provider, "openai");
  assert.equal(settings.llm.effective.structurePrimary?.model, "llama-3.3-70b-versatile");
  assert.equal(settings.llm.effective.blockPrimary?.providerId, "gemini");
  assert.equal(settings.llm.effective.blockPrimary?.provider, "gemini");
  assert.equal(settings.llm.effective.blockPrimary?.model, "gemma-4-26b-a4b-it");
  assert.equal(settings.llm.effective.structureAttempts, 4);
  assert.equal(settings.llm.effective.blockAttempts, 4);
  assert.equal(settings.llm.effective.structureChain[1]?.fallbackModel, "gemma-4-26b-a4b-it");
  assert.equal(settings.llm.effective.blockChain[1]?.fallbackModel, "llama3.1:8b");
});
