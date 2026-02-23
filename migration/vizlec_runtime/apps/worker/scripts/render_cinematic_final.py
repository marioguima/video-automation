import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def _run(cmd: list[str]) -> None:
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"command failed ({result.returncode}): {' '.join(cmd)}\n{result.stderr}")


def _concat_audio_ffmpeg(audio_files: list[str], output_path: str) -> None:
    if not audio_files:
        raise ValueError("audio_files cannot be empty")
    if len(audio_files) == 1:
        shutil.copy2(audio_files[0], output_path)
        return
    with tempfile.TemporaryDirectory(prefix="vizlec_audio_concat_") as tmp:
        concat_list = Path(tmp) / "concat.txt"
        concat_list.write_text(
            "\n".join(f"file '{Path(p).as_posix().replace("'", "'\\''")}'" for p in audio_files) + "\n",
            encoding="utf-8",
        )
        _run([
            "ffmpeg",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(concat_list),
            "-c:a",
            "pcm_s16le",
            output_path,
        ])


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: render_cinematic_final.py <payload.json>", file=sys.stderr)
        return 2

    payload_path = Path(sys.argv[1]).resolve()
    payload = json.loads(payload_path.read_text(encoding="utf-8"))

    project_root = Path(payload["project_root"]).resolve()
    backend_dir = project_root / "backend"
    sys.path.insert(0, str(backend_dir))

    from main import create_video_pipeline  # type: ignore

    output_path = Path(payload["output_path"]).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    media_files = [str(Path(p).resolve()) for p in payload["media_files"]]
    audio_files = [str(Path(p).resolve()) for p in payload["audio_files"]]
    durations = [float(x) for x in payload["durations"]]

    for idx, _ in enumerate(media_files, start=1):
        print(f"__VIZLEC_RESULT__ clip_start {idx} {len(media_files)}", flush=True)

    with tempfile.TemporaryDirectory(prefix="vizlec_cinematic_final_") as tmp_dir:
        concat_audio = str(Path(tmp_dir) / "audio_concat.wav")
        _concat_audio_ffmpeg(audio_files, concat_audio)

        create_video_pipeline(
            media_files=media_files,
            durations=durations,
            output=str(output_path),
            transition=payload.get("transition", "XF3b_flash_white_occluded_6f"),
            transition_duration=float(payload.get("transition_duration", 0.2)),
            audio_file=concat_audio,
            overlays=None,
            width=int(payload.get("width", 1920)),
            height=int(payload.get("height", 1080)),
            fps=int(payload.get("fps", 30)),
            motion_preset=payload.get("motion_preset", "D_zoom_cinematic"),
            zoom_transition_preset=payload.get("zoom_transition_preset", "T6_inertial_ref"),
        )

    print(json.dumps({
        "ok": True,
        "output_path": str(output_path),
        "engine": "backend.create_video_pipeline",
        "motion_preset": payload.get("motion_preset", "D_zoom_cinematic"),
        "zoom_transition_preset": payload.get("zoom_transition_preset", "T6_inertial_ref"),
        "transition": payload.get("transition", "XF3b_flash_white_occluded_6f"),
    }), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
