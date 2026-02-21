import json
import math
import re
from dataclasses import dataclass
from pathlib import Path


SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")
HEADING_RE = re.compile(r"^\s{0,3}#{1,6}\s+")
MARKUP_ONLY_LINE_RE = re.compile(r"^[\s#>*`~_\-|]+$")
TOKEN_RE = re.compile(r"[a-zA-ZÀ-ÿ0-9]+")

STOPWORDS_PT = {
    "a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "é", "em", "um",
    "uma", "para", "por", "com", "que", "na", "no", "nas", "nos", "se", "ao",
    "à", "às", "ou", "como", "mais", "mas", "já", "não", "sim", "ser", "foi",
    "são", "tem", "também", "quando", "onde", "isso", "essa", "esse", "seu",
    "sua", "seus", "suas", "você", "vocês", "ele", "ela", "eles", "elas",
}


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
        # Ignore lines that are only markdown/control characters
        # (e.g. "#", "##", "---", "***", ">", "```").
        if MARKUP_ONLY_LINE_RE.match(line):
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


def _tokenize(text: str) -> list[str]:
    tokens = [t.lower() for t in TOKEN_RE.findall(text)]
    return [t for t in tokens if t not in STOPWORDS_PT and len(t) > 1]


def _term_freq(tokens: list[str]) -> dict[str, int]:
    tf: dict[str, int] = {}
    for token in tokens:
        tf[token] = tf.get(token, 0) + 1
    return tf


def _cosine_similarity(a: dict[str, int], b: dict[str, int]) -> float:
    if not a or not b:
        return 0.0
    dot = sum(a.get(k, 0) * b.get(k, 0) for k in a.keys())
    na = math.sqrt(sum(v * v for v in a.values()))
    nb = math.sqrt(sum(v * v for v in b.values()))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def _split_long_sentence(sentence: str, max_chars: int) -> list[str]:
    if len(sentence) <= max_chars:
        return [sentence]

    parts = re.split(r"(?<=,)\s+", sentence)
    blocks: list[str] = []
    buf = ""

    for part in parts:
        candidate = f"{buf} {part}".strip() if buf else part
        if len(candidate) <= max_chars:
            buf = candidate
            continue

        if buf:
            blocks.append(buf)
            buf = ""

        if len(part) <= max_chars:
            buf = part
            continue

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

    if buf:
        blocks.append(buf)
    return blocks


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
            parts = _split_long_sentence(sentence, max_chars=max_chars)
            blocks.extend(parts[:-1])
            current = parts[-1] if parts else ""

    if current:
        blocks.append(current)

    return blocks


def split_paragraph_into_blocks_by_topic(
    paragraph_text: str,
    max_chars: int | None = None,
    min_chars: int = 120,
    similarity_threshold: float = 0.16,
) -> list[str]:
    """
    Splits paragraph by topical cohesion between neighboring sentences.
    No LLM: uses token-frequency cosine similarity.
    """
    sentences = _split_into_sentences(paragraph_text)
    if not sentences:
        return []

    blocks: list[str] = []
    cur_sentences: list[str] = [sentences[0]]
    prev_tf = _term_freq(_tokenize(sentences[0]))

    for sentence in sentences[1:]:
        sent_tf = _term_freq(_tokenize(sentence))
        sim = _cosine_similarity(prev_tf, sent_tf)
        current_text = " ".join(cur_sentences).strip()
        candidate = f"{current_text} {sentence}".strip()

        must_split_by_size = bool(max_chars and len(candidate) > max_chars)
        can_split_by_topic = len(current_text) >= min_chars and sim < similarity_threshold

        if must_split_by_size or can_split_by_topic:
            if current_text:
                blocks.append(current_text)
            cur_sentences = [sentence]
        else:
            cur_sentences.append(sentence)

        prev_tf = sent_tf

    if cur_sentences:
        blocks.append(" ".join(cur_sentences).strip())

    # Optional guardrail: split oversized blocks only if max_chars is active
    if not max_chars:
        return blocks

    final_blocks: list[str] = []
    for block in blocks:
        if len(block) <= max_chars:
            final_blocks.append(block)
            continue
        split_sentences = _split_into_sentences(block)
        temp = ""
        for sent in split_sentences:
            cand = f"{temp} {sent}".strip() if temp else sent
            if len(cand) <= max_chars:
                temp = cand
            else:
                if temp:
                    final_blocks.append(temp)
                if len(sent) <= max_chars:
                    temp = sent
                else:
                    parts = _split_long_sentence(sent, max_chars=max_chars)
                    final_blocks.extend(parts[:-1])
                    temp = parts[-1] if parts else ""
        if temp:
            final_blocks.append(temp)
    return final_blocks


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


def build_manifest(
    script_text: str,
    max_visual_chars: int = 0,
    max_tts_chars: int = 200,
    split_mode: str = "topic",
    topic_min_chars: int = 120,
    topic_similarity_threshold: float = 0.16,
) -> dict:
    script = normalize_space(script_text)
    paragraphs = split_markdown_into_paragraphs(script)
    manifest_blocks: list[dict] = []

    for paragraph in paragraphs:
        p_text = paragraph["text"]
        if split_mode == "topic":
            topic_max_chars = max_visual_chars if max_visual_chars > 0 else None
            visual_parts = split_paragraph_into_blocks_by_topic(
                p_text,
                max_chars=topic_max_chars,
                min_chars=topic_min_chars,
                similarity_threshold=topic_similarity_threshold,
            )
        else:
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
        "split_mode": split_mode,
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
