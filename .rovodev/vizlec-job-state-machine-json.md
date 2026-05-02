# VizLec Prompt — Job State Machine (Pipeline) [JSON]

Defina uma máquina de estados para o pipeline do VizLec, considerando reprocessamento por bloco e idempotência.
Retorne **apenas JSON válido**.

## Requisitos
- Estados por bloco: segmentation_done, image_prompt_done, image_done, tts_done, slide_render_done, clip_done.
- Estados por aula: draft, segmented, assets_generated, ready_to_render, rendered, failed.
- Deve suportar re-execução parcial: se `image_prompt_user` mudar, invalidar image_done+dependentes.
- Inclua transições e eventos.

## Output JSON
{
  "lesson_states": ["string"],
  "block_states": ["string"],
  "events": ["string"],
  "transitions": [
    {
      "scope": "lesson|block",
      "from": "string",
      "event": "string",
      "to": "string",
      "invalidate": ["string"]
    }
  ]
}
