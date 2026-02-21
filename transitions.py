import random
import shutil
import subprocess


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


def _run(cmd: list[str]) -> None:
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed ({result.returncode}):\n{result.stderr}")


def apply_xfade_chain(
    clips: list[str],
    durations: list[float],
    transition: str,
    trans_dur: float,
    output_path: str,
    fps: int = 25,
) -> str:
    """Chains multiple clips using xfade in a single ffmpeg command."""
    if len(clips) != len(durations):
        raise ValueError("clips and durations must have the same length")
    if len(clips) == 0:
        raise ValueError("at least one clip is required")
    if len(clips) == 1:
        shutil.copy2(clips[0], output_path)
        return output_path

    for idx, duration in enumerate(durations):
        if duration <= trans_dur:
            raise ValueError(
                f"duration[{idx}] must be > transition_duration ({trans_dur})"
            )

    cmd = ["ffmpeg", "-y"]
    for clip in clips:
        cmd += ["-i", clip]

    filter_parts = [f"[{i}:v]settb=AVTB,fps={fps},format=yuv420p[v{i}]" for i in range(len(clips))]

    previous_label = "v0"
    offset = 0.0
    for i in range(1, len(clips)):
        chosen = random.choice(XFADE_TRANSITIONS) if transition == "random" else transition
        if chosen not in XFADE_TRANSITIONS:
            raise ValueError(f"unknown transition '{chosen}'")

        offset += durations[i - 1] - trans_dur
        next_label = f"x{i}"
        filter_parts.append(
            f"[{previous_label}][v{i}]"
            f"xfade=transition={chosen}:duration={trans_dur}:offset={offset:.3f}"
            f"[{next_label}]"
        )
        previous_label = next_label

    cmd += [
        "-filter_complex",
        ";".join(filter_parts),
        "-map",
        f"[{previous_label}]",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
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
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        output_path,
    ]
    _run(cmd)
    return output_path
