export type AgentControlBootstrapPresence = {
  has_api_base_url: boolean;
  has_agent_control_token: boolean;
  has_workspace_id: boolean;
  has_agent_id: boolean;
};

type AgentControlBootstrapInput = {
  apiBaseUrl: string | null | undefined;
  agentControlToken: string | null | undefined;
  workspaceId: string | null | undefined;
  agentId: string | null | undefined;
};

export function buildAgentControlBootstrapPresence(
  input: AgentControlBootstrapInput
): AgentControlBootstrapPresence {
  return {
    has_api_base_url: Boolean(input.apiBaseUrl?.trim()),
    has_agent_control_token: Boolean(input.agentControlToken?.trim()),
    has_workspace_id: Boolean(input.workspaceId?.trim()),
    has_agent_id: Boolean(input.agentId?.trim())
  };
}

export function hasCompleteAgentControlIdentity(
  presence: AgentControlBootstrapPresence
): boolean {
  return (
    presence.has_api_base_url &&
    presence.has_agent_control_token &&
    presence.has_workspace_id &&
    presence.has_agent_id
  );
}

export function buildMissingIdentitySkipPayload(
  presence: AgentControlBootstrapPresence
): { reason: "missing_agent_identity_or_token" } & AgentControlBootstrapPresence {
  return {
    reason: "missing_agent_identity_or_token",
    ...presence
  };
}

export function buildWorkerBootstrapDecisionEvents(params: {
  wakeReason: string;
  presence: AgentControlBootstrapPresence;
}): Array<{ event: "worker_wake_requested" | "agent_control_skipped"; payload: Record<string, unknown> }> {
  const events: Array<{
    event: "worker_wake_requested" | "agent_control_skipped";
    payload: Record<string, unknown>;
  }> = [
    {
      event: "worker_wake_requested",
      payload: { reason: params.wakeReason }
    }
  ];
  if (!hasCompleteAgentControlIdentity(params.presence)) {
    events.push({
      event: "agent_control_skipped",
      payload: buildMissingIdentitySkipPayload(params.presence)
    });
  }
  return events;
}

export function shouldFailStartupWithoutIdentity(params: {
  workerRequireWsOnStartup: boolean;
  hasIdentity: boolean;
}): boolean {
  return params.workerRequireWsOnStartup && !params.hasIdentity;
}
