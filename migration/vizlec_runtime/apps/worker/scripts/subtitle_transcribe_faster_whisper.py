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


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _pick_window_index(ts: float, windows: list[dict[str, Any]]) -> int | None:
    if not windows:
        return None
    for i, w in enumerate(windows):
        start = float(w.get("start", 0.0) or 0.0)
        end = float(w.get("end", start) or start)
        if i == len(windows) - 1:
            if start <= ts <= end:
                return i
        if start <= ts < end:
            return i
    return None


def _resegment_by_block_windows(
    transcript_segments: list[dict[str, Any]],
    block_windows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not transcript_segments or not block_windows:
        return transcript_segments

    normalized_windows: list[dict[str, Any]] = []
    for idx, w in enumerate(block_windows):
        start = float(w.get("start", 0.0) or 0.0)
        end = float(w.get("end", start) or start)
        if end <= start:
            continue
        normalized_windows.append(
            {
                "block_index": int(w.get("block_index", idx) or idx),
                "start": start,
                "end": end,
            }
        )
    if not normalized_windows:
        return transcript_segments

    resegmented: list[dict[str, Any]] = []
    for seg in transcript_segments:
        seg_start = float(seg.get("start", 0.0) or 0.0)
        seg_end = float(seg.get("end", seg_start) or seg_start)
        raw_text = _clean_text(str(seg.get("text") or ""))
        words = list(seg.get("words") or [])

        if words:
            buckets: dict[int, list[dict[str, Any]]] = {}
            for w in words:
                ws = w.get("start")
                we = w.get("end")
                token = _clean_text(str(w.get("word") or ""))
                if ws is None or we is None or not token:
                    continue
                wsf = float(ws)
                wef = float(we)
                mid = (wsf + wef) / 2.0
                win_idx = _pick_window_index(mid, normalized_windows)
                if win_idx is None:
                    continue
                buckets.setdefault(win_idx, []).append(
                    {
                        "word": token,
                        "start": wsf,
                        "end": wef,
                        "probability": float(w.get("probability", 0.0) or 0.0),
                    }
                )

            if buckets:
                for win_idx in sorted(buckets.keys()):
                    bucket_words = buckets[win_idx]
                    window = normalized_windows[win_idx]
                    w_start = _clamp(
                        min(float(w["start"]) for w in bucket_words),
                        float(window["start"]),
                        float(window["end"]),
                    )
                    w_end = _clamp(
                        max(float(w["end"]) for w in bucket_words),
                        float(window["start"]),
                        float(window["end"]),
                    )
                    if w_end <= w_start:
                        w_end = min(float(window["end"]), w_start + 0.18)
                    text = _clean_text(" ".join(str(w["word"]) for w in bucket_words))
                    if not text:
                        continue
                    seg_obj: dict[str, Any] = {
                        "id": seg.get("id"),
                        "start": w_start,
                        "end": max(w_end, w_start + 0.18),
                        "text": text,
                        "block_index": int(window["block_index"]),
                    }
                    seg_obj["words"] = [
                        {
                            **w,
                            "start": _clamp(float(w["start"]), float(window["start"]), float(window["end"])),
                            "end": _clamp(float(w["end"]), float(window["start"]), float(window["end"])),
                        }
                        for w in bucket_words
                    ]
                    resegmented.append(seg_obj)
                continue

        # Fallback when word timestamps are unavailable: keep segment inside a single block window.
        midpoint = (seg_start + seg_end) / 2.0
        win_idx = _pick_window_index(midpoint, normalized_windows)
        if win_idx is None:
            continue
        window = normalized_windows[win_idx]
        new_start = _clamp(seg_start, float(window["start"]), float(window["end"]))
        new_end = _clamp(seg_end, float(window["start"]), float(window["end"]))
        if new_end <= new_start:
            new_end = min(float(window["end"]), new_start + 0.18)
        if not raw_text:
            continue
        resegmented.append(
            {
                **seg,
                "start": new_start,
                "end": max(new_end, new_start + 0.18),
                "text": raw_text,
                "block_index": int(window["block_index"]),
            }
        )

    # Keep deterministic ordering after splitting.
    resegmented.sort(key=lambda item: (float(item.get("start", 0.0) or 0.0), float(item.get("end", 0.0) or 0.0)))
    return resegmented


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


def _extract_transcript_segments(model: Any, audio_path: str, *, language: str, vad_filter: bool, word_timestamps: bool) -> tuple[list[dict[str, Any]], Any]:
    segments_iter, info = model.transcribe(
        audio_path,
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
    return transcript_segments, info


def _serialize_transcribe_info(info: Any) -> dict[str, Any]:
    return {
        "language": getattr(info, "language", None),
        "language_probability": getattr(info, "language_probability", None),
        "duration": getattr(info, "duration", None),
        "duration_after_vad": getattr(info, "duration_after_vad", None),
        "all_language_probs": getattr(info, "all_language_probs", None),
    }


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: subtitle_transcribe_faster_whisper.py <payload.json>", file=sys.stderr)
        return 2
    payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    audio_path_value = payload.get("audio_path")
    audio_files_payload = payload.get("audio_files") or []
    out_dir = Path(payload["out_dir"]).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    width = int(payload.get("width", 1920))
    height = int(payload.get("height", 1080))
    template_id = payload.get("template_id", "subtitle-yellow-bold-bottom-v1")
    block_windows_payload = payload.get("block_windows") or []
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
    transcript_segments: list[dict[str, Any]] = []
    per_file_debug: list[dict[str, Any]] = []
    per_file_results: list[dict[str, Any]] = []
    info_payload: dict[str, Any] = {}

    if isinstance(audio_files_payload, list) and audio_files_payload:
        global_offset = 0.0
        total_files = len(audio_files_payload)
        for file_idx, item in enumerate(audio_files_payload, start=1):
            if not isinstance(item, dict) or not item.get("path"):
                continue
            file_path = str(Path(str(item["path"])).resolve())
            expected_duration = 0.0
            try:
                expected_duration = float(item.get("duration") or 0.0)
            except Exception:
                expected_duration = 0.0
            local_segments, local_info = _extract_transcript_segments(
                model,
                file_path,
                language=language,
                vad_filter=vad_filter,
                word_timestamps=word_timestamps,
            )
            local_duration = 0.0
            if local_segments:
                local_duration = max(float(seg.get("end", 0.0) or 0.0) for seg in local_segments)
            if getattr(local_info, "duration", None) is not None:
                try:
                    local_duration = max(local_duration, float(getattr(local_info, "duration", 0.0) or 0.0))
                except Exception:
                    pass
            effective_duration = expected_duration if expected_duration > 0 else local_duration
            clamped_segments: list[dict[str, Any]] = []
            for seg in local_segments:
                local_start = float(seg.get("start", 0.0) or 0.0)
                local_end = float(seg.get("end", local_start) or local_start)
                if effective_duration > 0:
                    local_start = _clamp(local_start, 0.0, effective_duration)
                    local_end = _clamp(local_end, 0.0, effective_duration)
                if local_end <= local_start:
                    local_end = local_start + 0.18
                    if effective_duration > 0:
                        local_end = min(effective_duration, local_end)
                next_seg = dict(seg)
                shifted_start = global_offset + max(0.0, local_start)
                shifted_end = global_offset + max(local_start, local_end)
                next_seg["start"] = shifted_start
                next_seg["end"] = max(shifted_start, shifted_end)
                next_seg["block_index"] = int(item.get("block_index", file_idx - 1) or (file_idx - 1))
                if isinstance(next_seg.get("words"), list):
                    shifted_words = []
                    for w in next_seg["words"]:
                        ws = float(w.get("start", 0.0) or 0.0)
                        we = float(w.get("end", ws) or ws)
                        if effective_duration > 0:
                            ws = _clamp(ws, 0.0, effective_duration)
                            we = _clamp(we, 0.0, effective_duration)
                        shifted_words.append({**w, "start": global_offset + ws, "end": global_offset + max(ws, we)})
                    next_seg["words"] = shifted_words
                clamped_segments.append(next_seg)
            transcript_segments.extend(clamped_segments)
            per_file_debug.append(
                {
                    "index": file_idx,
                    "path": file_path,
                    "block_index": int(item.get("block_index", file_idx - 1) or (file_idx - 1)),
                    "expected_duration": expected_duration if expected_duration > 0 else None,
                    "detected_duration": local_duration if local_duration > 0 else None,
                    "offset_start": global_offset,
                    "offset_end": global_offset + max(0.0, effective_duration),
                    "segment_count": len(clamped_segments),
                }
            )
            per_file_results.append(
                {
                    "index": file_idx,
                    "path": file_path,
                    "block_index": int(item.get("block_index", file_idx - 1) or (file_idx - 1)),
                    "expected_duration": expected_duration if expected_duration > 0 else None,
                    "detected_duration": local_duration if local_duration > 0 else None,
                    "offset_start": global_offset,
                    "offset_end": global_offset + max(0.0, effective_duration),
                    "effective_duration": effective_duration if effective_duration > 0 else None,
                    "transcribe_info": _serialize_transcribe_info(local_info),
                    # Raw faster-whisper output before any offset shifting/clamping.
                    "local_segments": local_segments,
                    # Final per-file segments after local clamp and global offset application.
                    "shifted_segments": clamped_segments,
                }
            )
            print(
                json.dumps({"progress": "transcribe_audio_file", "current": file_idx, "total": total_files}, ensure_ascii=False),
                flush=True,
            )
            global_offset += max(0.0, effective_duration)
        info_payload = {
            "mode": "audio_files_loop",
            "file_count": len(per_file_debug),
            "duration": global_offset if global_offset > 0 else None,
        }
    else:
        if not audio_path_value:
            raise RuntimeError("payload must include audio_files or audio_path")
        audio_path = Path(str(audio_path_value)).resolve()
        transcript_segments, info = _extract_transcript_segments(
            model,
            str(audio_path),
            language=language,
            vad_filter=vad_filter,
            word_timestamps=word_timestamps,
        )
        info_payload = {
            "mode": "single_audio",
            "duration": getattr(info, "duration", None),
            "language_probability": getattr(info, "language_probability", None),
        }

    if (not isinstance(audio_files_payload, list) or not audio_files_payload) and isinstance(block_windows_payload, list) and block_windows_payload:
        transcript_segments = _resegment_by_block_windows(transcript_segments, block_windows_payload)

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
                "block_windows": block_windows_payload if isinstance(block_windows_payload, list) else None,
                "info": {
                    **info_payload,
                },
                "files": per_file_debug if per_file_debug else None,
                "per_file_results": per_file_results if per_file_results else None,
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
        ),
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
