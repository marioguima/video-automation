# Domain Translation Spec (Vizlec -> Channel/Video)

Status: `draft (execution-oriented)`

Objetivo: guiar a recontextualização do kernel do `vizlec` para o produto de vídeo para canal, sem quebrar o fluxo de blocos/assets/jobs.

## Princípio

O kernel permanece:
- roteiro -> blocos -> assets -> jobs -> revisão -> render final

O que muda é o contexto de produto:
- `course/module/lesson` -> `channel/video`

## Tradução de entidades (produto)

### Estrutura alvo (produto)

- `Workspace` (mantido)
- `Channel`
- `Video`
- `VideoVersion` (recomendado)
- `Block`
- `Asset`
- `Job`

### Mapeamento prático (migração)

- `Course` -> `Channel`
- `Module` -> **fora do MVP**
  - pode existir apenas como compat layer temporária
- `Lesson` -> `Video`
- `LessonVersion` -> `VideoVersion`
- `Block` -> `Block` (mantido)
- `Asset` -> `Asset` (mantido)
- `Job` -> `Job` (mantido)

## Tradução de campos (bloco)

Campos já bons e mantidos:
- `sourceText`
- `ttsText`
- `audioDurationS`
- `imagePromptJson`

Campos com mudança de uso:
- `onScreenJson`
  - MVP: ignorado / opcional
  - pós-MVP: volta como recurso de vídeo educacional

## Tradução de rotas (compat layer inicial)

Estratégia: manter temporariamente algumas rotas do kernel (`lesson`, `lesson-version`) e expor aliases novos (`video`, `video-version`) para acelerar port do frontend.

### Compat temporária (rápido para subir)

- `/lessons/:id` ~ alias interno de `/videos/:id`
- `/lesson-versions/:id/*` ~ alias interno de `/video-versions/:id/*`

### Rotas alvo (produto)

- `/channels`
- `/channels/:channelId/videos`
- `/videos/:videoId`
- `/video-versions/:versionId/blocks`
- `/video-versions/:versionId/segment`
- `/video-versions/:versionId/tts`
- `/video-versions/:versionId/images`
- `/video-versions/:versionId/final-video`
- `/blocks/:blockId`
- `/blocks/:blockId/tts`
- `/blocks/:blockId/image`
- `/blocks/:blockId/audio/raw`
- `/blocks/:blockId/image/raw`

## Tradução de UX (frontend)

### MVP

- "Course" -> "Channel"
- "Lesson" -> "Video"
- esconder/remover fluxos de módulo
- manter editor de blocos como tela principal de revisão
- remover obrigatoriedade de `on-screen`

### Pós-MVP

- reintroduzir `on-screen` como opção por template/tipo de vídeo

## Decisão de execução (agora)

1. Portar kernel e rodar local.
2. Adicionar compat layer de domínio.
3. Recontextualizar UI e rotas.
4. Integrar motor visual deste projeto no render final.
