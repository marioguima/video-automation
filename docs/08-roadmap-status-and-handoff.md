# FlowShopy Roadmap, Status and Handoff

Ultima atualizacao: 2026-05-02

## Estado real atual

Nota importante de produto:

- a conversa de 2026-04-30 revisou o conceito de projeto;
- existem dois elementos centrais: conteudos e projetos;
- conteudo pode ser iniciado rapidamente e reutilizado, mas so ganha fluxo/impacto quando associado a projeto;
- projeto nao deve comecar por tipo/contexto como curso, canal, campanha ou musica; ele e um agrupador editorial/comercial com destinations e formatos padrao;
- nao existe mais fluxo separado de "criacao de cursos"; curso deve ser tratado como projeto;
- FlowShopy deve evoluir como maquina de atencao para promocao de produtos/ofertas/eventos, usando short links redirecionaveis.
- a tela `Content` deve ser voltada para producao do conteudo/roteiro com apoio de IA; canais e formatos pertencem ao projeto.
- a tela `Content` nao deve pedir tipo de midia na criacao; o conteudo e generico e entregaveis sao definidos no projeto/variant.
- a tela `Content` nao deve gerar cenas, abrir editor de video ou iniciar render; segmentacao/render pertencem ao projeto/variant.
- CTAs e linguagem de interacao devem poder variar por canal; blocos comuns devem ser reaproveitados quando possivel.

Implementado:

- monorepo VizLec trazido para `G:\tool\video-automation`;
- `ContentProject` e `ContentItem` no banco/API; na UX, `ContentProject` e exibido como `Project`;
- endpoints basicos de conteudo;
- tela `Projects`;
- backing tecnico invisivel usando Course/Module/Lesson;
- gerar blocos a partir de ContentItem ainda existe tecnicamente no backend, mas a UI de Content nao deve expor isso fora do contexto de projeto/variant;
- abrir editor a partir de ContentItem ainda existe tecnicamente no backend/projeto, mas nao deve ser acao da listagem/cadastro de Content;
- Gemini nas settings;
- worker usando Gemini quando selecionado;
- teste integrado COPE.
- tela Projects com grade visual de projetos, cadastro separado e detalhe com Contents, Feed, Kanban e Agenda;
- projeto nao possui `kind`; canal, perfil, curso, musica e campanha foram removidos do contrato de projeto e ficam como contexto, destinations ou entregaveis;
- area `Content` criada na sidebar com listagem de conteudos e tela separada de cadastro; cadastro prioriza producao de conteudo/roteiro com prompt IA opcional, permite associar apenas a projeto existente e nao exibe tipo de midia antes do conteudo;
- area `Content` nao deve exibir `Generate Scenes`, `Open Editor` ou qualquer acao de renderizacao;
- detalhe de `Projects` nao cria conteudo; ele lista conteudos associados e permite seguir com geracao de entregavel;
- area `Content` deve listar todos os conteudos ja criados, com filtros por nome/data/projeto/destination, modos grade/lista e acesso ao formulario de edicao;
- area `Content` deve ter foco visual no conteudo; projeto aparece apenas como uso/associacao secundaria;
- V1 bloqueia edicao de conteudo apenas quando algum projeto ja iniciou criacao/geracao de entregavel com base nele; simples associacao a projeto nao bloqueia edicao; versionamento de conteudo usado fica para fase futura;
- metadados operacionais por ContentItem: destinos, aspect ratios, stage, owner e data planejada;
- endpoint `PATCH /content-items/:itemId` para atualizar status/metadados preservando backing tecnico;
- inventario de endpoints atualizado em `docs/10-api-endpoint-inventory.md`.
- `animationPromptJson` persistido em `Block`;
- prompt de animacao gerado pela segmentacao/LLM ou fallback;
- prompt de animacao editavel no editor;
- endpoint `PATCH /blocks/:blockId` aceita `animationPrompt`.
- `directionNotesJson` persistido/editavel em `Block`;
- `soundEffectPromptJson` persistido/editavel em `Block` como reserva para geracao futura;
- invalidador basico de assets no `PATCH /blocks/:blockId` para texto, prompts e sound effect.
- decisao: XTTS e o provider TTS ja integrado no worker; Chatterbox, Qwen, ElevenLabs, Fish Speech, F5-TTS, GPT-SoVITS e outros ficam como sugestoes/rotas futuras;
- decisao: limites de fala devem ser configurados antes da segmentacao, por idioma/provider, para evitar blocos que degradam a qualidade do TTS.
- Settings TTS agora salva providers, linguas atendidas por provider, rota por lingua e orcamento inicial de fala (`targetChars`, `maxChars`, `targetSpeechSeconds`, `maxSpeechSeconds`).
- decisao: nao existe TTS ativo global; projeto escolhe a rota TTS que vai usar.
- decisao: nao existe provider ativo global para imagem/video; projeto escolhe modelo de imagem e modelo de video opcional.
- decisao: uma lingua so pode aparecer em uma rota TTS do catalogo para evitar ambiguidade na geracao de fala.
- decisao: troca de voz por amostra entra no roadmap como pos-processamento de videos com fala nativa ou vozes inconsistentes.
- decisao: segmentacao deve receber um `SpeechBudget`; quando a fala vier do TTS, usar limites da rota TTS; quando vier do motor de video com audio nativo, usar limites do provider/modelo de video.
- decisao: geracao de imagem/video deve evoluir para providers configuraveis por capacidade; ComfyUI e o provider de imagem atual, e a extensao Veo deve entrar como provider `veo_extension`.
- Settings Visual agora cataloga providers/modelos de imagem e video; projeto escolhe modelo de imagem e modelo de video opcional.

Nao implementado ainda:

- segmentacao LLM efetiva usando `buildSegmentationPrompt`;
- orcamento de fala consumido pelo segmentador;
- validacao de projeto/variant com TTS exigido e lingua sem rota TTS configurada;
- worker ainda nao consome a escolha visual do projeto em `metadata.visualGeneration`;
- adaptador da extensao Veo para pedir imagem/video, acompanhar status e importar resultado;
- render de cena animada usando provider configurado;
- troca de voz por amostra (`voice_replacement`);
- separacao/alinhamento de audio para substituir voz preservando fundo;
- Variant como entidade dedicada;
- Variant render plan, CTA por canal e render por blocos/cache;
- versionamento de ContentItem usado em entregaveis;
- ContentSource;
- biblioteca de conteudos reutilizaveis independente de projeto;
- associacao muitos-para-muitos entre conteudo e projetos;
- DeliveryChannel/formatos permitidos por canal;
- PromotionTarget;
- ShortLink redirecionavel;
- publicacao social;
- Stripe;
- animacao de imagem.

## Credencial local de dev

```text
email: marioguimaraes@vizlec.com
senha: TempPass123!
```

## Portas usadas

```text
web:    http://127.0.0.1:4273/
api:    http://127.0.0.1:4110
worker: http://127.0.0.1:4111
```

Frontend env:

```text
apps/web/.env.local
VITE_API_BASE=http://127.0.0.1:4110
```

## Validacoes realizadas

- `pnpm verify:critical`
- `pnpm --filter @vizlec/api typecheck`
- `pnpm --filter @vizlec/web typecheck`
- `pnpm --filter @vizlec/worker typecheck`
- `pnpm --filter @vizlec/web build`
- `pnpm --filter @vizlec/api run test:one -- test/content-cope-flow.test.ts`
- `pnpm --filter @vizlec/api run test:one -- test/content-cope-flow.test.ts test/endpoint-ownership-inventory.test.ts`

## Arquivos de implementacao relevantes

```text
apps/web/src/components/ContentProjects.tsx
apps/web/src/App.tsx
apps/web/src/components/Sidebar.tsx
apps/api/src/index.ts
apps/worker/src/index.ts
packages/db/prisma/schema.prisma
packages/db/prisma/migrations/20260430143000_add_block_animation_prompt/migration.sql
packages/db/prisma/migrations/20260430165000_add_block_scene_notes_and_sound_effect/migration.sql
packages/db/prisma/migrations/20260501002000_remove_content_project_kind/migration.sql
packages/shared/src/segmenter.ts
packages/shared/src/gemini.ts
apps/api/test/content-cope-flow.test.ts
```

## Roadmap

### Fase 1 - Projects workspace

Objetivo: transformar a tela `Projects` em workspace operacional onde projeto e o agrupador e conteudos vivem dentro dele.

Itens:

- [x] grade visual de projetos;
- [x] cadastro separado de projeto;
- [x] detalhe do projeto;
- [x] Contents;
- [x] Feed visual;
- [x] Kanban;
- [x] Agenda;
- [x] plataformas/destinos;
- [x] aspect ratios;
- [x] campos metadata para status, prazos e responsavel.

Aceite:

- [x] criar projeto em tela separada;
- [x] abrir projeto a partir da grade;
- [x] escolher plataformas;
- [x] escolher aspect ratios;
- [x] criar conteudo generico;
- [x] gerar blocos dentro do workspace de projeto;
- [x] abrir editor dentro do workspace de projeto;
- [x] ver Feed;
- [x] ver Kanban;
- [x] ver Agenda;
- [x] typecheck web passa;
- [x] teste COPE API continua passando.

Observacao: Fase 1 esta implementada como MVP funcional usando `ContentItem.metadataJson`. Projeto nao e canal/perfil/pagina; esses sao destinos do conteudo. Feed usa placeholder visual quando nao ha thumbnail/asset. Kanban altera stage via `PATCH /content-items/:itemId`. Agenda usa `plannedPublishAt` e `ownerName` em metadata.

### Fase 2 - Scene completa

Objetivo: enriquecer blocos/cenas e fazer a segmentacao respeitar orcamento de fala.

Itens:

- [x] separar texto narrado, texto em tela e notas;
- [x] adicionar `animationPromptJson`;
- [x] editar prompt de animacao;
- [x] reservar sound effect;
- [x] invalidacao granular basica.
- [ ] `SpeechBudget` resolvido antes da segmentacao;
- [ ] segmentacao deterministica usando `maxChars` configurado;
- [ ] segmentacao LLM usando `buildSegmentationPrompt` com `SpeechBudget`;
- [ ] validacao deterministicamente bloqueando blocos acima do limite de fala;
- [ ] aviso/bloqueio quando a lingua do projeto/variant nao tiver rota TTS e o modo exigir TTS.

Aceite parcial concluido:

- [x] `Block.animationPromptJson` existe no schema e migration;
- [x] segmentacao LLM pede `animation_prompt`;
- [x] fallback deterministic gera prompt de animacao;
- [x] worker persiste `animationPromptJson`;
- [x] editor carrega/salva prompt de animacao;
- [x] `PATCH /blocks/:blockId` aceita `animationPrompt`;
- [x] teste COPE cobre persistencia do prompt de animacao.
- [x] `PATCH /blocks/:blockId` aceita `directionNotes` e `soundEffectPrompt`;
- [x] editor carrega/salva notas de direcao e prompt de sound effect;
- [x] mudancas de bloco invalidam assets derivados existentes;
- [x] teste COPE cobre persistencia de notas e sound effect.

### Fase 3 - Variantes

Objetivo: mesmo conteudo gerar multiplas saidas.

Itens:

- entidade/contrato Variant;
- destinos por ContentItem;
- aspect ratios por Variant;
- assets por Variant;
- variante curta por LLM.

### Fase 4 - Fontes

Objetivo: ajudar a chegar ao roteiro.

Itens:

- ContentSource;
- ideia -> roteiro;
- links -> transcricao/analise;
- pesquisa Gemini video;
- estrategia download/transcricao/VLM.

### Fase 5 - Animacao e efeitos

Objetivo: imagem estatica virar cena animada e habilitar provider de video configuravel.

Itens:

- settings `visualGeneration` para imagem/video;
- selecao de provider/modelo visual por projeto;
- provider `veo_extension` para comunicacao com a extensao externa;
- provider `comfyui` como motor local/futuro para video quando houver workflow adequado;
- provider `vertex_veo` opcional/futuro para API oficial;
- `SpeechBudget` para fala nativa de video, separado do TTS;
- job `image_animation`;
- provider imagem-para-video;
- provider texto-para-video;
- substituicao de voz por amostra para videos ja gerados;
- source separation/alinhamento para preservar musica/efeitos ao trocar voz;
- efeitos/transicoes;
- sound effects.

### Fase 6 - Publicacao e billing

Objetivo: fechar automacao e monetizacao.

Itens:

- YouTube;
- TikTok;
- Instagram/Facebook;
- captions;
- agendamento;
- Stripe;
- planos.

## Proxima tarefa recomendada

Antes de continuar implementacao pesada de render/publicacao, fechar o contrato de TTS por lingua e fazer a segmentacao respeitar limites de fala.

Prioridade:

1. criar helper `SpeechBudget` e resolver budget atual via settings TTS/idioma;
2. fazer `buildDeterministicBlocks`/segmentacao usar limite configurado em vez de `200` fixo;
3. ligar `buildSegmentationPrompt` ao fluxo real, passando orcamento de fala e validando retorno;
4. bloquear/avisar quando projeto/variant exige TTS e a lingua nao possui rota TTS configurada;
5. fazer worker consumir `metadata.visualGeneration.image` na geracao de imagem;
6. tratar limite separado para fala nativa de provider de video, como duracoes aceitas pelo modelo;
7. adicionar adaptador `veo_extension` para imagem/video como objetivo central do pipeline;
8. modelar troca de voz por amostra como pipeline separado de pos-processamento;
9. testar Content -> produzir roteiro -> associar projeto -> salvar, sem gerar cenas;
10. testar Projects -> abrir projeto com conteudo associado -> gerar cenas -> editor;
11. conectar bloco de prompt IA ao provider LLM selecionado;
12. modelar biblioteca de conteudos reutilizaveis e associacao muitos-para-muitos conteudo-projeto;
13. modelar canais de entrega e formatos permitidos como contrato dedicado no projeto/variant;
14. modelar PromotionTarget e ShortLink como entidades futuras;
15. manter fluxo/telas de cursos intactos ate decisao explicita de migracao.

## Checklist antes de finalizar proxima tarefa

- [x] atualizar docs afetadas;
- [x] typecheck web;
- [x] typecheck API se tocar backend;
- [x] typecheck API;
- [x] teste COPE se tocar contratos;
- [x] teste de inventario de endpoints;
- [ ] validar login/Projects manualmente;
- [x] atualizar este arquivo.
