# FlowShopy Roadmap, Status and Handoff

Ultima atualizacao: 2026-05-01

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

Nao implementado ainda:

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

Objetivo: enriquecer blocos/cenas.

Itens:

- [x] separar texto narrado, texto em tela e notas;
- [x] adicionar `animationPromptJson`;
- [x] editar prompt de animacao;
- [x] reservar sound effect;
- [x] invalidacao granular basica.

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

Objetivo: imagem estatica virar cena animada.

Itens:

- job `image_animation`;
- provider imagem-para-video;
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

Antes de continuar implementacao pesada de render/publicacao, revisar o modelo de produto `Content` + `Project` com a decisao mais recente.

Prioridade:

1. testar Content -> produzir roteiro -> associar projeto -> salvar, sem gerar cenas;
2. testar Projects -> abrir projeto com conteudo associado -> gerar cenas -> editor;
3. conectar bloco de prompt IA ao provider LLM selecionado;
4. modelar biblioteca de conteudos reutilizaveis e associacao muitos-para-muitos conteudo-projeto;
5. modelar canais de entrega e formatos permitidos como contrato dedicado no projeto/variant;
6. modelar PromotionTarget e ShortLink como entidades futuras;
7. manter fluxo/telas de cursos intactos ate decisao explicita de migracao.

## Checklist antes de finalizar proxima tarefa

- [x] atualizar docs afetadas;
- [x] typecheck web;
- [x] typecheck API se tocar backend;
- [x] typecheck API;
- [x] teste COPE se tocar contratos;
- [x] teste de inventario de endpoints;
- [ ] validar login/Projects manualmente;
- [x] atualizar este arquivo.
