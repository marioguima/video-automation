# VizLec Prompt — FFmpeg Plan (Slides -> Video) [JSON]

Você é um engenheiro de vídeo. Crie um plano de comandos (alto nível) para gerar o vídeo final a partir de slides e áudios.
Retorne **apenas JSON válido**.

## Requisitos
- Para cada slide: imagem estática + áudio, duração = duração do áudio (usar -shortest).
- Saída intermediária: um MP4 por slide.
- Depois: concatenação com transição leve (fade) entre clips.
- Resolução: 1920x1080 no MVP.
- FPS: 30.
- Codec: libx264.

## Output JSON
{
  "settings": {
    "width": 1920,
    "height": 1080,
    "fps": 30,
    "video_codec": "libx264",
    "audio_codec": "aac"
  },
  "per_slide": {
    "command_template": "string",
    "notes": ["string"]
  },
  "concat": {
    "strategy": "string",
    "command_template": "string",
    "notes": ["string"]
  }
}

## Input
SLIDES:
{{SLIDES_MANIFEST_JSON}}
