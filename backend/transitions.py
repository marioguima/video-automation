import random
import shutil
import subprocess
import tempfile
import os
from pathlib import Path


XFADE_TRANSITIONS = [
    "fade",
    "wipeleft",
    "wiperight",
    "wipeup",
    "wipedown",
    "slideleft",
    "slideright",
    "slideup",
    "slidedown",
    "circlecrop",
    "rectcrop",
    "distance",
    "fadeblack",
    "fadewhite",
    "radial",
    "smoothleft",
    "smoothright",
    "smoothup",
    "smoothdown",
    "circleopen",
    "circleclose",
    "vertopen",
    "vertclose",
    "horzopen",
    "horzclose",
    "dissolve",
    "pixelize",
    "diagtl",
    "diagtr",
    "diagbl",
    "diagbr",
    "hlslice",
    "hrslice",
    "vuslice",
    "vdslice",
    "hblur",
    "fadegrays",
    "squeezeh",
    "squeezev",
    "zoomin",
    "fadefast",
    "fadeslow",
]

XFADE_PRESET_ALIASES = {
    "basic_fade": "fade",
    "flash_white": "fadewhite",
    "flash_black": "fadeblack",
    "XF1_flash_white_centered_5f": "fadewhite",
    "XF2_flash_black_centered_5f": "fadeblack",
    "XF3_flash_white_occluded_5f": "fade",  # custom branch (no ghosting)
    "XF3b_flash_white_occluded_6f": "fade",  # custom branch (no ghosting, 2 white center frames)
    "XF3b_flash_black_occluded_6f": "fade",  # custom branch (no ghosting, 2 black center frames)
    "XF3c_flash_white_occluded_5f_1o3w1o": "fade",  # custom branch (1 opacity, 3 white, 1 opacity)
}

XFADE_PRESET_DURATIONS_FRAMES = {
    "XF1_flash_white_centered_5f": 5,
    "XF2_flash_black_centered_5f": 5,
    "XF3_flash_white_occluded_5f": 5,
    "XF3b_flash_white_occluded_6f": 6,
    "XF3b_flash_black_occluded_6f": 6,
    "XF3c_flash_white_occluded_5f_1o3w1o": 5,
}


def list_xfade_presets() -> list[str]:
    return list(XFADE_PRESET_ALIASES.keys())


def resolve_xfade_transition(transition: str) -> str:
    return XFADE_PRESET_ALIASES.get(transition, transition)


def resolve_xfade_duration(transition: str, fps: int, default_duration: float) -> float:
    frames = XFADE_PRESET_DURATIONS_FRAMES.get(transition)
    if not frames:
        return default_duration
    if fps <= 0:
        return default_duration
    return max(0.001, frames / float(fps))


def _run(cmd: list[str]) -> None:
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed ({result.returncode}):\n{result.stderr}")


def _make_solid_clip(
    color: str,
    duration: float,
    width: int,
    height: int,
    fps: int,
    output_path: str,
) -> str:
    cmd = [
        "ffmpeg",
        "-y",
        "-f",
        "lavfi",
        "-i",
        f"color=c={color}:s={width}x{height}:r={fps}:d={duration:.6f}",
        "-an",
        *_video_encode_args(),
        "-r",
        str(fps),
        output_path,
    ]
    _run(cmd)
    return output_path


def _probe_dimensions(path: str) -> tuple[int, int]:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "csv=p=0:s=x",
        path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed ({result.returncode}):\n{result.stderr}")
    raw = result.stdout.strip()
    width_s, height_s = raw.split("x")
    return int(width_s), int(height_s)


def _xfade_two(
    clip_a: str,
    dur_a: float,
    clip_b: str,
    transition_name: str,
    trans_dur: float,
    fps: int,
    output_path: str,
) -> str:
    offset = max(0.0, dur_a - trans_dur)
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        clip_a,
        "-i",
        clip_b,
        "-filter_complex",
        (
            f"[0:v]settb=AVTB,fps={fps},format=yuv420p[a];"
            f"[1:v]settb=AVTB,fps={fps},format=yuv420p[b];"
            f"[a][b]xfade=transition={transition_name}:duration={trans_dur:.6f}:offset={offset:.6f}[v]"
        ),
        "-map",
        "[v]",
        *_video_encode_args(),
        "-r",
        str(fps),
        output_path,
    ]
    _run(cmd)
    return output_path


def _compose_occluded_flash_pair(
    clip_a: str,
    dur_a: float,
    clip_b: str,
    dur_b: float,
    output_path: str,
    fps: int,
    flash_color: str = "white",
    center_frames: int = 1,
    edge_fade_frames: int = 2,
) -> str:
    width, height = _probe_dimensions(clip_a)
    tail_dur = max(1.0, float(edge_fade_frames)) / float(fps)
    center_dur = max(1.0, float(center_frames)) / float(fps)
    head_dur = max(1.0, float(edge_fade_frames)) / float(fps)

    if dur_a <= tail_dur or dur_b <= head_dur:
        raise ValueError("clips are too short for XF3 centered occluded flash")

    a_main_end = max(0.0, dur_a - tail_dur)
    b_main_start = head_dur

    # Build 5-frame centered flash with no A+B overlap:
    # A(main) -> A tail fades to white -> white frame -> B head fades from white -> B(main)
    filter_complex = (
        # A main / tail
        f"[0:v]settb=AVTB,fps={fps},format=yuv420p,trim=start=0:end={a_main_end:.6f},setpts=PTS-STARTPTS[a_main];"
        f"[0:v]settb=AVTB,fps={fps},format=rgba,trim=start={a_main_end:.6f}:end={dur_a:.6f},setpts=PTS-STARTPTS,"
        f"fade=t=out:st=0:d={tail_dur:.6f}:alpha=1[a_tail_rgba];"
        # B head / main
        f"[1:v]settb=AVTB,fps={fps},format=rgba,trim=start=0:end={head_dur:.6f},setpts=PTS-STARTPTS,"
        f"fade=t=in:st=0:d={head_dur:.6f}:alpha=1[b_head_rgba];"
        f"[1:v]settb=AVTB,fps={fps},format=yuv420p,trim=start={b_main_start:.6f}:end={dur_b:.6f},setpts=PTS-STARTPTS[b_main];"
        # White backing clips
        f"color=c={flash_color}:s={width}x{height}:r={fps}:d={tail_dur:.6f},format=yuv420p[wa0];"
        f"color=c={flash_color}:s={width}x{height}:r={fps}:d={center_dur:.6f},format=yuv420p[wmid];"
        f"color=c={flash_color}:s={width}x{height}:r={fps}:d={head_dur:.6f},format=yuv420p[wb0];"
        # Composite tails/heads over white
        f"[wa0]format=rgba[wa];[wa][a_tail_rgba]overlay=0:0:format=auto,format=yuv420p[a_tail_flash];"
        f"[wb0]format=rgba[wb];[wb][b_head_rgba]overlay=0:0:format=auto,format=yuv420p[b_head_flash];"
        # Concat all segments
        f"[a_main][a_tail_flash][wmid][b_head_flash][b_main]concat=n=5:v=1:a=0[v]"
    )

    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        clip_a,
        "-i",
        clip_b,
        "-filter_complex",
        filter_complex,
        "-map",
        "[v]",
        *_video_encode_args(),
        "-r",
        str(fps),
        output_path,
    ]
    _run(cmd)
    return output_path


def _apply_centered_flash_chain(
    clips: list[str],
    durations: list[float],
    flash_color: str,
    output_path: str,
    fps: int,
) -> str:
    if len(clips) != len(durations):
        raise ValueError("clips and durations must have the same length")
    if len(clips) == 0:
        raise ValueError("at least one clip is required")
    if len(clips) == 1:
        shutil.copy2(clips[0], output_path)
        return output_path

    flash_half = max(0.001, 2.0 / float(fps))  # 2 frames
    flash_center = max(0.001, 1.0 / float(fps))  # 1 frame

    for idx, duration in enumerate(durations):
        # Need enough clip duration to host the centered flash envelope near the cut.
        if duration <= (flash_half + 0.001):
            raise ValueError(f"duration[{idx}] too short for centered flash transition")

    width, height = _probe_dimensions(clips[0])

    with tempfile.TemporaryDirectory(prefix="xfade_centered_flash_") as tmp:
        tmp_dir = Path(tmp)
        current_path = clips[0]
        current_dur = float(durations[0])

        for i in range(1, len(clips)):
            white_clip = tmp_dir / f"flash_{i}.mp4"
            _make_solid_clip(
                color=flash_color,
                duration=flash_center,
                width=width,
                height=height,
                fps=fps,
                output_path=str(white_clip),
            )

            # A -> flash (2 frames), then flash -> B (2 frames).
            a_to_flash = tmp_dir / f"a_flash_{i}.mp4"
            _xfade_two(
                clip_a=current_path,
                dur_a=current_dur,
                clip_b=str(white_clip),
                transition_name="fade",
                trans_dur=flash_half,
                fps=fps,
                output_path=str(a_to_flash),
            )
            a_to_flash_dur = current_dur + flash_center - flash_half

            merged_pair = tmp_dir / f"merged_{i}.mp4"
            _xfade_two(
                clip_a=str(a_to_flash),
                dur_a=a_to_flash_dur,
                clip_b=clips[i],
                transition_name="fade",
                trans_dur=flash_half,
                fps=fps,
                output_path=str(merged_pair),
            )
            current_path = str(merged_pair)
            current_dur = a_to_flash_dur + float(durations[i]) - flash_half

        shutil.copy2(current_path, output_path)
    return output_path


def _apply_centered_flash_occluded_chain(
    clips: list[str],
    durations: list[float],
    flash_color: str,
    output_path: str,
    fps: int,
    center_frames: int = 1,
    edge_fade_frames: int = 2,
) -> str:
    if len(clips) != len(durations):
        raise ValueError("clips and durations must have the same length")
    if len(clips) == 0:
        raise ValueError("at least one clip is required")
    if len(clips) == 1:
        shutil.copy2(clips[0], output_path)
        return output_path

    with tempfile.TemporaryDirectory(prefix="xfade_occluded_flash_") as tmp:
        tmp_dir = Path(tmp)
        current_path = clips[0]
        current_dur = float(durations[0])

        for i in range(1, len(clips)):
            merged_pair = tmp_dir / f"pair_{i}.mp4"
            _compose_occluded_flash_pair(
                clip_a=current_path,
                dur_a=current_dur,
                clip_b=clips[i],
                dur_b=float(durations[i]),
                output_path=str(merged_pair),
                fps=fps,
                flash_color=flash_color,
                center_frames=center_frames,
                edge_fade_frames=edge_fade_frames,
            )
            # This custom transition inserts opaque center flash frames at the cut.
            current_dur = current_dur + float(durations[i]) + (float(center_frames) / float(fps))
            current_path = str(merged_pair)

        shutil.copy2(current_path, output_path)
    return output_path


def apply_xfade_chain(
    clips: list[str],
    durations: list[float],
    transition: str,
    trans_dur: float,
    output_path: str,
    fps: int = 25,
) -> str:
    """Chains multiple clips using xfade in a single ffmpeg command."""
    if transition == "XF3_flash_white_occluded_5f":
        return _apply_centered_flash_occluded_chain(
            clips=clips,
            durations=durations,
            flash_color="white",
            output_path=output_path,
            fps=fps,
            center_frames=1,
            edge_fade_frames=2,
        )
    if transition == "XF3b_flash_white_occluded_6f":
        return _apply_centered_flash_occluded_chain(
            clips=clips,
            durations=durations,
            flash_color="white",
            output_path=output_path,
            fps=fps,
            center_frames=2,
            edge_fade_frames=2,
        )
    if transition == "XF3b_flash_black_occluded_6f":
        return _apply_centered_flash_occluded_chain(
            clips=clips,
            durations=durations,
            flash_color="black",
            output_path=output_path,
            fps=fps,
            center_frames=2,
            edge_fade_frames=2,
        )
    if transition == "XF3c_flash_white_occluded_5f_1o3w1o":
        return _apply_centered_flash_occluded_chain(
            clips=clips,
            durations=durations,
            flash_color="white",
            output_path=output_path,
            fps=fps,
            center_frames=3,
            edge_fade_frames=1,
        )
    if transition == "XF1_flash_white_centered_5f":
        return _apply_centered_flash_chain(
            clips=clips,
            durations=durations,
            flash_color="white",
            output_path=output_path,
            fps=fps,
        )
    if transition == "XF2_flash_black_centered_5f":
        return _apply_centered_flash_chain(
            clips=clips,
            durations=durations,
            flash_color="black",
            output_path=output_path,
            fps=fps,
        )

    if len(clips) != len(durations):
        raise ValueError("clips and durations must have the same length")
    if len(clips) == 0:
        raise ValueError("at least one clip is required")
    if len(clips) == 1:
        shutil.copy2(clips[0], output_path)
        return output_path

    effective_trans_dur = resolve_xfade_duration(transition=transition, fps=fps, default_duration=trans_dur)

    for idx, duration in enumerate(durations):
        if duration <= effective_trans_dur:
            raise ValueError(
                f"duration[{idx}] must be > transition_duration ({effective_trans_dur})"
            )

    cmd = ["ffmpeg", "-y"]
    for clip in clips:
        cmd += ["-i", clip]

    filter_parts = [f"[{i}:v]settb=AVTB,fps={fps},format=yuv420p[v{i}]" for i in range(len(clips))]

    previous_label = "v0"
    offset = 0.0
    for i in range(1, len(clips)):
        resolved_transition = resolve_xfade_transition(transition)
        chosen = random.choice(XFADE_TRANSITIONS) if resolved_transition == "random" else resolved_transition
        if chosen not in XFADE_TRANSITIONS:
            raise ValueError(f"unknown transition '{chosen}'")

        offset += durations[i - 1] - effective_trans_dur
        next_label = f"x{i}"
        filter_parts.append(
            f"[{previous_label}][v{i}]"
            f"xfade=transition={chosen}:duration={effective_trans_dur}:offset={offset:.3f}"
            f"[{next_label}]"
        )
        previous_label = next_label

    cmd += [
        "-filter_complex",
        ";".join(filter_parts),
        "-map",
        f"[{previous_label}]",
        *_video_encode_args(),
        "-r",
        str(fps),
        output_path,
    ]
    _run(cmd)
    return output_path


def apply_overlay_transition(
    video_path: str,
    transition_clip: str,
    at_second: float,
    output_path: str,
    duration: float = 1.2,
) -> str:
    """Applies one alpha overlay transition clip on top of the base video."""
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        video_path,
        "-i",
        transition_clip,
        "-filter_complex",
        (
            f"[1:v]format=rgba,setpts=PTS-STARTPTS+{at_second}/TB[ov];"
            f"[0:v][ov]overlay=0:0:format=auto:enable='between(t,{at_second},{at_second + duration})'"
        ),
        *_video_encode_args(),
        output_path,
    ]
    _run(cmd)
    return output_path
def _video_encode_args() -> list[str]:
    codec = (os.getenv("VIDEO_AUTOMATION_FFMPEG_VCODEC") or "libx264").strip().lower()
    if codec == "h264_nvenc":
        preset = (os.getenv("VIDEO_AUTOMATION_FFMPEG_NVENC_PRESET") or "p5").strip()
        cq = (os.getenv("VIDEO_AUTOMATION_FFMPEG_NVENC_CQ") or "21").strip()
        return ["-c:v", "h264_nvenc", "-preset", preset, "-cq", cq, "-pix_fmt", "yuv420p"]
    preset = (os.getenv("VIDEO_AUTOMATION_FFMPEG_X264_PRESET") or "veryfast").strip()
    crf = (os.getenv("VIDEO_AUTOMATION_FFMPEG_X264_CRF") or "20").strip()
    return ["-c:v", "libx264", "-preset", preset, "-crf", crf, "-pix_fmt", "yuv420p"]
