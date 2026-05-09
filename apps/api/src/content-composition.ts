import {
  buildDeterministicBlocks,
  COMPOSITION_PRESET_IDS,
  getCompositionDimensions,
  type CompositionAspectRatio,
  type CompositionClip,
  type CompositionPresetId,
  type CompositionTimeline,
  type NarrativeRole
} from "@flowshopy/shared";

export type GeneratedNarrativeUnit = {
  order: number;
  role: NarrativeRole;
  title: string;
  sourceText: string;
  narrationText: string;
  durationEstimateS: number;
  visualIntent: Record<string, unknown>;
  ctaIntent: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
};

const SENTENCE_SPLIT_REGEX = /(?<=[.!?])\s+/;

function summarizeTitle(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "Untitled scene";
  const firstSentence = normalized.split(SENTENCE_SPLIT_REGEX)[0] ?? normalized;
  const words = firstSentence.split(/\s+/).slice(0, 6);
  const title = words.join(" ").trim();
  return title.length > 0 ? title : "Untitled scene";
}

function looksLikeCta(text: string): boolean {
  const normalized = text.toLowerCase();
  return [
    "clique",
    "acesse",
    "compre",
    "garanta",
    "cadastre",
    "inscreva",
    "saiba mais",
    "link",
    "chame"
  ].some((token) => normalized.includes(token));
}

function resolveRole(index: number, total: number, text: string): NarrativeRole {
  if (index === 0) return "hook";
  if (index === total - 1) return looksLikeCta(text) ? "cta" : "outro";
  if (index === 1) return "setup";
  if (index === total - 2) return "turn";
  if (index % 3 === 0) return "proof";
  return "core_point";
}

function buildPalette(presetId: CompositionPresetId, role: NarrativeRole): CompositionClip["palette"] {
  if (presetId === "dark-promo") {
    return {
      backgroundFrom: "#120b0a",
      backgroundTo: "#402214",
      accent: role === "cta" ? "#ff8d3a" : "#ff6b2c",
      panel: "rgba(17, 12, 10, 0.72)",
      textPrimary: "#fff4ed",
      textSecondary: "#f7c8ad"
    };
  }
  if (presetId === "kinetic-cta") {
    return {
      backgroundFrom: "#071521",
      backgroundTo: "#103653",
      accent: role === "cta" ? "#42d392" : "#68d2ff",
      panel: "rgba(7, 21, 33, 0.74)",
      textPrimary: "#f5fbff",
      textSecondary: "#b4d9ef"
    };
  }
  return {
    backgroundFrom: "#f4efe7",
    backgroundTo: "#c9a77f",
    accent: role === "cta" ? "#c24f1c" : "#7a3f1d",
    panel: "rgba(255, 248, 240, 0.76)",
    textPrimary: "#20130f",
    textSecondary: "#5f3d2b"
  };
}

export function normalizePresetId(value: string | null | undefined): CompositionPresetId {
  return COMPOSITION_PRESET_IDS.includes(value as CompositionPresetId)
    ? (value as CompositionPresetId)
    : "clean-authority";
}

export function generateNarrativeUnits(sourceText: string, targetDurationS?: number | null): GeneratedNarrativeUnit[] {
  const blocks = buildDeterministicBlocks(sourceText, 2.5);
  const fallbackParts = sourceText
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  const parts = blocks.length > 0 ? blocks.map((block) => block.sourceText) : fallbackParts;
  const total = Math.max(parts.length, 1);
  return parts.map((part, index) => {
    const cleanText = part.trim();
    const role = resolveRole(index, total, cleanText);
    const durationEstimateS = Math.max(
      2.5,
      Math.round((cleanText.split(/\s+/).filter(Boolean).length / 2.5) * 10) / 10
    );
    return {
      order: index,
      role,
      title: summarizeTitle(cleanText),
      sourceText: cleanText,
      narrationText: cleanText,
      durationEstimateS,
      visualIntent: {
        visualStyle: role === "hook" ? "attention-grab" : role === "cta" ? "direct-response" : "editorial",
        assetPreference: role === "proof" ? "video" : "mixed",
        emphasis: role === "hook" || role === "cta" ? "high" : "medium",
        motionHint: role === "hook" ? "fast-intro" : role === "cta" ? "lock-focus" : "steady"
      },
      ctaIntent:
        role === "cta"
          ? {
              kind: "soft",
              objective: "drive-click",
              targetDurationS: targetDurationS ?? null
            }
          : null,
      metadata: {
        generatedFrom: "content_source_text",
        sentenceCount: cleanText.split(SENTENCE_SPLIT_REGEX).filter(Boolean).length
      }
    };
  });
}

export function buildInitialCompositionTimeline(args: {
  aspectRatio: CompositionAspectRatio;
  presetId: CompositionPresetId;
  units: GeneratedNarrativeUnit[];
  fps?: number;
}): CompositionTimeline {
  const fps = args.fps ?? 30;
  let startFrame = 0;
  const clips: CompositionClip[] = args.units.map((unit) => {
    const durationFrames = Math.max(45, Math.round(unit.durationEstimateS * fps));
    const clip: CompositionClip = {
      id: `scene-${unit.order + 1}`,
      type: "narrative_scene",
      role: unit.role,
      startFrame,
      durationFrames,
      title: unit.title,
      body: unit.narrationText,
      palette: buildPalette(args.presetId, unit.role),
      motion:
        unit.role === "hook" ? "slow_push" : unit.role === "cta" ? "static" : "drift_up",
      overlay:
        unit.role === "cta"
          ? { label: "CTA", value: "Promote the offer" }
          : unit.role === "proof"
            ? { label: "Proof", value: "Evidence / example" }
            : { label: unit.role.replace("_", " "), value: `${unit.durationEstimateS.toFixed(1)}s` }
    };
    startFrame += durationFrames;
    return clip;
  });
  return {
    version: 1,
    presetId: args.presetId,
    aspectRatio: args.aspectRatio,
    fps,
    durationFrames: clips.reduce((sum, clip) => sum + clip.durationFrames, 0),
    tracks: [
      {
        id: "scene-track",
        type: "scene",
        clips
      }
    ]
  };
}

export function getTimelineDimensions(aspectRatio: CompositionAspectRatio): { width: number; height: number } {
  return getCompositionDimensions(aspectRatio);
}
