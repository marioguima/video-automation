from typing import Any


class SchemaValidationError(ValueError):
    pass


def validate_layer_a(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise SchemaValidationError("layer A payload must be an object")
    anchor = payload.get("aesthetic_anchor")
    dna = payload.get("visual_dna")
    if not isinstance(anchor, str) or not anchor.strip():
        raise SchemaValidationError("layer A: aesthetic_anchor is required")
    if not isinstance(dna, dict):
        raise SchemaValidationError("layer A: visual_dna must be object")

    required = [
        "art_style",
        "character_style",
        "color_palette",
        "lighting",
        "composition",
        "constraints",
        "forbidden_elements",
    ]
    for key in required:
        if key not in dna:
            raise SchemaValidationError(f"layer A: missing visual_dna.{key}")
    if not isinstance(dna["constraints"], list):
        raise SchemaValidationError("layer A: visual_dna.constraints must be list")
    if not isinstance(dna["forbidden_elements"], list):
        raise SchemaValidationError("layer A: visual_dna.forbidden_elements must be list")
    return payload


def validate_layer_b(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise SchemaValidationError("layer B payload must be an object")
    emotional = payload.get("emotional")
    narrative = payload.get("narrative")
    rupture = payload.get("rupture")
    if not isinstance(emotional, dict):
        raise SchemaValidationError("layer B: emotional must be object")
    if not isinstance(narrative, dict):
        raise SchemaValidationError("layer B: narrative must be object")
    if not isinstance(rupture, dict):
        raise SchemaValidationError("layer B: rupture must be object")

    niv = emotional.get("niv")
    if not isinstance(niv, int) or niv < 1 or niv > 5:
        raise SchemaValidationError("layer B: emotional.niv must be integer 1..5")
    if not isinstance(narrative.get("symbolic_representations"), list):
        raise SchemaValidationError("layer B: narrative.symbolic_representations must be list")
    if len(narrative["symbolic_representations"]) < 3:
        raise SchemaValidationError("layer B: symbolic_representations must have >= 3 items")
    if not isinstance(rupture.get("needed"), bool):
        raise SchemaValidationError("layer B: rupture.needed must be boolean")
    return payload


def validate_layer_c(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise SchemaValidationError("layer C payload must be an object")
    scenes = payload.get("scenes")
    if not isinstance(scenes, list):
        raise SchemaValidationError("layer C: scenes must be list")
    if len(scenes) < 1:
        raise SchemaValidationError("layer C: scenes cannot be empty")
    if len(scenes) > 8:
        raise SchemaValidationError("layer C: scenes cannot exceed 8")
    required = [
        "scene_id",
        "source_excerpt",
        "central_idea",
        "emotional_function",
        "dominant_symbol",
        "camera_shot",
        "light_contrast",
        "composition",
        "transition_to_next",
        "image_prompt",
    ]
    for index, scene in enumerate(scenes):
        if not isinstance(scene, dict):
            raise SchemaValidationError(f"layer C: scene {index} must be object")
        for key in required:
            if key not in scene:
                raise SchemaValidationError(f"layer C: scene {index} missing {key}")
            if not isinstance(scene[key], str) or not scene[key].strip():
                raise SchemaValidationError(f"layer C: scene {index} invalid {key}")
    return payload

