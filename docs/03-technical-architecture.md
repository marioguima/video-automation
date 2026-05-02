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
- ffmpeg/ffprobe para video/audio;
- Ollama/Gemini para LLM;
- ComfyUI para imagem atual;
- XTTS para TTS atual;
- providers futuros de imagem/video por configuracao, incluindo extensao Veo e motores locais.

## Estrutura do repositorio

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

## Arquitetura logica

```text
Browser UI
  -> API Fastify
    -> SQLite/Prisma
    -> filesystem DATA_DIR
    -> WebSocket/HTTP para worker/agente
      -> LLM/TTS/ComfyUI/Playwright/ffmpeg
```

## Dominio atual vs dominio alvo

Dominio herdado:

```text
Course -> Module -> Lesson -> LessonVersion -> Block -> Asset/Job
```

Dominio alvo:

```text
Workspace -> ContentItem
Workspace -> Project
ContentItem <-> Project via ProjectContent
ProjectContent -> Variant -> Scene/Block -> Asset/Job
```

Estrategia atual:

- manter `Course/Module/Lesson` como backing tecnico;
- expor `Project/ContentItem` para a UI;
- salvar ponte em `ContentItem.metadataJson.backing`;
- tratar `ContentItem.projectId` como acoplamento temporario;
- evoluir para `ProjectContent` para permitir um conteudo associado a muitos projetos;
- migrar gradualmente para Variant/Scene sem quebrar o pipeline.
- nao iniciar segmentacao/render a partir de `ContentItem` isolado na UI;
- iniciar segmentacao/render somente no contexto de `Project` e, idealmente, `Variant`.

Nota de produto:

- `Project` e agrupador editorial/comercial, nao destino de publicacao;
- `Project` nao possui campo `kind`;
- qualquer tentativa de enviar `kind` para projeto deve ser recusada;
- canais/perfis/paginas aparecem principalmente como destinations/variantes quando um projeto publica em varios canais.

## Banco de dados

Banco padrao:

```text
SQLite em DATA_DIR/vizlec.db
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

Auth:

- cookie `vizlec_session`;
- JWT assinado por `AUTH_JWT_SECRET`;
- workspace resolvido a partir do usuario autenticado.

Settings:

- configuracoes em arquivo JSON sob `DATA_DIR`;
- LLM selecionada salva em System Settings;
- Gemini exige API key.
- TTS em Settings e catalogo de providers/rotas; o provider usado e escolhido pelo projeto;
- cada lingua deve estar em no maximo uma rota TTS do catalogo;
- geracao visual em Settings e catalogo de providers/modelos por capacidade, em vez de ComfyUI fixo;
- projeto escolhe modelo de imagem e, quando necessario, modelo de video.

## Worker

App:

```text
apps/worker/src/index.ts
```

Responsabilidades:

- buscar jobs pendentes;
- executar segmentacao/LLM;
- gerar audio;
- gerar imagens;
- renderizar slides;
- renderizar clips;
- concatenar video;
- healthcheck;
- comunicar progresso/status.

Padrao de execucao:

- serial por padrao;
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

Necessario evoluir:

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
- sidebar tambem mostra `Content` como area de listagem/cadastro de conteudos;
- primeira tela e uma grade visual de projetos;
- cadastro de projeto fica em tela separada;
- detalhe do projeto contem Contents, Feed, Kanban e Agenda;
- a area Content lista conteudos e abre uma tela separada de cadastro;
- o cadastro de Content associa o conteudo somente a um projeto existente;
- a area Content nao gera cenas nem abre editor de video.
- a listagem de Content deve destacar o conteudo; projetos aparecem apenas como usos/associacoes secundarias.

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
- Agenda.

Editor de cenas:

- `ttsText` editavel;
- `onScreenJson` editavel;
- `imagePromptJson` editavel;
- `animationPromptJson` editavel.
- `directionNotesJson` editavel;
- `soundEffectPromptJson` editavel e reservado para geracao futura.

## Integracao LLM

Providers atuais:

- Ollama local;
- Gemini cloud configuravel;
- OpenAI aparece em configuracao mas worker ainda nao deve ser tratado como implementado para producao se nao houver caminho completo.

Gemini:

```text
packages/shared/src/gemini.ts
```

Uso:

- se provider salvo for `gemini`, worker chama Gemini para tarefas LLM;
- API exige `apiKey` para Gemini nas settings.

## Pipeline de producao do projeto

Direcao:

- Settings cataloga providers, rotas e modelos disponiveis;
- o Projeto declara quais etapas de producao fazem parte do produto final;
- cada etapa ligada aponta para uma rota/modelo do catalogo quando precisar de um provider externo;
- o fluxo deve aceitar projetos sem TTS, sem imagem, sem video IA, ou com combinacoes diferentes dessas etapas.

Contrato inicial em `ContentProject.metadata.pipeline`:

```text
pipeline
- script.mode: none | scene_blocks | music_storyboard
- audio.mode: none | tts | music | video_native_audio
- image.enabled: boolean
- video.mode: none | editor_motion | text_to_video | image_to_video | looped_clips
- render.outputMode: images_only | single_video | clips
```

Semantica:

- `audio.mode = tts`: exige `metadata.tts` com rota TTS do projeto;
- `audio.mode = music`: audio principal vem de musica/faixa externa, sem TTS associado ao projeto;
- `audio.mode = video_native_audio`: fala/audio vem do provider de video, respeitando limites do modelo;
- `image.enabled = true`: gera imagens a partir das cenas;
- `video.mode = editor_motion`: usa imagens e movimentos automatizados de editor, como pan, zoom e loop;
- `video.mode = text_to_video`: gera video direto de texto/prompt;
- `video.mode = image_to_video`: gera imagem base e anima com provider de video;
- `video.mode = looped_clips`: gera poucos clipes e repete/compõe ate cobrir a duracao do produto final.

Decisao de beta:

- nao usar React Flow agora;
- expor cards/toggles de etapas no projeto;
- manter o pipeline serial e validado por regras simples;
- deixar React Flow como modo avancado futuro, quando houver ramificacoes reais e reutilizacao de steps.

Exemplos:

- narracao comum: `script.scene_blocks` + `audio.tts` + `image.enabled` + `video.editor_motion`;
- shorts com video IA: `script.scene_blocks` + `audio.video_native_audio` + `video.text_to_video`;
- playlist musical simples: `script.music_storyboard` + `audio.music` + `video.looped_clips`;
- imagens sociais: `script.scene_blocks` + `audio.none` + `image.enabled` + `render.images_only`.

## Pipeline de video

Fluxo esperado:

1. `ContentItem.sourceText/scriptText` fica associado a um projeto.
2. Projeto define canais, formatos e pipeline de producao.
3. Uma `Variant` de video escolhe modo de fala: sem fala, TTS externo ou audio nativo do motor de video.
4. O sistema resolve `SpeechBudget` a partir da rota TTS por lingua ou do provider/modelo de video.
5. Uma `Variant` de video inicia a segmentacao com limites de fala/duracao ja resolvidos.
6. Segmentacao cria `Block[]` com `role` e `variantScope`.
7. criacao de `onScreenJson`
8. criacao de `ttsText` quando a fala for externa;
9. criacao de `imagePromptJson`
10. criacao de `animationPromptJson`
11. criacao/reserva de `directionNotesJson`
12. criacao/reserva opcional de `soundEffectPromptJson`
13. TTS gera audio quando o modo for `external_tts`
14. ffprobe mede duracao quando existir audio externo
15. provider visual gera imagem ou video de cena conforme capacidade escolhida
16. Playwright renderiza slide PNG quando o fluxo for slide/imagem estatica
17. ffmpeg renderiza clip MP4 quando necessario
18. ffmpeg concatena/compoe video final da Variant

## Orcamento de fala e segmentacao

Objetivo:

- evitar blocos que falham ou degradam na etapa de fala;
- fazer a segmentacao respeitar o motor real que vai narrar a cena;
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
- nao existe TTS global ativo para producao;
- `video_native_audio`: usar settings do provider/modelo de video escolhido para a Variant;
- `none`: segmentacao pode priorizar ritmo visual, sem limite de fala;
- se `mode` exigir fala e nao houver configuracao, bloquear antes de gerar blocos.

Uso pelo segmentador:

- `buildSegmentationPrompt` deve receber `SpeechBudget`;
- o prompt deve pedir blocos dentro de `targetChars` e nunca acima de `maxChars` quando houver TTS;
- para fala nativa de video, o prompt deve pedir blocos que caibam na duracao maxima aceita pelo provider/modelo;
- a resposta do LLM deve ser validada deterministicamente antes de persistir blocos.

## Providers visuais

Estado atual:

- ComfyUI e o provider de imagem implementado;
- animacao/video ainda esta como contrato futuro (`animationPromptJson`, `image_animation`, `render_animated_scene`).

Direcao alvo:

- settings deve ter uma camada `visualGeneration` com providers e modelos;
- cada provider declara capacidades: `text_to_image`, `image_to_image`, `text_to_video`, `image_to_video`, `native_audio`;
- projeto/variant escolhe provider/modelo de imagem e provider/modelo de video conforme formato, qualidade e custo;
- video e opcional por projeto: um projeto pode usar apenas ComfyUI para imagem, outro pode usar Veo Extension para imagem e video;
- o worker deve tratar cada provider por adaptador, como hoje faz com ComfyUI.

Extensao Veo:

- objetivo principal do FlowShopy e usar uma extensao externa para gerar imagem/video com Veo e recuperar resultados para continuar o pipeline;
- a extensao deve ser modelada como provider `veo_extension`;
- o contrato deve ser parecido com ComfyUI: enviar prompt/parametros/assets, acompanhar status, baixar resultado, salvar `Asset` e metadados;
- a integracao direta com API oficial (`vertex_veo`) pode coexistir como outro provider, mas nao deve ser requisito para o fluxo principal.

## Substituicao de voz

Objetivo:

- permitir trocar a voz final de um video ja gerado usando uma amostra fornecida pelo usuario;
- cobrir videos gerados com fala nativa do provider visual quando a voz original vier inconsistente;
- evitar nova geracao visual cara quando apenas a voz precisa mudar.

Fluxo tecnico:

1. registrar `voice_sample_audio` com consentimento/metadados;
2. extrair audio do video fonte;
3. opcionalmente separar voz, musica e efeitos;
4. resolver texto da cena pelo roteiro existente ou por transcricao;
5. gerar nova fala pelo provider TTS/clonagem configurado para a lingua;
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

- source separation para preservar musica/ambiencia quando necessario;
- forced alignment/time stretching para manter sincronismo;
- politica de direitos/consentimento para amostras de voz;
- invalidacao de assets quando a amostra, voz alvo, roteiro ou video fonte mudar.

## Variants, CTA e render por blocos

Objetivo:

- reaproveitar cenas comuns entre canais;
- permitir CTA e linguagem especificos por plataforma;
- evitar re-render completo quando muda apenas uma parte variavel.

Modelo:

- `Variant`: entregavel especifico de um conteudo dentro de um projeto, como YouTube `16:9`, Shorts `9:16`, TikTok `9:16` ou Facebook video;
- `Block.role`: `core`, `intro`, `cta`, `outro`, `platform_specific`;
- `Block.variantScope`: `shared` para blocos comuns ou identificador da variante/canal para blocos especificos;
- `renderPlanJson`: ordem dos blocos que compoem cada variante;
- `ctaStrategyJson`: texto, tom, acao e restricoes do CTA por canal.

Estrategia de render:

- renderizar blocos `core` e cachear seus assets;
- renderizar blocos especificos por variante quando necessario;
- montar o video final por variante usando os blocos comuns e especificos;
- se a transicao entre blocos for simples, concatenar clips prontos;
- se a transicao depender de continuidade visual entre duas cenas, re-renderizar a borda afetada ou a sequencia final da variante;
- V1 deve preferir transicoes simples entre blocos variaveis para preservar velocidade, cache e previsibilidade.

Exemplos:

- YouTube: CTA pode pedir inscricao no canal;
- Facebook: CTA pode pedir seguir a pagina;
- TikTok: CTA pode pedir tocar no botao de seguir do perfil;
- Shorts/Reels/TikTok podem exigir ritmo, texto em tela e CTA diferentes do video horizontal.

## Reprocessamento granular

Regras:

- mudou `ttsText`: invalidar audio, clip e final;
- mudou `imagePromptJson`: invalidar imagem, slide, clip e final;
- mudou `onScreenJson`: invalidar slide, clip e final;
- mudou `animationPromptJson`: invalidar animacao, clip e final;
- mudou `soundEffectPromptJson`: invalidar sound effect, clip e final;
- mudou template: invalidar slide, clip e final.

Estado atual:

- `PATCH /blocks/:blockId` apaga assets locais afetados por `ttsText`, `onScreenJson`, `imagePromptJson`, `animationPromptJson` e `soundEffectPromptJson`;
- o asset `sound_effect_audio` ainda nao e gerado, mas o contrato ja esta reservado.

## Segurança

V1 local/self-hosted:

- auth por cookie/JWT;
- workspace isolation;
- secrets em `.env`/settings locais;
- nao commitar chaves API;
- em producao, HTTPS obrigatorio;
- `AUTH_COOKIE_SECURE=true` em HTTPS;
- secrets fortes para JWT e agent control.

## Decisoes tecnicas

- manter monorepo pnpm;
- manter SQLite na V1 local-first;
- manter backing Course/Module/Lesson por ora;
- evitar refactor fisico grande antes do fluxo content-first ficar usavel;
- usar metadata para campos instaveis ate estabilizar contrato;
- adicionar tabelas dedicadas quando houver uso consistente.
