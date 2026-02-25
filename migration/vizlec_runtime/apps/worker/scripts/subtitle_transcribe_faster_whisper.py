import json
import os
import re
import sys
from pathlib import Path
from typing import Any


def _fmt_srt_time(seconds: float) -> str:
    total_ms = max(0, int(round(seconds * 1000)))
    ms = total_ms % 1000
    total_s = total_ms // 1000
    s = total_s % 60
    total_m = total_s // 60
    m = total_m % 60
    h = total_m // 60
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


def _fmt_ass_time(seconds: float) -> str:
    centis = max(0, int(round(seconds * 100)))
    cs = centis % 100
    total_s = centis // 100
    s = total_s % 60
    total_m = total_s // 60
    m = total_m % 60
    h = total_m // 60
    return f"{h}:{m:02}:{s:02}.{cs:02}"


def _clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def _escape_ass_text(text: str) -> str:
    # Preserve ASS newline control (\N). Escaping "\" globally turns line breaks into literal backslashes.
    return text.replace("{", r"\{").replace("}", r"\}").replace("\n", r"\N")


def _split_two_lines(words: list[str], max_chars_line: int = 28) -> str:
    if not words:
        return ""
    total_text = " ".join(words)
    # Do not force a second line for short cues; let libass wrap naturally within margins when needed.
    if len(words) <= 5 or len(total_text) <= 30:
        return total_text
    if len(words) == 1:
        return words[0]
    best_idx = 1
    best_score = 10**9
    for i in range(1, len(words)):
        left = " ".join(words[:i])
        right = " ".join(words[i:])
        score = abs(len(left) - len(right))
        overflow_penalty = max(0, len(left) - max_chars_line) * 4 + max(0, len(right) - max_chars_line) * 4
        if score + overflow_penalty < best_score:
            best_score = score + overflow_penalty
            best_idx = i
    left = " ".join(words[:best_idx])
    right = " ".join(words[best_idx:])
    return f"{left}\\N{right}" if right else left


def _format_cue_text(words: list[str], max_chars_line: int = 34) -> str:
    if not words:
        return ""
    joined = " ".join(words)
    # Keep single line for short/medium cues. Use manual break only when likely to exceed safe width.
    if len(words) <= 6 or len(joined) <= max_chars_line:
        return joined
    return _split_two_lines(words, max_chars_line=max_chars_line)


def _build_cues(transcript_segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    cues: list[dict[str, Any]] = []
    for seg in transcript_segments:
        raw = _clean_text(str(seg.get("text") or "")).upper()
        if not raw:
            continue
        seg_start = float(seg.get("start") or 0)
        seg_end = float(seg.get("end") or seg_start)
        cues.append(
            {
                "start": seg_start,
                "end": max(seg_end, seg_start + 0.18),
                # Keep each ASR segment as a single subtitle cue; only insert a visual line break if needed.
                "text": _format_cue_text(raw.split(), max_chars_line=44),
            }
        )

    # sanitize ordering / overlaps
    sanitized: list[dict[str, Any]] = []
    for cue in cues:
        text = _clean_text(str(cue.get("text") or "")).replace("\\N ", "\\N")
        if not text:
            continue
        start = float(cue["start"])
        end = float(cue["end"])
        if sanitized and start < float(sanitized[-1]["end"]):
            start = float(sanitized[-1]["end"])
        if end <= start:
            end = start + 0.18
        sanitized.append({"start": start, "end": end, "text": text})
    return sanitized


def _cue_text_len(text: str) -> int:
    return len(text.replace("\\N", " "))


def _merge_cue_text(a: str, b: str) -> str:
    a_clean = a.replace("\\N", " ").strip()
    b_clean = b.replace("\\N", " ").strip()
    merged_words = [w for w in f"{a_clean} {b_clean}".split(" ") if w]
    upper_words = [w.upper() for w in merged_words]
    return _format_cue_text(upper_words)


def _merge_short_cues(
    cues: list[dict[str, Any]],
    min_duration: float = 0.75,
    max_merged_duration: float = 2.6,
    max_merged_chars: int = 62,
) -> list[dict[str, Any]]:
    if not cues:
        return cues
    merged = [dict(c) for c in cues]
    i = 0
    while i < len(merged):
        cue = merged[i]
        dur = float(cue["end"]) - float(cue["start"])
        if dur >= min_duration:
            i += 1
            continue

        # Prefer merging forward to preserve reading flow.
        merged_with_neighbor = False
        if i + 1 < len(merged):
            nxt = merged[i + 1]
            new_start = float(cue["start"])
            new_end = float(nxt["end"])
            new_dur = new_end - new_start
            candidate_text = _merge_cue_text(str(cue["text"]), str(nxt["text"]))
            if new_dur <= max_merged_duration and _cue_text_len(candidate_text) <= max_merged_chars:
                merged[i] = {"start": new_start, "end": new_end, "text": candidate_text}
                del merged[i + 1]
                merged_with_neighbor = True

        if merged_with_neighbor:
            # Re-evaluate same index; maybe still short and can merge once more.
            continue

        if i > 0:
            prev = merged[i - 1]
            new_start = float(prev["start"])
            new_end = float(cue["end"])
            new_dur = new_end - new_start
            candidate_text = _merge_cue_text(str(prev["text"]), str(cue["text"]))
            if new_dur <= max_merged_duration and _cue_text_len(candidate_text) <= max_merged_chars:
                merged[i - 1] = {"start": new_start, "end": new_end, "text": candidate_text}
                del merged[i]
                i = max(0, i - 1)
                continue

        i += 1

    return merged


def _write_srt(cues: list[dict[str, Any]], out_path: Path) -> None:
    lines: list[str] = []
    for idx, cue in enumerate(cues, start=1):
        text = str(cue["text"]).replace("\\N", "\n")
        lines.extend(
            [
                str(idx),
                f"{_fmt_srt_time(float(cue['start']))} --> {_fmt_srt_time(float(cue['end']))}",
                text,
                "",
            ]
        )
    out_path.write_text("\n".join(lines), encoding="utf-8")


def _write_ass(cues: list[dict[str, Any]], out_path: Path, width: int, height: int) -> None:
    # ASS colors are AABBGGRR. Yellow = 00FFFF, black = 000000.
    # WrapStyle 2 minimizes automatic word wrapping. We rely primarily on manual cue breaking,
    # while margins remain as visual safe area.
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial Black,64,&H0000FFFF,&H0000FFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,5,0,2,160,160,42,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    event_lines = []
    for cue in cues:
        event_lines.append(
            "Dialogue: 0,"
            + f"{_fmt_ass_time(float(cue['start']))},{_fmt_ass_time(float(cue['end']))},"
            + f"Default,,0,0,0,,{_escape_ass_text(str(cue['text']))}"
        )
    out_path.write_text(header + "\n".join(event_lines) + ("\n" if event_lines else ""), encoding="utf-8")


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: subtitle_transcribe_faster_whisper.py <payload.json>", file=sys.stderr)
        return 2
    payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    audio_path = Path(payload["audio_path"]).resolve()
    out_dir = Path(payload["out_dir"]).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    width = int(payload.get("width", 1920))
    height = int(payload.get("height", 1080))
    template_id = payload.get("template_id", "subtitle-yellow-bold-bottom-v1")
    if template_id != "subtitle-yellow-bold-bottom-v1":
        raise RuntimeError(f"unsupported subtitle template: {template_id}")

    try:
        from faster_whisper import WhisperModel  # type: ignore
    except Exception as err:
        print(json.dumps({"ok": False, "skipped": True, "reason": "faster_whisper_import_failed", "error": str(err)}))
        return 0

    model_name = str(payload.get("model", os.getenv("VIZLEC_SUBTITLE_WHISPER_MODEL", "small")))
    device = str(payload.get("device", os.getenv("VIZLEC_SUBTITLE_WHISPER_DEVICE", "cpu")))
    compute_type = str(payload.get("compute_type", os.getenv("VIZLEC_SUBTITLE_WHISPER_COMPUTE_TYPE", "int8")))
    language = str(payload.get("language", payload.get("lang", "pt")))
    vad_filter = bool(payload.get("vad_filter", True))
    word_timestamps = bool(payload.get("word_timestamps", True))

    model = WhisperModel(model_name, device=device, compute_type=compute_type)
    segments_iter, info = model.transcribe(
        str(audio_path),
        language=language,
        vad_filter=vad_filter,
        word_timestamps=word_timestamps,
        beam_size=5,
    )

    transcript_segments: list[dict[str, Any]] = []
    for seg in segments_iter:
        seg_obj: dict[str, Any] = {
            "id": getattr(seg, "id", None),
            "start": float(getattr(seg, "start", 0.0) or 0.0),
            "end": float(getattr(seg, "end", 0.0) or 0.0),
            "text": _clean_text(str(getattr(seg, "text", "") or "")),
        }
        words = []
        for w in (getattr(seg, "words", None) or []):
            ws = getattr(w, "start", None)
            we = getattr(w, "end", None)
            token = _clean_text(str(getattr(w, "word", "") or ""))
            if ws is None or we is None or not token:
                continue
            words.append(
                {
                    "word": token,
                    "start": float(ws),
                    "end": float(we),
                    "probability": float(getattr(w, "probability", 0.0) or 0.0),
                }
            )
        if words:
            seg_obj["words"] = words
        transcript_segments.append(seg_obj)

    cues = _build_cues(transcript_segments)
    raw_json_path = out_dir / "subtitles.raw.json"
    cues_json_path = out_dir / "subtitles.cues.json"
    srt_path = out_dir / "subtitles.srt"
    ass_path = out_dir / "subtitles.default.ass"

    raw_json_path.write_text(
        json.dumps(
            {
                "engine": "faster-whisper",
                "model": model_name,
                "device": device,
                "compute_type": compute_type,
                "language": language,
                "template_id": template_id,
                "info": {
                    "duration": getattr(info, "duration", None),
                    "language_probability": getattr(info, "language_probability", None),
                },
                "segments": transcript_segments,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    cues_json_path.write_text(
        json.dumps(
            {
                "template_id": template_id,
                "width": width,
                "height": height,
                "cues": cues,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    _write_srt(cues, srt_path)
    _write_ass(cues, ass_path, width=width, height=height)

    print(
        json.dumps(
            {
                "ok": True,
                "engine": "faster-whisper",
                "template_id": template_id,
                "raw_json_path": str(raw_json_path),
                "cues_json_path": str(cues_json_path),
                "srt_path": str(srt_path),
                "ass_path": str(ass_path),
                "segment_count": len(transcript_segments),
                "cue_count": len(cues),
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
