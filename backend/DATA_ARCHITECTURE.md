# Arquitetura de Dados (SQLite)

Objetivo: permitir operacao de agencia com pausa/retomada por canal e video.

Arquivo de banco:

- `backend/data/studio.db`

## Entidades principais

1. `channels`
- cadastro do canal (nome, nicho, idioma)

2. `videos`
- cada video pertence a um canal
- guarda roteiro de entrada e parametros de segmentacao
- status do fluxo (ex.: `draft`, `script_ready`, `blocks_ready`)

3. `video_blocks`
- blocos segmentados por contexto
- trecho original, spans, prompt de imagem e chunks de TTS

4. `block_assets`
- progresso por bloco para `image` e `audio`
- status, arquivo gerado, provider/modelo e metadados

5. `pipeline_jobs`
- jobs por etapa (`llm_analysis`, `image_gen`, `tts_gen`, `render`)
- tentativas, erro e payload

6. `video_renders`
- saidas finais/intermediarias de render

## Fluxo operacional minimo

1. Criar canal
2. Criar video (roteiro pronto, vindo de fora)
3. Ingerir roteiro em blocos (`/ingest-script`)
4. Processar blocos por etapa:
- analise LLM
- imagem
- audio
5. Render final
6. (Opcional) agendamento de publicacao

## Pause/Resume

Como tudo fica persistido no banco:

- pode interromper o processo no meio
- consultar status de cada bloco
- retomar apenas etapas pendentes

Estratégia recomendada:

- nunca reprocessar video inteiro sem necessidade
- usar status em `block_assets` e `pipeline_jobs`
- reexecutar somente itens com `pending`/`failed`

## Endpoints atuais para gestao de projeto

- `GET /api/channels`
- `POST /api/channels`
- `GET /api/videos?channel_id=...`
- `POST /api/videos`
- `GET /api/videos/{id}`
- `POST /api/videos/{id}/ingest-script`

## Observacao sobre roteiros internos

Nesta fase o fluxo parte de roteiro externo (pronto).
Ja esta preparado para evoluir:

- `videos.source_type` aceita origem (`external_script`, `internal_llm`)
- no futuro, adicionar etapa de geracao interna e gravar no mesmo `script_text`.
