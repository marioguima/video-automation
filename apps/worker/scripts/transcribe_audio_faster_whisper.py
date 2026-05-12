#!/usr/bin/env python3
import argparse
import json
import os
import sys
import traceback
from typing import Any, Dict, List


def load_payload(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def transcribe(payload: Dict[str, Any]) -> Dict[str, Any]:
    from faster_whisper import WhisperModel

    audio_path = str(payload.get("audio_path") or "").strip()
    if not audio_path:
        raise ValueError("payload.audio_path is required")
    if not os.path.exists(audio_path):
        raise FileNotFoundError(audio_path)

    model_name = str(payload.get("model") or "small")
    model_path = str(payload.get("model_path") or "").strip()
    download_root = str(payload.get("download_root") or "").strip() or None
    device = str(payload.get("device") or "auto")
    compute_type = str(payload.get("compute_type") or "int8")
    language = str(payload.get("language") or "").strip() or None
    beam_size = int(payload.get("beam_size") or 1)

    model_source = model_path if model_path and os.path.exists(model_path) else model_name
    model = WhisperModel(
        model_source,
        device=device,
        compute_type=compute_type,
        download_root=download_root,
    )
    segments, info = model.transcribe(
        audio_path,
        language=language,
        beam_size=beam_size,
        vad_filter=True,
    )

    rows: List[Dict[str, Any]] = []
    texts: List[str] = []
    for segment in segments:
        text = str(segment.text or "").strip()
        if not text:
            continue
        texts.append(text)
        rows.append(
            {
                "start_s": float(segment.start),
                "end_s": float(segment.end),
                "text": text,
            }
        )

    return {
        "text": " ".join(texts).strip(),
        "language": getattr(info, "language", None),
        "duration_s": getattr(info, "duration", None),
        "segments": rows,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    try:
        payload = load_payload(args.input)
        result = transcribe(payload)
        with open(args.output, "w", encoding="utf-8") as handle:
            json.dump(result, handle)
        return 0
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
