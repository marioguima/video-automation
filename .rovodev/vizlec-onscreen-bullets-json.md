# VizLec Prompt — On-screen (Title+Bullets) [JSON]

Você recebe um `source_text` (trecho narrado) e deve produzir texto curto para aparecer no slide.
Retorne **apenas JSON válido**.

## Regras
- Use linguagem clara e didática.
- Não copie frases longas do source.
- Não invente conteúdo que não exista no source.
- `title`: máx 8 palavras.
- `bullets`: 2–5 itens; cada um máx 10 palavras.
- Evite pontuação longa; prefira frases nominais.
- Não usar emojis.

## Output JSON
{
  "title": "string",
  "bullets": ["string"]
}

## Input
SOURCE_TEXT:
{{SOURCE_TEXT}}
