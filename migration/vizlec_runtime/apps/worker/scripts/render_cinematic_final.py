import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path


def _run(cmd: list[str], cwd: str | None = None) -> str:
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd)
    if result.returncode != 0:
        raise RuntimeError(f"command failed ({result.returncode}): {' '.join(cmd)}\n{result.stderr}")
    return result.stdout


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


def _run_subtitle_transcription(payload: dict, work_dir: Path) -> dict | None:
    script_path = Path(__file__).with_name("subtitle_transcribe_faster_whisper.py")
    payload_path = work_dir / "subtitle_payload.json"
    payload_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    raw_stdout = _run([sys.executable, str(script_path), str(payload_path)])
    lines = [line.strip() for line in raw_stdout.splitlines() if line.strip()]
    if not lines:
        return None
    last = lines[-1]
    try:
        data = json.loads(last)
    except Exception:
        return None
    return data


def _burn_subtitles_ffmpeg(video_in: str, ass_path: str, video_out: str, work_dir: str) -> None:
    vcodec = (os.getenv("VIDEO_AUTOMATION_FFMPEG_VCODEC") or "libx264").strip().lower()
    if vcodec == "h264_nvenc":
        vcodec_args = ["-c:v", "h264_nvenc", "-preset", os.getenv("VIDEO_AUTOMATION_FFMPEG_NVENC_PRESET", "p5"), "-cq", os.getenv("VIDEO_AUTOMATION_FFMPEG_NVENC_CQ", "21")]
    else:
        vcodec_args = ["-c:v", "libx264", "-preset", os.getenv("VIDEO_AUTOMATION_FFMPEG_X264_PRESET", "veryfast"), "-crf", os.getenv("VIDEO_AUTOMATION_FFMPEG_X264_CRF", "18")]
    ass_name = Path(ass_path).name
    _run(
        [
            "ffmpeg",
            "-y",
            "-i",
            video_in,
            "-vf",
            f"ass={ass_name}",
            *vcodec_args,
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "copy",
            "-movflags",
            "+faststart",
            video_out,
        ],
        cwd=work_dir,
    )


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
        tmp_dir_path = Path(tmp_dir)
        concat_audio = str(tmp_dir_path / "audio_concat.wav")
        _concat_audio_ffmpeg(audio_files, concat_audio)

        subtitle_enabled = bool(payload.get("subtitle_enabled", True))
        subtitle_info = None
        subtitle_ass_path = None
        if subtitle_enabled:
            print("__VIZLEC_RESULT__ subtitle_start", flush=True)
            subtitle_out_dir = output_path.parent
            subtitle_payload = {
                "audio_path": concat_audio,
                "out_dir": str(subtitle_out_dir),
                "width": int(payload.get("width", 1920)),
                "height": int(payload.get("height", 1080)),
                "language": payload.get("subtitle_language", "pt"),
                "template_id": payload.get("subtitle_template_id", "subtitle-yellow-bold-bottom-v1"),
                "vad_filter": payload.get("subtitle_vad_filter", True),
                "word_timestamps": payload.get("subtitle_word_timestamps", True),
            }
            if payload.get("subtitle_model"):
                subtitle_payload["model"] = payload["subtitle_model"]
            if payload.get("subtitle_device"):
                subtitle_payload["device"] = payload["subtitle_device"]
            if payload.get("subtitle_compute_type"):
                subtitle_payload["compute_type"] = payload["subtitle_compute_type"]
            started = time.time()
            try:
                subtitle_info = _run_subtitle_transcription(subtitle_payload, tmp_dir_path)
                duration_ms = int((time.time() - started) * 1000)
                if subtitle_info and subtitle_info.get("ok"):
                    subtitle_ass_path = subtitle_info.get("ass_path")
                    print(
                        f"__VIZLEC_RESULT__ subtitle_ready {subtitle_info.get('cue_count', 0)} {duration_ms}",
                        flush=True,
                    )
                elif subtitle_info and subtitle_info.get("skipped"):
                    print(
                        f"__VIZLEC_RESULT__ subtitle_skipped {subtitle_info.get('reason', 'unknown')}",
                        flush=True,
                    )
            except Exception as subtitle_err:
                print(
                    json.dumps(
                        {
                            "warning": "subtitle_transcription_failed",
                            "error": str(subtitle_err),
                        }
                    ),
                    flush=True,
                )

        visual_output = str(output_path if not subtitle_ass_path else (tmp_dir_path / "visual_no_subs.mp4"))
        render_mode = (os.getenv("VIZLEC_CINEMATIC_RENDER_MODE") or "quality").strip().lower()
        fps = int(payload.get("fps", 30))
        if render_mode == "preview":
            fps = int(os.getenv("VIZLEC_CINEMATIC_PREVIEW_FPS", str(min(fps, 24))))
            os.environ.setdefault("VIDEO_AUTOMATION_SUPERSAMPLE", os.getenv("VIZLEC_CINEMATIC_PREVIEW_SUPERSAMPLE", "2"))
            os.environ.setdefault("VIDEO_AUTOMATION_FFMPEG_X264_PRESET", "ultrafast")
        create_video_pipeline(
            media_files=media_files,
            durations=durations,
            output=visual_output,
            transition=payload.get("transition", "XF3b_flash_white_occluded_6f"),
            transition_duration=float(payload.get("transition_duration", 0.2)),
            audio_file=concat_audio,
            overlays=None,
            width=int(payload.get("width", 1920)),
            height=int(payload.get("height", 1080)),
            fps=fps,
            motion_preset=payload.get("motion_preset", "D_zoom_cinematic"),
            zoom_transition_preset=payload.get("zoom_transition_preset", "T6_inertial_ref"),
        )
        if subtitle_ass_path and Path(subtitle_ass_path).exists():
            print("__VIZLEC_RESULT__ subtitle_burn_start", flush=True)
            _burn_subtitles_ffmpeg(
                video_in=visual_output,
                ass_path=subtitle_ass_path,
                video_out=str(output_path),
                work_dir=str(output_path.parent),
            )
            print("__VIZLEC_RESULT__ subtitle_burn_done", flush=True)

    print(json.dumps({
        "ok": True,
        "output_path": str(output_path),
        "engine": "backend.create_video_pipeline",
        "motion_preset": payload.get("motion_preset", "D_zoom_cinematic"),
        "zoom_transition_preset": payload.get("zoom_transition_preset", "T6_inertial_ref"),
        "transition": payload.get("transition", "XF3b_flash_white_occluded_6f"),
        "subtitle_template_id": payload.get("subtitle_template_id", "subtitle-yellow-bold-bottom-v1"),
    }), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
