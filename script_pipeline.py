import json
import re
from dataclasses import dataclass
from pathlib import Path


SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")
HEADING_RE = re.compile(r"^\s{0,3}#{1,6}\s+")


@dataclass
class Span:
    start: int
    end: int


def normalize_space(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def split_markdown_into_paragraphs(markdown_text: str) -> list[dict]:
    """Extracts paragraphs while ignoring headings and separators."""
    text = normalize_space(markdown_text)
    lines = [line.strip() for line in text.split("\n")]
    paragraphs: list[str] = []
    current: list[str] = []

    for line in lines:
        if not line:
            if current:
                paragraphs.append(" ".join(current).strip())
                current = []
            continue
        if HEADING_RE.match(line):
            if current:
                paragraphs.append(" ".join(current).strip())
                current = []
            continue
        if set(line) <= {"-", "_", "*"}:
            if current:
                paragraphs.append(" ".join(current).strip())
                current = []
            continue
        current.append(line)

    if current:
        paragraphs.append(" ".join(current).strip())

    return [{"paragraph_id": f"p{i+1}", "text": p} for i, p in enumerate(paragraphs)]


def _split_into_sentences(text: str) -> list[str]:
    sentences = [s.strip() for s in SENTENCE_SPLIT_RE.split(text.strip()) if s.strip()]
    if not sentences:
        return [text.strip()] if text.strip() else []
    return sentences


def split_paragraph_into_blocks(paragraph_text: str, max_chars: int = 320) -> list[str]:
    """
    Splits paragraph into visual blocks using sentence grouping.
    This is deterministic and easy to validate.
    """
    sentences = _split_into_sentences(paragraph_text)
    if not sentences:
        return []

    blocks: list[str] = []
    current = ""
    for sentence in sentences:
        candidate = f"{current} {sentence}".strip() if current else sentence
        if len(candidate) <= max_chars:
            current = candidate
            continue

        if current:
            blocks.append(current)
            current = sentence
        else:
            # sentence longer than max_chars: split by comma / words
            parts = re.split(r"(?<=,)\s+", sentence)
            buf = ""
            for part in parts:
                candidate_part = f"{buf} {part}".strip() if buf else part
                if len(candidate_part) <= max_chars:
                    buf = candidate_part
                else:
                    if buf:
                        blocks.append(buf)
                    if len(part) <= max_chars:
                        buf = part
                    else:
                        words = part.split()
                        word_buf = ""
                        for word in words:
                            cand_word = f"{word_buf} {word}".strip() if word_buf else word
                            if len(cand_word) <= max_chars:
                                word_buf = cand_word
                            else:
                                if word_buf:
                                    blocks.append(word_buf)
                                word_buf = word
                        buf = word_buf
            current = buf

    if current:
        blocks.append(current)

    return blocks


def _find_spans(full_text: str, parts: list[str]) -> list[Span]:
    spans: list[Span] = []
    cursor = 0
    for part in parts:
        idx = full_text.find(part, cursor)
        if idx < 0:
            # fallback for minor spacing differences
            compact_full = re.sub(r"\s+", " ", full_text[cursor:])
            compact_part = re.sub(r"\s+", " ", part)
            compact_idx = compact_full.find(compact_part)
            if compact_idx < 0:
                raise ValueError(f"Block text not found in source: {part[:80]}")
            # do not expose approximate offsets as real offsets
            raise ValueError(
                "Spacing mismatch prevented exact span mapping; keep block text literal."
            )
        start = idx
        end = idx + len(part)
        spans.append(Span(start=start, end=end))
        cursor = end
    return spans


def _chunk_tts_text(text: str, max_chars: int = 200) -> list[str]:
    sentences = _split_into_sentences(text)
    chunks: list[str] = []
    cur = ""
    for sentence in sentences:
        cand = f"{cur} {sentence}".strip() if cur else sentence
        if len(cand) <= max_chars:
            cur = cand
            continue
        if cur:
            chunks.append(cur)
            cur = sentence
        else:
            words = sentence.split()
            word_buf = ""
            for word in words:
                word_cand = f"{word_buf} {word}".strip() if word_buf else word
                if len(word_cand) <= max_chars:
                    word_buf = word_cand
                else:
                    if word_buf:
                        chunks.append(word_buf)
                    word_buf = word
            cur = word_buf
    if cur:
        chunks.append(cur)
    return chunks


def _estimate_duration(text: str, chars_per_second: float = 14.5) -> float:
    return round(max(1.0, len(text) / chars_per_second), 2)


def build_manifest(script_text: str, max_visual_chars: int = 320, max_tts_chars: int = 200) -> dict:
    script = normalize_space(script_text)
    paragraphs = split_markdown_into_paragraphs(script)
    manifest_blocks: list[dict] = []

    for paragraph in paragraphs:
        p_text = paragraph["text"]
        visual_parts = split_paragraph_into_blocks(p_text, max_chars=max_visual_chars)
        spans = _find_spans(p_text, visual_parts)

        for j, (part, span) in enumerate(zip(visual_parts, spans), start=1):
            tts_chunks = _chunk_tts_text(part, max_chars=max_tts_chars)
            tts_payload = []
            total = 0.0
            for k, chunk in enumerate(tts_chunks, start=1):
                dur = _estimate_duration(chunk)
                total += dur
                tts_payload.append(
                    {
                        "chunk_id": f"{paragraph['paragraph_id']}_b{j}_c{k}",
                        "text": chunk,
                        "chars": len(chunk),
                        "estimated_duration_sec": dur,
                    }
                )

            manifest_blocks.append(
                {
                    "block_id": f"{paragraph['paragraph_id']}_b{j}",
                    "paragraph_id": paragraph["paragraph_id"],
                    "source_text": part,
                    "source_span": {"start": span.start, "end": span.end},
                    "image_prompt": "",
                    "tts_chunks": tts_payload,
                    "estimated_duration_sec": round(total, 2),
                }
            )

    return {
        "schema_version": "1.0",
        "script": script,
        "paragraphs": paragraphs,
        "blocks": manifest_blocks,
    }


def validate_manifest(manifest: dict) -> dict:
    errors: list[str] = []
    by_paragraph: dict[str, list[dict]] = {}
    for block in manifest.get("blocks", []):
        by_paragraph.setdefault(block["paragraph_id"], []).append(block)

    for paragraph in manifest.get("paragraphs", []):
        pid = paragraph["paragraph_id"]
        ptext = paragraph["text"]
        blocks = by_paragraph.get(pid, [])
        if not blocks:
            errors.append(f"{pid}: no blocks generated")
            continue

        rebuilt = " ".join(block["source_text"] for block in blocks).strip()
        normalized_rebuilt = re.sub(r"\s+", " ", rebuilt)
        normalized_source = re.sub(r"\s+", " ", ptext)
        if normalized_rebuilt != normalized_source:
            errors.append(f"{pid}: reconstructed text differs from source paragraph")

        prev_end = 0
        for block in blocks:
            span = block["source_span"]
            if span["start"] < prev_end:
                errors.append(f"{block['block_id']}: overlapping span")
            if span["end"] <= span["start"]:
                errors.append(f"{block['block_id']}: invalid span range")
            prev_end = span["end"]

    return {"valid": len(errors) == 0, "errors": errors}


def load_script_file(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def save_manifest(manifest: dict, out_path: str) -> None:
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    Path(out_path).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
