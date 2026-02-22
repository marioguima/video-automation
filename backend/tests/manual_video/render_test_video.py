import argparse
import contextlib
import subprocess
import time
import wave
from pathlib import Path

from backend.main import create_video_pipeline
from backend.effects import list_motion_presets, list_zoom_transition_presets
from backend.transitions import list_xfade_presets

LETTER_PRESETS = {
    "A": "A_zoom_soft_hold",
    "B": "B_zoom_balanced_hold",
    "C": "C_zoom_micro_pullout",
    "D": "D_zoom_cinematic",
    "E": "E_pan_premium_lr",
    "F": "F_pan_premium_rl",
    "G": "G_zoom_pulse_accel",
    "H": "H_transition_envelope",
}

LETTER_TRANSITIONS = {
    "T1": "T1_subtle",
    "T2": "T2_standard",
    "T3": "T3_aggressive",
    "T4": "T4_continuous",
    "T5": "T5_blur_burst",
    "T6": "T6_inertial_ref",
}


def _audio_duration_sec(path: Path) -> float:
    with contextlib.closing(wave.open(str(path), "rb")) as wav_file:
        return wav_file.getnframes() / float(wav_file.getframerate())


def _concat_wavs(audio_files: list[Path], output_path: Path) -> None:
    cmd = ["ffmpeg", "-y"]
    for audio in audio_files:
        cmd += ["-i", str(audio)]
    joined_inputs = "".join(f"[{index}:a]" for index in range(len(audio_files)))
    cmd += [
        "-filter_complex",
        f"{joined_inputs}concat=n={len(audio_files)}:v=0:a=1[a]",
        "-map",
        "[a]",
        str(output_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg concat failed ({result.returncode}):\n{result.stderr}")


def _fmt_hhmmss(seconds: float) -> str:
    total = max(0, int(round(seconds)))
    hh = total // 3600
    mm = (total % 3600) // 60
    ss = total % 60
    return f"{hh:02d}:{mm:02d}:{ss:02d}"


def main() -> None:
    all_choices = list_motion_presets() + list(LETTER_PRESETS.keys()) + ["all", "all_letters"]
    transition_choices = list_zoom_transition_presets() + list(LETTER_TRANSITIONS.keys()) + ["all_t"]
    xfade_choices = ["fade", "random"] + list_xfade_presets() + ["all_basic", "all_flash_centered", "all_flash_premium", "all_flash_premium_wb"]
    parser = argparse.ArgumentParser(description="Render manual video smoke test.")
    parser.add_argument("--fps", type=int, default=25, help="Output FPS (ex.: 25, 30, 60)")
    parser.add_argument(
        "--preset",
        default="B",
        choices=all_choices,
        help="Motion preset for Ken Burns.",
    )
    parser.add_argument(
        "--transition",
        default="none",
        choices=transition_choices,
        help="Zoom in/out transition preset (separate from motion).",
    )
    parser.add_argument(
        "--xfade",
        default="fade",
        choices=xfade_choices,
        help="Image-to-image xfade transition (supports flash presets).",
    )
    parser.add_argument(
        "--xfade-duration",
        type=float,
        default=0.05,
        help="xfade overlap duration in seconds.",
    )
    parser.add_argument("--suffix", default="", help="Optional output filename suffix")
    args = parser.parse_args()

    root = Path(__file__).resolve().parent
    assets_dir = root / "assets"
    output_dir = root / "output"
    output_dir.mkdir(parents=True, exist_ok=True)

    image_files = [
        assets_dir / "images" / "b00-01.jpeg",
        assets_dir / "images" / "b00-02.jpeg",
        assets_dir / "images" / "b00-03.jpeg",
        assets_dir / "images" / "b00-04.png",
        assets_dir / "images" / "b00-05.jpeg",
    ]
    audio_files = [
        assets_dir / "audios" / "audio_1.wav",
        assets_dir / "audios" / "audio_2.wav",
        assets_dir / "audios" / "audio_3.wav",
        assets_dir / "audios" / "audio_4.wav",
        assets_dir / "audios" / "audio_5.wav",
    ]

    missing = [str(path) for path in (image_files + audio_files) if not path.exists()]
    if missing:
        raise FileNotFoundError(f"missing test assets: {missing}")

    durations = [round(_audio_duration_sec(path), 3) for path in audio_files]
    audio_concat = output_dir / "audio_concat.wav"
    _concat_wavs(audio_files, audio_concat)
    if args.preset == "all":
        presets = list_motion_presets()
    elif args.preset == "all_letters":
        presets = [LETTER_PRESETS[k] for k in ("A", "B", "C", "D", "E", "F", "G", "H")]
    else:
        presets = [LETTER_PRESETS.get(args.preset, args.preset)]

    if args.transition == "all_t":
        transitions = [LETTER_TRANSITIONS[k] for k in ("T1", "T2", "T3", "T4", "T5", "T6")]
    else:
        transitions = [LETTER_TRANSITIONS.get(args.transition, args.transition)]

    if args.xfade == "all_basic":
        xfade_variants = ["fade", "flash_white", "flash_black"]
    elif args.xfade == "all_flash_centered":
        xfade_variants = ["XF1_flash_white_centered_5f", "XF2_flash_black_centered_5f"]
    elif args.xfade == "all_flash_premium":
        xfade_variants = [
            "XF1_flash_white_centered_5f",
            "XF3_flash_white_occluded_5f",
            "XF3b_flash_white_occluded_6f",
            "XF3c_flash_white_occluded_5f_1o3w1o",
        ]
    elif args.xfade == "all_flash_premium_wb":
        xfade_variants = [
            "XF3b_flash_white_occluded_6f",
            "XF3b_flash_black_occluded_6f",
        ]
    else:
        xfade_variants = [args.xfade]

    suffix = f"_{args.suffix.strip()}" if args.suffix.strip() else ""

    print(f"audio: {audio_concat}")
    batch_started = time.monotonic()
    timing_rows: list[tuple[str, str, str, float]] = []
    for preset in presets:
        for transition_preset in transitions:
            for xfade_variant in xfade_variants:
                video_output = output_dir / (
                    f"video_test_5imgs_1920x1080_{preset}_tr-{transition_preset}_xf-{xfade_variant}{suffix}.mp4"
                )
                started = time.monotonic()
                create_video_pipeline(
                    media_files=[str(path) for path in image_files],
                    durations=durations,
                    output=str(video_output),
                    transition=xfade_variant,
                    transition_duration=args.xfade_duration,
                    audio_file=str(audio_concat),
                    width=1920,
                    height=1080,
                    fps=args.fps,
                    motion_preset=preset,
                    zoom_transition_preset=transition_preset,
                )
                elapsed = time.monotonic() - started
                timing_rows.append((preset, transition_preset, xfade_variant, elapsed))
                print(
                    f"video[motion={preset}, zoom_transition={transition_preset}, xfade={xfade_variant}]: {video_output} "
                    f"(tempo={_fmt_hhmmss(elapsed)})"
                )

    total_elapsed = time.monotonic() - batch_started
    if timing_rows:
        print("\nResumo de tempos:")
        for preset, transition_preset, xfade_variant, elapsed in timing_rows:
            print(
                f"- motion={preset} | zoom_transition={transition_preset} | xfade={xfade_variant} | tempo={_fmt_hhmmss(elapsed)}"
            )
    print(f"\nTempo total do processo: {_fmt_hhmmss(total_elapsed)}")


if __name__ == "__main__":
    main()
