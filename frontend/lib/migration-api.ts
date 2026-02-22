const BASE_URL = process.env.NEXT_PUBLIC_STUDIO_API ?? "http://127.0.0.1:8001";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { detail?: string; error?: string }).detail || (data as { error?: string }).error || `Request failed: ${path}`);
  }
  return data as T;
}

export type CompatVideoVersion = {
  id: string;
  lessonId: string;
  speechRateWps: number;
  preferredVoiceId?: string | null;
  preferredTemplateId?: string | null;
  createdAt: string;
};

export type CompatBlock = {
  id: string;
  lessonVersionId: string;
  index: number;
  sourceText: string;
  ttsText: string;
  onScreenJson: string | null;
  imagePromptJson?: string | null;
  status: string | null;
  segmentError?: string | null;
};

export async function listChannels() {
  return req<{ items: Array<{ id: number; name: string }> }>("/api/channels");
}

export async function createChannel(payload: { name: string; niche?: string; language?: string }) {
  return req<{ id: number; name: string }>("/api/channels", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listVideos(channelId?: number) {
  const q = channelId ? `?channel_id=${channelId}` : "";
  return req<{ items: Array<{ id: number; title: string; status: string }> }>(`/api/videos${q}`);
}

export async function createVideo(payload: {
  channel_id: number;
  title: string;
  script_text: string;
}) {
  return req<{ id: number; title: string }>("/api/videos", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function ingestVideo(videoId: number) {
  return req<{ video_id: number; blocks_count: number; status: string }>(`/api/videos/${videoId}/ingest-script`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function listVideoVersions(videoId: number) {
  return req<CompatVideoVersion[]>(`/api/videos/${videoId}/versions`);
}

export async function listVideoVersionBlocks(versionId: string | number) {
  return req<CompatBlock[]>(`/api/video-versions/${versionId}/blocks`);
}

export async function patchBlock(blockId: string | number, payload: { ttsText?: string; imagePrompt?: { block_prompt?: string } }) {
  return req<CompatBlock>(`/api/blocks/${blockId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
