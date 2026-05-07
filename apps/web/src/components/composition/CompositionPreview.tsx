import React from 'react';
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion';
import { Player } from '@remotion/player';

export type CompositionAspectRatio = '16:9' | '9:16' | '1:1' | '4:5' | '4:3' | '3:4';
export type NarrativeRole = 'hook' | 'setup' | 'core_point' | 'proof' | 'objection' | 'turn' | 'cta' | 'outro';

export type StudioCompositionClip = {
  id: string;
  type: 'narrative_scene';
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
  motion: 'static' | 'slow_push' | 'drift_up';
  overlay?: {
    label?: string;
    value?: string;
  };
};

export type StudioCompositionTimeline = {
  version: 1;
  presetId: string;
  aspectRatio: CompositionAspectRatio;
  fps: number;
  durationFrames: number;
  tracks: Array<{
    id: string;
    type: 'scene';
    clips: StudioCompositionClip[];
  }>;
};

type SceneCardProps = {
  clip: StudioCompositionClip;
};

function getDimensions(aspectRatio: CompositionAspectRatio): { width: number; height: number } {
  switch (aspectRatio) {
    case '9:16':
      return { width: 1080, height: 1920 };
    case '1:1':
      return { width: 1080, height: 1080 };
    case '4:5':
      return { width: 1080, height: 1350 };
    case '4:3':
      return { width: 1440, height: 1080 };
    case '3:4':
      return { width: 1080, height: 1440 };
    case '16:9':
    default:
      return { width: 1920, height: 1080 };
  }
}

function SceneCard({ clip }: SceneCardProps) {
  const frame = useCurrentFrame();
  const entrance = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
  const scale =
    clip.motion === 'slow_push'
      ? interpolate(frame, [0, clip.durationFrames], [1, 1.08], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp'
        })
      : clip.motion === 'drift_up'
        ? interpolate(frame, [0, clip.durationFrames], [1, 1.04], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp'
          })
        : 1;
  const translateY =
    clip.motion === 'drift_up'
      ? interpolate(frame, [0, clip.durationFrames], [28, -18], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp'
        })
      : 0;

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${clip.palette.backgroundFrom}, ${clip.palette.backgroundTo})`,
        color: clip.palette.textPrimary,
        overflow: 'hidden'
      }}
    >
      <AbsoluteFill
        style={{
          transform: `scale(${scale}) translateY(${translateY}px)`,
          opacity: entrance
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: '8%',
            borderRadius: 42,
            background: clip.palette.panel,
            border: `1px solid ${clip.palette.accent}33`,
            boxShadow: `0 24px 80px ${clip.palette.backgroundFrom}66`,
            padding: '7%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            backdropFilter: 'blur(12px)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 12,
                fontSize: 26,
                letterSpacing: '0.24em',
                textTransform: 'uppercase',
                fontWeight: 700,
                color: clip.palette.accent
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: clip.palette.accent,
                  display: 'inline-block'
                }}
              />
              {clip.overlay?.label ?? clip.role}
            </div>
            {clip.overlay?.value ? (
              <div
                style={{
                  fontSize: 22,
                  color: clip.palette.textSecondary,
                  textTransform: 'uppercase',
                  letterSpacing: '0.18em',
                  fontWeight: 600
                }}
              >
                {clip.overlay.value}
              </div>
            ) : null}
          </div>

          <div style={{ display: 'grid', gap: 28, alignContent: 'center' }}>
            <div
              style={{
                fontSize: 72,
                lineHeight: 1.02,
                fontWeight: 800,
                maxWidth: '80%',
                textWrap: 'balance'
              }}
            >
              {clip.title}
            </div>
            <div
              style={{
                fontSize: 32,
                lineHeight: 1.35,
                color: clip.palette.textSecondary,
                maxWidth: '72%'
              }}
            >
              {clip.body}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div
              style={{
                height: 8,
                width: '42%',
                borderRadius: 999,
                background: `${clip.palette.accent}55`
              }}
            >
              <div
                style={{
                  width: `${entrance * 100}%`,
                  height: '100%',
                  borderRadius: 999,
                  background: clip.palette.accent
                }}
              />
            </div>
            <div
              style={{
                fontSize: 24,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: clip.palette.textSecondary,
                fontWeight: 700
              }}
            >
              {clip.role.replace('_', ' ')}
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

type CompositionRootProps = {
  timeline: StudioCompositionTimeline;
};

function CompositionRoot({ timeline }: CompositionRootProps) {
  const clips = timeline.tracks.flatMap((track) => track.clips);
  return (
    <AbsoluteFill>
      {clips.map((clip) => (
        <Sequence
          key={clip.id}
          from={clip.startFrame}
          durationInFrames={clip.durationFrames}
        >
          <SceneCard clip={clip} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}

type CompositionPreviewProps = {
  timeline: StudioCompositionTimeline | null;
};

export default function CompositionPreview({ timeline }: CompositionPreviewProps) {
  if (!timeline) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-[6px] border border-dashed border-border bg-card text-sm text-muted-foreground">
        Gere a composição para visualizar a timeline.
      </div>
    );
  }

  const dimensions = getDimensions(timeline.aspectRatio);
  return (
    <div className="overflow-hidden rounded-[6px] border border-border bg-card shadow-sm">
      <Player
        component={CompositionRoot}
        inputProps={{ timeline }}
        durationInFrames={Math.max(1, timeline.durationFrames)}
        fps={Math.max(1, timeline.fps)}
        compositionWidth={dimensions.width}
        compositionHeight={dimensions.height}
        style={{ width: '100%', aspectRatio: `${dimensions.width} / ${dimensions.height}` }}
        controls
        autoPlay={false}
        loop
      />
    </div>
  );
}
