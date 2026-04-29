import { ManifestResponse } from "@/lib/types";

const BASE_URL = process.env.NEXT_PUBLIC_STUDIO_API ?? "http://127.0.0.1:8001";

export async function buildManifest(payload: {
  script: string;
  max_visual_chars: number;
  max_tts_chars: number;
  split_mode?: "length" | "topic";
  topic_min_chars?: number;
  topic_similarity_threshold?: number;
}): Promise<ManifestResponse> {
  const res = await fetch(`${BASE_URL}/api/manifest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Failed to build manifest");
  }
  return data;
}

export async function buildManifestFromFile(payload: {
  path: string;
  split_mode?: "length" | "topic";
  topic_min_chars?: number;
  topic_similarity_threshold?: number;
}): Promise<ManifestResponse> {
  const res = await fetch(`${BASE_URL}/api/manifest/from-file`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Failed to load script file");
  }
  return data;
}

export type LlmProvider = "ollama" | "gemini" | "openai";

export type SystemSettings = {
  llm: {
    provider: LlmProvider;
    base_url: string;
    model: string;
    api_key: string;
    timeout_sec: number;
  };
};

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || data.error || `Request failed: ${path}`);
  }
  return data as T;
}

export async function getSystemSettings(): Promise<SystemSettings> {
  return requestJson<SystemSettings>("/api/settings");
}

export async function updateSystemSettings(payload: {
  llm: {
    provider: LlmProvider;
    base_url: string;
    model: string;
    api_key: string;
    timeout_sec: number;
  };
}): Promise<SystemSettings> {
  return requestJson<SystemSettings>("/api/settings", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
