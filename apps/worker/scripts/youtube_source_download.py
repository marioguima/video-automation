#!/usr/bin/env python3
import argparse
import glob
import json
import os
import sys
import traceback
from typing import Any, Dict


def load_payload(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def ensure_clean_output_dir(output_dir: str) -> None:
    os.makedirs(output_dir, exist_ok=True)


def find_downloaded_video(output_dir: str) -> str:
    candidates = []
    for pattern in ("video.*", "source.*", "*.mp4", "*.mkv", "*.webm"):
        candidates.extend(glob.glob(os.path.join(output_dir, pattern)))
    candidates = [
        path
        for path in candidates
        if os.path.isfile(path) and not path.endswith(".json") and not path.endswith(".part")
    ]
    candidates = sorted(set(candidates), key=os.path.getmtime, reverse=True)
    if not candidates:
        raise RuntimeError("downloaded video file not found")
    return candidates[0]


def download_video(payload: Dict[str, Any]) -> Dict[str, Any]:
    from yt_dlp import YoutubeDL

    url = str(payload.get("url") or "").strip()
    output_dir = str(payload.get("output_dir") or "").strip()
    if not url:
        raise ValueError("payload.url is required")
    if not output_dir:
        raise ValueError("payload.output_dir is required")

    ensure_clean_output_dir(output_dir)

    options: Dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "format": "bv*+ba/b",
        "merge_output_format": "mp4",
        "outtmpl": os.path.join(output_dir, "video.%(ext)s"),
        "restrictfilenames": True,
    }

    with YoutubeDL(options) as ydl:
        info = ydl.extract_info(url, download=True)

    video_path = find_downloaded_video(output_dir)
    return {
        "url": info.get("webpage_url") or url,
        "video_id": info.get("id"),
        "title": info.get("title"),
        "duration_s": info.get("duration"),
        "video_path": os.path.abspath(video_path),
        "extractor": info.get("extractor_key") or info.get("extractor"),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    try:
        payload = load_payload(args.input)
        result = download_video(payload)
        with open(args.output, "w", encoding="utf-8") as handle:
            json.dump(result, handle)
        return 0
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
