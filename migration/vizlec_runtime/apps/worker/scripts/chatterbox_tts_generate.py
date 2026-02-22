#!/usr/bin/env python3
import argparse
import json
import os
import random
import sys
import traceback
from typing import Any, Dict, List

import numpy as np
import torch
import soundfile as sf
from chatterbox.mtl_tts import ChatterboxMultilingualTTS

RESULT_PREFIX = "__VIZLEC_RESULT__"


try:
    import perth  # type: ignore
    if not callable(getattr(perth, "PerthImplicitWatermarker", None)):
        class DummyWatermarker:
            def apply_watermark(self, wav, sample_rate=None):
                return wav
        perth.PerthImplicitWatermarker = DummyWatermarker  # type: ignore
except Exception:
    pass


def load_payload(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def set_seed(seed: int) -> None:
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed(seed)
        torch.cuda.manual_seed_all(seed)
    random.seed(seed)
    np.random.seed(seed)


def build_model(payload: Dict[str, Any]) -> ChatterboxMultilingualTTS:
    device = payload.get("device") or ("cuda" if torch.cuda.is_available() else "cpu")
    model = ChatterboxMultilingualTTS.from_pretrained(device=device)
    if hasattr(model, "to") and str(getattr(model, "device", "")) != device:
        model.to(device)
    return model


def generate_audio(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    items = payload.get("items") or []
    if not items:
        return []

    model = build_model(payload)
    language_id = payload.get("language_id") or "pt"
    audio_prompt_path = payload.get("audio_prompt_path")
    if not audio_prompt_path:
        raise ValueError("payload.audio_prompt_path is required")

    exaggeration = float(payload.get("exaggeration", 0.5))
    temperature = float(payload.get("temperature", 0.8))
    cfg_weight = float(payload.get("cfg_weight", 0.5))
    seed = int(payload.get("seed", 0))
    if seed:
        set_seed(seed)

    results: List[Dict[str, Any]] = []
    for item in items:
        text = str(item.get("text") or "").strip()
        output_path = str(item.get("output_path") or "")
        if not output_path:
            raise ValueError("item.output_path is required")
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        wav = model.generate(
            text,
            language_id=language_id,
            audio_prompt_path=audio_prompt_path,
            exaggeration=exaggeration,
            temperature=temperature,
            cfg_weight=cfg_weight,
        )
        wav_np = wav.squeeze(0).detach().cpu().numpy()
        sf.write(output_path, wav_np, model.sr)
        duration_s = float(len(wav_np) / model.sr) if model.sr else 0.0
        result = {
            "id": item.get("id"),
            "output_path": output_path,
            "sample_rate": model.sr,
            "num_samples": int(len(wav_np)),
            "duration_s": duration_s,
        }
        results.append(result)
        print(f\"{RESULT_PREFIX}{json.dumps(result)}\", flush=True)
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
        print(traceback.format_exc(), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
