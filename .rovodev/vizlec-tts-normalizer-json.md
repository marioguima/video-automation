# VizLec Prompt — TTS Text Normalizer (Pronunciation helper) [JSON]

Você recebe um texto que será narrado via TTS. Seu objetivo é sugerir uma versão `tts_text` que soe natural no TTS.
Retorne **apenas JSON válido**.

## Regras
- Preserve o significado.
- Permita ajustes ortográficos leves para melhorar pronúncia ("escrever como fala"), sem usar fonemas.
- Expanda siglas na primeira ocorrência (ex.: "LLM" -> "modelo de linguagem, L L M") quando necessário.
- Evite símbolos que TTS costuma ler mal.
- Não invente conteúdo.

## Output JSON
{
  "tts_text": "string",
  "notes": ["string"]
}

## Input
SOURCE_TEXT:
{{SOURCE_TEXT}}
