export type OnScreen = { title: string; bullets: string[] };
export type ImagePrompt = {
  block_prompt: string;
  avoid?: string;
  seed_hint?: string;
  seed?: number;
};
export type AnimationPrompt = {
  prompt: string;
  motion?: string;
  camera?: string;
  duration_hint?: string;
};
export type DirectionNotes = {
  notes: string;
};
export type SoundEffectPrompt = {
  prompt: string;
  timing?: string;
  avoid?: string;
};

export type LlmBlock = {
  index?: number;
  source_text?: string;
  word_count?: number;
  duration_estimate_s?: number;
  on_screen?: OnScreen;
};

export type LlmSegmentation = {
  lesson_title?: string;
  speech_rate_wps?: number;
  blocks?: LlmBlock[];
};

export type ScriptStructureMode = "scene_blocks" | "music_storyboard";
export type TextLayerMode = "none" | "captions" | "slide_points" | "highlights";
export type SpeechBudget = {
  mode: "external_tts" | "video_native_audio" | "none";
  language?: string;
  sourceProviderId?: string;
  targetChars?: number;
  maxChars?: number;
  targetSpeechSeconds?: number;
  maxSpeechSeconds?: number;
  acceptedDurationsSeconds?: number[];
};

export type SegmentationPromptOptions = {
  scriptMode?: ScriptStructureMode;
  speechRateWps: number;
  speechBudget?: SpeechBudget;
  textLayerMode?: TextLayerMode;
};

export type NormalizedBlock = {
  index: number;
  sourceText: string;
  wordCount: number;
  durationEstimateS: number;
  onScreen?: OnScreen;
};

export type NormalizationResult = {
  blocks: NormalizedBlock[];
  usedFallback: boolean;
  reason?: "empty_blocks" | "mismatch";
};

export type BlockDraft = {
  index: number;
  sourceText: string;
  wordCount: number;
  durationEstimateS: number;
};

export type BlockMeta = {
  onScreen: OnScreen;
  imagePrompt: ImagePrompt;
  animationPrompt: AnimationPrompt;
  directionNotes: DirectionNotes;
  soundEffectPrompt?: SoundEffectPrompt;
};

const FALLBACK_TITLE = "Bloco";
const HORIZONTAL_RULE_RE = /^\s*---\s*$/;
const BULLET_LINE_RE = /^\s*(?:[*+-]|\d+[.)])\s+.+$/;
const TTS_BULLET_LINE_RE = /^\s*([*-])\s*(.+)$/;

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function sanitizeNarratedScriptText(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const parts: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const bulletMatch = line.match(TTS_BULLET_LINE_RE);
    if (bulletMatch) {
      const bulletText = normalizeWhitespace(bulletMatch[2] ?? "");
      if (!bulletText) continue;
      const withoutTrailingSemicolon = bulletText.replace(/;+$/g, "").trim();
      parts.push(`${withoutTrailingSemicolon};`);
      continue;
    }

    parts.push(trimmed);
  }

  return normalizeWhitespace(parts.join(" "))
    .replace(/[“”]/g, "\"")
    .replace(/—/g, "-")
    .replace(/[*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitTextByHorizontalRule(scriptText: string): string[] {
  const sections: string[] = [];
  const current: string[] = [];
  const lines = scriptText.split("\n");
  for (const line of lines) {
    if (HORIZONTAL_RULE_RE.test(line)) {
      sections.push(current.join("\n"));
      current.length = 0;
      continue;
    }
    current.push(line);
  }
  sections.push(current.join("\n"));
  return sections;
}

function splitSectionIntoParagraphLines(sectionText: string): string[][] {
  const paragraphs: string[][] = [];
  const current: string[] = [];
  const lines = sectionText.split("\n");
  for (const line of lines) {
    if (line.trim().length === 0) {
      if (current.length > 0) {
        paragraphs.push([...current]);
        current.length = 0;
      }
      continue;
    }
    current.push(line);
  }
  if (current.length > 0) {
    paragraphs.push(current);
  }
  return paragraphs;
}

function mergeBulletParagraphContext(paragraphs: string[][]): string[][] {
  const merged: string[][] = [];
  for (const paragraph of paragraphs) {
    const hasBullet = paragraph.some((line) => BULLET_LINE_RE.test(line));
    if (
      hasBullet &&
      merged.length > 0 &&
      !merged[merged.length - 1].some((line) => BULLET_LINE_RE.test(line))
    ) {
      const previous = merged.pop() ?? [];
      merged.push([...previous, ...paragraph]);
      continue;
    }
    merged.push(paragraph);
  }
  return merged;
}

function fitsChunkLimits(text: string, maxChars: number, maxWords?: number): boolean {
  if (text.length > maxChars) return false;
  if (typeof maxWords === "number" && maxWords > 0 && wordCount(text) > maxWords) return false;
  return true;
}

function splitTextByLimit(text: string, maxChars: number, maxWords?: number): string[] {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];

  const chunks: string[] = [];
  const words = normalized.split(/\s+/).filter(Boolean);
  let wordStart = 0;

  while (wordStart < words.length) {
    let wordEnd = words.length;
    if (typeof maxWords === "number" && maxWords > 0) {
      wordEnd = Math.min(wordEnd, wordStart + maxWords);
    }
    let candidate = words.slice(wordStart, wordEnd).join(" ");
    while (candidate.length > maxChars && wordEnd > wordStart + 1) {
      wordEnd -= 1;
      candidate = words.slice(wordStart, wordEnd).join(" ");
    }
    if (candidate.length <= maxChars) {
      chunks.push(candidate);
      wordStart = wordEnd;
      continue;
    }

    const remaining = words.slice(wordStart).join(" ");
    const maxEnd = Math.min(maxChars, remaining.length);
    let end = -1;

    for (let i = maxEnd - 1; i >= 0; i -= 1) {
      const char = remaining[i];
      if (char === "." || char === ",") {
        end = i + 1;
        break;
      }
    }

    if (end === -1) {
      const space = remaining.lastIndexOf(" ", maxEnd);
      if (space > 0) {
        end = space;
      } else {
        end = maxEnd;
      }
    }

    const chunk = remaining.slice(0, end).trim();
    if (!chunk.length) {
      chunks.push(remaining.slice(0, maxChars).trim());
      wordStart += 1;
      continue;
    }
    chunks.push(chunk);
    wordStart += wordCount(chunk);
  }

  return chunks;
}

function splitBulletParagraph(paragraphLines: string[], maxChars: number, maxWords?: number): string[] {
  const hasBullet = paragraphLines.some((line) => BULLET_LINE_RE.test(line));
  if (!hasBullet) {
    return splitTextByLimit(paragraphLines.join(" "), maxChars, maxWords);
  }

  const prefaceLines: string[] = [];
  const bullets: string[] = [];
  let currentBulletLines: string[] | null = null;
  let bulletStarted = false;

  for (const rawLine of paragraphLines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (BULLET_LINE_RE.test(rawLine)) {
      bulletStarted = true;
      if (currentBulletLines && currentBulletLines.length > 0) {
        bullets.push(normalizeWhitespace(currentBulletLines.join(" ")));
      }
      currentBulletLines = [line];
      continue;
    }

    if (!bulletStarted) {
      prefaceLines.push(line);
      continue;
    }

    if (!currentBulletLines) {
      currentBulletLines = [line];
    } else {
      currentBulletLines.push(line);
    }
  }

  if (currentBulletLines && currentBulletLines.length > 0) {
    bullets.push(normalizeWhitespace(currentBulletLines.join(" ")));
  }

  if (bullets.length === 0) {
    return splitTextByLimit(paragraphLines.join(" "), maxChars, maxWords);
  }

  const chunks: string[] = [];
  let currentParts: string[] = [];
  const preface = normalizeWhitespace(prefaceLines.join(" "));
  if (preface) {
    currentParts.push(preface);
  }

  const flushCurrent = () => {
    if (currentParts.length === 0) return;
    const text = normalizeWhitespace(currentParts.join(" "));
    if (text) chunks.push(text);
    currentParts = [];
  };

  for (const bullet of bullets) {
    if (currentParts.length === 0) {
      if (fitsChunkLimits(bullet, maxChars, maxWords)) {
        currentParts = [bullet];
      } else {
        chunks.push(...splitTextByLimit(bullet, maxChars, maxWords));
      }
      continue;
    }

    const candidate = normalizeWhitespace([...currentParts, bullet].join(" "));
    if (fitsChunkLimits(candidate, maxChars, maxWords)) {
      currentParts.push(bullet);
      continue;
    }

    flushCurrent();
    if (fitsChunkLimits(bullet, maxChars, maxWords)) {
      currentParts = [bullet];
    } else {
      chunks.push(...splitTextByLimit(bullet, maxChars, maxWords));
    }
  }

  flushCurrent();
  return chunks;
}

function segmentationMatchesScript(blocks: Array<{ sourceText: string }>, scriptText: string): boolean {
  const scriptNormalized = normalizeWhitespace(scriptText);
  const blocksNormalized = normalizeWhitespace(blocks.map((b) => b.sourceText).join(" "));
  return scriptNormalized.length > 0 && scriptNormalized === blocksNormalized;
}

function chunkWords(words: string[], size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += size) {
    chunks.push(words.slice(i, i + size).join(" "));
  }
  return chunks;
}

function fallbackOnScreen(sourceText: string, index: number): OnScreen {
  const words = sourceText.split(/\s+/).filter(Boolean);
  const title = words.length > 0 ? words.slice(0, 8).join(" ") : `${FALLBACK_TITLE} ${index}`;
  const remainder = words.slice(8);
  const bullets = remainder.length > 0 ? chunkWords(remainder, 8).slice(0, 3) : [];
  return { title, bullets };
}

function fallbackImagePrompt(sourceText: string, index: number): ImagePrompt {
  const trimmed = sourceText.trim();
  const asciiOnly = /^[\x00-\x7F]*$/.test(trimmed);
  const promptText = asciiOnly && trimmed.length > 0
    ? `${trimmed.slice(0, 180)}. Photorealistic scene, natural lighting, no text or logos.`
    : `Photorealistic educational visual representing the block topic ${index}. Natural lighting, no text or logos.`;
  return {
    block_prompt: promptText,
    avoid: "text, captions, watermarks",
    seed_hint: `block_${index}`,
    seed: 100000 + index
  };
}

function fallbackAnimationPrompt(sourceText: string, index: number): AnimationPrompt {
  const trimmed = normalizeWhitespace(sourceText);
  const subject = /^[\x00-\x7F]*$/.test(trimmed) && trimmed.length > 0
    ? trimmed.slice(0, 140)
    : `the visual scene for block ${index}`;
  return {
    prompt: `Animate ${subject} with subtle cinematic movement that preserves the original composition and avoids adding text or logos.`,
    motion: "subtle parallax, gentle environmental movement, no abrupt cuts",
    camera: "slow push-in with stable framing",
    duration_hint: "4-6 seconds"
  };
}

function fallbackDirectionNotes(sourceText: string): DirectionNotes {
  const trimmed = normalizeWhitespace(sourceText);
  return {
    notes: trimmed
      ? `Use this scene to support the narrated idea without adding visible text unless it is present in on_screen. Keep the visual focused on: ${trimmed.slice(0, 180)}`
      : "Use this scene to support the narration with clear visual continuity."
  };
}

function buildFallbackBlocks(scriptText: string, speechRateWps: number, maxChars = 200, maxWords?: number): BlockDraft[] {
  const sections = splitTextByHorizontalRule(scriptText);
  const paragraphs = sections.flatMap((section) =>
    mergeBulletParagraphContext(splitSectionIntoParagraphLines(section))
  );
  if (paragraphs.length === 0) {
    throw new Error("Script text is empty");
  }

  const blocks: BlockDraft[] = [];
  let blockIndex = 1;

  for (const paragraphLines of paragraphs) {
    const chunks = splitBulletParagraph(paragraphLines, maxChars, maxWords);
    for (const chunk of chunks) {
      const wc = wordCount(chunk);
      const duration = speechRateWps > 0 ? Number((wc / speechRateWps).toFixed(1)) : 0;
      blocks.push({
        index: blockIndex,
        sourceText: chunk,
        wordCount: wc,
        durationEstimateS: duration
      });
      blockIndex += 1;
    }
  }

  return blocks;
}

function isValidOnScreen(value: unknown): value is OnScreen {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { title?: unknown; bullets?: unknown };
  return typeof candidate.title === "string" && Array.isArray(candidate.bullets);
}

function isValidImagePrompt(value: unknown): value is ImagePrompt {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { block_prompt?: unknown; seed?: unknown };
  if (typeof candidate.block_prompt !== "string") return false;
  if (candidate.seed === undefined) return true;
  return typeof candidate.seed === "number" && Number.isFinite(candidate.seed);
}

function isValidAnimationPrompt(value: unknown): value is AnimationPrompt {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { prompt?: unknown };
  return typeof candidate.prompt === "string" && candidate.prompt.trim().length > 0;
}

function looksLikePortuguese(text: string): boolean {
  const lower = ` ${text.toLowerCase()} `;
  if (/[áâãàçéêíóôõú]/.test(lower)) return true;
  const tokens = [" que ", " de ", " para ", " com ", " uma ", " um ", " não ", " do ", " da "];
  return tokens.some((token) => lower.includes(token));
}

function looksLikeEnglish(text: string): boolean {
  const lower = ` ${text.toLowerCase()} `;
  if (/[áâãàçéêíóôõú]/.test(lower)) return false;
  const tokens = [
    " the ",
    " and ",
    " of ",
    " with ",
    " without ",
    " for ",
    " from ",
    " to ",
    " in ",
    " on "
  ];
  const hits = tokens.filter((token) => lower.includes(token)).length;
  return hits >= 2;
}

export function buildBlockMetaPrompt(options: {
  index: number;
  total: number;
  sourceText: string;
  prevText?: string;
  nextText?: string;
}): string {
  const { index, total, sourceText, prevText, nextText } = options;
  const contextParts = [];
  if (prevText) {
    contextParts.push(`Previous context (do not quote verbatim):\n${prevText}`);
  }
  if (nextText) {
    contextParts.push(`Next context (do not quote verbatim):\n${nextText}`);
  }
  const context = contextParts.length > 0 ? `\n${contextParts.join("\n\n")}` : "";

  return `You are a script assistant for video lessons.

CRITICAL OUTPUT CONTRACT:
- Return one raw JSON object only.
- The first character must be { and the last character must be }.
- Do not use Markdown, bullets outside JSON, code fences, comments, explanations, or copied instructions.
- If uncertain, still return the JSON object using the provided block text.

Task: generate on_screen, image_prompt and animation_prompt for block ${index} of ${total}.
Use ONLY the block text as source. Do not invent facts.

Rules:
1) Do not rewrite the block text.
2) on_screen must be in PT-BR only.
3) on_screen: title max 8 words; bullets 2–5 items, max 10 words each.
4) image_prompt must be in English only. Use "block_prompt" as the main description and optionally "avoid" and "seed_hint".
5) image_prompt must describe a concrete visual scene derived from the block text, not a summary or slogan.
6) image_prompt must avoid any visible text, typography, logos, watermarks, UI, posters, banners, signs, labels, captions, or subtitles.
7) image_prompt should be 2–4 sentences and include: subject, environment, action, camera/framing, and lighting.
8) image_prompt.seed must be an integer number (for KSampler).
9) animation_prompt must be in English only and describe how the generated image should move.
10) animation_prompt should include "prompt", "motion", "camera" and "duration_hint".
11) Return ONLY valid JSON in the format below.

Format:
{
  "on_screen": {"title":"string","bullets":["string"]},
  "image_prompt": {"block_prompt":"string","avoid":"string","seed_hint":"string","seed":123456},
  "animation_prompt": {"prompt":"string","motion":"string","camera":"string","duration_hint":"string"}
}

Block text:
${sourceText}${context}`;
}

export function normalizeBlockMetaResponse(
  content: string,
  sourceText: string,
  index: number
): BlockMeta {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start >= 0 && end > start) {
      parsed = JSON.parse(content.slice(start, end + 1));
    } else {
      throw new Error("Invalid JSON response from LLM");
    }
  }

  const candidate = parsed as { on_screen?: unknown; image_prompt?: unknown; animation_prompt?: unknown };
  if (!isValidOnScreen(candidate.on_screen)) {
    throw new Error("Invalid on_screen payload");
  }
  const onScreenTitle = candidate.on_screen.title;
  if (looksLikeEnglish(onScreenTitle) && !looksLikePortuguese(onScreenTitle)) {
    throw new Error("on_screen must be in PT-BR");
  }
  for (const bullet of candidate.on_screen.bullets) {
    if (looksLikeEnglish(bullet) && !looksLikePortuguese(bullet)) {
      throw new Error("on_screen bullets must be in PT-BR");
    }
  }
  if (!isValidImagePrompt(candidate.image_prompt)) {
    throw new Error("Invalid image_prompt payload");
  }
  const raw = candidate.image_prompt as ImagePrompt;
  if (looksLikePortuguese(raw.block_prompt) && !looksLikeEnglish(raw.block_prompt)) {
    throw new Error("image_prompt must be in English");
  }
  const imagePrompt: ImagePrompt = {
    block_prompt: raw.block_prompt,
    avoid: raw.avoid,
    seed_hint: raw.seed_hint,
    seed: raw.seed
  };
  const animationPrompt = isValidAnimationPrompt(candidate.animation_prompt)
    ? {
        prompt: candidate.animation_prompt.prompt,
        motion: (candidate.animation_prompt as AnimationPrompt).motion,
        camera: (candidate.animation_prompt as AnimationPrompt).camera,
        duration_hint: (candidate.animation_prompt as AnimationPrompt).duration_hint
      }
    : fallbackAnimationPrompt(sourceText, index);
  return {
    onScreen: candidate.on_screen,
    imagePrompt,
    animationPrompt,
    directionNotes: fallbackDirectionNotes(sourceText)
  };
}

export function buildDeterministicBlocks(
  scriptText: string,
  speechRateWps: number,
  maxChars = 200,
  maxWords?: number
): BlockDraft[] {
  return buildFallbackBlocks(scriptText, speechRateWps, maxChars, maxWords);
}

export function buildFallbackMeta(sourceText: string, index: number): BlockMeta {
  return {
    onScreen: fallbackOnScreen(sourceText, index),
    imagePrompt: fallbackImagePrompt(sourceText, index),
    animationPrompt: fallbackAnimationPrompt(sourceText, index),
    directionNotes: fallbackDirectionNotes(sourceText)
  };
}

export function normalizeSegmentation(
  segmentation: LlmSegmentation,
  scriptText: string,
  speechRateWps: number
): NormalizationResult {
  const blocks = segmentation.blocks ?? [];
  if (blocks.length === 0) {
    throw new Error("Segmentation returned empty blocks");
  }
  const normalized = blocks.map((block, idx) => {
    const index = idx + 1;
    const sourceText = block.source_text?.trim() ?? "";
    if (!sourceText) {
      throw new Error(`Segmentation block ${index} is empty`);
    }
    const wc = sourceText ? wordCount(sourceText) : 0;
    const duration = Number.isFinite(block.duration_estimate_s as number)
      ? Number(block.duration_estimate_s)
      : speechRateWps > 0
      ? Number((wc / speechRateWps).toFixed(1))
      : 0;
    return {
      index,
      sourceText,
      wordCount: block.word_count ?? wc,
      durationEstimateS: duration,
      ...(block.on_screen ? { onScreen: block.on_screen } : {})
    };
  });
  if (!segmentationMatchesScript(normalized, scriptText)) {
    throw new Error("Segmentation blocks do not match script");
  }
  return { blocks: normalized, usedFallback: false };
}

function normalizeSegmentationPromptOptions(
  options: number | SegmentationPromptOptions
): Required<Pick<SegmentationPromptOptions, "scriptMode" | "speechRateWps" | "textLayerMode">> & {
  speechBudget: SpeechBudget;
} {
  if (typeof options === "number") {
    return {
      scriptMode: "scene_blocks",
      speechRateWps: options,
      speechBudget: { mode: "external_tts", maxChars: 200 },
      textLayerMode: "slide_points"
    };
  }
  return {
    scriptMode: options.scriptMode ?? "scene_blocks",
    speechRateWps: options.speechRateWps,
    speechBudget: options.speechBudget ?? { mode: "none" },
    textLayerMode: options.textLayerMode ?? "none"
  };
}

function buildBudgetInstructions(budget: SpeechBudget, speechRateWps: number): string {
  const lines: string[] = [];
  lines.push(`- speech_rate_wps = ${speechRateWps}.`);
  lines.push(`- speech_budget.mode = ${budget.mode}.`);
  if (budget.language) lines.push(`- language = ${budget.language}.`);
  if (budget.sourceProviderId) lines.push(`- source_provider_id = ${budget.sourceProviderId}.`);
  if (typeof budget.targetChars === "number") {
    lines.push(`- target_chars_per_block = ${budget.targetChars}.`);
  }
  if (typeof budget.maxChars === "number") {
    lines.push(`- max_chars_per_block = ${budget.maxChars}. Nunca ultrapasse esse limite em source_text.`);
  }
  if (typeof budget.targetSpeechSeconds === "number") {
    lines.push(`- target_speech_seconds_per_block = ${budget.targetSpeechSeconds}.`);
  }
  if (typeof budget.maxSpeechSeconds === "number") {
    lines.push(`- max_speech_seconds_per_block = ${budget.maxSpeechSeconds}. Nunca ultrapasse essa duracao estimada.`);
  }
  if (budget.acceptedDurationsSeconds && budget.acceptedDurationsSeconds.length > 0) {
    lines.push(`- accepted_video_durations_seconds = ${budget.acceptedDurationsSeconds.join(", ")}.`);
  }
  if (budget.mode === "none") {
    lines.push("- Sem fala gerada: priorize ritmo visual e cortes naturais, mantendo o texto completo.");
  }
  return lines.join("\n");
}

export function buildSegmentationPrompt(
  scriptText: string,
  options: number | SegmentationPromptOptions
): string {
  const normalized = normalizeSegmentationPromptOptions(options);
  const scriptModeInstructions =
    normalized.scriptMode === "music_storyboard"
      ? `Modo do roteiro: music_storyboard.
- Divida em visual beats: momentos visuais coerentes que podem virar imagens, clipes ou loops.
- Um visual beat representa uma mudanca de imagem, clima, cena, assunto ou energia visual.
- Se existir texto narrativo no roteiro, preserve esse texto literalmente em source_text; a sincronizacao musical fina fica para uma etapa posterior.`
      : `Modo do roteiro: scene_blocks.
- Divida em blocos de cena para narracao, imagem e/ou video.
- Cada bloco deve representar uma ideia falavel ou cena coerente.`;

  return `Você é um sistema de análise estrutural de roteiros para geração automatizada de vídeo.

CONTRATO CRITICO DE SAIDA:
- Retorne um unico objeto JSON bruto.
- O primeiro caractere deve ser { e o ultimo deve ser }.
- Nao use Markdown, listas fora do JSON, blocos de codigo, comentarios, explicacoes ou copia das instrucoes.
- Se houver duvida, ainda assim retorne o objeto JSON seguindo o formato.

Tarefa: segmentar o roteiro em blocos estruturais antes da geração de fala, imagem, vídeo e render.

${scriptModeInstructions}

Orçamento de fala/tempo:
${buildBudgetInstructions(normalized.speechBudget, normalized.speechRateWps)}

Text layer configurado: ${normalized.textLayerMode}.
- Nao gere on_screen, captions, bullets de slide ou texto para tela nesta etapa.
- O text layer sera decidido em fase posterior por template/render.

Regras obrigatorias:
1) Preserve a ordem do roteiro.
2) Não invente fatos.
3) Copie os trechos do roteiro literalmente, sem reescrever, resumir ou omitir palavras.
4) A concatenação de source_text de todos os blocos deve ser exatamente igual ao roteiro original depois de normalizar espaços.
5) Tente cortar em fronteiras naturais: frases, pausas, mudancas de assunto ou mudancas visuais.
6) Se houver limite de caracteres ou segundos, reduza o tamanho do bloco dividindo em mais blocos.
7) Nao inclua campos que nao estao no formato pedido.

Retorne APENAS JSON válido no formato:
{
  "lesson_title": "string",
  "speech_rate_wps": ${normalized.speechRateWps},
  "blocks": [
    {
      "index": 1,
      "source_text": "string",
      "word_count": 0,
      "duration_estimate_s": 0
    }
  ]
}

ROTEIRO:
${scriptText}`;
}
