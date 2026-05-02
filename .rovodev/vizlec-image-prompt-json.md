# VizLec Prompt — Image Prompt (por bloco) [JSON]

Você cria o **prompt variável do bloco** para gerar uma imagem no ComfyUI, baseado no texto narrado.
Retorne **apenas JSON válido**.

## Contexto
Existe um template que já define um "master positive prompt" e um "negative prompt". Você NÃO deve repetir essas partes. Você deve produzir apenas o `block_prompt` com a cena e elementos específicos do bloco.

## Regras
- Não incluir texto na imagem (sem letras, sem legendas, sem tipografia).
- Descrever uma cena/ilustração compatível com um slide didático.
- Evitar conteúdo sensível.
- Preferir estilo "clean premium" e composição simples.
- Incluir 3–8 detalhes visuais concretos.
- Se o texto for abstrato, use metáforas visuais simples.

## Output JSON
{
  "block_prompt": "string",
  "avoid": ["string"],
  "seed_hint": "string"
}

## Input
SOURCE_TEXT:
{{SOURCE_TEXT}}

ON_SCREEN (para contexto, não para renderizar texto na imagem):
{{ON_SCREEN_JSON}}
