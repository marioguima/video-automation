#!/usr/bin/env python3
import argparse
import json
import os
import sys
from typing import Any, Dict, List, Tuple


def load_payload(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def resolve_dtype(dtype_name: str):
    import torch

    mapping = {
        "bfloat16": torch.bfloat16,
        "float16": torch.float16,
        "float32": torch.float32,
    }
    return mapping.get(dtype_name, torch.float32)


def build_model(payload: Dict[str, Any]):
    from qwen_tts import Qwen3TTSModel

    model_id = payload.get("model")
    if not model_id:
        raise ValueError("payload.model is required")
    device = payload.get("device") or "cuda:0"
    dtype = resolve_dtype(str(payload.get("dtype") or "float32"))

    kwargs: Dict[str, Any] = {}
    attn_impl = payload.get("attn_implementation")
    if attn_impl:
        kwargs["attn_implementation"] = attn_impl

    return Qwen3TTSModel.from_pretrained(model_id, device_map=device, dtype=dtype, **kwargs)


def ensure_list(value: Any, length: int) -> List[Any]:
    if isinstance(value, list):
        return value
    return [value for _ in range(length)]


def generate_audio(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    items = payload.get("items") or []
    if not items:
        return []

    model = build_model(payload)
    task = str(payload.get("task") or "custom_voice").lower()
    language = payload.get("language") or "Auto"
    speaker = payload.get("speaker") or "Ryan"
    instruct = payload.get("instruct") or ""

    texts = [str(item.get("text") or "") for item in items]

    if task == "custom_voice":
        languages = ensure_list(language, len(texts))
        speakers = ensure_list(speaker, len(texts))
        if instruct:
            instructs = ensure_list(instruct, len(texts))
            wavs, sr = model.generate_custom_voice(
                text=texts,
                language=languages,
                speaker=speakers,
                instruct=instructs,
            )
        else:
            wavs, sr = model.generate_custom_voice(
                text=texts,
                language=languages,
                speaker=speakers,
            )
    elif task == "voice_design":
        if not instruct:
            raise ValueError("voice_design requires instruct")
        languages = ensure_list(language, len(texts))
        instructs = ensure_list(instruct, len(texts))
        wavs, sr = model.generate_voice_design(
            text=texts,
            language=languages,
            instruct=instructs,
        )
    else:
        raise ValueError(f"unsupported task: {task}")

    results: List[Dict[str, Any]] = []
    import soundfile as sf

    for idx, item in enumerate(items):
        output_path = str(item.get("output_path") or "")
        if not output_path:
            raise ValueError("item.output_path is required")
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        sf.write(output_path, wavs[idx], sr)
        duration_s = float(len(wavs[idx]) / sr) if sr else 0.0
        results.append(
            {
                "id": item.get("id"),
                "output_path": output_path,
                "sample_rate": sr,
                "num_samples": int(len(wavs[idx])),
                "duration_s": duration_s,
            }
        )
    return results


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    try:
        payload = load_payload(args.input)
        results = generate_audio(payload)
        with open(args.output, "w", encoding="utf-8") as handle:
            json.dump({"results": results}, handle)
        return 0
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
