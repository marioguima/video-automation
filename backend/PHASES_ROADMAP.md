# Roadmap por Fases (Execucao)

Baseado na conversa em `chat.md` e no estado atual do projeto.

## Objetivo do produto

1. Dividir roteiro em blocos por semelhanca (contexto narrativo).
2. Gerar prompts de imagem por bloco via LLM.
3. Gerar audio por bloco/chunk via API de TTS.
4. Montar video final com timing correto, transicoes e coesao visual.

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

Status: `TODO` (TTS base ja resolvido, falta acoplamento final robusto)

### 5.1 Tarefas

- [ ] Integrar retorno real de duracao da API de TTS no manifesto.
- [ ] Mapear cenas -> chunks de audio -> timeline final.
- [~] Definir regra de transicao por NIV/intensidade.
- [ ] Inserir overlays/transicoes somente em cortes de maior impacto.

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
- [ ] Video final reproduzivel de ponta a ponta sem ajuste manual.

---

## Fase 6 - Qualidade, observabilidade e operacao

Status: `TODO`

### 6.1 Tarefas

- [ ] Padronizar logs estruturados por `project_id`.
- [ ] Criar relatorio final por execucao (tempo, modelos, imgs geradas, erros).
- [ ] Definir "modo rapido" e "modo qualidade".
- [ ] Adicionar testes de regressao para parser/segmentador/esquemas JSON.

### 6.2 Criterios de aceite

- [ ] Reproducao consistente entre execucoes.
- [ ] Falhas recuperaveis sem perder progresso.
- [ ] Operacao simples no fluxo local.

---

## Ordem de implementacao (pratica)

1. Finalizar Fase 2 (motor LLM por bloco + schemas + cache).
2. Implementar Fase 3 (router local/cloud).
3. Atacar Fase 4 (reducao de imagens, maior ganho de tempo).
4. Consolidar Fase 5 (timeline final automatica).
5. Fechar Fase 6 (robustez e manutencao).

---

## Decisoes tecnicas ja tomadas

- Segmentacao visual por semelhanca e contexto.
- Limite de 200 chars apenas no TTS.
- Front separado (`frontend/`) e backend separado (`backend/`).
- Hot-reload no backend via `watchfiles`.
