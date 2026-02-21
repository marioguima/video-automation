import { ManifestResponse } from "@/lib/types";

const BASE_URL = process.env.NEXT_PUBLIC_STUDIO_API ?? "http://127.0.0.1:8765";

export async function buildManifest(payload: {
  script: string;
  max_visual_chars: number;
  max_tts_chars: number;
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

export async function buildManifestFromFile(path: string): Promise<ManifestResponse> {
  const res = await fetch(`${BASE_URL}/api/manifest/from-file`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Failed to load script file");
  }
  return data;
}
