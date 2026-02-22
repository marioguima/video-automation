import fs from "node:fs";
import path from "node:path";

export type InventorySnapshot = {
  audioCount: number;
  durationSeconds: number;
  diskUsageBytes: number;
};

type InventoryFileFingerprint = {
  sizeBytes: number;
  mtimeMs: number;
  durationSeconds: number;
};

export type InventoryCollectorOptions = {
  audioExtensions?: string[];
  probeDurationSeconds?: (filePath: string) => Promise<number | null>;
  durationCache?: Map<string, InventoryFileFingerprint>;
};

const DEFAULT_AUDIO_EXTENSIONS = [".wav", ".mp3", ".ogg", ".m4a", ".flac", ".aac"];

function normalizeNonNegative(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value;
}

export async function collectAudioInventorySnapshot(
  rootDir: string,
  options: InventoryCollectorOptions = {}
): Promise<InventorySnapshot> {
  const extensions = new Set(
    (options.audioExtensions ?? DEFAULT_AUDIO_EXTENSIONS).map((item) =>
      item.trim().toLowerCase()
    )
  );
  const probeDurationSeconds = options.probeDurationSeconds;
  const durationCache = options.durationCache;

  let audioCount = 0;
  let durationSeconds = 0;
  let diskUsageBytes = 0;

  if (!rootDir || !fs.existsSync(rootDir)) {
    return { audioCount: 0, durationSeconds: 0, diskUsageBytes: 0 };
  }

  const stack = [rootDir];
  while (stack.length > 0) {
    const currentDir = stack.pop();
    if (!currentDir) continue;

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;

      let stats: fs.Stats;
      try {
        stats = fs.statSync(fullPath);
      } catch {
        continue;
      }
      diskUsageBytes += Math.trunc(normalizeNonNegative(stats.size));

      const ext = path.extname(entry.name).toLowerCase();
      if (!extensions.has(ext)) continue;

      audioCount += 1;

      if (!probeDurationSeconds) continue;

      const cacheKey = fullPath;
      const cached = durationCache?.get(cacheKey);
      if (cached && cached.sizeBytes === stats.size && cached.mtimeMs === stats.mtimeMs) {
        durationSeconds += normalizeNonNegative(cached.durationSeconds);
        continue;
      }

      const probedDuration = normalizeNonNegative(
        (await probeDurationSeconds(fullPath)) ?? 0
      );
      durationSeconds += probedDuration;
      durationCache?.set(cacheKey, {
        sizeBytes: stats.size,
        mtimeMs: stats.mtimeMs,
        durationSeconds: probedDuration
      });
    }
  }

  if (durationCache) {
    // Remove cache de arquivos que não existem mais para evitar crescimento infinito.
    for (const cachedPath of durationCache.keys()) {
      if (!cachedPath.startsWith(rootDir)) continue;
      if (!fs.existsSync(cachedPath)) {
        durationCache.delete(cachedPath);
      }
    }
  }

  return {
    audioCount,
    durationSeconds: Number(durationSeconds.toFixed(3)),
    diskUsageBytes
  };
}

export function buildInventoryDelta(
  previous: InventorySnapshot,
  current: InventorySnapshot
): {
  changed: boolean;
  delta: {
    audioCountDelta: number;
    durationSecondsDelta: number;
    diskUsageBytesDelta: number;
  };
} {
  const audioCountDelta = Math.trunc(current.audioCount - previous.audioCount);
  const durationSecondsDelta = Number(
    (current.durationSeconds - previous.durationSeconds).toFixed(3)
  );
  const diskUsageBytesDelta = Math.trunc(current.diskUsageBytes - previous.diskUsageBytes);
  const changed =
    audioCountDelta !== 0 || durationSecondsDelta !== 0 || diskUsageBytesDelta !== 0;
  return {
    changed,
    delta: {
      audioCountDelta,
      durationSecondsDelta,
      diskUsageBytesDelta
    }
  };
}
