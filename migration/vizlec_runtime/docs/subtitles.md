# Legendas (MVP) - `vizlec_runtime`

Este documento descreve a implementacao atual de legendas no `vizlec_runtime` para:
- manter alinhamento entre backend/worker/render
- preparar a integracao futura no frontend (templates/preview/edicao)

## Estado atual (MVP funcional)

Pipeline de legenda no render final cinematografico:
1. Worker concatena audio de voz da `lessonVersion`
2. Worker descarrega modelos de geracao (XTTS/Comfy/LLM) para liberar VRAM
3. Bridge Python roda transcricao com `faster-whisper`
4. Sao gerados arquivos de legenda no `final/`
5. Bridge aplica burn-in no video final com template default (ASS)

### Template default atual (fixo)
- `subtitle-yellow-bold-bottom-v1`
- estilo inspirado no frame de referencia:
  - texto amarelo
  - bold forte
  - contorno preto forte
  - alinhamento bottom-center
  - estilo de "trechos" (nao palavra por palavra)

Observacao: este **e apenas um template**. A arquitetura ja foi separada para suportar outros templates depois.

## Onde esta implementado

### Worker (orquestracao)
- `migration/vizlec_runtime/apps/worker/src/index.ts`
  - descarrega contexto/VRAM antes da transcricao:
    - `ensureMemoryForSubtitleTranscription(...)`
  - chama bridge cinematografico
  - registra assets de legenda

### Bridge de render final
- `migration/vizlec_runtime/apps/worker/scripts/render_cinematic_final.py`
  - concatena audio
  - chama transcricao
  - renderiza video cinematografico
  - aplica burn-in com `ASS`

### Transcricao + geracao de cues
- `migration/vizlec_runtime/apps/worker/scripts/subtitle_transcribe_faster_whisper.py`
  - `faster-whisper`
  - gera arquivos:
    - `subtitles.raw.json`
    - `subtitles.cues.json`
    - `subtitles.srt`
    - `subtitles.default.ass`

## Arquivos gerados (por `lessonVersion`)

Diretorio:
- `.../versions/<versionId>/final/`

Arquivos:
- `subtitles.raw.json`
  - saida crua de transcricao (segmentos + palavras, quando disponivel)
- `subtitles.cues.json`
  - cues ja preparados para render (template-aware)
- `subtitles.srt`
  - versao SRT derivada dos cues
- `subtitles.default.ass`
  - legenda final no template default (ASS), usada no burn-in

## Assets registrados no banco

Kinds criados no `Asset.kind`:
- `subtitle_raw_json`
- `subtitle_cues_json`
- `subtitle_srt`
- `subtitle_ass`

Observacao:
- os assets sao registrados usando o `blockId` do primeiro bloco da `lessonVersion` (padrao atual do runtime para assets finais por versao)

## Estrutura de dados (importante para frontend)

### `subtitles.raw.json` (transcricao / timestamps)
Contem:
- `engine`
- `model`
- `device`
- `compute_type`
- `language`
- `template_id`
- `info`
- `segments[]`
  - `start`
  - `end`
  - `text`
  - `words[]` (quando disponivel)
    - `word`
    - `start`
    - `end`
    - `probability`

Uso futuro no frontend:
- diagnostico de sincronismo
- edicao de cues com base em palavras/segmentos
- troca de template sem retranscrever

### `subtitles.cues.json` (render / template-aware)
Contem:
- `template_id`
- `width`
- `height`
- `cues[]`
  - `start`
  - `end`
  - `text`

Observacao:
- `text` pode conter quebra manual de linha com `\\N` (ASS newline)

Uso futuro no frontend:
- preview de legenda no template
- edicao fina de cue (texto, inicio, fim, quebra)
- troca de template sem refazer ASR

## Regras de quebra e legibilidade (MVP atual)

O estilo atual **nao e karaoke**. Ele e orientado a trechos.

### Quebra de linha
- nao quebra em 2 linhas sempre
- cues curtos/medios ficam em 1 linha
- cues maiores podem receber quebra manual em 2 linhas
- o `libass` foi configurado para reduzir wrap automatico
- margem lateral existe como **safe area visual** (nao como mecanismo principal de quebra)

### Tempo minimo de exibicao (legibilidade)
Existe pos-processamento de cues para evitar "pisca-pisca":
- `min_cue_duration = 0.75s`
- se um cue ficar curto demais:
  - tenta agrupar com o proximo (preferencia)
  - senao tenta agrupar com o anterior

Limites do merge (para nao virar bloco grande):
- `max_merged_duration = 2.6s`
- `max_merged_chars = 62`

Objetivo:
- manter dinamica
- evitar palavras/trechos sumindo rapido demais
- manter estilo de trechos grandes legiveis

## Configuracoes por ambiente (worker -> bridge)

Variaveis suportadas:
- `VIZLEC_SUBTITLES_ENABLED` (`1`/`0`)
- `VIZLEC_SUBTITLE_LANGUAGE` (ex.: `pt`)
- `VIZLEC_SUBTITLE_WHISPER_MODEL` (ex.: `large-v3`, `distil-large-v3`)
- `VIZLEC_SUBTITLE_WHISPER_DEVICE` (`cuda` / `cpu`)
- `VIZLEC_SUBTITLE_WHISPER_COMPUTE_TYPE` (ex.: `float16`)
- `VIZLEC_SUBTITLE_VAD_FILTER` (`1`/`0`)
- `VIZLEC_SUBTITLE_WORD_TIMESTAMPS` (`1`/`0`)

## Integracao futura no frontend (planejado)

### 1) Selecao de template de legenda
Modelo esperado no frontend:
- `template_id`
- preview visual
- parametros (futuros):
  - posicao
  - fonte
  - tamanho
  - outline
  - cor
  - safe area (margens)
  - comportamento de quebra

### 2) Preview / edicao de cues
Com base em `subtitles.cues.json`:
- listar cues
- editar texto
- ajustar `start/end`
- ajustar quebra manual (`\\N`)

### 3) Rebuild de ASS sem retranscrever
Troca de template **nao precisa** rerodar `faster-whisper`:
- reaproveitar `raw.json` / `cues.json`
- regenerar apenas `ASS` (e opcionalmente `SRT`)

## Decisoes tecnicas importantes (para nao perder)

- Transcricao foi implementada como **script interno do worker** (nao servico separado) por pragmatismo/reuso
- Antes da transcricao, o worker descarrega modelos de geracao para liberar VRAM
- A transcricao e desacoplada do template (raw -> cues -> ass)
- O template atual e default/fixo, mas **nao definitivo**

