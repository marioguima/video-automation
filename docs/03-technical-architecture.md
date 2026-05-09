# FlowShopy Technical Architecture

## Stack atual

Monorepo:

- pnpm workspaces;
- TypeScript;
- Node.js;
- React/Vite frontend;
- Fastify API;
- Worker Node;
- Prisma 7;
- SQLite via `better-sqlite3`;
- Playwright para render HTML/CSS -> PNG;
- ffmpeg/ffprobe para vídeo/audio;
- Ollama/Gemini para LLM;
- ComfyUI para imagem atual;
- XTTS para TTS atual;
- providers futuros de imagem/vídeo por configuração, incluindo extensao Veo e motores locais.

## Estrutura do repositório

```text
apps/api      API HTTP/WebSocket, auth, settings, jobs, endpoints de dominio
apps/web      frontend React/Vite
apps/worker   executor local de jobs pesados
packages/db   Prisma schema/client helper
packages/shared helpers compartilhados, config, Gemini, tipos auxiliares
data          banco local, settings, assets gerados em dev
docs          documentacao ativa
scripts       scripts de setup/dev/lab
infra         infraestrutura de laboratorio/producao
```

## Arquitetura lógica

```text
Browser UI
  -> API Fastify
    -> SQLite/Prisma
    -> filesystem DATA_DIR
    -> WebSocket/HTTP para worker/agente
      -> LLM/TTS/ComfyUI/Playwright/ffmpeg
```

## Domínio atual vs domínio alvo

Estado herdado de implementação:

```text
Course -> Module -> Lesson -> LessonVersion -> Block -> Asset/Job
```

Domínio alvo:

```text
Workspace -> ContentItem
Workspace -> Project
Project -> PromotionTarget -> ShortLink
ContentItem <-> Project via ProjectContent
ProjectContent -> ProjectContentOutput -> NarrativeUnit -> Composition -> Asset/Job
Composition -> Component / CompositionPreset
```

Leitura correta do domínio:

- `ContentItem` e a matéria-prima editorial;
- `Project` e o conjunto de parâmetros que orienta o core/fábrica;
- `ProjectContentOutput` e o entregável áudiovisual concreto da combinação projeto + conteúdo + output configurado;
- `Composition` e a forma declarativa de montagem desse entregável.

Estratégia atual:

- expor `Project/ContentItem` para a UI;
- usar `ProjectContent`/`ContentProjectItem` para associar conteúdo a zero, um ou muitos projetos;
- migrar gradualmente para `ProjectContentOutput`, `NarrativeUnit` e `Composition` sem quebrar o pipeline atual;
- remover o legado herdado quando o domínio novo estiver cobrindo o fluxo principal, em vez de carregar dois modelos de produto por tempo indefinido;
- não iniciar segmentação/render a partir de `ContentItem` isolado na UI;
- iniciar segmentação/render somente no contexto de `Project` e, idealmente, `ProjectContentOutput`.
- não criar `ContentItem` a partir do detalhe do projeto na UX principal; a criação pertence a área `Content`;
- permitir no detalhe do projeto apenas encontrar, vincular e orquestrar conteúdos existentes.

Regra rigida de produto:

- `Course`, `Module`, `Lesson` e derivados não fazem parte do domínio válido do FlowShopy;
- se ainda existirem em schema, API ou implementação, isso é apenas estado transitivo de migração;
- o fluxo novo não pode expor esses nomes em UX, onboarding, documentação de produto ou contratos novos.

Nota de produto:

- `Project` e agrupador editorial/comercial, não destino de publicação;
- `Project` não possui campo `kind`;
- qualquer tentativa de enviar `kind` para projeto deve ser recusada;
- canais/perfis/paginas aparecem principalmente como destinations/outputs quando um projeto publica em vários canais.

Princípio de migração:

- o domínio herdado não deve continuar recebendo novas capacidades de produto;
- novas capacidades devem nascer em torno de `ContentItem`, `Project`, `ProjectContentOutput`, `Composition` e promoção;
- o backing herdado só deve sobreviver enquanto for necessário para manter entrega e reduzir risco de transição;
- quando um fluxo novo estabilizar, o equivalente herdado deve ser removido.

## Arquitetura alvo de produto

O FlowShopy deve ser tratado como uma fábrica de conteúdo promocional orientada por conteúdo, projeto, output e composição.

Fluxo alvo:

```text
Input source
  -> Source ingestion
  -> Source processing
  -> Source analysis
  -> Script development
  -> Script ready
  -> Project association / project context
  -> Start project flow
  -> ProjectContentOutput queue
  -> Output adaptation
  -> Output structure
  -> Composition
  -> Preview
  -> Final render
  -> Publication / Promotion
```

Leitura correta de cada etapa:

- `Input source`: qualquer forma de entrada bruta fornecida pelo usuário;
- `Source ingestion`: momento em que o sistema registra, baixa ou recebe o insumo;
- `Source processing`: momento em que o sistema extrai áudio, texto, metadados ou transcrição;
- `Source analysis`: momento em que o sistema entende editorialmente o insumo;
- `Script development`: momento em que o sistema e/ou usuário desenvolvem o script;
- `Script ready`: ponto de convergência obrigatório antes de outputs seguirem;
- `ContentItem`: unidade editorial principal que representa o conteúdo dentro da esteira;
- `Project association`: um mesmo conteúdo pode servir a um, vários ou nenhum projeto;
- `Project context`: marca, produto promovido, CTA, destinos, formatos, estilo e intenção declarada do que deve ser produzido;
- `Start project flow`: comando principal de início do projeto ou do conteúdo associado;
- `ProjectContentOutput queue`: fila real de outputs respeitando limites de hardware e prioridade;
- `ProjectContentOutput`: entregável concreto por canal, formato e objetivo;
- `Output adaptation`: adaptação do script-base para a linguagem final do output;
- `Output structure`: quebra do output em cenas, cards, páginas, seções ou blocos;
- `Composition`: timeline áudiovisual declarativa;
- `Preview`: visualizacao antes do render final;
- `Final render`: exportacao definitiva do entregável.

Princípio central:

- a pipeline e mais importante do que o formato de entrada;
- link de vídeo, áudio, PDF e texto não exigem produtos diferentes;
- eles apenas entram em posições diferentes da mesma esteira;
- vários formatos de entrada precisam convergir para texto analisável e depois para script aprovado.
- a preparação inicial do conteúdo é compartilhada por todos os outputs derivados;
- a criação por output só deve começar quando o conteúdo já estiver pronto para isso.

Regra de UX derivada:

- a tela `Content` e o lugar de criar e editar matéria-prima;
- a tela `Project` e o lugar de associar conteúdo, escolher output e orquestrar a fábrica;
- `Studio` existe dentro do projeto para operar sobre conteúdo associado, não para substituir a área de escrita de conteúdo.
- a visão principal do projeto não deve ser um pseudo-editor por output;
- o editor de vídeo e o lugar real para blocos, prompts, ajustes e preview composicional.
- se o modo escolhido for `final content`, a tela principal também precisa deixar claro quais outputs ainda estão sem conteúdo final.
- se o modo escolhido for `source`, a tela principal também precisa deixar claro que cada output usará um prompt próprio de transformação.

### Estrutura semântica

`ContentItem` não deve gerar "slides" diretamente. Primeiro ele precisa chegar a script e, depois, gerar uma estrutura semântica reutilizável por output.

Exemplos de papéis semanticos:

- `hook`
- `setup`
- `core_point`
- `proof`
- `objection`
- `turn`
- `cta`
- `outro`
- `visual_beat`
- `platform_specific`

Esses papéis descrevem funcao editorial e narrativa. A composição visual vem depois.

Regra:

- a estrutura semântica não deve ser produzida diretamente da fonte bruta;
- antes disso, o sistema precisa decidir qual script está sendo usado:
  - script desenvolvido a partir da fonte;
  - script pronto fornecido pelo usuário;
  - script específico já definido para um output.

Regra adicional:

- a atual noção de `Build Narrative` não deve sobreviver como um botão genérico acoplado a uma visão ambígua;
- tecnicamente, ela precisa ser decomposta em:
  - preparação do conteúdo;
  - adaptação do script para o output;
  - estruturação operacional do output;
  - composição quando o output for audiovisual.
- em `final content mode`, a etapa de adaptação pode ser reduzida, mas a verificação de cobertura por output continua obrigatória.
- em `source mode`, a adaptação precisa ser guiada por prompts específicos de cada combinação `canal + formato`.
- a aplicação desses prompts por saída fecha a fase `Preparation` e só depois libera `Creation`.

### Entidades alvo

Entidades principais do domínio novo:

- `Workspace`: escopo de isolamento;
- `WorkspaceMembership`: autorização por equipe;
- `ContentItem`: conteúdo-base;
- `ContentSource`: origem do conteúdo;
- `ContentScript`: script-base ou script por output;
- `Project`: contexto estratégico/comercial;
- `ProjectContent`: vínculo reutilizável entre conteúdo e projeto;
- `PromotionTarget`: produto, oferta, evento ou destino promovido;
- `ShortLink`: link curto redirecionável usado em CTAs e distribuição;
- `ProjectContentOutput`: entregável concreto por canal/formato;
- `NarrativeUnit`: unidade semântica derivada do conteúdo;
- `Composition`: timeline declarativa de um output;
- `CompositionTrack`: trilha de vídeo, imagem, áudio, texto, overlay ou efeito;
- `CompositionClip`: item concreto posicionado na timeline;
- `Component`: primitive reutilizável de composição;
- `CompositionPreset`: receita visual/motion que combina componentes;
- `OutputTemplate`: receita estrutural/visual/editorial por tipo de saída;
- `TemplateSelectionStrategy`: estratégia de rotação, fila, aleatoriedade ou escolha contextual;
- `Asset`: entrada, intermediario ou saída de render.

Papéis mínimos de equipe esperados:

- `owner`: controla workspace, billing e membros;
- `admin`: administra conteúdos, projetos, settings operacionais e equipe conforme permissão;
- `member`: produz conteúdo e opera entregáveis conforme escopo autorizado.

### Composição em vez de slide

`slide` deve deixar de ser o centro do produto. Ele pode continuar existindo como um tipo de composição simples, mas o modelo principal precisa aceitar:

- vídeo puro;
- imagem pura;
- imagem com motion;
- vídeo com overlay;
- vídeo com burn effects;
- mescla de clips e imagens;
- CTA visual;
- transições;
- blocos comuns e blocos específicos por output.

Antes da composição, o sistema precisa aceitar estruturas operacionais diferentes por tipo de saída:

- vídeo longo: cenas e arcos maiores;
- vídeo curto: hook, progressão curta, CTA;
- imagem única: headline, supporting copy, CTA;
- carousel: cards/páginas;
- e-book/PDF: capítulos, seções e blocos de leitura;
- áudio: segmentos de narração e marcações de ritmo.

Isso implica:

- a preparação compartilhada do conteúdo não pertence ao editor de vídeo;
- o preview principal de composição também não pertence à visão resumida do projeto;
- o preview composicional deve existir no editor de vídeo quando o output já estiver em fase de criação.

### Componentes e presets

O conceito atual de template deve evoluir para um sistema combinavel:

- `StyleDNA`: identidade da marca;
- `Component Library`: pecas reutilizáveis;
- `CompositionPreset`: regras de combinação;
- `OutputTemplate`: regras de estrutura, copy, prompts e layout por formato;
- `VariationRules`: variação controlada para evitar vídeos parecidos.

Exemplos de `Component`:

- intro;
- CTA card;
- transition;
- lower third;
- overlay;
- frame treatment;
- caption style;
- zoom behavior;
- burn/glitch effect.

Exemplos de `CompositionPreset`:

- `direct_response_bold`
- `clean_authority`
- `faceless_dark_promo`
- `ugc_hybrid`
- `kinetic_cta`

Regras de variação esperadas:

- limitar repeticao de uma mesma transição;
- alternar familias de motion;
- variar crop/zoom dentro de faixas permitidas;
- escolher overlays por contexto semantico;
- permitir múltiplos layouts de CTA final;
- preservar identidade visual sem gerar clones.

Regras de seleção esperadas:

- permitir template fixo por output;
- permitir seleção aleatória dentro de um pool elegível;
- permitir rotação em fila;
- permitir round-robin;
- permitir escolha contextual baseada em canal, duração, campanha ou estágio.

## Motor de composição e render

Direção aceita:

- `Remotion` deve ser a camada principal de composição e preview;
- `ffmpeg` deve permanecer como infraestrutura de mídia, não como modelo mental principal do produto.

Papéis do Remotion:

- visualizador;
- timeline;
- preview antes do render final;
- composição declarativa;
- biblioteca de componentes;
- efeitos, transições e motion;
- parametrizacao por dados de domínio.

Papéis do ffmpeg:

- transcode;
- normalizacao de áudio/vídeo;
- proxies;
- operações auxiliares de export;
- otimizações de pipeline.

Implicacao:

- `render_slide`, `render_clip` e `concat_video` são etapas de execução herdadas;
- o alvo é um renderer orientado a `Composition`, onde slide passa a ser apenas um caso simples.

## Banco de dados

Banco padrão:

```text
SQLite em DATA_DIR/data.db
```

ORM:

```text
Prisma + @prisma/adapter-better-sqlite3
```

Schema:

```text
packages/db/prisma/schema.prisma
```

Migration COPE atual:

```text
packages/db/prisma/migrations/20260429194500_add_cope_content_projects/migration.sql
packages/db/prisma/migrations/20260430143000_add_block_animation_prompt/migration.sql
packages/db/prisma/migrations/20260430165000_add_block_scene_notes_and_sound_effect/migration.sql
packages/db/prisma/migrations/20260501002000_remove_content_project_kind/migration.sql
```

Modelos principais atuais:

- `Workspace`
- `User`
- `WorkspaceMembership`
- `Agent`
- `Course`
- `Module`
- `Lesson`
- `LessonVersion`
- `Block`
- `Asset`
- `Job`
- `Notification`
- `ContentProject`
- `ContentItem`

Leitura correta:

- a presenca de `Course/Module/Lesson` no schema atual não autoriza continuar modelando o produto por essas entidades;
- as proximas tabelas novas devem nascer no domínio `Project/Content/Output/Composition/Team`.

## API

App:

```text
apps/api/src/index.ts
```

Stack:

- Fastify;
- cookies;
- JWT;
- CORS;
- Swagger/Scalar;
- WebSocket;
- Prisma.

Endpoints FlowShopy existentes:

```text
GET  /content-projects
POST /content-projects
GET  /content-projects/:projectId/items
POST /content-projects/:projectId/items
PATCH /content-items/:itemId
GET  /content-items/:itemId/blocks
POST /content-items/:itemId/segment
PATCH /blocks/:blockId
```

Direção de contrato:

- endpoints novos não devem nascer com nomenclatura de curso/aula/módulo;
- a API nova deve convergir para `projects`, `content-items`, `project-contents`, `project-output-definitions` e `project-content-outputs`.

Auth:

- cookie `flowshopy_session`;
- JWT assinado por `AUTH_JWT_SECRET`;
- workspace resolvido a partir do usuário autenticado.

Settings:

- configurações em arquivo JSON sob `DATA_DIR`;
- LLM selecionada salva em System Settings;
- Gemini exige API key.
- TTS em Settings e catálogo de providers/rotas; o provider usado e escolhido pelo projeto;
- cada língua deve estar em no máximo uma rota TTS do catálogo;
- geração visual em Settings e catálogo de providers/modelos por capacidade, em vez de ComfyUI fixo;
- projeto escolhe modelo de imagem e, quando necessário, modelo de vídeo.

## Worker

App:

```text
apps/worker/src/index.ts
```

Responsabilidades:

- buscar jobs pendentes;
- executar segmentação/LLM;
- gerar áudio;
- gerar imagens;
- renderizar slides;
- renderizar clips;
- concatenar vídeo;
- healthcheck;
- comunicar progresso/status.

Regra de papel do worker:

- o worker e engine local de fábricacao de entregáveis;
- ele deve ser pensado como pipeline local de transformação de conteúdo em output.

Padrão de execução:

- serial por padrão;
- VRAM-friendly;
- jobs com retries/lease;
- assets gravados em `DATA_DIR`.

## Jobs

Tipos existentes/esperados:

- `segment`
- `segment_block`
- `tts`
- `probe_audio`
- `image_prompt`
- `comfyui_image`
- `render_slide`
- `render_clip`
- `concat_video`

Tipos futuros:

- `image_animation`
- `sound_effect`
- `voice_replacement`
- `audio_source_separation`
- `forced_audio_alignment`
- `publish_schedule`
- `source_video_analysis`
- `script_from_idea`

## Assets

Tipos atuais/esperados:

- `audio_raw`
- `image_raw`
- `slide_png`
- `clip_mp4`
- `final_mp4`
- `manifest_json`

Necessário evoluir:

- `thumbnail`
- `animated_scene_mp4`
- `sound_effect_audio`
- `voice_sample_audio`
- `voice_replacement_audio`
- `voice_replaced_video_mp4`
- `platform_publish_payload`

## Frontend

App:

```text
apps/web
```

Stack:

- React 18;
- Vite;
- TypeScript;
- Tailwind;
- lucide-react;
- Radix primitives;
- Recharts.

Tela ativa de FlowShopy:

```text
apps/web/src/components/ContentProjects.tsx
```

UX atual:

- sidebar mostra `Projects`;
- sidebar também mostra `Content` como área de listagem/cadastro de conteúdos;
- primeira tela é uma grade visual de projetos;
- cadastro de projeto fica em tela separada;
- detalhe do projeto contém Contents, Feed e Kanban; `Agenda` volta quando houver base real de distribuição;
- a área Content lista conteúdos e abre uma tela separada de cadastro;
- o cadastro de Content associa o conteúdo somente a um projeto existente;
- a área Content não gera cenas nem abre editor de vídeo.
- a listagem de Content deve destacar o conteúdo; projetos aparecem apenas como usos/associações secundarias.

Direção adicional:

- a UI precisa ganhar uma camada clara de autenticação, workspace e equipe;
- a área atual de convites é apenas uma base inicial e ainda não cobre o modelo real de autorização;
- o próximo passo de produto é o usuário entender que escreve conteúdo, associa a projeto e escolhe o que quer gerar dali.

Navegacao:

```text
apps/web/src/components/Sidebar.tsx
apps/web/src/App.tsx
```

Implementado na tela Projects:

- grade visual de projetos;
- cadastro separado de projeto;
- detalhe do projeto;
- Contents;
- Feed;
- Kanban;
- `Agenda` como capacidade futura, dependente de integrações de contas/plataformas.

Editor de cenas:

- `ttsText` editável;
- `onScreenJson` editável;
- `imagePromptJson` editável;
- `animationPromptJson` editável.
- `directionNotesJson` editável;
- `soundEffectPromptJson` editável e reservado para geração futura.

## Integração LLM

Providers atuais:

- Ollama local;
- Gemini cloud configurável;
- OpenAI aparece em configuração mas worker ainda não deve ser tratado como implementado para produção se não houver caminho completo.

Gemini:

```text
packages/shared/src/gemini.ts
```

Uso:

- se provider salvo for `gemini`, worker chama Gemini para tarefas LLM;
- API exige `apiKey` para Gemini nas settings.

## Pipeline de produção do projeto

Direção:

- Settings cataloga providers, rotas e modelos disponíveis;
- o Projeto declara quais etapas de produção fazem parte do produto final;
- cada etapa ligada aponta para uma rota/modelo do catálogo quando precisar de um provider externo;
- o fluxo deve aceitar projetos sem TTS, sem imagem, sem vídeo IA, ou com combinacoes diferentes dessas etapas.

Contrato inicial em `ContentProject.metadata.pipeline`:

```text
pipeline
- script.mode: none | scene_blocks | music_storyboard
- audio.mode: none | tts | music | video_native_audio
- audio.tts: rota TTS resolvida quando mode = tts
- audio.soundFx: camada opcional futura de efeitos sonoros
- audio.backgroundMusic: biblioteca/selecao opcional futura de musicas de fundo
- image.mode: none | generate
- image.model: provider/modelo de imagem quando mode = generate
- video.mode: none | editor_motion | text_to_video | image_to_video | looped_clips
- video.model: provider/modelo de video quando o modo usar provider de video IA
- render.outputMode: images_only | single_video | clips
- render.textLayer: none | captions | slide_points | highlights
- render.templateSelection: manual | random | sequential
```

Interpretacao de produto:

- esse pipeline não define apenas "como renderizar";
- ele representa a expectativa do usuário sobre o que o core deve produzir a partir do conteúdo associado;
- o passo seguinte e tirar esse contrato de `metadata` e leva-lo para entidades dedicadas de output.

Semantica:

- `metadata.pipeline` e a fonte única de verdade para as etapas do projeto;
- não devem existir campos paralelos como `metadata.tts` ou `metadata.visualGeneration` no contrato novo;
- `audio.mode = tts`: exige `pipeline.audio.tts` com rota TTS do projeto;
- `audio.mode = music`: áudio principal vem de música/faixa externa, sem TTS associado ao projeto;
- `audio.mode = video_native_audio`: fala/audio vem do provider de vídeo, respeitando limites do modelo;
- `audio.soundFx`: efeitos sonoros entram como camada de mixagem, não como parte obrigatoria da segmentação;
- `audio.backgroundMusic`: projeto seleciona músicas permitidas de uma biblioteca global ou, futuramente, um provider de música instrumental IA;
- `image.mode = generate`: gera imagens a partir das cenas;
- `video.mode = editor_motion`: usa imagens e movimentos automatizados de editor, como pan, zoom e loop;
- `video.mode = text_to_video`: gera vídeo direto de texto/prompt;
- `video.mode = image_to_video`: gera imagem base e anima com provider de vídeo;
- `video.mode = looped_clips`: gera poucos clipes e repete/compõe até cobrir a duração do produto final.
- `render.textLayer`: define se o vídeo final tera captions, pontos de slide ou destaques, sem obrigar `on_screen` na segmentação.

Decisao de beta:

- não usar React Flow agora;
- expor cards/toggles de etapas no projeto;
- manter o pipeline serial e validado por regras simples;
- deixar React Flow como modo avancado futuro, quando houver ramificacoes reais e reutilizacao de steps.

Exemplos:

- narração comum: `script.scene_blocks` + `audio.tts` + `image.generate` + `video.editor_motion`;
- shorts com vídeo IA: `script.scene_blocks` + `audio.video_native_audio` + `video.text_to_video`;
- playlist músical simples: `script.music_storyboard` + `audio.music` + `video.looped_clips`;
- imagens sociais: `script.scene_blocks` + `audio.none` + `image.generate` + `render.images_only`.

## Templates de render e textLayer

Decisao:

- texto na tela não e `script.mode`;
- texto na tela é uma camada de saída/render, controlada por template;
- `script.mode` decide como o roteiro vira blocos estruturais;
- `render.textLayer` e o template decidem como esses blocos aparecem no produto final.

Responsabilidades do template:

- captions: com ou sem legenda, estilo, posicao, tamanho, cor, sombra e efeito;
- highlights: palavras ou trechos em destaque, possívelmente dirigidos por marcadores futuros como `[show]`;
- slide_points: pontos curtos na tela, mais perto de um layout de apoio textual;
- logo: asset, posicao, tamanho e opacidade;
- overlay: asset de vídeo com alpha, opacidade e velocidade;
- transições, enquadramento, safe áreas e identidade visual.

Politicas por projeto/output:

- `manual`: usuário aprova o template antes de renderizar;
- `random`: escolhe um template permitido aleatoriamente;
- `sequential`: percorre templates permitidos em ordem e volta ao início.

Implicacao para a segmentação:

- `buildSegmentationPrompt` não deve gerar `on_screen`;
- a divisao estrutural deve produzir `source_text`, `word_count` e `duration_estimate_s`;
- a etapa seguinte pode gerar prompts visuais, captions ou destaques conforme `render.textLayer` e template.

## Visual beats para music_storyboard

`music_storyboard` não deve ser tratado como uma sequencia de blocos de fala. Ele descreve momentos visuais de uma música, playlist ou album.

Definição:

- um visual beat é uma mudanca coerente de imagem, clima, assunto, energia, camera ou ação visual;
- no beta, visual beats podem usar durações fixas ou faixas aceitas pelo provider de vídeo;
- sincronização fina com música fica para etapa posterior, usando BPM, waveform, transientes ou marcadores manuais.

Implementação incremental:

- beta: segmentar roteiro/storyboard em visual beats com duração aproximada;
- depois: importar música, medir duração, BPM e transientes;
- depois: distribuir beats visuais no timeline;
- depois: permitir loop de poucos clipes curtos sobre músicas longas;
- depois: gerar uma historia visual completa para playlist/album.

## Biblioteca de músicas de fundo

Direção:

- criar uma biblioteca global de músicas enviadas pelo usuário;
- cada projeto escolhe quais faixas podem ser usadas como background music;
- na renderizacao, a selecao pode ser aleatoria, sequencial ou manual;
- a mixagem deve respeitar volume, fade, loop, crossfade e duração final.

Futuro:

- adicionar providers de geração de música instrumental IA;
- manter música instrumental sem letra como caso principal para background;
- guardar licença/origem/metadados para evitar uso indevido em publicação.

## Pipeline de vídeo

Fluxo esperado:

1. `ContentItem.sourceText/scriptText` pode existir sem projeto e pode ser associado a um ou mais projetos.
2. Projeto define canais, formatos e pipeline de produção.
3. Um `ProjectContentOutput` de vídeo escolhe modo de fala: sem fala, TTS externo ou áudio nativo do motor de vídeo.
4. O sistema resolve `SpeechBudget` a partir da rota TTS por língua ou do provider/modelo de vídeo.
5. Um `ProjectContentOutput` de vídeo inicia a segmentação com limites de fala/duração já resolvidos.
6. Segmentação estrutural por LLM cria `Block[]`/visual beats, sem exigir `onScreenJson`.
7. fallback secundario usa segundo modelo Gemini quando disponível.
8. fallback final usa heurística deterministica com o mesmo orçamento conhecido.
9. criação de `ttsText` quando a fala for externa;
10. criação de `imagePromptJson`
11. criação de `animationPromptJson`
12. criação/reserva de `directionNotesJson`
13. criação/reserva opcional de `soundEffectPromptJson`
14. TTS gera áudio quando o modo for `external_tts`
15. ffprobe mede duração quando existir áudio externo
16. provider visual gera imagem ou vídeo de cena conforme capacidade escolhida
17. Playwright renderiza slide PNG quando o fluxo for slide/imagem estática
18. ffmpeg renderiza clip MP4 quando necessário
19. ffmpeg concatena/compoe vídeo final do output

## Orcamento de fala e segmentação

Objetivo:

- evitar blocos que falham ou degradam na etapa de fala;
- fazer a segmentação respeitar o motor real que vai narrar a cena;
- manter o conceito independente do provider atual.

Contrato conceitual:

```text
SpeechBudget
- mode: external_tts | video_native_audio | none
- language
- sourceProviderId
- targetChars
- maxChars
- targetSpeechSeconds
- maxSpeechSeconds
- acceptedDurationsSeconds
```

Resolucao:

- `external_tts`: usar a rota TTS escolhida pelo projeto e seus limites de provider/voz;
- não existe TTS global ativo para produção;
- `video_native_audio`: usar settings do provider/modelo de vídeo escolhido para o output;
- `none`: segmentação pode priorizar ritmo visual, sem limite de fala;
- se `mode` exigir fala e não houver configuração, bloquear antes de gerar blocos.

Uso pelo segmentador:

- `buildSegmentationPrompt` deve receber `SpeechBudget`;
- o prompt deve pedir blocos dentro de `targetChars` e nunca acima de `maxChars` quando houver TTS;
- para fala nativa de vídeo, o prompt deve pedir blocos que caibam na duração maxima aceita pelo provider/modelo;
- a resposta do LLM deve ser validada deterministicamente antes de persistir blocos.
- se o LLM primario falhar ou retornar JSON/blocos invalidos, o worker tenta o modelo Gemini fallback configurado;
- se o fallback também falhar, o worker usa heurística deterministica e registra isso em log.

## Providers visuais

Estado atual:

- ComfyUI é o provider de imagem implementado;
- animação/vídeo ainda está como contrato futuro (`animationPromptJson`, `image_animation`, `render_animated_scene`).

Direção alvo:

- settings deve ter uma camada `visualGeneration` com providers e modelos;
- cada provider declara capacidades: `text_to_image`, `image_to_image`, `text_to_video`, `image_to_video`, `native_audio`;
- projeto/output escolhe provider/modelo de imagem e provider/modelo de vídeo conforme formato, qualidade e custo;
- vídeo e opcional por projeto: um projeto pode usar apenas ComfyUI para imagem, outro pode usar Veo Extension para imagem e vídeo;
- o worker deve tratar cada provider por adaptador, como hoje faz com ComfyUI.

Extensao Veo:

- objetivo principal do FlowShopy e usar uma extensao externa para gerar imagem/vídeo com Veo e recuperar resultados para continuar o pipeline;
- a extensao deve ser modelada como provider `veo_extension`;
- o contrato deve ser parecido com ComfyUI: enviar prompt/parametros/assets, acompanhar status, baixar resultado, salvar `Asset` e metadados;
- a integração direta com API oficial (`vertex_veo`) pode coexistir como outro provider, mas não deve ser requisito para o fluxo principal.

## Substituicao de voz

Objetivo:

- permitir trocar a voz final de um vídeo já gerado usando uma amostra fornecida pelo usuário;
- cobrir vídeos gerados com fala nativa do provider visual quando a voz original vier inconsistente;
- evitar nova geração visual cara quando apenas a voz precisa mudar.

Fluxo técnico:

1. registrar `voice_sample_audio` com consentimento/metadados;
2. extrair áudio do vídeo fonte;
3. opcionalmente separar voz, música e efeitos;
4. resolver texto da cena pelo roteiro existente ou por transcrição;
5. gerar nova fala pelo provider TTS/clonagem configurado para a língua;
6. alinhar a nova fala ao timing original;
7. mixar voz, fundo e efeitos;
8. salvar `voice_replaced_video_mp4` como novo asset derivado.

Contrato conceitual:

```text
voiceReplacement
- sourceVideoAssetId
- sourceVoiceSampleAssetId
- targetVoiceId
- language
- providerId
- preserveBackgroundAudio
- alignmentMode
- maxDriftMs
```

Dependencias futuras:

- source separation para preservar música/ambiencia quando necessário;
- forced alignment/time stretching para manter sincronismo;
- politica de direitos/consentimento para amostras de voz;
- invalidacao de assets quando a amostra, voz alvo, roteiro ou vídeo fonte mudar.

## Outputs, CTA e render por blocos

Objetivo:

- reaproveitar cenas comuns entre canais;
- permitir CTA e linguagem específicos por plataforma;
- evitar re-render completo quando muda apenas uma parte variavel.

Modelo:

- `ProjectContentOutput`: entregável específico de um conteúdo dentro de um projeto, como YouTube `16:9`, Shorts `9:16`, TikTok `9:16` ou Facebook vídeo;
- `Block.role`: `core`, `intro`, `cta`, `outro`, `platform_specific`;
- `Block.outputScope`: `shared` para blocos comuns ou identificador do output/canal para blocos específicos;
- `renderPlanJson`: ordem dos blocos que compoem cada output;
- `ctaStrategyJson`: texto, tom, ação e restrições do CTA por canal.

Estratégia de render:

- renderizar blocos `core` e cachear seus assets;
- renderizar blocos específicos por output quando necessário;
- montar o vídeo final por output usando os blocos comuns e específicos;
- se a transição entre blocos for simples, concatenar clips prontos;
- se a transição depender de continuidade visual entre duas cenas, re-renderizar a borda afetada ou a sequencia final do output;
- V1 deve preferir transições simples entre blocos variáveis para preservar velocidade, cache e previsibilidade.

Exemplos:

- YouTube: CTA pode pedir inscrição no canal;
- Facebook: CTA pode pedir seguir a página;
- TikTok: CTA pode pedir tocar no botão de seguir do perfil;
- Shorts/Reels/TikTok podem exigir ritmo, texto em tela e CTA diferentes do vídeo horizontal.

## Reprocessamento granular

Regras:

- mudou `ttsText`: invalidar áudio, clip e final;
- mudou `imagePromptJson`: invalidar imagem, slide, clip e final;
- mudou `onScreenJson`: invalidar slide, clip e final;
- mudou `animationPromptJson`: invalidar animação, clip e final;
- mudou `soundEffectPromptJson`: invalidar sound effect, clip e final;
- mudou template: invalidar slide, clip e final.

Estado atual:

- `PATCH /blocks/:blockId` apaga assets locais afetados por `ttsText`, `onScreenJson`, `imagePromptJson`, `animationPromptJson` e `soundEffectPromptJson`;
- o asset `sound_effect_audio` ainda não e gerado, mas o contrato já está reservado.

## Segurança

V1 local/self-hosted:

- auth por cookie/JWT;
- workspace isolation;
- secrets em `.env`/settings locais;
- não commitar chaves API;
- em produção, HTTPS obrigatorio;
- `AUTH_COOKIE_SECURE=true` em HTTPS;
- secrets fortes para JWT e agent control.

## Decisões técnicas

- manter monorepo pnpm;
- manter SQLite na V1 local-first;
- evitar refactor fisico grande antes do fluxo content-first ficar usavel;
- usar metadata para campos instaveis até estabilizar contrato;
- adicionar tabelas dedicadas quando houver uso consistente.

Decisao adicional:

- não aceitar novas features ancoradas em nomenclatura ou fluxo de curso/aula/módulo;
- toda feature nova deve ser defendida em termos de conteúdo, projeto, output, composição, equipe e promoção.
