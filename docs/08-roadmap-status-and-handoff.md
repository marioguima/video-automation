# FlowShopy Roadmap, Status and Handoff

Última atualização: 2026-05-09

## Estado real atual

Nota importante de produto:

- a conversa de 2026-04-30 revisou o conceito de projeto;
- este repositório é o produto FlowShopy que será lançado como app instalado local-first; `Vizlec` existe como projeto separado e como origem de aprendizado técnico, não como domínio que deve continuar vazando para este produto;
- o fluxo novo não pode usar, ensinar, expor ou depender conceitualmente de `Course`, `Module`, `Lesson` ou qualquer linguagem de "curso/aula/módulo";
- se esses nomes ainda existirem em codigo, banco ou endpoint, isso deve ser tratado como divida técnica de migração e não como modelo válido do produto;
- existem dois elementos centrais: conteúdos e projetos;
- conteúdo pode ser iniciado rapidamente e reutilizado, mas só ganha fluxo/impacto quando associado a projeto;
- projeto não deve começar por tipo/contexto como canal, campanha, música ou curso; ele é um agrupador editorial/comercial que informa ao core o que deve ser feito com o conteúdo;
- projeto deve declarar expectativa de saída: vídeo, imagem, texto, áudio, e-book, infográfico, carousel e outros entregáveis futuros;
- FlowShopy deve evoluir como máquina de atenção para promoção de produtos/ofertas/eventos, usando short links redirecionáveis;
- o produto e instalado na máquina do usuário final; ele deve exigir autenticação e depois aplicar autorização por workspace/equipe;
- a arquitetura deve assumir owner/admin gerenciando membros do time, papéis e permissões; a área de convites existe hoje, mas ainda está superficial e não pode ser confundida com RBAC completo;
- a tela `Content` deve ser voltada para ingestão e preparação de fontes até texto bruto; canais e formatos pertencem ao projeto.
- a tela `Content` não deve pedir tipo de mídia na criação; o conteúdo e genérico e entregáveis são definidos no projeto e materializados como outputs.
- a tela `Content` não deve gerar cenas, abrir editor de vídeo ou iniciar render; segmentação/render pertencem ao projeto/output.
- a tela `Content` deve evoluir para uma área própria de ingestão e preparação de múltiplas fontes;
- ingestão de links, PDFs, áudios e vídeos locais não deve acontecer no detalhe do projeto;
- a preparação de fontes deve ocorrer nos bastidores até convergir para texto bruto.
- ao confirmar cada fonte, o sistema já deve iniciar sua preparação em fila sequencial;
- a tela `Project` não deve virar um segundo lugar para criar conteúdo; ela deve localizar, associar e orquestrar conteúdos existentes.
- um mesmo conteúdo pode estar associado a um ou muitos projetos; o vínculo precisa ser reutilizável e visível.
- CTAs e linguagem de interação devem poder variar por canal; blocos comuns devem ser reaproveitados quando possível.

Implementado:

- monorepo FlowShopy trazido para `G:\tool\video-automation`;
- `ContentProject` e `ContentItem` no banco/API; na UX, `ContentProject` e exibido como `Project`;
- endpoints básicos de conteúdo;
- tela `Projects`;
- runtime desktop local-first com `apps/desktop`, bootstrap local de API e worker e documentação do modo instalado;
- autenticação local, workspace e área inicial de convite de membros;
- Team/Security existem como base inicial de equipe, mas sem modelagem completa de papéis, limites e gestão operacional de time;
- gerar blocos a partir de ContentItem ainda existe técnicamente no backend, mas a UI de Content não deve expor isso fora do contexto de projeto/output;
- abrir editor a partir de ContentItem ainda existe técnicamente no backend/projeto, mas não deve ser ação da listagem/cadastro de Content;
- Gemini nas settings;
- worker usando Gemini quando selecionado;
- teste integrado COPE.
- tela Projects com grade visual de projetos, cadastro separado e detalhe com Contents, Feed e Kanban; `Agenda` chegou a existir como MVP de metadata, mas foi retirada da tela atual para voltar no momento certo;
- projeto não possui `kind`; canal, perfil, curso, música e campanha foram removidos do contrato de projeto e ficam como contexto, destinations ou entregáveis;
- área `Content` criada na sidebar com listagem de conteúdos e tela separada de cadastro; cadastro prioriza produção de conteúdo/roteiro com prompt IA opcional, permite associar apenas a projeto existente e não exibe tipo de mídia antes do conteúdo;
- área `Content` não deve exibir `Generate Scenes`, `Open Editor` ou qualquer ação de renderizacao;
- detalhe de `Projects` não deve criar conteúdo; ele lista conteúdos associados, permite vincular conteúdos existentes e acompanhar os outputs gerados para cada combinação projeto + conteúdo;
- área `Content` deve listar todos os conteúdos já criados, com filtros por nome/data/projeto/destination, modos grade/lista e acesso ao formulário de edição;
- área `Content` deve ter foco visual no conteúdo; projeto aparece apenas como uso/associação secundária;
- preparação inicial de fontes YouTube já está conectada ao worker local em fila sequencial: download do vídeo, extração de áudio e transcrição até texto bruto;
- a solução imediata aceita para o beta usa dependências críticas embarcadas ou standalone, não dependências pré-instaladas no sistema do usuário;
- V1 bloqueia edição de conteúdo apenas quando algum projeto já iniciou criação/geração de entregável com base nele; simples associação a projeto não bloqueia edição; versionamento de conteúdo usado fica para fase futura;
- metadados operacionais por ContentItem: destinos, aspect ratios, stage, owner e data planejada;
- endpoint `PATCH /content-items/:itemId` para atualizar status/metadados preservando backing técnico;
- inventário de endpoints atualizado em `docs/10-api-endpoint-inventory.md`.
- `animationPromptJson` persistido em `Block`;
- prompt de animação gerado pela segmentação/LLM ou fallback;
- prompt de animação editável no editor;
- endpoint `PATCH /blocks/:blockId` aceita `animationPrompt`.
- `directionNotesJson` persistido/editavel em `Block`;
- `soundEffectPromptJson` persistido/editavel em `Block` como reserva para geração futura;
- invalidador básico de assets no `PATCH /blocks/:blockId` para texto, prompts e sound effect.
- decisao: XTTS é o provider TTS já integrado no worker; Chatterbox, Qwen, ElevenLabs, Fish Speech, F5-TTS, GPT-SoVITS e outros ficam como sugestões/rotas futuras;
- decisao: limites de fala devem ser configurados antes da segmentação, por idioma/provider, para evitar blocos que degradam a qualidade do TTS.
- Settings TTS agora salva providers, línguas atendidas por provider, rota por língua e orçamento inicial de fala (`targetChars`, `maxChars`, `targetSpeechSeconds`, `maxSpeechSeconds`).
- decisao: não existe TTS ativo global; projeto escolhe a rota TTS que vai usar.
- decisao: não existe provider ativo global para imagem/vídeo; pipeline do projeto escolhe modelo de imagem e modelo de vídeo opcional.
- decisao: uma língua só pode aparecer em uma rota TTS do catálogo para evitar ambiguidade na geração de fala.
- decisao: troca de voz por amostra entra no roadmap como pos-processamento de vídeos com fala nativa ou vozes inconsistentes.
- decisao: segmentação deve receber um `SpeechBudget`; quando a fala vier do TTS, usar limites da rota TTS; quando vier do motor de vídeo com áudio nativo, usar limites do provider/modelo de vídeo.
- decisao: geração de imagem/vídeo deve evoluir para providers configuráveis por capacidade; ComfyUI é o provider de imagem atual, e a extensao Veo deve entrar como provider `veo_extension`.
- Settings Visual agora cataloga providers/modelos de imagem e vídeo; pipeline do projeto escolhe modelo de imagem e modelo de vídeo opcional.
- decisao: projeto passa a declarar um Pipeline de Produção em `metadata.pipeline`; Settings continua sendo catálogo, e o projeto liga/desliga etapas como TTS, música, imagem, movimento de editor e vídeo IA.
- decisao: `metadata.pipeline` deve ser a fonte única de verdade do projeto; rotas TTS, modelo de imagem e modelo de vídeo ficam dentro dele, sem `metadata.tts` nem `metadata.visualGeneration` paralelos.
- decisao: React Flow fica fora do beta; a configuração inicial será por cards/toggles de etapas para reduzir complexidade para o usuário.
- decisao: eventos detalhados de job do worker devem ser persistidos em JSONL para diagnóstico; o console sozinho não e suficiente para acompanhar falhas de segmentação, TTS, imagem e render.
- decisao: logs persistidos do worker ficam em `logs/`, fora de `data/`, para facilitar limpeza sem misturar com banco, assets e configurações.
- decisao: progresso da segmentação deve acompanhar blocos salvos/atualizados, não apenas blocos criados, porque regeneracao reaproveita `Block` existente.
- decisao: ao abrir o editor durante uma segmentação ativa, a UI deve hidratar os blocos já salvos pelo job, não esperar apenas o fim do processo.
- decisao: a segmentação estrutural por LLM deve considerar o `scriptStructure` do projeto; prompts por estrutura devem ser versionados e futuramente editáveis apenas por admin.
- decisao: `textLayer` não e tipo de roteiro; captions, highlights, slide points, logo, overlays e estilos pertencem ao template/render do vídeo final.
- decisao: `music_storyboard` deve gerar visual beats, não blocos de fala; sincronização fina com música fica para etapa posterior com BPM/waveform/transientes ou marcadores manuais.
- decisao: sound effects e background music são camadas opcionais de mix/render do projeto, não requisitos da segmentação estrutural.
- decisao aceita em 2026-05-09: `Agenda` não deve ocupar espaco de produto principal antes de existirem integrações de contas, leitura de canais e automação de distribuição; antes disso ela tende a ser apenas um calendario raso de metadata.
- decisao aceita em 2026-05-05: o produto não deve continuar evoluindo como gerador de aulas; a arquitetura-alvo passa a ser conteúdo -> estrutura semântica -> output -> composição -> preview -> render -> promoção.
- decisao aceita em 2026-05-09: `Course/Module/Lesson` não faz parte do produto novo nem do vocabulário permitido do fluxo principal; qualquer permanencia desses termos deve ser tratada como migração técnica a remover.
- decisao aceita em 2026-05-05: `template` deixa de significar slide com ou sem texto e passa a significar sistema de composição baseado em `Component`, `CompositionPreset`, `StyleDNA` e `VariationRules`.
- decisao aceita em 2026-05-05: `Remotion` entra como direção principal para composição, preview e timeline; `ffmpeg` permanece como infraestrutura de mídia e export.
- decisao aceita em 2026-05-10: o uso atual de `Playwright` para rasterização de slides HTML/CSS fica mapeado como solução transitória; após a entrada de `Remotion`, deve ser reavaliado se esses layouts podem ser gerados pelo mesmo motor para reduzir dependências.
- segmentação estrutural por LLM conectada ao worker usando `buildSegmentationPrompt`, com fallback para segundo modelo Gemini quando disponível e fallback final por heurística deterministica; aguardando validação manual.
- `buildSegmentationPrompt` não pede mais `on_screen`; `on_screen` permanece temporariamente na etapa de metadados por bloco para compatibilidade com editor/render atual; aguardando validação manual.
- regeneracao manual de bloco (`segment_block`) usa o `sourceText` já salvo no bloco, evitando voltar para os cortes heuristicos antigos; aguardando validação manual.

Não implementado ainda:

- remocao efetiva de referências de fluxo novo a `Course`, `Module`, `Lesson` em UI, API e contratos de domínio;
- modelo explícito de equipe com `owner/admin/member`, convites, papéis e autorização por ação;
- revisão da área Team para sair de "convite básico" e virar gestão real de time;
- catálogo/admin UI de prompts de segmentação por `scriptStructure`;
- render efetivamente dirigido por `render.textLayer`;
- templates de render com politicas manual/aleatoria/sequencial;
- biblioteca global de músicas de fundo e selecao por projeto;
- geração/mixagem efetiva de sound effects;
- validação de projeto/output com TTS exigido e língua sem rota TTS configurada;
- worker ainda não consome a escolha visual do projeto em `metadata.pipeline.image`/`metadata.pipeline.video`;
- adaptador da extensao Veo para pedir imagem/vídeo, acompanhar status e importar resultado;
- render de cena animada usando provider configurado;
- troca de voz por amostra (`voice_replacement`);
- separacao/alinhamento de áudio para substituir voz preservando fundo;
- ProjectOutputDefinition como contrato de saídas esperadas do projeto;
- ProjectContentOutput como instancia técnica do entregável para a combinação projeto + conteúdo;
- NarrativeUnit como entidade dedicada;
- Composition como entidade dedicada;
- Component Library / CompositionPreset;
- viewer/timeline em Remotion;
- plano de render por output, CTA por canal e render por blocos/cache;
- revisão do uso de `Playwright` para geração de slides após estabilizar `Remotion`, para avaliar substituição e redução de dependências;
- versionamento de ContentItem usado em entregáveis;
- ContentSource;
- empacotamento oficial de `ffmpeg` e `ffprobe` no desktop runtime;
- empacotamento oficial de runtime Python e bibliotecas Python no desktop runtime;
- estratégia final de distribuição de `yt-dlp` e `faster-whisper`;
- estratégia final de distribuição de modelos de transcrição;
- biblioteca de conteúdos reutilizáveis independente de projeto;
- associação muitos-para-muitos entre conteúdo e projetos;
- simplificar a tela de projeto para manter uma única ação principal de associação, sem duplicar o fluxo de criação da área `Content`;
- painel lateral de ajuda contextual acionado por ícone de interrogação na barra superior, com conteúdo sensível à tela atual;
- DeliveryChannel/formatos permitidos por canal;
- PromotionTarget;
- ShortLink redirecionável;
- publicação social;
- integrações de contas de canais/plataformas para leitura e automação;
- Stripe;
- animação de imagem.

Prioridade de arquitetura a partir desta decisao:

1. parar de adicionar qualquer capacidade nova em torno do domínio herdado `Course/Module/Lesson`;
2. consolidar o núcleo `Workspace`, `Membership`, `ContentItem`, `Project`, `ProjectContent`, `ProjectOutputDefinition` e `ProjectContentOutput`;
3. fazer `Project` ser explicitamente o contrato de intenção do usuário sobre o que o core deve produzir a partir do conteúdo;
4. introduzir `NarrativeUnit` e `Composition` como fonte de verdade para composição;
5. usar `Remotion` para preview/timeline;
6. migrar renderer final para `Composition` quando o preview estiver estável;
7. remover nomenclatura, endpoints e estruturas herdadas conforme cada parte do fluxo novo estabilizar.

## Decisão operacional de empacotamento para o beta

Resumo executivo:

- dependências críticas do caminho principal são distribuídas junto com o app;
- isso inclui `Node`, `ffmpeg`, runtime Python, bibliotecas Python e modelo inicial de transcrição;
- a pipeline inicial de YouTube roda localmente com `yt-dlp -> ffmpeg -> faster-whisper`;
- o desktop prepara e valida esse runtime automaticamente no boot;
- no app instalado, `DATA_DIR` é ignorado e o runtime usa `%LOCALAPPDATA%/FlowShopy Desktop`.

Este arquivo não deve detalhar mais do que isso.

Documento fonte desta trilha:

- `docs/12-desktop-local-runtime.md`

Lá ficam:

- estrutura exata de pastas em desenvolvimento e instalado;
- comandos de build, limpeza e reteste;
- comportamento da splash;
- regras de reprovisionamento;
- pendências futuras da estratégia de runtime.

## Credencial local de dev

```text
email: marioguimaraes@flowshopy.com
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

## Validações realizadas

- `pnpm verify:critical`
- `pnpm --filter @flowshopy/api typecheck`
- `pnpm --filter @flowshopy/web typecheck`
- `pnpm --filter @flowshopy/worker typecheck`
- `pnpm --filter @flowshopy/web build`
- `pnpm --filter @flowshopy/api run test:one -- test/content-cope-flow.test.ts`
- `pnpm --filter @flowshopy/api run test:one -- test/content-cope-flow.test.ts test/endpoint-ownership-inventory.test.ts`

## Arquivos de implementação relevantes

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

Objetivo: transformar a tela `Projects` em um workspace operacional no qual o projeto é o agrupador de intenção e os conteúdos vivem associados a ele.

Itens:

- [x] grade visual de projetos;
- [x] cadastro separado de projeto;
- [x] detalhe do projeto;
- [x] Contents;
- [x] Feed visual;
- [x] Kanban;
- [x] plataformas/destinos;
- [x] aspect ratios;
- [x] campos metadata para status, prazos e responsável.

Aceite:

- [x] criar projeto em tela separada;
- [x] abrir projeto a partir da grade;
- [x] escolher plataformas;
- [x] escolher aspect ratios;
- [x] criar conteúdo genérico;
- [x] gerar blocos dentro do workspace de projeto;
- [x] abrir editor dentro do workspace de projeto;
- [x] ver Feed;
- [x] ver Kanban;
- [x] typecheck web passa;
- [x] teste COPE API continua passando.

Observação: Fase 1 está implementada como MVP funcional usando `ContentItem.metadataJson`. Projeto não e canal/perfil/pagina; esses são destinos do conteúdo. Feed usa placeholder visual quando não ha thumbnail/asset. Kanban altera stage via `PATCH /content-items/:itemId`. Uma Agenda baseada apenas em `plannedPublishAt` e `ownerName` chegou a existir como MVP de metadata, mas foi removida da tela principal porque a visão completa de agenda faz mais sentido depois de integrações de contas, leitura de publicações e automação de distribuição.

### Fase 2 - Scene completa

Objetivo: enriquecer blocos/cenas e fazer a segmentação respeitar orçamento de fala.

Itens:

- [x] separar texto narrado, texto em tela e notas;
- [x] adicionar `animationPromptJson`;
- [x] editar prompt de animação;
- [x] reservar sound effect;
- [x] invalidacao granular básica.
- [ ] `SpeechBudget` resolvido antes da segmentação a partir do `metadata.pipeline` quando o projeto estiver associado ao ContentItem; implementado, aguardando validação manual;
- [ ] segmentação deterministica usando `maxChars` configurado ou estimado pelo limite de fala; implementado, aguardando validação manual;
- [ ] segmentação LLM usando `buildSegmentationPrompt` com `SpeechBudget`; implementado, aguardando validação manual;
- [ ] validação deterministica bloqueando blocos acima do limite de fala antes de persistir; implementado, aguardando validação manual;
- [ ] aviso/bloqueio quando a língua do projeto/output não tiver rota TTS e o modo exigir TTS.

Aceite parcial concluido:

- [x] `Block.animationPromptJson` existe no schema e migration;
- [x] segmentação LLM pede `animation_prompt`;
- [x] fallback deterministic gera prompt de animação;
- [x] worker persiste `animationPromptJson`;
- [x] editor carrega/salva prompt de animação;
- [x] `PATCH /blocks/:blockId` aceita `animationPrompt`;
- [x] teste COPE cobre persistencia do prompt de animação.
- [x] `PATCH /blocks/:blockId` aceita `directionNotes` e `soundEffectPrompt`;
- [x] editor carrega/salva notas de direção e prompt de sound effect;
- [x] mudancas de bloco invalidam assets derivados existentes;
- [x] teste COPE cobre persistencia de notas e sound effect.

### Fase 3 - Outputs

Objetivo: um mesmo conteúdo gerar múltiplos entregáveis a partir da intenção declarada pelo projeto.

Itens:

- entidades `ProjectOutputDefinition` e `ProjectContentOutput`;
- `ProjectOutputDefinition` descreve o que o projeto espera produzir: vídeo, imagem, texto, áudio, e-book, infográfico, carousel e formatos futuros;
- destinos por ContentItem;
- aspect ratios por output quando aplicavel;
- assets por output;
- output curto derivado por LLM.

### Fase 4 - Fontes

Objetivo: ajudar a chegar ao roteiro.

Itens:

- ContentSource;
- ideia -> roteiro;
- links -> transcrição/análise;
- pesquisa Gemini vídeo;
- estratégia download/transcrição/VLM.
- fase inicial aceita com fila local sequencial no worker;
- fase inicial aceita com `yt-dlp`, `ffmpeg` e `faster-whisper` embarcados ou standalone;
- revisão futura do empacotamento definitivo dessas dependências.

### Fase 5 - Animação e efeitos

Objetivo: imagem estática virar cena animada e habilitar provider de vídeo configurável.

Itens:

- settings `visualGeneration` para imagem/vídeo;
- selecao de provider/modelo visual dentro do Pipeline de Produção do projeto;
- Pipeline de Produção por projeto com modos `tts`, `music`, `editor_motion`, `text_to_video`, `image_to_video` e `looped_clips`;
- consolidar rotas TTS/imagem/vídeo dentro de `metadata.pipeline` e remover campos paralelos do projeto;
- provider `veo_extension` para comunicacao com a extensao externa;
- provider `comfyui` como motor local/futuro para vídeo quando houver workflow adequado;
- provider `vertex_veo` opcional/futuro para API oficial;
- `SpeechBudget` para fala nativa de vídeo, separado do TTS;
- job `image_animation`;
- provider imagem-para-vídeo;
- provider texto-para-vídeo;
- substituicao de voz por amostra para vídeos já gerados;
- source separation/alinhamento para preservar música/efeitos ao trocar voz;
- efeitos/transições;
- sound effects.

### Fase 6 - Team e autorização

Objetivo: tornar o app instalado utilizável por equipes reais com controle de acesso claro.

Itens:

- autenticar usuário no app instalado;
- resolver workspace ativo;
- separar papéis `owner`, `admin`, `member` e futuros papéis especializados;
- revisar convites, aceite, revogacao e expiração;
- aplicar autorização por ação em projeto, conteúdo, settings e billing;
- preparar limites de equipe por plano sem travar a arquitetura antes da hora.

### Fase 7 - Integrações de contas e canais

Objetivo: conectar o FlowShopy aos destinos reais do usuário para leitura, insights e operações futuras.

Itens:

- conectar contas autorizadas de YouTube, Facebook, Instagram, TikTok e futuras plataformas;
- salvar autorizações por workspace e por membro conforme permissão;
- ler metadados de canais/perfis/paginas;
- importar sinais úteis de publicações e ativos distribuídos;
- preparar leitura de conteúdo publicado para gerar insights e contexto;
- criar base segura para automação posterior de publicação/agendamento.

### Fase 8 - Agenda e operação de distribuição

Objetivo: recolocar `Agenda` no produto quando ela puder representar operação real, e não apenas metadata manual.

Itens:

- mostrar postagens agendadas por plataforma;
- mostrar publicações já realizadas;
- consolidar agenda por projeto, output, canal e responsável;
- refletir status reais vindos das integrações de contas;
- permitir filtros por plataforma, responsável, projeto e status;
- suportar fila operacional de distribuição e acompanhamento.

### Fase 9 - Publicação e billing

Objetivo: fechar automação e monetização.

Itens:

- YouTube;
- TikTok;
- Instagram/Facebook;
- captions;
- agendamento;
- agenda operacional apoiada por integrações reais;
- Stripe;
- planos.

## Proxima tarefa recomendada

Antes de continuar implementação pesada de render/publicação, precisamos fechar o contrato do domínio novo e impedir que o modelo herdado continue guiando a arquitetura.

Prioridade:

1. revisar e fechar o contrato conceitual de `ContentItem`, `Project`, `ProjectContent`, `ProjectOutputDefinition` e `ProjectContentOutput`;
2. remover do fluxo novo qualquer referência visível a `course`, `module`, `lesson` na UX e nos contratos que alimentam a UX;
3. modelar `Project` como contrato de intenção: que tipo de entregável o usuário quer gerar, com que canais, formatos, CTA e pipeline;
4. fechar o contrato de equipe/autorização com `owner/admin/member` e revisar a área atual de convites;
5. validar manualmente `Projects -> conteudo associado -> Generate Scenes -> editor` e confirmar log `segment_structure_llm_completed`;
6. bloquear/avisar quando projeto/output exige TTS e a língua não possui rota TTS configurada;
7. fazer worker consumir `metadata.pipeline.image.model` na geração de imagem;
8. tratar limite separado para fala nativa de provider de vídeo, como durações aceitas pelo modelo;
9. adicionar `render.textLayer`/templates ao projeto e separar `on_screen` da etapa de metadados atual;
10. modelar saídas não-vídeo no contrato de output mesmo que a execução inicial continue priorizando vídeo;
11. adicionar biblioteca global de músicas de fundo e selecao de faixas por projeto;
12. modelar sound effects como etapa opcional de mix/render;
13. adicionar adaptador `veo_extension` para imagem/vídeo como objetivo central do pipeline;
14. preparar a camada de integração de contas por workspace antes de recolocar `Agenda` como tela principal;
15. testar `Content -> produzir roteiro -> associar projeto -> salvar`, sem gerar cenas;
16. testar `Projects -> abrir projeto com conteudo associado -> gerar cenas -> editor`.

## Leitura real da implementação

Data de referência desta leitura: 2026-05-09.

O que já existe de verdade no codigo:

- autenticação local, workspace e convites de equipe;
- runtime desktop local-first com Electron, API local e worker local;
- `ContentProject`, `ContentItem`, `ContentProjectItem`, `ProjectOutputDefinition`, `ProjectContentOutput`, `NarrativeUnit` e `Composition` no schema;
- tela `ContentProjects` com fluxo de projetos, conteúdos associados, pipeline, outputs e `Studio`;
- endpoints para listar/criar projetos e conteúdos, materializar outputs e gerar narrativa/composition inicial;
- composição inicial e preview técnico já existem como base do `Studio`;
- pipeline TTS/imagem/vídeo já aparece no projeto é parte da validação de fala já entrou no worker.

O que ainda está enganando e precisa ser tratado como transição:

- `apps/web/src/App.tsx` ainda e dominado por navegacao e estado do fluxo herdado de `Course/Module/Lesson`;
- o schema ainda mantem `Course`, `Module`, `Lesson`, `LessonVersion`, `Block`, `Job` e `Notification` como centro técnico do pipeline real;
- `POST /content-items/:itemId/segment` e `GET /content-items/:itemId/blocks` ainda dependem de `ensureContentItemBacking()` e criam backing em `Course -> Module -> Lesson -> LessonVersion`;
- a UI de `ContentProjects` ainda oferece canal/output `course`, o que contradiz a direção do produto;
- `ContentItem.kind` ainda nasce com default antigo e não representa bem a ideia de conteúdo genérico;
- a geração de `NarrativeUnit`/`Composition` existe, mas a segmentação e a geração de assets ainda estão acopladas ao pipeline legado;
- a visão atual de `Selected Output` e o botão `Build Narrative` ainda simplificam demais uma etapa que na prática depende da fase do conteúdo e do tipo de entregável;
- o preview técnico atual não representa o editor de vídeo real e não deve ser confundido com a experiência final de edição;
- equipe existe hoje como convites e papéis básicos, não como autorização completa por ação;
- `Agenda` já existiu como metadata, mas não tem base operacional real e não deve voltar cedo.

Leitura correta:

- o beta não precisa remover todo o legado do banco;
- o beta precisa esconder o legado do fluxo principal e fazer o caminho novo funcionar ponta a ponta;
- toda decisao agora deve reduzir dependência visível do modelo antigo e aumentar confiança no fluxo `Content -> Project -> Output -> Studio -> Render`.
- para output de vídeo, o `Studio`/editor precisa entrar cedo no fluxo e não apenas no fim da pipeline.
- formatos de entrada diferentes não significam pipelines diferentes; eles apenas entram em estágios diferentes da mesma esteira até chegar a `script_ready`.
- a preparação do conteúdo vem antes da criação dos outputs e é compartilhada por eles;
- a visão principal do projeto deve priorizar fase, estado, fila e capacidade de disparo, não microdecisões manuais por output.
- `source mode` e `final content mode` são decisão do usuário, não do formato;
- em `final content mode`, o sistema precisa validar cobertura de conteúdo final por saída antes de entrar em `Creation`;
- em `source mode`, o sistema precisa aplicar prompts próprios por combinação `canal + formato`.
- a aplicação desses prompts por saída é o último passo da fase `Preparation`.
- `script_ready` não deve existir como toggle manual na UI;
- esse estado precisa ser derivado do que já foi resolvido no conjunto `conteúdo + projeto + saídas`;
- quando houver granularidade por saída, cada combinação `canal + formato` pode avançar para `Creation` sem esperar artificialmente todas as demais.
- o fluxo correto da geração é `conteudo -> projeto -> canal -> formato -> prompt -> final content`.
- se o conteúdo for associado ao projeto antes do fim da preparação, o projeto deve mostrar esse conteúdo em `Preparation` até todas as fontes convergirem para texto bruto.

## Definição de beta funcional

Beta funcional não e "ter tudo". Beta funcional é um caminho principal confiável, repetível e coerente com o produto que será lançado.

O beta deve permitir:

1. autenticar no app instalado;
2. operar em um workspace;
3. criar projeto sem `kind`;
4. criar conteúdo na biblioteca a partir de texto;
5. registrar claramente se o conteúdo ainda está em fonte bruta ou já está em script;
6. associar conteúdo a um projeto;
7. configurar pipeline, outputs e regras mínimas do projeto;
8. disparar manualmente o fluxo do conteúdo associado ao projeto;
9. colocar conteúdos e outputs em fila respeitando fase e limitação de hardware;
10. materializar um `ProjectContentOutput` de vídeo quando o conteúdo já estiver pronto para criação;
11. entrar no `Studio`/editor assim que esse output de vídeo existir;
12. ajustar prompts, revisar blocos e acompanhar as fases do output dentro do editor;
13. seguir para segmentação/geração de assets/vídeo sem expor `course/module/lesson` ao usuário;
14. baixar o resultado final;
15. convidar pelo menos um membro/admin para o workspace.

Coisas que não precisam bloquear o beta:

- publicação automática;
- integrações de contas;
- agenda operacional;
- outputs não-vídeo executaveis;
- RBAC avancado alem de `owner/admin/member`;
- remocao física completa do legado do banco.

## Sequencia correta para tornar isso real rápido

Princípio: reduzir superfície, fechar um happy path, e só depois expandir.

### Etapa 1 - Congelar o legado no produto novo

Objetivo: parar de reforcar visualmente e técnicamente o fluxo errado.

Ações:

- remover da UX nova qualquer linguagem, opção ou CTA ligada a `course/module/lesson`;
- remover `course` dos outputs/canais da UI `ContentProjects`;
- tratar `App.tsx` como casca em transição e impedir que views herdadas voltem a disputar protagonismo com o fluxo novo;
- marcar todo endpoint/estado herdado como compatibilidade interna, não direção de produto.

Saída esperada:

- o usuário beta entende apenas `Content`, `Project`, `Output`, `Studio`, `Team`, `Settings`.

### Etapa 2 - Fechar o contrato do núcleo novo

Objetivo: parar de deixar o domínio novo parcialmente implícito.

Ações:

- estabilizar o contrato de `ContentItem`, `ContentProject`, `ContentProjectItem`, `ProjectOutputDefinition` e `ProjectContentOutput`;
- introduzir formalmente a esteira `source -> processed -> analyzed -> script_ready -> output`;
- padronizar `ContentItem` como conteúdo genérico e não classificação de mídia;
- introduzir distinção entre fonte, script-base e script por output;
- distinguir `script_ready` do conteúdo e `final_content_coverage_ready` por output quando o modo escolhido for `final content`;
- introduzir prompts padrão por combinação `canal + formato` para o fluxo `source mode`;
- mover o máximo possível de decisao de saída para `ProjectOutputDefinition` e `ProjectContentOutput`;
- definir o status mínimo desses objetos para o beta;
- deixar claro onde mora `pipeline` hoje e o que ainda permanece em `metadata` por conveniência.

Saída esperada:

- o backend e a UI passam a falar o mesmo contrato do fluxo novo sem depender de interpretações.

### Etapa 3 - Fechar o happy path de produção no fluxo novo

Objetivo: fazer o caminho principal funcionar de ponta a ponta.

Ações:

- usar `ProjectContentOutput` como entidade central do `Studio`;
- garantir: projeto -> conteúdo associado -> preparation -> script_ready -> start -> outputs em fila -> studio/editor -> adaptação -> estrutura -> composition -> produção;
- garantir que o editor fique acessível assim que existir um `ProjectContentOutput` de vídeo;
- decidir se a segmentação beta continua usando o backing legado por baixo, mas sempre iniciada a partir de `ProjectContentOutput`;
- parar de tratar `Build Narrative` como simples quebra de texto e redefinir essa etapa como adaptação/estruturação específica por output;
- remover a ambiguidade da visão `Selected Output` como pseudo-editor;
- criar ou ajustar a ponte para que `segment`, `blocks`, `assets` e `final video` sejam disparados do fluxo novo, mesmo que o worker ainda processe o legado por baixo;
- expor no editor as fases do output, ajuste de prompts e previews de imagem/animação quando o template ou pipeline suportarem isso;
- manter o usuário fora de `lessonVersionId`, `courseId` e afins;
- validar manualmente o fluxo completo com um projeto real e um conteúdo real.

Saída esperada:

- existe um caminho único e demonstravel até MP4 final a partir do modelo novo;
- o editor vira o hub operacional do output de vídeo desde cedo no fluxo.
- a preparação do output fica conceitualmente separada da ingestão da fonte.

### Etapa 4 - Fechar equipe e autorização mínima

Objetivo: tornar o beta utilizável em cenario real de time.

Ações:

- consolidar `owner/admin/member`;
- garantir autorização mínima em projetos, conteúdos, convites e settings;
- manter `Team` como tela principal de convites;
- evitar duplicacao desnecessaria entre `Security` e `Team` para gerenciamento de convites;
- revisar se `Security` deve ficar focada em senha/sessoes e `Team` em colaboração.

Saída esperada:

- um owner consegue convidar admin/member e o produto respeita isso de forma consistente.

### Etapa 5 - Fechar confiabilidade do pipeline beta

Objetivo: evitar demos bonitas com fluxo quebrado.

Ações:

- finalizar validação de `SpeechBudget` e bloqueio de rota TTS ausente;
- fazer worker consumir `metadata.pipeline.image.model` e, quando aplicavel, `metadata.pipeline.video.model`;
- padronizar logs e estados de progresso para o fluxo novo;
- revisar invalidacao de assets no contexto do output;
- confirmar download e reprocessamento básico.

Saída esperada:

- o beta produz resultado com previsibilidade suficiente para uso interno e demos externas.

## Ordem de implementação recomendada

Se a meta e chegar ao beta funcional o mais breve possível, a ordem deve ser esta:

1. limpar a UX nova de referências herdadas;
2. fechar o contrato do núcleo `Source/Content/Script/Project/Output`;
3. separar claramente `Preparation` de `Creation` no fluxo do produto;
4. fazer `ProjectContentOutput` dirigir o `Studio`/editor e o disparo da produção;
5. consolidar equipe/autorização mínima;
6. fechar TTS/imagem/vídeo no pipeline do projeto;
7. validar o fluxo beta ponta a ponta várias vezes;
8. só depois voltar para contas conectadas, agenda e distribuição.

O que não fazer agora:

- reabrir agenda antes de integrações de contas;
- investir em publicação automática antes do happy path local estar estável;
- expandir demais outputs não-vídeo antes de o fluxo de vídeo estar confiável;
- continuar adicionando features novas ao fluxo herdado.

## Backlog de execução para o beta

### Bloco A - Correcoes imediatas de coerencia

- remover `course` de `apps/web/src/components/ContentProjects.tsx`;
- revisar labels/status que ainda empurram o usuário para leitura antiga;
- revisar `App.tsx` para definir qual conjunto de telas compoe o shell do beta e quais ficam explicitamente como legado.

### Bloco B - Fluxo novo como caminho oficial

- criar/ajustar endpoints do fluxo novo para que `ProjectContentOutput` seja o ponto oficial de produção;
- introduzir estados explícitos para `source`, `script` e `output`;
- permitir que texto simples e conteúdo final entrem em pontos diferentes da mesma esteira;
- validar se `final content mode` recebeu todos os conteúdos finais exigidos pelos outputs configurados;
- preparar catálogo inicial de prompts padrão por combinação `canal + formato`;
- manter ponte interna com legado apenas como infraestrutura, sem expor ids/termos;
- decidir se `GET /content-items/:itemId/blocks` vira compatibilidade e o fluxo principal passa a depender de output.

### Bloco C - Studio beta

- garantir que `Studio` abra sempre por output;
- garantir que um output de vídeo possa entrar no editor desde o início do fluxo;
- substituir o entendimento de `Build Narrative` por adaptação e estruturação do output;
- garantir narrativa/composition inicial para vídeo como primeira implementação;
- conectar operações de gerar adaptação do output, ajustar prompts, revisar previews e seguir para assets/render;
- garantir leitura clara de status por output.

### Bloco F - Esteira de ingestão e script

- formalizar que tipos de entrada chegam em pontos diferentes da mesma pipeline;
- definir tratamento mínimo para texto, script pronto, áudio, vídeo por link e PDF;
- garantir convergência obrigatória em `script_ready`;
- introduzir gate de revisão/aprovação antes de produção automatizada.
- mover a experiência de ingestão/preparação para a área `Content`, fora do detalhe do projeto;
- permitir uma ou muitas fontes por conteúdo;
- automatizar seleção da pipeline de extração/transcrição conforme a origem da fonte.
- executar preparação inicial em fila sequencial, uma fonte por vez;
- refletir no projeto apenas o estado agregado do conteúdo associado durante `Preparation`.

### Bloco G - Orquestração do projeto

- substituir a interação principal de cliques por output por uma ação de início no nível do par `projeto + conteúdo`;
- refletir fases macro `Preparation`, `Creation` e `Publication`;
- mostrar estado detalhado dentro de cada fase, como `downloading_video`, `extracting_audio` e `transcribing`;
- garantir que a preparação do conteúdo aconteça antes da criação dos outputs;
- tratar fila e prioridade de outputs como parte explícita do runtime.
- modelar revisão humana como subetapas dentro de `Creation`, incluindo prompts, TTS, imagens, vídeos, preview/timeline e autorização para render imediato ou em fila.

### Bloco D - Team beta

- consolidar convites em uma única experiência principal;
- revisar duplicidade entre `Team` e `Security`;
- reforcar permissão mínima por papel.

### Bloco E - Estabilizacao

- testes de fluxo novo;
- validação manual desktop;
- docs finais do beta;
- checklist de demo interna.

## Definição pratica do próximo ciclo

O próximo ciclo de implementação deve ter um objetivo único:

`fazer o beta rodar no fluxo novo sem linguagem herdada, com projeto + conteudo + output + studio + render`

Leitura complementar obrigatória para o próximo ciclo:

- o primeiro input a funcionar bem continua sendo texto;
- mas a arquitetura implementada agora já deve assumir que inputs futuros, como PDF, áudio e link de vídeo, entrarão mais atrás na mesma esteira;
- a pipeline deve ser desenhada pela transformação de estados, não pelo formato de entrada em si.

Sequencia do próximo ciclo:

1. limpar `ContentProjects.tsx` e shell principal do beta;
2. ajustar contrato de `content` para deixar explícito o estado `script_ready`;
3. separar fase `Preparation` da fase `Creation` no contrato e na UI;
4. introduzir ação principal de início no conteúdo associado ao projeto;
5. ajustar API do fluxo novo onde ainda depende de `content-item` isolado em vez de `output`;
6. fechar `Studio` como centro operacional do output de vídeo;
7. remover a ambiguidade da visão `Selected Output`;
8. redefinir `Build Narrative` como etapa de adaptação/estruturação do output;
9. revisar base para presets/templates e estratégia de seleção no projeto;
10. validar TTS/imagem/render no pipeline;
11. revisar equipe/autorização mínima;
12. executar validação manual completa.

Direcionamento registrado em 2026-05-09:

- revisão humana não é fase após `Creation`;
- revisão humana acontece durante `Creation`;
- o usuário deve poder revisar prompts por bloco, TTS, imagens, vídeos e preview/timeline antes de autorizar render;
- a autorização de render pode ser imediata ou colocada em fila.

## Checklist antes de finalizar proxima tarefa

- [x] atualizar docs afetadas;
- [x] typecheck web;
- [x] typecheck API se tocar backend;
- [x] typecheck API;
- [x] teste COPE se tocar contratos;
- [x] teste de inventário de endpoints;
- [ ] validar login/Projects manualmente;
- [x] atualizar este arquivo.
