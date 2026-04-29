import base64
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .prompts import (
    LAYER_A_PROMPT_VERSION,
    LAYER_B_PROMPT_VERSION,
    LAYER_C_PROMPT_VERSION,
    build_layer_a_messages,
    build_layer_b_messages,
    build_layer_c_messages,
)
from .providers import GeminiProvider, OpenAICompatibleProvider
from .router import LLMRouter
from .schemas import (
    SchemaValidationError,
    validate_layer_a,
    validate_layer_b,
    validate_layer_c,
)


PIPELINE_VERSION = "phase2.v1"


class LLMPipeline:
    def __init__(
        self,
        cache_dir: str | Path | None = None,
        router: LLMRouter | None = None,
    ) -> None:
        root = Path(__file__).resolve().parent.parent
        self.cache_dir = Path(cache_dir) if cache_dir else (root / "cache")
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.router = router or LLMRouter()

    def run_for_video_blocks(
        self,
        blocks: list[dict[str, Any]],
        style_notes: str = "",
        reference_images: list[str] | None = None,
        style_payload: dict[str, Any] | None = None,
        force_reprocess: bool = False,
        selected_block_codes: list[str] | None = None,
    ) -> dict[str, Any]:
        if not blocks:
            return {"updates": [], "meta": {"processed_blocks": 0}}

        allowed_codes = set(selected_block_codes or [])
        only_selected = bool(allowed_codes)
        reference_images = reference_images or []

        layer_a_result = (
            validate_layer_a(style_payload) if style_payload else self._run_layer_a(style_notes, reference_images)
        )

        updates: list[dict[str, Any]] = []
        prev_niv = 3
        prev_tension = "estabilizacao"
        processed = 0
        reused = 0

        for block in blocks:
            block_code = str(block["block_code"])
            if only_selected and block_code not in allowed_codes:
                existing_analysis = self._safe_json_load(block.get("analysis_json"))
                if existing_analysis and isinstance(existing_analysis.get("emotional"), dict):
                    prev_niv = int(existing_analysis["emotional"].get("niv", prev_niv))
                    prev_tension = str(existing_analysis["emotional"].get("tension_type", prev_tension))
                continue

            analysis_payload, analysis_meta, analysis_reused = self._get_layer_b_payload(
                block=block,
                previous_niv=prev_niv,
                previous_tension=prev_tension,
                force_reprocess=force_reprocess,
            )

            storyboard_payload, storyboard_meta, storyboard_reused = self._get_layer_c_payload(
                block=block,
                layer_a_result=layer_a_result,
                block_analysis=analysis_payload,
                force_reprocess=force_reprocess,
            )

            first_prompt = storyboard_payload["scenes"][0]["image_prompt"]
            update = {
                "id": int(block["id"]),
                "analysis_json": json.dumps(analysis_payload, ensure_ascii=False),
                "storyboard_json": json.dumps(storyboard_payload, ensure_ascii=False),
                "image_prompt": first_prompt,
                "analysis_provider": analysis_meta["provider"],
                "analysis_model": analysis_meta["model"],
                "storyboard_provider": storyboard_meta["provider"],
                "storyboard_model": storyboard_meta["model"],
            }
            updates.append(update)
            processed += 1
            reused += int(analysis_reused) + int(storyboard_reused)
            prev_niv = int(analysis_payload["emotional"]["niv"])
            prev_tension = str(analysis_payload["emotional"]["tension_type"])

        return {
            "updates": updates,
            "meta": {
                "processed_blocks": processed,
                "cache_hits": reused,
                "layer_a": layer_a_result,
            },
        }

    def _run_layer_a(self, style_notes: str, reference_images: list[str]) -> dict[str, Any]:
        image_data_urls = [self._image_path_to_data_url(path) for path in reference_images]
        if not image_data_urls and not style_notes.strip():
            return self._default_layer_a()

        input_payload = {
            "pipeline_version": PIPELINE_VERSION,
            "prompt_version": LAYER_A_PROMPT_VERSION,
            "style_notes": style_notes.strip(),
            "reference_images": sorted(reference_images),
        }
        input_hash = self._hash(input_payload)
        cached = self._read_cache("A", input_hash)
        if cached:
            return cached

        messages = build_layer_a_messages(style_notes=style_notes, image_data_urls=image_data_urls)
        payload, _ = self._run_stage_with_fallback(stage="A", messages=messages, temperature=0.1)
        payload["input_hash"] = input_hash
        payload["schema_version"] = PIPELINE_VERSION
        validate_layer_a(payload)
        self._write_cache("A", input_hash, payload)
        return payload

    def _get_layer_b_payload(
        self,
        block: dict[str, Any],
        previous_niv: int,
        previous_tension: str,
        force_reprocess: bool,
    ) -> tuple[dict[str, Any], dict[str, str], bool]:
        input_payload = {
            "pipeline_version": PIPELINE_VERSION,
            "prompt_version": LAYER_B_PROMPT_VERSION,
            "block_text": block["source_text"],
            "previous_niv": previous_niv,
            "previous_tension": previous_tension,
        }
        input_hash = self._hash(input_payload)
        existing = self._safe_json_load(block.get("analysis_json"))
        if (
            not force_reprocess
            and existing
            and isinstance(existing, dict)
            and existing.get("input_hash") == input_hash
        ):
            return existing, self._extract_meta(existing), True

        cached = None if force_reprocess else self._read_cache("B", input_hash)
        if cached:
            return cached, self._extract_meta(cached), True

        messages = build_layer_b_messages(
            block_text=block["source_text"],
            previous_niv=previous_niv,
            previous_tension=previous_tension,
        )
        payload, meta = self._run_stage_with_fallback(stage="B", messages=messages, temperature=0.25)
        payload["input_hash"] = input_hash
        payload["meta"] = meta
        payload["schema_version"] = PIPELINE_VERSION
        validate_layer_b(payload)
        self._write_cache("B", input_hash, payload)
        return payload, meta, False

    def _get_layer_c_payload(
        self,
        block: dict[str, Any],
        layer_a_result: dict[str, Any],
        block_analysis: dict[str, Any],
        force_reprocess: bool,
    ) -> tuple[dict[str, Any], dict[str, str], bool]:
        input_payload = {
            "pipeline_version": PIPELINE_VERSION,
            "prompt_version": LAYER_C_PROMPT_VERSION,
            "block_text": block["source_text"],
            "layer_a_anchor": layer_a_result.get("aesthetic_anchor", ""),
            "layer_a_dna": layer_a_result.get("visual_dna", {}),
            "block_analysis": block_analysis,
        }
        input_hash = self._hash(input_payload)
        existing = self._safe_json_load(block.get("storyboard_json"))
        if (
            not force_reprocess
            and existing
            and isinstance(existing, dict)
            and existing.get("input_hash") == input_hash
            and block.get("image_prompt")
        ):
            return existing, self._extract_meta(existing), True

        cached = None if force_reprocess else self._read_cache("C", input_hash)
        if cached:
            return cached, self._extract_meta(cached), True

        messages = build_layer_c_messages(
            block_text=block["source_text"],
            visual_dna=layer_a_result["visual_dna"],
            aesthetic_anchor=layer_a_result["aesthetic_anchor"],
            block_analysis=block_analysis,
        )
        payload, meta = self._run_stage_with_fallback(stage="C", messages=messages, temperature=0.3)
        payload["input_hash"] = input_hash
        payload["meta"] = meta
        payload["schema_version"] = PIPELINE_VERSION
        validate_layer_c(payload)
        self._write_cache("C", input_hash, payload)
        return payload, meta, False

    def _run_stage_with_fallback(
        self,
        stage: str,
        messages: list[dict[str, Any]],
        temperature: float,
    ) -> tuple[dict[str, Any], dict[str, str]]:
        errors: list[str] = []
        for candidate in self.router.route(stage):
            provider_target = self.router.get_provider_target(candidate.provider_name)
            client = GeminiProvider(provider_target) if provider_target.name == "gemini" else OpenAICompatibleProvider(provider_target)
            try:
                payload = client.complete_json(
                    model=candidate.model,
                    messages=messages,
                    temperature=temperature,
                )
                if stage == "A":
                    validate_layer_a(payload)
                elif stage == "B":
                    validate_layer_b(payload)
                else:
                    validate_layer_c(payload)
                return payload, {"provider": candidate.provider_name, "model": candidate.model}
            except (RuntimeError, SchemaValidationError) as exc:
                errors.append(f"{candidate.provider_name}:{candidate.model}: {exc}")
        raise RuntimeError(f"all providers failed for stage {stage}: {' | '.join(errors)}")

    def _cache_path(self, stage: str, input_hash: str) -> Path:
        return self.cache_dir / f"{stage.lower()}_{input_hash}.json"

    def _read_cache(self, stage: str, input_hash: str) -> dict[str, Any] | None:
        cache_path = self._cache_path(stage, input_hash)
        if not cache_path.exists():
            return None
        return json.loads(cache_path.read_text(encoding="utf-8"))

    def _write_cache(self, stage: str, input_hash: str, payload: dict[str, Any]) -> None:
        cache_path = self._cache_path(stage, input_hash)
        envelope = dict(payload)
        envelope["_cache"] = {
            "stage": stage,
            "input_hash": input_hash,
            "saved_at": datetime.now(timezone.utc).isoformat(),
        }
        cache_path.write_text(json.dumps(envelope, ensure_ascii=False, indent=2), encoding="utf-8")

    @staticmethod
    def _hash(payload: dict[str, Any]) -> str:
        raw = json.dumps(payload, ensure_ascii=False, sort_keys=True)
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    @staticmethod
    def _safe_json_load(value: Any) -> dict[str, Any] | None:
        if isinstance(value, dict):
            return value
        if isinstance(value, str) and value.strip():
            try:
                parsed = json.loads(value)
                if isinstance(parsed, dict):
                    return parsed
            except json.JSONDecodeError:
                return None
        return None

    @staticmethod
    def _extract_meta(payload: dict[str, Any]) -> dict[str, str]:
        meta = payload.get("meta")
        if isinstance(meta, dict):
            provider = str(meta.get("provider", "cache"))
            model = str(meta.get("model", "cache"))
            return {"provider": provider, "model": model}
        return {"provider": "cache", "model": "cache"}

    @staticmethod
    def _image_path_to_data_url(path: str) -> str:
        image_path = Path(path)
        if not image_path.exists():
            raise FileNotFoundError(f"reference image not found: {path}")
        ext = image_path.suffix.lower().replace(".", "") or "png"
        mime = "jpeg" if ext == "jpg" else ext
        raw = image_path.read_bytes()
        b64 = base64.b64encode(raw).decode("ascii")
        return f"data:image/{mime};base64,{b64}"

    @staticmethod
    def _default_layer_a() -> dict[str, Any]:
        return {
            "aesthetic_anchor": (
                "ilustracao 2D editorial, leitura clara, contraste moderado, composicao limpa"
            ),
            "visual_dna": {
                "art_style": "2D digital simplificado",
                "character_style": "semi-cartoon com contorno limpo",
                "color_palette": "tons neutros com acentos quentes",
                "lighting": "difusa e didatica",
                "composition": "foco central com espaco negativo funcional",
                "constraints": [
                    "manter contorno consistente",
                    "evitar excesso de textura",
                    "priorizar clareza narrativa",
                ],
                "forbidden_elements": [
                    "fotorealismo extremo",
                    "texto embutido na imagem",
                    "ruido visual excessivo",
                ],
            },
            "meta": {"provider": "system", "model": "default"},
            "schema_version": PIPELINE_VERSION,
        }
