import assert from "node:assert/strict";
import test from "node:test";
import { buildDeterministicBlocks } from "@vizlec/shared";

test("deterministic segment fallback respects max words derived from speech budget", () => {
  const scriptText =
    "Um bloco muito longo sem pontuacao forte para forcar o heuristico a dividir corretamente em partes menores respeitando o limite de fala configurado para o tts e evitando que a validacao final reprove toda a segmentacao por excesso de segundos no primeiro bloco";

  const drafts = buildDeterministicBlocks(scriptText, 2.5, 200, 30);
  assert.ok(drafts.length >= 2);
  for (const draft of drafts) {
    assert.ok(draft.wordCount <= 30, `block ${draft.index} exceeded max words: ${draft.wordCount}`);
    assert.ok(draft.durationEstimateS <= 12, `block ${draft.index} exceeded duration: ${draft.durationEstimateS}`);
  }
});
