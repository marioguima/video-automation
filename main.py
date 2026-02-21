import shutil
import subprocess
import tempfile
from pathlib import Path

from audio import add_audio
from effects import ken_burns_filter
from transitions import apply_overlay_transition, apply_xfade_chain

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def _run(cmd: list[str]) -> None:
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed ({result.returncode}):\n{result.stderr}")


def _is_image(path: str) -> bool:
    return Path(path).suffix.lower() in IMAGE_EXTENSIONS


def _render_clip(
    media: str,
    duration: float,
    output_path: str,
    width: int,
    height: int,
    fps: int,
) -> str:
    base_vf = f"scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height}"

    if _is_image(media):
        kb = ken_burns_filter(duration=duration, width=width, height=height, fps=fps)
        vf = f"{base_vf},{kb}"
        cmd = [
            "ffmpeg",
            "-y",
            "-loop",
            "1",
            "-framerate",
            str(fps),
            "-i",
            media,
            "-vf",
            vf,
            "-t",
            str(duration),
            "-an",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-r",
            str(fps),
            output_path,
        ]
    else:
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            media,
            "-vf",
            f"{base_vf},fps={fps}",
            "-t",
            str(duration),
            "-an",
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


def create_video_pipeline(
    media_files: list[str],
    durations: list[float],
    output: str = "output/output.mp4",
    transition: str = "fade",
    transition_duration: float = 0.8,
    audio_file: str | None = None,
    overlays: list[dict] | None = None,
    width: int = 1920,
    height: int = 1080,
    fps: int = 25,
) -> str:
    """Builds a cinematic video from media, transitions and optional audio."""
    if len(media_files) == 0:
        raise ValueError("media_files cannot be empty")
    if len(media_files) != len(durations):
        raise ValueError("media_files and durations must have the same length")

    for media in media_files:
        if not Path(media).exists():
            raise FileNotFoundError(f"media file not found: {media}")
    if audio_file and not Path(audio_file).exists():
        raise FileNotFoundError(f"audio file not found: {audio_file}")

    output_path = Path(output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="video_pipeline_") as tmp_dir:
        temp_dir = Path(tmp_dir)
        rendered_clips: list[str] = []

        for i, (media, duration) in enumerate(zip(media_files, durations)):
            clip_out = temp_dir / f"clip_{i}.mp4"
            _render_clip(media, duration, str(clip_out), width, height, fps)
            rendered_clips.append(str(clip_out))

        merged = temp_dir / "merged.mp4"
        apply_xfade_chain(
            clips=rendered_clips,
            durations=durations,
            transition=transition,
            trans_dur=transition_duration,
            output_path=str(merged),
            fps=fps,
        )

        current_video = merged
        for i, overlay in enumerate(overlays or []):
            overlay_clip = overlay["clip"]
            at_second = float(overlay["at_second"])
            overlay_duration = float(overlay.get("duration", 1.2))
            if not Path(overlay_clip).exists():
                raise FileNotFoundError(f"overlay file not found: {overlay_clip}")

            next_video = temp_dir / f"overlay_{i}.mp4"
            apply_overlay_transition(
                video_path=str(current_video),
                transition_clip=overlay_clip,
                at_second=at_second,
                output_path=str(next_video),
                duration=overlay_duration,
            )
            current_video = next_video

        if audio_file:
            add_audio(str(current_video), audio_file, str(output_path))
        else:
            shutil.copy2(current_video, output_path)

    return str(output_path)


if __name__ == "__main__":
    print("Use create_video_pipeline(...) from this module to render videos.")

