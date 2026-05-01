import fs from "node:fs";
import path from "node:path";

export type VoiceDefinition = {
  id: string;
  label?: string;
  file: string;
  description?: string;
};

export type VoiceIndex = {
  voices: VoiceDefinition[];
};

function normalizeVoiceList(raw: unknown): VoiceDefinition[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.reduce<VoiceDefinition[]>((voices, item) => {
      if (!item || typeof item !== "object") return voices;
      const value = item as Record<string, unknown>;
      const id = String(value.id ?? "").trim();
      const file = String(value.file ?? "").trim();
      if (!id || !file) return voices;
      voices.push({
        id,
        file,
        label: value.label ? String(value.label) : undefined,
        description: value.description ? String(value.description) : undefined
      });
      return voices;
    }, []);
  }
  if (typeof raw === "object") {
    const value = raw as Record<string, unknown>;
    if (Array.isArray(value.voices)) {
      return normalizeVoiceList(value.voices);
    }
    return Object.entries(value).reduce<VoiceDefinition[]>((voices, [id, voice]) => {
      if (typeof voice === "string") {
        voices.push({ id, file: voice });
        return voices;
      }
      if (voice && typeof voice === "object") {
        const entry = voice as Record<string, unknown>;
        const file = String(entry.file ?? "").trim();
        if (!file) return voices;
        voices.push({
          id,
          file,
          label: entry.label ? String(entry.label) : undefined,
          description: entry.description ? String(entry.description) : undefined
        });
      }
      return voices;
    }, []);
  }
  return [];
}

export function loadVoiceIndex(indexPath: string): VoiceIndex {
  try {
    if (!fs.existsSync(indexPath)) {
      return { voices: [] };
    }
    const raw = fs.readFileSync(indexPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return { voices: normalizeVoiceList(parsed) };
  } catch {
    return { voices: [] };
  }
}

export function findVoiceById(index: VoiceIndex, voiceId: string): VoiceDefinition | null {
  const trimmed = voiceId.trim();
  if (!trimmed) return null;
  return index.voices.find((voice) => voice.id === trimmed) ?? null;
}

export function resolveVoicePath(voicesDir: string, filePath: string): string {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  return path.join(voicesDir, filePath);
}
