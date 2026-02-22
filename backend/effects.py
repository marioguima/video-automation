from dataclasses import dataclass


@dataclass(frozen=True)
class MotionPreset:
    mode: str
    zoom_peak: float
    base_zoom: float
    in_ratio: float
    hold_end_ratio: float
    pan_start: float
    pan_end: float
    y_anchor: float
    pulse_delta: float = 0.0
    pulse_ratio: float = 0.0
    entry_accel_power: float = 2.0
    exit_accel_power: float = 2.0


MOTION_PRESETS: dict[str, MotionPreset] = {
    # Zoom-only presets (x/y locked in center).
    "A_zoom_soft_hold": MotionPreset(
        mode="zoom_only",
        zoom_peak=1.08,
        base_zoom=1.00,
        in_ratio=0.26,
        hold_end_ratio=0.80,
        pan_start=0.50,
        pan_end=0.50,
        y_anchor=0.50,
    ),
    "B_zoom_balanced_hold": MotionPreset(
        mode="zoom_only",
        zoom_peak=1.12,
        base_zoom=1.00,
        in_ratio=0.24,
        hold_end_ratio=0.76,
        pan_start=0.50,
        pan_end=0.50,
        y_anchor=0.50,
    ),
    "C_zoom_micro_pullout": MotionPreset(
        mode="zoom_only",
        zoom_peak=1.10,
        base_zoom=1.00,
        in_ratio=0.18,
        hold_end_ratio=0.70,
        pan_start=0.50,
        pan_end=0.50,
        y_anchor=0.50,
    ),
    "D_zoom_cinematic": MotionPreset(
        mode="zoom_only",
        zoom_peak=1.16,
        base_zoom=1.00,
        in_ratio=0.22,
        hold_end_ratio=0.72,
        pan_start=0.50,
        pan_end=0.50,
        y_anchor=0.50,
    ),
    # Requested style:
    # subtle pulse near the neutral point, then accelerated zoom motion.
    "G_zoom_pulse_accel": MotionPreset(
        mode="zoom_pulse_accel",
        zoom_peak=1.16,
        base_zoom=1.00,
        in_ratio=0.24,
        hold_end_ratio=0.70,
        pan_start=0.50,
        pan_end=0.50,
        y_anchor=0.50,
        pulse_delta=0.020,
        pulse_ratio=0.085,
    ),
    # Transition-oriented zoom:
    # very subtle initial movement, then pressure/acceleration in the second half.
    "H_transition_envelope": MotionPreset(
        mode="zoom_transition_envelope",
        zoom_peak=1.15,
        base_zoom=1.00,
        in_ratio=0.28,
        hold_end_ratio=0.66,
        pan_start=0.50,
        pan_end=0.50,
        y_anchor=0.50,
        pulse_delta=0.010,
        pulse_ratio=0.070,
        entry_accel_power=2.6,
        exit_accel_power=2.4,
    ),
    # Pan-only presets (no progressive zoom curve).
    "E_pan_premium_lr": MotionPreset(
        mode="pan_only",
        zoom_peak=1.00,
        base_zoom=1.12,
        in_ratio=0.0,
        hold_end_ratio=1.0,
        pan_start=0.20,
        pan_end=0.80,
        y_anchor=0.50,
    ),
    "F_pan_premium_rl": MotionPreset(
        mode="pan_only",
        zoom_peak=1.00,
        base_zoom=1.12,
        in_ratio=0.0,
        hold_end_ratio=1.0,
        pan_start=0.80,
        pan_end=0.20,
        y_anchor=0.50,
    ),
    # Backward-compatible names.
    "dramatic_slow": MotionPreset(
        mode="zoom_only",
        zoom_peak=1.12,
        base_zoom=1.00,
        in_ratio=0.34,
        hold_end_ratio=0.80,
        pan_start=0.50,
        pan_end=0.50,
        y_anchor=0.50,
    ),
    "neutral_doc": MotionPreset(
        mode="zoom_only",
        zoom_peak=1.08,
        base_zoom=1.00,
        in_ratio=0.28,
        hold_end_ratio=0.76,
        pan_start=0.50,
        pan_end=0.50,
        y_anchor=0.50,
    ),
    "tension_push": MotionPreset(
        mode="zoom_only",
        zoom_peak=1.22,
        base_zoom=1.00,
        in_ratio=0.22,
        hold_end_ratio=0.68,
        pan_start=0.50,
        pan_end=0.50,
        y_anchor=0.50,
    ),
    "cinematic_entry_hold_exit": MotionPreset(
        mode="zoom_only",
        zoom_peak=1.18,
        base_zoom=1.00,
        in_ratio=0.28,
        hold_end_ratio=0.72,
        pan_start=0.50,
        pan_end=0.50,
        y_anchor=0.50,
    ),
}


def list_motion_presets() -> list[str]:
    return list(MOTION_PRESETS.keys())


@dataclass(frozen=True)
class ZoomTransitionPreset:
    entry_start_zoom: float
    entry_ratio: float
    entry_decel_power: float
    entry_landing_ratio: float
    entry_landing_epsilon: float
    entry_blur_ratio: float
    entry_blur_strength: float
    exit_end_zoom: float
    exit_ratio: float
    exit_accel_power: float


ZOOM_TRANSITION_PRESETS: dict[str, ZoomTransitionPreset] = {
    "none": ZoomTransitionPreset(
        entry_start_zoom=1.0,
        entry_ratio=0.0,
        entry_decel_power=1.0,
        entry_landing_ratio=0.0,
        entry_landing_epsilon=0.0,
        entry_blur_ratio=0.0,
        entry_blur_strength=0.0,
        exit_end_zoom=1.0,
        exit_ratio=0.0,
        exit_accel_power=1.0,
    ),
    "T1_subtle": ZoomTransitionPreset(
        entry_start_zoom=1.10,
        entry_ratio=0.16,
        entry_decel_power=1.0,
        entry_landing_ratio=0.18,
        entry_landing_epsilon=0.010,
        entry_blur_ratio=0.0,
        entry_blur_strength=0.0,
        exit_end_zoom=1.16,
        exit_ratio=0.20,
        exit_accel_power=1.8,
    ),
    "T2_standard": ZoomTransitionPreset(
        entry_start_zoom=1.16,
        entry_ratio=0.20,
        entry_decel_power=0.92,
        entry_landing_ratio=0.20,
        entry_landing_epsilon=0.014,
        entry_blur_ratio=0.0,
        entry_blur_strength=0.0,
        exit_end_zoom=1.26,
        exit_ratio=0.24,
        exit_accel_power=2.3,
    ),
    "T3_aggressive": ZoomTransitionPreset(
        entry_start_zoom=3.12,
        entry_ratio=0.24,
        entry_decel_power=0.72,
        entry_landing_ratio=0.26,
        entry_landing_epsilon=0.022,
        entry_blur_ratio=0.0,
        entry_blur_strength=0.0,
        exit_end_zoom=3.90,
        exit_ratio=0.32,
        exit_accel_power=5.2,
    ),
    "T4_continuous": ZoomTransitionPreset(
        entry_start_zoom=2.60,
        entry_ratio=0.28,
        entry_decel_power=1.0,
        entry_landing_ratio=0.0,
        entry_landing_epsilon=0.0,
        entry_blur_ratio=0.0,
        entry_blur_strength=0.0,
        exit_end_zoom=3.20,
        exit_ratio=0.30,
        exit_accel_power=3.0,
    ),
    "T5_blur_burst": ZoomTransitionPreset(
        entry_start_zoom=3.10,
        entry_ratio=0.30,
        entry_decel_power=0.78,
        entry_landing_ratio=0.22,
        entry_landing_epsilon=0.018,
        entry_blur_ratio=0.42,
        entry_blur_strength=16.0,
        exit_end_zoom=3.40,
        exit_ratio=0.30,
        exit_accel_power=3.4,
    ),
    "T6_inertial_ref": ZoomTransitionPreset(
        entry_start_zoom=3.10,
        entry_ratio=0.0,  # frame-driven in branch
        entry_decel_power=1.0,
        entry_landing_ratio=0.0,
        entry_landing_epsilon=0.0,
        entry_blur_ratio=0.0,  # frame-driven in branch
        entry_blur_strength=14.0,
        exit_end_zoom=3.55,
        exit_ratio=0.0,  # frame-driven in branch
        exit_accel_power=3.2,
    ),
}


def list_zoom_transition_presets() -> list[str]:
    return list(ZOOM_TRANSITION_PRESETS.keys())


def zoom_transition_filter(
    duration: float,
    width: int = 1920,
    height: int = 1080,
    fps: int = 25,
    preset: str = "T2_standard",
) -> str:
    """Zoom-only in/out transition envelope for clip edges.

    Entry: starts zoomed-in and only decelerates while entering scene.
    Exit: starts gently and accelerates while zooming out of scene.
    """
    selected = preset if preset in ZOOM_TRANSITION_PRESETS else "T2_standard"
    cfg = ZOOM_TRANSITION_PRESETS[selected]

    def _edge_blur_burst_filter(base_graph: str, blur_total_sec: float, blur_strength: float) -> str:
        # Edge-only blur:
        # - keeps center sharp
        # - blends blurred layer only near borders via radial mask
        blur_total_sec = max(0.04, blur_total_sec)
        luma = max(0.8, min(20.0, blur_strength))
        chroma = max(0.5, min(12.0, luma * 0.62))
        # Mask rises from near-center to borders.
        edge_mask = (
            "min(1,max(0,(hypot((X-W/2)/(W/2),(Y-H/2)/(H/2))-0.42)/0.50))"
        )
        blend_expr = f"A*(1-{edge_mask})+B*({edge_mask})"
        return (
            f"{base_graph},"
            f"split=2[sharp][tmp];"
            f"[tmp]boxblur="
            f"luma_radius={luma:.3f}:luma_power=1:"
            f"chroma_radius={chroma:.3f}:chroma_power=1[blur];"
            f"[sharp][blur]blend=all_expr='{blend_expr}':enable='lt(t,{blur_total_sec:.4f})'"
        )

    if selected == "none":
        return (
            f"zoompan=z='1':"
            f"x='iw/2-(iw/zoom/2)':"
            f"y='ih/2-(ih/zoom/2)':"
            f"d=1:s={width}x{height}:fps={fps}"
        )

    if selected == "T5_blur_burst":
        # Frame-driven profile based on reference measurement:
        # - blur burst: 15 frames
        # - transition in/out window: ~46 frames (1s15f @ 29/30fps)
        transition_frames = 46.0
        blur_frames = 15.0
        entry_accel_frames = 10.0
        entry_sec_target = transition_frames / float(fps)
        exit_sec_target = transition_frames / float(fps)
        blur_total_sec = blur_frames / float(fps)

        # Guardrails for short clips.
        entry_sec = min(entry_sec_target, max(0.12, duration * 0.45))
        exit_sec = min(exit_sec_target, max(0.12, duration * 0.45))
        exit_start = max(entry_sec + 0.04, duration - exit_sec)
        mid_zoom = 1.0
        entry_accel_sec = min(entry_sec * 0.55, entry_accel_frames / float(fps))
        entry_accel_sec = max(0.05, entry_accel_sec)
        entry_decel_sec = max(0.05, entry_sec - entry_accel_sec)
        entry_split_progress = 0.46

        z_expr = (
            f"if(between(it,0,{entry_sec:.4f}),"
            # Entry in 2 stages:
            # 1) ~10 frames builds speed,
            # 2) then long deceleration until frame ~46.
            f"if(between(it,0,{entry_accel_sec:.4f}),"
            f"{mid_zoom}+({cfg.entry_start_zoom}-{mid_zoom})*"
            f"(1-{entry_split_progress:.4f}*pow(it/{entry_accel_sec:.4f},1.8)),"
            f"{mid_zoom}+({cfg.entry_start_zoom}-{mid_zoom})*"
            f"(1-({entry_split_progress:.4f}+(1-{entry_split_progress:.4f})*"
            f"sin((it-{entry_accel_sec:.4f})*PI/(2*{entry_decel_sec:.4f}))))"
            f"),"
            f"if(between(it,{entry_sec:.4f},{exit_start:.4f}),"
            f"{mid_zoom},"
            # Exit: starts smooth and accelerates hard.
            f"{mid_zoom}+({cfg.exit_end_zoom}-{mid_zoom})*pow((it-{exit_start:.4f})/{exit_sec:.4f},{cfg.exit_accel_power:.3f})"
            f"))"
        )
        base = (
            f"zoompan=z='{z_expr}':"
            f"x='iw/2-(iw/zoom/2)':"
            f"y='ih/2-(ih/zoom/2)':"
            f"d=1:s={width}x{height}:fps={fps}"
        )

        blur_total_sec = min(blur_total_sec, max(0.05, entry_sec * 0.8))
        blur_strong_sec = max(0.03, blur_total_sec * 0.42)
        strong_luma = max(1.0, min(20.0, cfg.entry_blur_strength))
        soft_luma = max(0.6, min(14.0, cfg.entry_blur_strength * 0.38))
        strong_chroma = max(0.6, min(12.0, strong_luma * 0.62))
        soft_chroma = max(0.4, min(9.0, soft_luma * 0.62))

        blur_mix_strength = (strong_luma * 0.66) + (soft_luma * 0.34)
        return _edge_blur_burst_filter(
            base_graph=base,
            blur_total_sec=blur_total_sec,
            blur_strength=blur_mix_strength,
        )

    if selected == "T6_inertial_ref":
        # Reference-style behavior from manual observation:
        # - blur lasts ~15 frames
        # - in and out envelopes span ~46 frames each
        # - no hard stop: for short scenes, in naturally blends into out.
        transition_frames = 46.0
        blur_frames = 15.0
        entry_sec = transition_frames / float(fps)
        exit_sec = transition_frames / float(fps)
        blur_total_sec = blur_frames / float(fps)
        mid_zoom = 1.0
        exit_start = duration - exit_sec
        if exit_start < 0:
            exit_start = 0.0

        # Entry: fast then decelerating (inertial settle).
        # Exit: smooth start then accelerates.
        # Combined additively so short scenes "emendam" sem parada seca.
        z_in = (
            f"if(lt(it,{entry_sec:.4f}),"
            f"{mid_zoom}+({cfg.entry_start_zoom}-{mid_zoom})*pow(max(0,1-it/{entry_sec:.4f}),2.25),"
            f"{mid_zoom})"
        )
        out_span = max(0.04, exit_sec)
        out_split = 0.88  # keep acceleration most of the way, then damp tail.
        out_k = cfg.exit_accel_power
        # Piecewise out curve:
        # - accel phase (0 -> split)
        # - damping tail (split -> 1) with zero slope at the end.
        z_out = (
            f"if(gt(it,{exit_start:.4f}),"
            f"{mid_zoom}+({cfg.exit_end_zoom}-{mid_zoom})*"
            f"if(lte((it-{exit_start:.4f})/{out_span:.4f},{out_split:.4f}),"
            f"pow({out_split:.4f},(1-{out_k:.3f}))*pow((it-{exit_start:.4f})/{out_span:.4f},{out_k:.3f}),"
            f"{out_split:.4f}+(1-{out_split:.4f})*(1-pow(1-((it-{exit_start:.4f})/{out_span:.4f}-{out_split:.4f})/(1-{out_split:.4f}),{out_k:.3f}))"
            f"),"
            f"{mid_zoom})"
        )
        z_expr = f"{z_in}+{z_out}-{mid_zoom}"
        base = (
            f"zoompan=z='{z_expr}':"
            f"x='iw/2-(iw/zoom/2)':"
            f"y='ih/2-(ih/zoom/2)':"
            f"d=1:s={width}x{height}:fps={fps}"
        )

        blur_strong_sec = max(0.03, blur_total_sec * 0.45)
        strong_luma = max(1.0, min(20.0, cfg.entry_blur_strength))
        soft_luma = max(0.6, min(12.0, cfg.entry_blur_strength * 0.34))
        strong_chroma = max(0.6, min(12.0, strong_luma * 0.60))
        soft_chroma = max(0.4, min(8.0, soft_luma * 0.60))
        blur_mix_strength = (strong_luma * 0.68) + (soft_luma * 0.32)
        return _edge_blur_burst_filter(
            base_graph=base,
            blur_total_sec=blur_total_sec,
            blur_strength=blur_mix_strength,
        )

    if selected == "T4_continuous":
        entry_sec = max(0.08, duration * cfg.entry_ratio)
        exit_sec = max(0.08, duration * cfg.exit_ratio)
        exit_start = max(entry_sec + 0.04, duration - exit_sec)
        mid_zoom = 1.0
        # Continuous profile (no "step" feeling):
        # - Entry uses ease-out cubic: starts fast, decelerates smoothly to settle.
        # - Exit uses ease-in cubic: starts gently, accelerates progressively.
        z_expr = (
            f"if(between(it,0,{entry_sec:.4f}),"
            f"{mid_zoom}+({cfg.entry_start_zoom}-{mid_zoom})*pow(1-it/{entry_sec:.4f},3),"
            f"if(between(it,{entry_sec:.4f},{exit_start:.4f}),"
            f"{mid_zoom},"
            f"{mid_zoom}+({cfg.exit_end_zoom}-{mid_zoom})*pow((it-{exit_start:.4f})/{exit_sec:.4f},3)"
            f"))"
        )
        return (
            f"zoompan=z='{z_expr}':"
            f"x='iw/2-(iw/zoom/2)':"
            f"y='ih/2-(ih/zoom/2)':"
            f"d=1:s={width}x{height}:fps={fps}"
        )

    entry_sec = max(0.08, duration * cfg.entry_ratio)
    entry_landing_sec = max(0.04, entry_sec * cfg.entry_landing_ratio) if entry_sec > 0 else 0.0
    entry_main_sec = max(0.04, entry_sec - entry_landing_sec) if entry_sec > 0 else 0.0
    entry_main_end = entry_main_sec
    exit_sec = max(0.08, duration * cfg.exit_ratio)
    exit_start = max(entry_sec + 0.08, duration - exit_sec)
    mid_zoom = 1.0

    # Entry (ease-out): fast start then decelerates towards mid_zoom.
    # Exit (ease-in): starts smooth then accelerates towards exit_end_zoom.
    z_expr = (
        f"if(between(it,0,{entry_sec:.4f}),"
        f"if(between(it,0,{entry_main_end:.4f}),"
        # Main in: fast and decelerating.
        f"{mid_zoom}+({cfg.entry_start_zoom}-{mid_zoom})*(1-sin(pow(it/{entry_main_sec:.4f},{cfg.entry_decel_power:.3f})*PI/2))"
        f"+{cfg.entry_landing_epsilon:.4f},"
        # Landing: easy-ease finish to avoid hard stop (Premiere/AE F9 feel).
        f"{mid_zoom}+{cfg.entry_landing_epsilon:.4f}*(1+cos(PI*(it-{entry_main_end:.4f})/{entry_landing_sec:.4f}))/2"
        f"),"
        f"if(between(it,{entry_sec:.4f},{exit_start:.4f}),"
        f"{mid_zoom},"
        f"{mid_zoom}+({cfg.exit_end_zoom}-{mid_zoom})*pow((it-{exit_start:.4f})/{exit_sec:.4f},{cfg.exit_accel_power:.3f})"
        f"))"
    )
    base = (
        f"zoompan=z='{z_expr}':"
        f"x='iw/2-(iw/zoom/2)':"
        f"y='ih/2-(ih/zoom/2)':"
        f"d=1:s={width}x{height}:fps={fps}"
    )
    if cfg.entry_blur_strength <= 0.0 or cfg.entry_blur_ratio <= 0.0:
        return base

    # Blur burst at entry (edge-only) when enabled for generic presets.
    blur_total_sec = max(0.05, entry_sec * cfg.entry_blur_ratio)
    return _edge_blur_burst_filter(
        base_graph=base,
        blur_total_sec=blur_total_sec,
        blur_strength=cfg.entry_blur_strength,
    )


def ken_burns_filter(
    duration: float,
    width: int = 1920,
    height: int = 1080,
    fps: int = 25,
    style: str | None = None,
) -> str:
    """Builds zoom-only or pan-only expressions for still images."""
    preset_name = style if style in MOTION_PRESETS else "B_zoom_balanced_hold"
    preset = MOTION_PRESETS[preset_name]
    frames = max(2, int(duration * fps))
    denom = max(1, frames - 1)

    if preset.mode == "pan_only":
        return (
            f"zoompan="
            f"z='{preset.base_zoom:.4f}':"
            f"x='(iw-iw/zoom)*({preset.pan_start:.4f}+({preset.pan_end:.4f}-{preset.pan_start:.4f})"
            f"*(1-cos(PI*on/{denom}))/2)':"
            f"y='(ih-ih/zoom)*{preset.y_anchor:.4f}':"
            f"d=1:s={width}x{height}:fps={fps}"
        )

    if preset.mode == "zoom_pulse_accel":
        in_end_sec = max(0.25, duration * preset.in_ratio)
        hold_end_sec = max(in_end_sec + 0.10, duration * preset.hold_end_ratio)

        in_pulse_sec = max(0.08, min(in_end_sec * 0.45, duration * preset.pulse_ratio))
        in_main_sec = max(0.08, in_end_sec - in_pulse_sec)

        out_total_sec = max(0.25, duration - hold_end_sec)
        out_pulse_sec = max(0.08, min(out_total_sec * 0.45, duration * preset.pulse_ratio))
        out_main_sec = max(0.08, out_total_sec - out_pulse_sec)
        out_main_start_sec = hold_end_sec + out_pulse_sec

        return (
            f"zoompan="
            f"z='if(between(it,0,{in_pulse_sec:.4f}),"
            # Pulse: slight zoom and return to neutral (quick, subtle).
            f"1+{preset.pulse_delta:.4f}*sin(PI*it/{in_pulse_sec:.4f}),"
            f"if(between(it,{in_pulse_sec:.4f},{in_end_sec:.4f}),"
            # Zoom-in main: fast at start, braking near peak (ease-out).
            f"1+({preset.zoom_peak}-1)*sin((it-{in_pulse_sec:.4f})*PI/(2*{in_main_sec:.4f})),"
            f"if(between(it,{in_end_sec:.4f},{hold_end_sec:.4f}),"
            # Hold.
            f"{preset.zoom_peak},"
            f"if(between(it,{hold_end_sec:.4f},{out_main_start_sec:.4f}),"
            # Out pulse: slight extra push-in then back to peak.
            f"{preset.zoom_peak}+{preset.pulse_delta:.4f}*sin(PI*(it-{hold_end_sec:.4f})/{out_pulse_sec:.4f}),"
            # Zoom-out main: starts smooth and accelerates to exit (ease-in).
            f"{preset.zoom_peak}-({preset.zoom_peak}-1)*pow((it-{out_main_start_sec:.4f})/{out_main_sec:.4f},2)"
            f"))))':"
            f"x='iw/2-(iw/zoom/2)':"
            f"y='ih/2-(ih/zoom/2)':"
            f"d=1:s={width}x{height}:fps={fps}"
        )

    if preset.mode == "zoom_transition_envelope":
        in_end_sec = max(0.25, duration * preset.in_ratio)
        hold_end_sec = max(in_end_sec + 0.10, duration * preset.hold_end_ratio)
        out_total_sec = max(0.25, duration - hold_end_sec)

        # Subtle start: first part has micro movement only.
        in_soft_sec = max(0.10, in_end_sec * 0.40)
        in_accel_sec = max(0.10, in_end_sec - in_soft_sec)
        in_soft_amp = (preset.zoom_peak - 1.0) * 0.18

        # Exit mirrors entry intent:
        # starts subtle, then accelerates outward toward neutral.
        out_soft_sec = max(0.10, out_total_sec * 0.35)
        out_accel_sec = max(0.10, out_total_sec - out_soft_sec)
        out_accel_start_sec = hold_end_sec + out_soft_sec
        out_soft_drop = (preset.zoom_peak - 1.0) * 0.12

        return (
            f"zoompan="
            f"z='if(between(it,0,{in_soft_sec:.4f}),"
            # Very subtle initial "breathing" motion (almost imperceptible).
            f"1+{in_soft_amp:.5f}*pow(it/{in_soft_sec:.4f},1.6),"
            f"if(between(it,{in_soft_sec:.4f},{in_end_sec:.4f}),"
            # Build pressure then accelerate toward peak from mid-to-late phase.
            f"1+{in_soft_amp:.5f}+({preset.zoom_peak}-1-{in_soft_amp:.5f})"
            f"*pow((it-{in_soft_sec:.4f})/{in_accel_sec:.4f},{preset.entry_accel_power:.3f}),"
            f"if(between(it,{in_end_sec:.4f},{hold_end_sec:.4f}),"
            # Hold with tiny drift so scene does not feel frozen.
            f"{preset.zoom_peak}+{preset.pulse_delta:.5f}*sin(PI*(it-{in_end_sec:.4f})/"
            f"{max(0.12, hold_end_sec - in_end_sec):.4f}),"
            f"if(between(it,{hold_end_sec:.4f},{out_accel_start_sec:.4f}),"
            # Slow exit start: slight movement only.
            f"{preset.zoom_peak}-{out_soft_drop:.5f}*pow((it-{hold_end_sec:.4f})/{out_soft_sec:.4f},1.4),"
            # Strong accelerated zoom-out to neutral.
            f"{preset.zoom_peak}-{out_soft_drop:.5f}-({preset.zoom_peak}-1-{out_soft_drop:.5f})"
            f"*pow((it-{out_accel_start_sec:.4f})/{out_accel_sec:.4f},{preset.exit_accel_power:.3f})"
            f"))))':"
            f"x='iw/2-(iw/zoom/2)':"
            f"y='ih/2-(ih/zoom/2)':"
            f"d=1:s={width}x{height}:fps={fps}"
        )

    # Zoom-only mode:
    # - zoom in: starts fast and brakes (ease-out)
    # - hold in middle
    # - zoom out: accelerates toward the end (ease-in)
    in_sec = max(0.25, duration * preset.in_ratio)
    out_start_sec = max(in_sec + 0.10, duration * preset.hold_end_ratio)
    out_sec = max(0.25, duration - out_start_sec)
    return (
        f"zoompan="
        f"z='if(between(it,0,{in_sec:.4f}),"
        f"1+({preset.zoom_peak}-1)*sin(it*PI/(2*{in_sec:.4f})),"
        f"if(between(it,{in_sec:.4f},{out_start_sec:.4f}),"
        f"{preset.zoom_peak},"
        f"if(between(it,{out_start_sec:.4f},{duration:.4f}),"
        f"{preset.zoom_peak}-({preset.zoom_peak}-1)*pow((it-{out_start_sec:.4f})/{out_sec:.4f},2),"
        f"1)"
        f"))':"
        f"x='iw/2-(iw/zoom/2)':"
        f"y='ih/2-(ih/zoom/2)':"
        f"d=1:s={width}x{height}:fps={fps}"
    )

