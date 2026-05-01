import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildInventoryDelta,
  collectAudioInventorySnapshot
} from "../../worker/src/inventory-collector.ts";

test("worker inventory collector: snapshot/delta detecta exclusao manual e evita delta indevido", async () => {
  // Objetivo do teste:
  // 1) validar snapshot inicial com N arquivos de audio;
  // 2) validar delta negativo apos exclusao manual no disco;
  // 3) validar que duas varreduras sem mudanca nao geram delta.
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vizlec-worker-inventory-"));
  const audioDir = path.join(tempDir, "courses", "c1", "modules", "m1", "lessons", "l1");
  fs.mkdirSync(audioDir, { recursive: true });

  const audioA = path.join(audioDir, "a.wav");
  const audioB = path.join(audioDir, "b.mp3");
  const nonAudio = path.join(audioDir, "ignore.txt");
  fs.writeFileSync(audioA, "AAAAAA", "utf8"); // 6 bytes
  fs.writeFileSync(audioB, "BBBBBBBBBB", "utf8"); // 10 bytes
  fs.writeFileSync(nonAudio, "nao conta", "utf8"); // 9 bytes (entra no disco total)

  const probeCalls: string[] = [];
  const durationByFile = new Map<string, number>([
    [audioA, 2.5],
    [audioB, 3.0]
  ]);
  const durationCache = new Map<
    string,
    { sizeBytes: number; mtimeMs: number; durationSeconds: number }
  >();

  const snapshot1 = await collectAudioInventorySnapshot(path.join(tempDir, "courses"), {
    durationCache,
    probeDurationSeconds: async (filePath) => {
      probeCalls.push(filePath);
      return durationByFile.get(filePath) ?? null;
    }
  });

  assert.equal(snapshot1.audioCount, 2);
  assert.equal(snapshot1.durationSeconds, 5.5);
  assert.equal(snapshot1.diskUsageBytes, 25);
  assert.equal(probeCalls.length, 2);

  // Segunda varredura sem alteracao deve reutilizar cache de duracao.
  const snapshot2 = await collectAudioInventorySnapshot(path.join(tempDir, "courses"), {
    durationCache,
    probeDurationSeconds: async (filePath) => {
      probeCalls.push(filePath);
      return durationByFile.get(filePath) ?? null;
    }
  });
  assert.equal(snapshot2.audioCount, 2);
  assert.equal(snapshot2.durationSeconds, 5.5);
  assert.equal(snapshot2.diskUsageBytes, 25);
  assert.equal(probeCalls.length, 2, "nao deve recalcular duracao sem mudanca de arquivo");

  const noChangeDelta = buildInventoryDelta(snapshot1, snapshot2);
  assert.equal(noChangeDelta.changed, false);
  assert.equal(noChangeDelta.delta.audioCountDelta, 0);
  assert.equal(noChangeDelta.delta.durationSecondsDelta, 0);
  assert.equal(noChangeDelta.delta.diskUsageBytesDelta, 0);

  // Exclusao manual de arquivo no disco.
  fs.unlinkSync(audioB);

  const snapshot3 = await collectAudioInventorySnapshot(path.join(tempDir, "courses"), {
    durationCache,
    probeDurationSeconds: async (filePath) => {
      probeCalls.push(filePath);
      return durationByFile.get(filePath) ?? null;
    }
  });

  assert.equal(snapshot3.audioCount, 1);
  assert.equal(snapshot3.durationSeconds, 2.5);
  assert.equal(snapshot3.diskUsageBytes, 15);

  const deletionDelta = buildInventoryDelta(snapshot2, snapshot3);
  assert.equal(deletionDelta.changed, true);
  assert.equal(deletionDelta.delta.audioCountDelta, -1);
  assert.equal(deletionDelta.delta.durationSecondsDelta, -3);
  assert.equal(deletionDelta.delta.diskUsageBytesDelta, -10);

  fs.rmSync(tempDir, { recursive: true, force: true });
});
