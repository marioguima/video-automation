export const COMPOSITION_ASPECT_RATIOS = [
  "16:9",
  "9:16",
  "1:1",
  "4:5",
  "4:3",
  "3:4"
] as const;

export type CompositionAspectRatio = (typeof COMPOSITION_ASPECT_RATIOS)[number];

export const NARRATIVE_ROLES = [
  "hook",
  "setup",
  "core_point",
  "proof",
  "objection",
  "turn",
  "cta",
  "outro"
] as const;

export type NarrativeRole = (typeof NARRATIVE_ROLES)[number];

export const COMPOSITION_PRESET_IDS = [
  "clean-authority",
  "dark-promo",
  "kinetic-cta"
] as const;

export type CompositionPresetId = (typeof COMPOSITION_PRESET_IDS)[number];

export type VariantMediaType = "video" | "image";
export type VariantStatus = "draft" | "structure_ready" | "composition_ready" | "ready";
export type CompositionStatus = "draft" | "ready";

export type NarrativeUnitIntent = {
  visualStyle?: string;
  assetPreference?: "image" | "video" | "mixed";
  emphasis?: "low" | "medium" | "high";
  motionHint?: string;
  overlayHint?: string;
};

export type CompositionClip = {
  id: string;
  type: "narrative_scene";
  role: NarrativeRole;
  startFrame: number;
  durationFrames: number;
  title: string;
  body: string;
  palette: {
    backgroundFrom: string;
    backgroundTo: string;
    accent: string;
    panel: string;
    textPrimary: string;
    textSecondary: string;
  };
  motion: "static" | "slow_push" | "drift_up";
  overlay?: {
    label?: string;
    value?: string;
  };
};

export type CompositionTrack = {
  id: string;
  type: "scene";
  clips: CompositionClip[];
};

export type CompositionTimeline = {
  version: 1;
  presetId: CompositionPresetId;
  aspectRatio: CompositionAspectRatio;
  fps: number;
  durationFrames: number;
  tracks: CompositionTrack[];
};

export type VariantCompositionSummary = {
  id: string;
  itemId: string;
  projectId?: string | null;
  title: string;
  status: VariantStatus;
  mediaType: VariantMediaType;
  aspectRatio: CompositionAspectRatio;
  presetId: CompositionPresetId;
  language?: string | null;
  targetDurationS?: number | null;
  metadata?: Record<string, unknown> | null;
  narrativeUnitsCount?: number;
  compositionStatus?: CompositionStatus;
};

export function getCompositionDimensions(aspectRatio: CompositionAspectRatio): {
  width: number;
  height: number;
} {
  switch (aspectRatio) {
    case "9:16":
      return { width: 1080, height: 1920 };
    case "1:1":
      return { width: 1080, height: 1080 };
    case "4:5":
      return { width: 1080, height: 1350 };
    case "4:3":
      return { width: 1440, height: 1080 };
    case "3:4":
      return { width: 1080, height: 1440 };
    case "16:9":
    default:
      return { width: 1920, height: 1080 };
  }
}
