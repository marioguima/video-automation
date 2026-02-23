# Roadmap por Fases (Execucao)

Baseado na conversa em `chat.md` e no estado atual do projeto.

## Objetivo do produto

1. Dividir roteiro em blocos por semelhanca (contexto narrativo).
2. Gerar prompts de imagem por bloco via LLM.
3. Gerar audio por bloco/chunk via API de TTS.
4. Montar video final com timing correto, transicoes e coesao visual.
5. Permitir revisao humana (blocos, texto TTS, audio, transicoes) com persistencia total.

---

## MVP (Prioridade Atual) - "Roteiro -> Video Local"

Status: `IN_PROGRESS`

Escopo fechado do MVP (local-first):

- [x] Flash transitions white/black premium (base visual aprovada em teste manual).
- [ ] Efeito de transicao "luzes coloridas" (light leaks / color flash overlay).
- [x] Extrair timestamps do audio para legenda (word/segment timing) - base implementada com `faster-whisper` no `migration/vizlec_runtime`.
- [x] Aplicar legenda estatica no video final (burned-in subtitles) - template default implementado (`subtitle-yellow-bold-bottom-v1`).
- [x] Selecionar musica de fundo + ajustar volume + persistir configuracao (base implementada no `migration/vizlec_runtime`).
- [x] Gerar video final respeitando mix de volume TTS + BGM (base implementada no `migration/vizlec_runtime`, com mixer `voice/music/master`).
- [x] Remover dependencia de `on-screen` do fluxo atual (legenda como texto principal em tela) no `vizlec_runtime`.

### MVP Frontend (fluxo minimo)

- [ ] Cadastro de canal -> videos -> roteiro (fase de migracao de dominio abaixo).
- [ ] Tela de roteiro com revisao de blocos:
  - [ ] unir blocos
  - [ ] separar bloco (criar novo bloco)
  - [ ] salvar alteracoes na base
- [ ] Acao por bloco para gerar/regerar prompt de imagem.
- [ ] Revisao por bloco do texto de TTS (separado do texto exibido em tela).
- [ ] Fluxo de audio/imagem/video baseado em legenda (sem exigir `on-screen`).
- [ ] Gerar audio via API de TTS por bloco/lote.
- [ ] Listar audios gerados e reproduzir no frontend.
- [ ] Revisao de audio gerado com marcação para regerar.
- [ ] Persistir estados de revisao (texto editado, flags de regerar, voice/params).

### MVP Backend/Timeline (fluxo minimo)

- [ ] Persistir "texto exibido" vs "texto narrado (TTS)" por bloco (campos separados e versionados).
- [x] Remover validacoes que bloqueiam o fluxo por ausencia de `on-screen` no `vizlec_runtime`.
- [ ] Persistir assets e metadados de audio por bloco (duracao real, status, revisao).
- [ ] Pipeline de legendas:
  - [x] gerar arquivo de timestamps (JSON + SRT) com `faster-whisper`
  - [x] gerar estilo de legenda fixa (template default `subtitle-yellow-bold-bottom-v1`)
  - [x] burn-in com ffmpeg (`ASS`)
  - [ ] expor configuracao/preview de templates de legenda no frontend
- [ ] Pipeline de musica de fundo:
  - [x] asset de BGM por video (path local persistido na `LessonVersion` do `vizlec_runtime`)
  - [x] ganho/volume configuravel
  - [x] mix final com TTS
- [ ] Render final via job persistido (retomavel), nao apenas script manual.
  - [x] Base funcional via `vizlec_runtime` (worker + jobs + persistencia)
  - [ ] Ajustes de progresso visual `x/y` no render cinematografico

### Criterios de aceite do MVP

- [ ] Um roteiro completo pode ser processado localmente ate video final.
- [ ] Usuario pode interromper e voltar depois sem perder revisoes (DB).
- [ ] Video final sai com: audio TTS, transicao, legenda estatica, musica de fundo.
- [x] Base funcional atingida no `vizlec_runtime` (faltando polimento/UX e migracao de dominio).
- [ ] Video final do MVP e gerado sem `on-screen` (titulos/bullets), usando legenda como camada principal.
- [ ] Fluxo principal roda sem depender de worker distribuido.

---

## Fase 1 (Concluida) - Segmentacao e manifesto

Status: `DONE`

Entregue:

- Segmentacao por `split_mode="topic"` (semelhança).
- Limite de 200 aplicado no TTS (`max_tts_chars`), nao no bloco visual.
- Parser ignora linhas de formatacao markdown isoladas (`#`, `---`, etc.).
- Manifesto com `source_text`, `source_span`, `tts_chunks`, `estimated_duration_sec`.

Arquivo-chave:

- `backend/script_pipeline.py`

---

## Fase 2 (Atual) - Motor de prompts LLM por bloco

Status: `IN_PROGRESS`

### 2.1 Arquitetura de camadas (otimizada)

Trocar pipeline 2+3+4 separado por uma unica chamada por bloco:

- Camada A (1x por projeto): extracao de estilo visual (VLM) -> `DNA_VISUAL.json` + `ANCORA_ESTETICA`.
- Camada B (Nx blocos): analise narrativo-emocional + arquetipos + ruptura em JSON unico.
- Camada C (Nx blocos): storyboard por bloco (4-8 cenas) + `prompt_imagem` final por cena.

### 2.2 Tarefas tecnicas

- [x] Criar `backend/llm/providers.py` (interface unica OpenAI-compatible).
- [x] Criar `backend/llm/router.py` (roteamento local vs cloud, fallback).
- [x] Criar `backend/llm/prompts.py` (templates versionados de prompts).
- [x] Criar `backend/llm/schemas.py` (JSON schema esperado por camada).
- [x] Criar `backend/llm/pipeline.py` (orquestracao A -> B -> C).
- [x] Persistir saidas em cache por hash de entrada (`backend/cache/*.json`).
- [x] Reprocessar apenas blocos alterados (por `block_codes` + hash de entrada por bloco).

### 2.2.1 Implementado ate agora

- Pacote `backend/llm/` criado com `providers.py`, `router.py`, `prompts.py`, `schemas.py`, `pipeline.py`.
- Orquestracao A -> B -> C integrada com fallback por etapa/modelo.
- Cache em arquivo por hash no diretorio `backend/cache/`.
- Reuso de resultado por hash (`input_hash`) para `analysis_json` e `storyboard_json`.
- Atualizacao de `video_blocks.analysis_json`, `video_blocks.storyboard_json` e `video_blocks.image_prompt`.
- Atualizacao de metadados de modelo/provider em `block_assets` (asset `image`).
- Job tracking para etapa `llm_analysis` em `pipeline_jobs`.
- Endpoint novo: `POST /api/videos/{video_id}/llm/prompts`.

### 2.3 Criterios de aceite

- [ ] Para 1 roteiro completo, gerar JSON final sem quebra de schema.
- [ ] Taxa de erro de parsing JSON < 2%.
- [x] Reexecucao parcial funcionando (bloco alterado nao invalida todos).

---

## Fase 3 - Strategia de modelos (RTX 3060 12GB)

Status: `TODO`

### 3.1 Alvos de modelo

Local (Ollama, 3060 12GB):

- Texto/JSON: `qwen2.5:7b` ou `llama3.1:8b`
- VLM local (alternativa): `llava` ou `qwen2-vl:7b` (se suportado no setup)

Cloud (fallback/qualidade):

- GitHub Models (`gpt-4o`/`gpt-4o-mini`) apenas quando necessario.

### 3.2 Politica recomendada

- Camada A (VLM estilo): cloud ou VLM local (1 chamada por projeto).
- Camada B (analise bloco): local por padrao.
- Camada C (storyboard): local por padrao, fallback cloud quando qualidade cair.

### 3.3 Tarefas tecnicas

- [ ] Implementar seletor de modelo por etapa (`requires_vision`, `requires_quality`).
- [ ] Implementar fallback automatico local -> cloud por tentativa.
- [ ] Implementar limite de taxa e fila de chamadas.
- [ ] Medir latencia media por bloco e custo/dia.

### 3.4 Criterios de aceite

- [ ] Pipeline completo roda com modelos locais.
- [ ] Fallback cloud aciona sem quebrar fluxo.
- [ ] Logs mostram modelo usado por bloco/etapa.

---

## Fase 4 - Gargalo de imagem (ComfyUI 2 img/min)

Status: `TODO`

Problema atual:

- 82 imagens -> ~41 minutos apenas para gerar imagem.

### 4.1 Estrategias obrigatorias

- [ ] Gerar imagem por "cena util", nao por bloco bruto quando houver redundancia.
- [ ] Reusar imagem quando blocos consecutivos mantem mesmo simbolo/ambiente.
- [ ] Cache por hash de prompt (`prompt_imagem + ancora + seed + checkpoint`).
- [ ] Permitir `variacao` (img2img leve) em vez de nova geracao full.
- [ ] Definir teto de imagens por minuto de video.

### 4.2 Estrategias recomendadas

- [ ] Selecionar 1 keyframe principal por unidade dramatica.
- [~] Preencher duracao com movimento (Ken Burns, crop, pan) no editor de video.
- [ ] Evitar gerar n imagens para texto linear sem mudanca visual real.

### 4.2.1 Base de movimento (implementada para testes manuais)

- `backend/effects.py` agora possui base de movimentos reutilizaveis:
  - Zooms (`A..D`, `G`, `H`) para exploracao
  - Pans (`E`, `F`) como base de movimento em cena
- Runner manual de comparacao em `backend/tests/manual_video/render_test_video.py`
- Assets locais de smoke test em `backend/tests/manual_video/assets/` para iteracao rapida


### 4.3 Criterios de aceite

- [ ] Reduzir pelo menos 30-50% do numero total de imagens por video.
- [ ] Tempo medio de geracao cair proporcionalmente.
- [ ] Qualidade narrativa visual mantida (validacao manual).

---

## Fase 5 - Integracao TTS e timeline final

Status: `IN_PROGRESS` (TTS + render + BGM + legenda base funcionando no `vizlec_runtime`)

### 5.1 Tarefas

- [ ] Integrar retorno real de duracao da API de TTS no manifesto.
- [ ] Mapear cenas -> chunks de audio -> timeline final.
- [x] Extrair timestamps de audio para legenda (JSON + SRT) com `faster-whisper` no `vizlec_runtime`.
- [x] Burn-in de legenda estatica no render final (ASS -> ffmpeg) no `vizlec_runtime`.
- [x] Mixar musica de fundo com TTS (ganho configuravel por video) no `vizlec_runtime`.
- [x] Mixer de preview no frontend (voice/music/master) com persistencia de ganhos no `vizlec_runtime`.
- [ ] Garantir fidelidade final preview vs render (diferença residual WebAudio vs ffmpeg/AAC sob controle e validada).
- [ ] Reintroduzir `on-screen` como recurso opcional por tipo de video (ex.: educativo usa bullets; narrativo usa apenas legenda).
- [~] Definir regra de transicao por NIV/intensidade.
- [ ] Inserir overlays/transicoes somente em cortes de maior impacto.

### 5.5 Migracao de dominio (course/module/lesson -> channel/video)

Status: `IN_PROGRESS`

- [x] Frontend principal (`App` + `Editor`) consumindo aliases `channel/section/video/video-versions`
- [x] API aliases HTTP `channel/section/video/video-versions`
- [x] Enriquecimento de payloads HTTP/WS/SSE com aliases canonicos + reescrita de urls/paths
- [x] Swagger/OpenAPI tags/metadata alinhados ao dominio novo
- [x] Prisma Pass 1 (`@@map` explicito nas tabelas legadas)
- [x] Prisma Pass 2 (models Prisma `Channel/Section/Video/VideoVersion` com tabelas legadas preservadas via `@@map`)
  - [~] Prisma Pass 3 (renomeio semantico de relation/scalar fields) - em progresso por etapas para reduzir blast radius
  - [x] Relation fields Prisma migrados para nomes canonicos (`sections/videos/videoVersions/video`, `videoVersion`)
  - [x] API/worker adaptados aos novos relation fields do Prisma client (sem alterar colunas/tabelas fisicas)
  - [~] FKs escalares canônicos com `@map` em progresso
    - [x] `Section.courseId -> channelId @map("courseId")`
    - [x] `Video.moduleId -> sectionId @map("moduleId")`
    - [x] `VideoVersion.lessonId -> videoId @map("lessonId")`
    - [x] `Block.lessonVersionId -> videoVersionId @map("lessonVersionId")`
    - [x] `Job.lessonVersionId -> videoVersionId @map("lessonVersionId")`
    - [x] `Notification.lessonId/lessonVersionId -> videoId/videoVersionId @map(...)`
  - [x] API/worker recompilados apos migracao dos FKs escalares de `Block/Job` (Prisma client regenerado + `typecheck`)
  - [ ] Planejar/roteirizar renomeio fisico de tabelas/colunas no SQLite (fase posterior, sem `@@map`)
- [x] Storage root canonico `channels` com fallback `courses`
- [x] Script de migracao de storage `courses -> channels` (`dry-run|copy|move|force`)
- [x] `packages/shared`: helpers de storage canonicos (`channel/section/video`)
- [x] `packages/shared`: helpers de alias de dominio extraidos (`domain-alias`)
- [x] `packages/shared`: contratos de dominio/base (`domain-contracts`)
- [x] `packages/shared`: contrato interno `/internal/jobs/event`
- [x] `packages/shared`: contrato interno `/internal/inventory/delta`
- [x] `packages/shared`: contrato interno `/internal/inventory/snapshot` + `assetRefs`
- [x] `packages/shared`: catalogo compartilhado de comandos do agent-control (`WorkerAgentCommandName`)
- [x] `packages/shared`: tipos do protocolo `agent-control` (request/response/ack)
- [x] `packages/shared`: `AgentIntegrationConfig` compartilhado (API/worker)
- [x] `packages/shared`: constantes de eventos WS/SSE (`WS_EVENT`, `JOB_STREAM_EVENT`)
- [x] Frontend (`apps/web`) com constantes locais de eventos WS/SSE (reduzindo strings soltas)
- [x] Frontend (`apps/web`) com helper local para parsing tipado de `vizlec:ws` (`readVizlecWsDetail`)
- [x] Worker/API usando contratos compartilhados para endpoints internos acima

### 5.1.1 Base de transicoes (parcial implementada)

- Transicao zoom in/out de referencia (`T6_inertial_ref`) implementada em `backend/effects.py`
  - blur de borda (edge-only) na entrada
  - envelope de entrada/saida com timing por frames (15f blur / ~46f in-out)
- Transicoes entre imagens (`xfade`) com aliases explicitos:
  - `fade`
  - `flash_white` (`fadewhite`)
  - `flash_black` (`fadeblack`)
- Transicao premium em teste manual (sem ghosting A+B):
  - `XF3_flash_white_occluded_5f` (custom `filter_complex`, centrada no corte, 5 frames)
  - `XF3b_flash_white_occluded_6f` (custom `filter_complex`, centrada no corte, 6 frames)
  - `XF3b_flash_black_occluded_6f` (mesma logica da `XF3b` white, mudando apenas a cor)
  - Observacao validada em teste visual: envelope percebido proximo de `1 opacidade -> 3 frames de flash -> 1 opacidade`
- Comparacao manual suportada no runner:
  - `--transition T6`
  - `--xfade flash_white|flash_black|fade`
  - `--xfade all_flash_premium` (compara variantes premium white)
  - `--xfade all_flash_premium_wb` (compara premium white vs black)

### 5.2 Criterios de aceite

- [ ] Timeline final sem gaps de audio/video.
- [ ] Duracao total bate com soma de audios (+ transicoes).
- [~] Legendas sincronizadas com audio (erro visual aceitavel) - base com `faster-whisper` + agrupamento de cues implementada; falta validacao em mais videos/templates.
- [ ] Mix TTS + musica respeita volumes configurados.
- [ ] Video final reproduzivel de ponta a ponta sem ajuste manual.

---

## Fase 6 - Qualidade, observabilidade e operacao

Status: `TODO`

### 6.1 Tarefas

- [ ] Padronizar logs estruturados por `project_id`.
- [ ] Criar relatorio final por execucao (tempo, modelos, imgs geradas, erros).
- [ ] Definir "modo rapido" e "modo qualidade".
- [x] Base de `modo rapido/qualidade` no render cinematografico (`VIZLEC_CINEMATIC_RENDER_MODE`, NVENC/supersample/fps via env) no `vizlec_runtime`.
- [ ] Adicionar testes de regressao para parser/segmentador/esquemas JSON.
- [ ] Corrigir progresso visual `x/y` do `concat_video` no `vizlec_runtime` (render cinematografico) para nao depender de `clip_mp4` legado e avançar durante o render final.

### 6.2 Criterios de aceite

- [ ] Reproducao consistente entre execucoes.
- [ ] Falhas recuperaveis sem perder progresso.
- [ ] Operacao simples no fluxo local.

---

## Ordem de implementacao (pratica)

1. Migrar dominio completo no `vizlec_runtime` (`course/module/lesson` -> `channel/video`) sem "lembrancas" do modelo antigo na UX/API externa.
2. Fechar MVP local-first no dominio novo (revisao por bloco + render final com legenda/BGM).
3. Finalizar criterios de aceite da Fase 2 (LLM por bloco com metricas reais).
4. Consolidar Fase 5 (timeline final automatica integrada ao backend/API).
5. Atacar Fase 4 (reducao de imagens, maior ganho de tempo).
6. Fechar Fase 3/6 de operacao (fila/rate-limit/logs/observabilidade).

---

## Reaproveitamento do projeto `vizlec` (analise inicial)

Status: `ANALISADO (alto potencial de reaproveitamento)`

Objetivo desta analise:

- Reaproveitar frontend e fluxo de revisao de blocos/audio ja maduros.
- Adaptar dominio de `course -> module -> lesson` para `channel -> video`.
- Manter foco local-first (sem exigir worker distribuido no MVP).

### O que ja existe no `vizlec` e pode ser reaproveitado

- Frontend avancado de gestao e editor de blocos (`apps/web/src/components/Editor.tsx`):
  - revisao de blocos
  - edicao de `ttsText` separado do texto original
  - player/lista de audios
  - fluxo de review de audio com marcacao para regerar
  - edicao de prompt de imagem por bloco
  - monitoramento de jobs e estados de geracao
- API Fastify madura (`apps/api/src/index.ts`) com endpoints para:
  - segmentacao de blocos
  - TTS por bloco/lote
  - imagem por bloco/lote
  - assets por bloco (audio/imagem)
  - jobs e eventos websocket
- Schema Prisma rico (`packages/db/prisma/schema.prisma`) com entidades reutilizaveis:
  - `LessonVersion`, `Block`, `Asset`, `Job`
  - campos relevantes ja existentes: `sourceText`, `ttsText`, `audioDurationS`, `imagePromptJson`

### O que precisa adaptar (vizlec -> video-automation)

- Dominio:
  - `Course` -> `Channel`
  - `Module` -> remover do dominio (avaliar extincao completa) ou camada tecnica interna temporaria sem exposicao
  - `Lesson`/`LessonVersion` -> `Video`/`VideoVersion`
  - eliminar nomenclatura legacy da UX/API externa (sem aliases permanentes)
- Fluxo visual:
  - manter melhorias cinematicas daqui (`effects.py`, `transitions.py`, ffmpeg pipeline)
  - substituir render "slide/aula" do vizlec pela pipeline de video cinematografico deste projeto
- Infra:
  - manter local-first no MVP
  - worker distribuido/websocket do vizlec vira opcional (nao prioridade)

### Estrategia de migracao recomendada (pratica)

- [x] Clonar/copiar `G:\\tool\\vizlec` para pasta segura em `migration/vizlec_runtime` (sem mexer no original).
- [x] Trazer primeiro o "kernel" funcional do `vizlec` (auth/workspace + blocos/assets/jobs + editor), mesmo com dominio antigo temporariamente.
- [~] Rodar o kernel reutilizado localmente (sem focar em worker distribuido no MVP).
  - [x] `@vizlec/api` da copia sobe localmente (porta `4110`) com `/health` respondendo.
  - [x] `@vizlec/web` da copia sobe localmente (porta `4273`) com Vite.
  - [ ] Validar fluxo funcional pela UI (login/workspace/curso/aula) dentro da copia.
- [ ] Extrair mapa de componentes reutilizaveis do frontend (`Editor`, players, review de audio, job UI).
- [ ] Extrair contrato minimo de API para o MVP local (`channel/video/blocks/audio/image/render`).
- [ ] Implementar migracao de dominio em duas etapas:
  - [ ] Etapa A: renomeacao de UX/API externa (`channel/video`) mantendo compatibilidade interna temporaria.
  - [ ] Etapa B: refactor de entidades Prisma/API/worker para remover referencias `course/module/lesson`.
- [ ] Recontextualizar frontend/rotas para `channel -> video` (com remocao de termos legacy na UI).
- [ ] Decidir abordagem:
  - [ ] A) portar frontend do vizlec para este backend
  - [ ] B) portar partes do backend vizlec (schema/API) para este projeto
  - [ ] C) hibrido (recomendado): reaproveitar UI/UX do vizlec + manter motor ffmpeg/transicoes daqui

### Decisao arquitetural atual (MVP)

- Foco em validar estrutura e fluxo local.
- Nao priorizar agora distribuicao/control plane/worker instalado.
- Nao perder o ganho visual deste projeto (transicoes, motion, edicao automatizada cinematografica).
- Manter base de usuarios/autenticacao/multitenancy do `vizlec` (ja funciona e nao precisa ser simplificada).
- "Local-first" significa execucao local do processamento, nao remocao de auth/workspace.
- Legenda sera a camada padrao de texto em tela no MVP.
- `on-screen` (titulos/bullets) fica fora do MVP e podera voltar depois como recurso opcional.
- No `vizlec_runtime`, o render final cinematografico (bridge Python + ffmpeg) ja esta integrado, mas o progresso de UI (`x/y`) ainda precisa de ajuste fino para refletir corretamente o avanço por bloco durante `concat_video`.
- A proxima fase prioritaria passa a ser **migracao de dominio completa** para `channel/video`, com reavaliacao das entidades de curso/modulo/licao e remocao de exposicao desses termos no produto final.

---

## Fase 5.5 - Migracao de dominio (`course/module/lesson` -> `channel/video`)

Status: `IN_PROGRESS`

Objetivo:
- trocar o contexto do produto sem "herdar" nomenclatura antiga na UX/API externa
- reavaliar entidades antigas e eliminar o que nao faz sentido para videos de canal

### 5.5.1 Principios

- [ ] Nao manter aliases permanentes de dominio antigo no frontend.
- [~] API externa deve expor `channel/video` como linguagem oficial.
- [ ] Entidades legacy podem existir temporariamente em camada interna apenas durante migracao.
- [ ] Revisar cada entidade ligada a `Course/Module/Lesson` e decidir: renomear, fundir, eliminar.

### 5.5.2 Revisao de entidades (obrigatoria)

- [ ] `Course` -> `Channel` (renomeacao semantica)
- [ ] `Module` -> avaliar remocao do dominio (camada intermediaria de aula nao e necessaria no produto atual)
- [ ] `Lesson` -> `Video`
- [ ] `LessonVersion` -> `VideoVersion`
- [ ] `Block` -> manter (continua valido)
- [ ] `Asset` -> manter (continua valido; revisar `kind` comments legados)
- [ ] `Job` -> manter (revisar `scope/type` comments legados)
- [ ] `Notification` -> revisar textos de contexto (`Course/Module/Lesson`)

### 5.5.3 Plano tecnico (sequencia)

- [~] Frontend: trocar labels, rotas, componentes e textos de UI para `channel/video`.
  - [x] Fluxo principal (`App` + `Editor`) consumindo aliases `channel/video`.
  - [x] Chamadas HTTP do frontend ativo (dashboard/importador/module-editor/links de video) migradas para aliases `channel/video`.
  - [x] Labels principais (`sidebar`, `header`, `dashboard`, fluxo de edicao) ajustados.
  - [ ] Limpeza de labels/telas secundarias.
- [~] API: expor rotas `channel/video` e eventos com naming novo.
  - [x] Aliases principais `channels/sections/videos/video-versions` implementados.
  - [~] Respostas JSON dos aliases enriquecidas com campos de dominio novo em paralelo aos legados.
  - [~] Payloads/listas aninhadas com aliases plurais (`modules->sections`, `lessons->videos`, `courses->channels`, `lessonVersions->videoVersions`) para build-status e respostas compostas.
  - [~] Campos `url/path` em respostas JSON dos aliases reescritos para rotas `channel/video` quando vierem de payload legacy.
  - [~] Eventos/ws payloads com aliases de dominio novo (`channelId/sectionId/videoId/videoVersionId`, `domainEntity`) em paralelo aos campos legacy.
  - [~] SSE de jobs (`/jobs/:jobId/stream`) enriquecido com aliases de dominio novo e reescrita de URLs/paths.
  - [~] Docs/contratos auxiliares (inventario de execucao de endpoints) com aliases `channel/video`.
  - [~] Swagger/OpenAPI (metadata/tags principais) alinhado para `Channels/Sections/Videos` na superficie da API.
  - [~] Normalizacao automatica de tags legacy (`Courses/Modules/Lessons`) para `Channels/Sections/Videos` em schemas de rota (OpenAPI).
  - [ ] Schemas auxiliares e contratos restantes com naming novo.
- [ ] Worker/API shared contracts: renomear comandos/event payloads com dominio novo.
  - [x] `packages/shared/src/storage.ts` agora expõe helpers canônicos (`channel/section/video/videoVersion`) mantendo helpers legacy como wrappers para compatibilidade.
  - [x] Helpers de alias de dominio (payloads/URLs para `channel/video`) extraidos para `packages/shared/src/domain-alias.ts` e reutilizados pela API.
  - [x] Tipos/utilitarios compartilhados de dominio iniciados em `packages/shared/src/domain-contracts.ts` (mapeamento de entidades legacy -> canônicas).
  - [~] Revisar contratos/event payloads tipados restantes em `packages/shared` para alias de dominio novo (além de storage).
    - [x] Worker snapshot asset refs passaram a carregar aliases canônicos (`channelId/sectionId/videoId/videoVersionId`) via helper compartilhado.
    - [x] Logs/eventos do worker (`logJobEvent`/`logWorkerAction`) agora aplicam helper compartilhado de alias de domínio quando payloads trazem IDs camelCase legacy.
    - [x] Contrato interno `/internal/jobs/event` tipado em `packages/shared/src/internal-jobs.ts` e reutilizado por API + worker (lifecycle/phase/progressPercent).
    - [x] Contrato interno `/internal/inventory/delta` tipado em `packages/shared/src/internal-inventory.ts` e reutilizado por API + worker (delta + normalização).
- [~] Prisma/schema: migrar entidades/relacoes e comments de dominio.
  - [x] Inventario estrutural de migracao (entidades, hotspots de query, storage, estrategia) documentado em `migration/vizlec_runtime/docs/domain-schema-migration-inventory.md`.
  - [x] Definir estrategia Prisma da transicao (`@map/@@map` primeiro) e executar primeira passada segura (`@@map` explicito nas tabelas de dominio/reuso) em `migration/vizlec_runtime/packages/db/prisma/schema.prisma`.
  - [x] Segunda passada Prisma: models Prisma/client renomeados para `Channel/Section/Video/VideoVersion` com `@@map` preservando tabelas fisicas legacy; API/worker refatorados para `prisma.channel/section/video/videoVersion`.
  - [x] Prisma Pass 2.x (baixo risco): `Notification` migrou para campos canônicos no Prisma client (`videoId/videoVersionId`) com `@map("lessonId"/"lessonVersionId")`, mantendo colunas físicas legadas e ajustando API.
  - [~] Terceira passada Prisma: revisar/renomear relation field names e comments legados (`courses/modules/lessons/lessonVersions`, `courseId/moduleId/lessonId`) sem quebrar compatibilidade.
    - [x] Relation fields Prisma migrados para nomes canônicos (`sections/videos/videoVersions/video`, `videoVersion`)
    - [x] FKs escalares canônicos com `@map` concluídos em `Section/Video/VideoVersion/Block/Job/Notification`
    - [x] API/worker recompilados após migração dos FKs escalares (`prisma generate` + `typecheck`)
    - [x] Renomeio físico SQLite executado (`Course/Module/Lesson/LessonVersion` -> `Channel/Section/Video/VideoVersion` e colunas FK correspondentes)
    - [x] `schema.prisma` alinhado após renomeio físico (remoção de `@@map/@map` nos modelos/colunas centrais do domínio)
    - [ ] Limpeza final de comments/enum docs legados (`scope/type` descriptions e comentários ainda citando lesson/module)
- [~] Storage paths: avaliar migracao de `data/courses/...` para `data/channels/...`.
  - [x] Root canônico configurável (`VIZLEC_STORAGE_DOMAIN_ROOT=channels`) com fallback automático para `courses`.
  - [x] Script de migracao (`dry-run/copy/move`) criado em `migration/vizlec_runtime/scripts/migrate-storage-domain-root.cjs` + scripts `pnpm storage:migrate:*`.
  - [~] Executar migracao de dados/paths persistidos em ambiente validado e remover fallback legado.
    - [x] Script de renomeio físico de domínio no SQLite (draft executável `dry-run/apply`) em `migration/vizlec_runtime/scripts/prisma-domain-physical-rename-sqlite.cjs`
    - [x] `dry-run` validado na base local (`vizlec.db`)
    - [x] `apply` executado na base local (`vizlec.db`) com backup automático
    - [ ] Remover fallback legado `courses` após validação de leitura/escrita em `channels`
- [~] Script de migracao de dados legacy -> novo dominio (quando schema mudar).
  - [x] Script de renomeio fisico de dominio no SQLite (draft executavel `dry-run/apply`) em `migration/vizlec_runtime/scripts/prisma-domain-physical-rename-sqlite.cjs`
  - [x] `dry-run` validado na base local (`vizlec.db`)
  - [x] `apply` executado na base local (`vizlec.db`)

### 5.5.4 Criterios de aceite

- [ ] Usuario nao ve termos `course/module/lesson` na UX principal.
- [ ] Fluxo completo roda em `channel/video` com blocos/TTS/imagem/render/legenda/BGM.
- [ ] Dados antigos podem ser migrados ou lidos de forma controlada.
- [ ] Nenhum bloco critico do pipeline depende semanticamente de `module` para funcionar.

---

## Decisoes tecnicas ja tomadas

- Segmentacao visual por semelhanca e contexto.
- Limite de 200 chars apenas no TTS.
- Front separado (`frontend/`) e backend separado (`backend/`).
- Hot-reload no backend via `watchfiles`.
- MVP local-first antes de retomar arquitetura distribuida.
- Reaproveitamento do `vizlec` sera guiado por compatibilidade de dominio e qualidade de UX do editor de blocos.
- Auth + multitenancy existentes no `vizlec` serao preservados como base da nova ferramenta.
