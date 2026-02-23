# Prisma Physical Domain Rename (SQLite) - Draft

Objetivo:
- remover a dependencia de `@@map/@map` para dominio `course/module/lesson`
- renomear fisicamente tabelas/colunas no SQLite para `channel/section/video`
- manter runtime funcional com rollback claro

Status:
- `DRAFT` (nao executar ainda)
- usar somente depois de estabilizar o runtime por algumas rodadas de uso

## Premissas

- Prisma client ja usa models canônicos (`Channel/Section/Video/VideoVersion`)
- Campos escalares Prisma ja estao canônicos com `@map(...)`
- Runtime (API/worker/frontend) ja compila e opera com naming canônico
- Storage root `channels` ja esta disponivel (com fallback legado)

## Estrategia recomendada

1. Fazer backup do SQLite
2. Parar API + worker + web
3. Executar migracao SQL em transacao (quando possivel)
4. Remover `@@map/@map` correspondentes no `schema.prisma`
5. `prisma generate`
6. Subir runtime e validar fluxo completo

## Backup (obrigatorio)

Exemplo (PowerShell):

```powershell
Copy-Item .\\data\\vizlec.db .\\data\\vizlec.pre-physical-rename.db
```

## Escopo prioritario (fase 1 de renomeio fisico)

Tabelas:
- `Course` -> `Channel`
- `Module` -> `Section`
- `Lesson` -> `Video`
- `LessonVersion` -> `VideoVersion`

Colunas FK:
- `Module.courseId` -> `channelId`
- `Lesson.moduleId` -> `sectionId`
- `LessonVersion.lessonId` -> `videoId`
- `Block.lessonVersionId` -> `videoVersionId`
- `Job.lessonVersionId` -> `videoVersionId`
- `Notification.lessonId` -> `videoId`
- `Notification.lessonVersionId` -> `videoVersionId`

## Rascunho SQL (SQLite)

Observacao:
- `ALTER TABLE ... RENAME COLUMN` e `RENAME TO` sao suportados em SQLite moderno.
- validar versao do SQLite usada no ambiente antes de aplicar.

```sql
-- Tabelas
ALTER TABLE "Course" RENAME TO "Channel";
ALTER TABLE "Module" RENAME TO "Section";
ALTER TABLE "Lesson" RENAME TO "Video";
ALTER TABLE "LessonVersion" RENAME TO "VideoVersion";

-- Colunas FK
ALTER TABLE "Section" RENAME COLUMN "courseId" TO "channelId";
ALTER TABLE "Video" RENAME COLUMN "moduleId" TO "sectionId";
ALTER TABLE "VideoVersion" RENAME COLUMN "lessonId" TO "videoId";
ALTER TABLE "Block" RENAME COLUMN "lessonVersionId" TO "videoVersionId";
ALTER TABLE "Job" RENAME COLUMN "lessonVersionId" TO "videoVersionId";
ALTER TABLE "Notification" RENAME COLUMN "lessonId" TO "videoId";
ALTER TABLE "Notification" RENAME COLUMN "lessonVersionId" TO "videoVersionId";
```

## Depois da migracao SQL (obrigatorio no schema.prisma)

Remover gradualmente:
- `@@map("Course")`, `@@map("Module")`, `@@map("Lesson")`, `@@map("LessonVersion")`
- `@map("courseId")`, `@map("moduleId")`, `@map("lessonId")`, `@map("lessonVersionId")`

Manter (temporariamente) se nao entrar nesta fase:
- quaisquer `@map` nao ligados ao dominio (ex.: campos legacy auxiliares)

## Validacao minima pos-migracao

1. `prisma generate`
2. `pnpm --filter @vizlec/api typecheck`
3. `pnpm --filter @vizlec/worker typecheck`
4. Subir API/worker/web
5. Fluxo real:
   - criar channel/section/video
   - segmentar
   - gerar TTS
   - gerar imagens
   - render final (BGM + legenda)

## Rollback (simples)

Se falhar:
- restaurar backup `vizlec.pre-physical-rename.db`
- voltar schema com `@@map/@map` (branch/commit anterior)

