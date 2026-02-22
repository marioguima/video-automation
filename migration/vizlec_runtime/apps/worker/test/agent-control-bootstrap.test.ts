import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAgentControlBootstrapPresence,
  buildWorkerBootstrapDecisionEvents,
  hasCompleteAgentControlIdentity,
  shouldFailStartupWithoutIdentity
} from "../src/agent-control-bootstrap.ts";

test("bootstrap observavel: configuracao incompleta gera flags e skip padronizado", () => {
  // Objetivo:
  // 1) validar flags de presenca no bootstrap;
  // 2) validar reason padrao ao pular agent-control sem identidade completa.
  const presence = buildAgentControlBootstrapPresence({
    apiBaseUrl: "",
    agentControlToken: "token-ok",
    workspaceId: "",
    agentId: "agent-ok"
  });

  assert.equal(presence.has_api_base_url, false);
  assert.equal(presence.has_agent_control_token, true);
  assert.equal(presence.has_workspace_id, false);
  assert.equal(presence.has_agent_id, true);
  assert.equal(hasCompleteAgentControlIdentity(presence), false);

  const events = buildWorkerBootstrapDecisionEvents({
    wakeReason: "startup",
    presence
  });
  assert.equal(events.length, 2);
  assert.equal(events[0]?.event, "worker_wake_requested");
  assert.equal(events[1]?.event, "agent_control_skipped");
  assert.equal(events[1]?.payload.reason, "missing_agent_identity_or_token");
  assert.equal(events[1]?.payload.has_api_base_url, false);
  assert.equal(events[1]?.payload.has_agent_control_token, true);
  assert.equal(events[1]?.payload.has_workspace_id, false);
  assert.equal(events[1]?.payload.has_agent_id, true);
});

test("bootstrap observavel: configuracao completa nao gera skip por identidade", () => {
  // Objetivo:
  // 1) garantir que identidade completa evita o evento agent_control_skipped;
  // 2) manter wake no inicio do bootstrap.
  const presence = buildAgentControlBootstrapPresence({
    apiBaseUrl: "http://127.0.0.1:4010",
    agentControlToken: "token-ok",
    workspaceId: "ws-1",
    agentId: "agent-1"
  });
  assert.equal(hasCompleteAgentControlIdentity(presence), true);

  const events = buildWorkerBootstrapDecisionEvents({
    wakeReason: "startup",
    presence
  });
  assert.equal(events.length, 1);
  assert.equal(events[0]?.event, "worker_wake_requested");
});

test("bootstrap observavel: startup permissivo nao derruba worker sem identidade", () => {
  // Objetivo:
  // 1) validar que modo permissivo preserva liveness quando identidade faltar;
  // 2) validar que modo estrito falha rapidamente no mesmo cenario.
  assert.equal(
    shouldFailStartupWithoutIdentity({
      workerRequireWsOnStartup: false,
      hasIdentity: false
    }),
    false
  );
  assert.equal(
    shouldFailStartupWithoutIdentity({
      workerRequireWsOnStartup: true,
      hasIdentity: false
    }),
    true
  );
});
