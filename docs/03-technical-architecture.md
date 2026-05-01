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
- ComfyUI para imagem;
- provedores TTS: XTTS, Chatterbox, Qwen.

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

## Pipeline de video

Fluxo esperado:

1. `ContentItem.sourceText/scriptText` fica associado a um projeto.
2. Projeto define canais, formatos e variantes.
3. Uma `Variant` de video inicia a segmentacao.
4. Segmentacao cria `Block[]` com `role` e `variantScope`.
5. criacao de `onScreenJson`
6. criacao de `ttsText`
7. criacao de `imagePromptJson`
8. criacao de `animationPromptJson`
9. criacao/reserva de `directionNotesJson`
10. criacao/reserva opcional de `soundEffectPromptJson`
11. TTS gera audio
12. ffprobe mede duracao
13. ComfyUI gera imagem
14. Playwright renderiza slide PNG
15. ffmpeg renderiza clip MP4
16. ffmpeg concatena/compoe video final da Variant

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
