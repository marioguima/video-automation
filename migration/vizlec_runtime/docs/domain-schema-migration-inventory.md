# Domain Schema Migration Inventory (`course/module/lesson` -> `channel/section/video`)

Objetivo: mapear o impacto real da migracao de base (Prisma/DB) antes de executar renomeacoes estruturais.

Status atual:
- Superficie externa (frontend principal + aliases API + WS/SSE/HTTP payload aliases) ja fala `channel/section/video`.
- Schema Prisma e queries internas ainda usam `Course/Module/Lesson/LessonVersion`.
- `Module` sera mantido temporariamente como `Section` (compatibilidade), com remocao/reavaliacao depois da estabilizacao.

## 1. Entidades Prisma (legado -> dominio novo)

Mapeamento atual (planejado):
- `Course` -> `Channel`
- `Module` -> `Section` (temporario; possivel remocao futura)
- `Lesson` -> `Video`
- `LessonVersion` -> `VideoVersion`
- `Block` -> `Block` (mantem)
- `Asset` -> `Asset` (mantem)
- `Job` -> `Job` (mantem)

### 1.1 Entidades com maior impacto

1. `Course`
- Relacoes:
  - `Workspace.courses`
  - `Course.modules`
- Impacta:
  - dashboard metrics
  - build status agregado
  - reorder e cascatas
  - storage path raiz (`data/courses/...`)

2. `Module` (Section)
- Relacoes:
  - `Workspace.modules`
  - `Module.courseId`
  - `Module.lessons`
- Impacta:
  - ordenacao e estrutura do canal
  - agrupamento de videos
  - payloads de build status (`modules[].lessons[]`)

3. `Lesson`
- Relacoes:
  - `Workspace.lessons`
  - `Lesson.moduleId`
  - `Lesson.versions`
- Impacta:
  - editor principal
  - notificacoes (`relatedLessonId`)
  - jobs de geracao/cancelamento

4. `LessonVersion`
- Relacoes:
  - `Workspace.lessonVersions`
  - `LessonVersion.lessonId`
  - `LessonVersion.blocks`
  - `LessonVersion.jobs`
- Impacta:
  - segmentacao, TTS, imagens, render, legenda, BGM
  - preferencias (`voiceVolume`, `masterVolume`, `bgm*`)
  - SSE/WS de progresso

## 2. Campos e colecoes Prisma a reavaliar na migracao

### 2.1 `Workspace`
Colecoes legacy ainda expostas no schema:
- `courses`
- `modules`
- `lessons`
- `lessonVersions`

Plano:
- manter durante transicao
- migrar para nomes novos (`channels`, `sections`, `videos`, `videoVersions`)
- atualizar queries e selects relacionados

### 2.2 `Block`
Campos legacy semanticos ainda presentes:
- `lessonVersionId`
- `onScreenJson` (ja removido do fluxo MVP, mas ainda existe no schema)

Plano:
- `lessonVersionId` -> `videoVersionId` (fase estrutural)
- `onScreenJson`: remover em fase posterior de limpeza de schema (apos migracao principal estabilizar)

### 2.3 `Job`
Campos legacy semanticos:
- `lessonVersionId`
- comentarios em `scope/type` com termos antigos

Plano:
- renomear campo / comentario quando `LessonVersion` migrar
- manter tipos internos por compatibilidade durante rollout controlado

## 3. Hotspots de queries (alto impacto)

### 3.1 API (`apps/api/src/index.ts`)
Uso massivo de:
- `prisma.course.*`
- `prisma.module.*`
- `prisma.lesson.*`
- `prisma.lessonVersion.*`

Areas mais sensiveis:
- build status agregado (dashboard / curso/canal)
- CRUD principal (course/module/lesson/version)
- cascatas de delete (`deleteCourseCascade`, `deleteModuleCascade`, `deleteLessonCascade`)
- cancelamento de jobs por escopo
- emissao de eventos de build status
- endpoints de `lesson-versions/*`

Risco:
- alto (quebra de fluxo principal se renomear sem camada de transicao)

### 3.2 Worker (`apps/worker/src/index.ts`)
Uso frequente de:
- `prisma.lessonVersion.findUnique(...)`
- resolucao de escopo por `lessonVersion`

Areas sensiveis:
- render final cinematografico
- legenda (faster-whisper)
- mix BGM / volumes
- TTS / imagem / jobs por bloco

Risco:
- alto (quebra de geracao/render)

### 3.3 Frontend (`apps/web/src`)
O frontend ativo ja usa aliases HTTP `channel/video`, mas tipos internos continuam:
- `Course`
- `Module`
- `LessonBlock`
- `LegacyLessonVersion`

Plano:
- manter tipos internos nesta fase
- renomear tipos TS depois da migracao de schema/API estabilizar (refactor semantico)

## 4. Storage e paths (estado atual)

Ja implementado:
- root canonico configuravel `VIZLEC_STORAGE_DOMAIN_ROOT=channels`
- fallback automatico para `data/courses` se `data/channels` nao existir

Proximo passo estrutural:
- migracao de dados locais de `data/courses/...` para `data/channels/...`
- atualizar paths persistidos em `Asset.path` quando necessario
- remover fallback legado depois da migracao e validacao

## 5. Estrategia de migracao de base (proposta)

### Etapa A (pre-migracao - atual)
- Superficie externa em `channel/video`
- Contratos HTTP/WS/SSE com aliases novos
- Storage com root `channels` (fallback `courses`)

### Etapa B (transicao de schema)
Opcoes:

1. Renomeacao direta de tabelas/colunas (mais limpa, maior risco)
- `Course` -> `Channel`
- `Lesson` -> `Video`
- `LessonVersion` -> `VideoVersion`
- `Module` -> `Section`

2. Modelo hibrido (recomendado)
- manter tabelas legacy por mais tempo
- introduzir nomes novos no Prisma via `@@map` / `@map` com nomes de modelo/campos novos
- reduzir risco de query SQL/SQLite durante transicao

Recomendacao:
- usar `@map/@@map` para expor nomes novos no Prisma Client antes de alterar fisicamente tudo no banco

### Etapa C (refactor de queries)
- API
- Worker
- Scripts
- Typescript frontend (tipos internos)

### Etapa D (migracao fisica / limpeza)
- migrar nomes fisicos e paths
- remover aliases e fallback legado
- remover `onScreenJson` (schema) se confirmado fora do escopo

## 6. Decisoes ja tomadas (para orientar a migracao)

- `Module` permanece como `Section` por compatibilidade nesta fase.
- Remocao total de `Module` fica para depois da estabilizacao.
- `on-screen` esta fora do fluxo MVP atual (legenda e texto narrado sao o foco).
- O pipeline visual/render/legenda/BGM ja esta funcional; migracao de base nao pode quebrar esse fluxo.

## 7. Checklist de readiness para iniciar a migracao de base

- [x] Frontend principal usa `channel/video`
- [x] API aliases `channel/video` implementados
- [x] WS/SSE/HTTP payloads com aliases de dominio novo
- [x] OpenAPI/Swagger com superficie principal em dominio novo
- [~] Contratos auxiliares restantes revisados
- [ ] Plano de migracao Prisma (`@map/@@map` vs rename fisico) fechado
- [ ] Janela de testes de regressao E2E definida

