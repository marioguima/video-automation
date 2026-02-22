from typing import Any


LAYER_A_PROMPT_VERSION = "a.v1"
LAYER_B_PROMPT_VERSION = "b.v1"
LAYER_C_PROMPT_VERSION = "c.v1"


def build_layer_a_messages(style_notes: str, image_data_urls: list[str]) -> list[dict[str, Any]]:
    system = (
        "Voce extrai estilo visual tecnico. Responda somente JSON valido, sem markdown."
    )
    instruction = (
        "Analise as referencias visuais e notas de estilo. "
        "Nao descreva narrativa, apenas padrao estilistico reutilizavel.\n"
        "Retorne JSON com chaves exatas:\n"
        "{\n"
        '  "aesthetic_anchor": "string",\n'
        '  "visual_dna": {\n'
        '    "art_style": "string",\n'
        '    "character_style": "string",\n'
        '    "color_palette": "string",\n'
        '    "lighting": "string",\n'
        '    "composition": "string",\n'
        '    "constraints": ["string", "..."],\n'
        '    "forbidden_elements": ["string", "..."]\n'
        "  }\n"
        "}"
    )
    user_content: list[dict[str, Any]] = [{"type": "text", "text": instruction}]
    if style_notes.strip():
        user_content.append({"type": "text", "text": f"Notas do projeto:\n{style_notes.strip()}"})
    for image_url in image_data_urls:
        user_content.append({"type": "image_url", "image_url": {"url": image_url}})

    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user_content},
    ]


def build_layer_b_messages(
    block_text: str,
    previous_niv: int,
    previous_tension: str,
) -> list[dict[str, Any]]:
    system = (
        "Voce e Diretor Narrativo + Tradutor Simbolico + Diretor Cinematografico. "
        "Responda apenas JSON valido."
    )
    user = (
        "Analise exclusivamente o BLOCO atual.\n\n"
        f"BLOCO:\n{block_text}\n\n"
        "CONTEXTO DO BLOCO ANTERIOR:\n"
        f"- niv: {previous_niv}\n"
        f"- tipo_tensao: {previous_tension}\n\n"
        "Retorne JSON com chaves exatas:\n"
        "{\n"
        '  "emotional": {\n'
        '    "niv": 1,\n'
        '    "tension_type": "conflito|revelacao|aplicacao|ruptura|estabilizacao",\n'
        '    "state_initial": "string",\n'
        '    "state_final": "string",\n'
        '    "trend_vs_previous": "aumentar|manter|reduzir"\n'
        "  },\n"
        '  "narrative": {\n'
        '    "narrative_type": "string",\n'
        '    "dominant_archetype": "string",\n'
        '    "secondary_archetype": "string",\n'
        '    "transformation": "de -> para",\n'
        '    "symbolic_representations": ["string", "string", "string"]\n'
        "  },\n"
        '  "rupture": {\n'
        '    "needed": true,\n'
        '    "justification": "string",\n'
        '    "type": "nenhuma|semi-realista|realista|abstrata",\n'
        '    "intensity": "leve|media|forte",\n'
        '    "estimated_duration_sec": 0.0\n'
        "  }\n"
        "}"
    )
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def build_layer_c_messages(
    block_text: str,
    visual_dna: dict[str, Any],
    aesthetic_anchor: str,
    block_analysis: dict[str, Any],
) -> list[dict[str, Any]]:
    system = (
        "Voce e Diretor de Storyboard Visual Silencioso. "
        "Responda apenas JSON valido."
    )
    user = (
        "Crie storyboard para o BLOCO atual com 4 a 8 cenas, no maximo uma cena por unidade dramatica.\n"
        "Cada cena deve usar trecho literal do bloco.\n\n"
        f"BLOCO:\n{block_text}\n\n"
        f"ANCORA_ESTETICA:\n{aesthetic_anchor}\n\n"
        f"DNA_VISUAL:\n{visual_dna}\n\n"
        f"ANALISE_BLOCO:\n{block_analysis}\n\n"
        "Retorne JSON com chaves exatas:\n"
        "{\n"
        '  "scenes": [\n'
        "    {\n"
        '      "scene_id": "01",\n'
        '      "source_excerpt": "trecho literal",\n'
        '      "central_idea": "string",\n'
        '      "emotional_function": "string",\n'
        '      "dominant_symbol": "string",\n'
        '      "camera_shot": "aberto|medio|close|super close",\n'
        '      "light_contrast": "string",\n'
        '      "composition": "string",\n'
        '      "transition_to_next": "suave|impacto",\n'
        '      "image_prompt": "ESTILO OBRIGATORIO: ..."\n'
        "    }\n"
        "  ]\n"
        "}"
    )
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]

