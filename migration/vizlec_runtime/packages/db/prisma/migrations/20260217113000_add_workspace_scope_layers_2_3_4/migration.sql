PRAGMA foreign_keys=OFF;

INSERT INTO "Workspace" ("id", "name", "createdAt", "updatedAt")
SELECT
  'legacy-workspace',
  'Legacy Workspace',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Workspace");

CREATE TABLE "new_Module" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Module_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Module_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "Course" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_Module" (
  "id",
  "workspaceId",
  "courseId",
  "name",
  "order",
  "createdAt"
)
SELECT
  m."id",
  COALESCE(
    (
      SELECT c."workspaceId"
      FROM "Course" c
      WHERE c."id" = m."courseId"
      LIMIT 1
    ),
    (
      SELECT w."id"
      FROM "Workspace" w
      ORDER BY w."createdAt" ASC
      LIMIT 1
    )
  ) AS "workspaceId",
  m."courseId",
  m."name",
  m."order",
  m."createdAt"
FROM "Module" m;

DROP TABLE "Module";
ALTER TABLE "new_Module" RENAME TO "Module";
CREATE INDEX "Module_courseId_order_idx" ON "Module"("courseId", "order");
CREATE INDEX "Module_workspaceId_courseId_order_idx" ON "Module"("workspaceId", "courseId", "order");

CREATE TABLE "new_Lesson" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "moduleId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Lesson_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Lesson_moduleId_fkey"
    FOREIGN KEY ("moduleId") REFERENCES "Module" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_Lesson" (
  "id",
  "workspaceId",
  "moduleId",
  "order",
  "title",
  "createdAt"
)
SELECT
  l."id",
  COALESCE(
    (
      SELECT m."workspaceId"
      FROM "Module" m
      WHERE m."id" = l."moduleId"
      LIMIT 1
    ),
    (
      SELECT w."id"
      FROM "Workspace" w
      ORDER BY w."createdAt" ASC
      LIMIT 1
    )
  ) AS "workspaceId",
  l."moduleId",
  l."order",
  l."title",
  l."createdAt"
FROM "Lesson" l;

DROP TABLE "Lesson";
ALTER TABLE "new_Lesson" RENAME TO "Lesson";
CREATE INDEX "Lesson_moduleId_order_idx" ON "Lesson"("moduleId", "order");
CREATE INDEX "Lesson_workspaceId_moduleId_order_idx" ON "Lesson"("workspaceId", "moduleId", "order");
CREATE UNIQUE INDEX "Lesson_moduleId_order_key" ON "Lesson"("moduleId", "order");

CREATE TABLE "new_LessonVersion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "lessonId" TEXT NOT NULL,
  "scriptText" TEXT NOT NULL,
  "speechRateWps" REAL NOT NULL DEFAULT 2.5,
  "preferredVoiceId" TEXT,
  "preferredTemplateId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LessonVersion_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LessonVersion_lessonId_fkey"
    FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_LessonVersion" (
  "id",
  "workspaceId",
  "lessonId",
  "scriptText",
  "speechRateWps",
  "preferredVoiceId",
  "preferredTemplateId",
  "createdAt"
)
SELECT
  lv."id",
  COALESCE(
    (
      SELECT l."workspaceId"
      FROM "Lesson" l
      WHERE l."id" = lv."lessonId"
      LIMIT 1
    ),
    (
      SELECT w."id"
      FROM "Workspace" w
      ORDER BY w."createdAt" ASC
      LIMIT 1
    )
  ) AS "workspaceId",
  lv."lessonId",
  lv."scriptText",
  lv."speechRateWps",
  lv."preferredVoiceId",
  lv."preferredTemplateId",
  lv."createdAt"
FROM "LessonVersion" lv;

DROP TABLE "LessonVersion";
ALTER TABLE "new_LessonVersion" RENAME TO "LessonVersion";
CREATE INDEX "LessonVersion_workspaceId_lessonId_createdAt_idx"
  ON "LessonVersion"("workspaceId", "lessonId", "createdAt");
CREATE INDEX "LessonVersion_preferredTemplateId_idx" ON "LessonVersion"("preferredTemplateId");

CREATE TABLE "new_Block" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "lessonVersionId" TEXT NOT NULL,
  "index" INTEGER NOT NULL,
  "sourceText" TEXT NOT NULL,
  "ttsText" TEXT NOT NULL,
  "wordCount" INTEGER NOT NULL,
  "durationEstimateS" REAL NOT NULL,
  "audioDurationS" REAL,
  "onScreenJson" TEXT,
  "imagePromptJson" TEXT,
  "segmentMs" INTEGER,
  "segmentError" TEXT,
  "status" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Block_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Block_lessonVersionId_fkey"
    FOREIGN KEY ("lessonVersionId") REFERENCES "LessonVersion" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_Block" (
  "id",
  "workspaceId",
  "lessonVersionId",
  "index",
  "sourceText",
  "ttsText",
  "wordCount",
  "durationEstimateS",
  "audioDurationS",
  "onScreenJson",
  "imagePromptJson",
  "segmentMs",
  "segmentError",
  "status",
  "createdAt",
  "updatedAt"
)
SELECT
  b."id",
  COALESCE(
    (
      SELECT lv."workspaceId"
      FROM "LessonVersion" lv
      WHERE lv."id" = b."lessonVersionId"
      LIMIT 1
    ),
    (
      SELECT w."id"
      FROM "Workspace" w
      ORDER BY w."createdAt" ASC
      LIMIT 1
    )
  ) AS "workspaceId",
  b."lessonVersionId",
  b."index",
  b."sourceText",
  b."ttsText",
  b."wordCount",
  b."durationEstimateS",
  b."audioDurationS",
  b."onScreenJson",
  b."imagePromptJson",
  b."segmentMs",
  b."segmentError",
  b."status",
  b."createdAt",
  b."updatedAt"
FROM "Block" b;

DROP TABLE "Block";
ALTER TABLE "new_Block" RENAME TO "Block";
CREATE INDEX "Block_lessonVersionId_index_idx" ON "Block"("lessonVersionId", "index");
CREATE INDEX "Block_workspaceId_lessonVersionId_index_idx"
  ON "Block"("workspaceId", "lessonVersionId", "index");

CREATE TABLE "new_Asset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "blockId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "sha256" TEXT,
  "metaJson" TEXT,
  "templateId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Asset_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Asset_blockId_fkey"
    FOREIGN KEY ("blockId") REFERENCES "Block" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_Asset" (
  "id",
  "workspaceId",
  "blockId",
  "kind",
  "path",
  "sha256",
  "metaJson",
  "templateId",
  "createdAt"
)
SELECT
  a."id",
  COALESCE(
    (
      SELECT b."workspaceId"
      FROM "Block" b
      WHERE b."id" = a."blockId"
      LIMIT 1
    ),
    (
      SELECT w."id"
      FROM "Workspace" w
      ORDER BY w."createdAt" ASC
      LIMIT 1
    )
  ) AS "workspaceId",
  a."blockId",
  a."kind",
  a."path",
  a."sha256",
  a."metaJson",
  a."templateId",
  a."createdAt"
FROM "Asset" a;

DROP TABLE "Asset";
ALTER TABLE "new_Asset" RENAME TO "Asset";
CREATE INDEX "Asset_blockId_kind_idx" ON "Asset"("blockId", "kind");
CREATE INDEX "Asset_workspaceId_blockId_kind_idx" ON "Asset"("workspaceId", "blockId", "kind");
CREATE INDEX "Asset_templateId_idx" ON "Asset"("templateId");

CREATE TABLE "new_Job" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "lessonVersionId" TEXT,
  "blockId" TEXT,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "inputHash" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "clientId" TEXT,
  "requestId" TEXT,
  "metaJson" TEXT,
  "leaseExpiresAt" DATETIME,
  "canceledAt" DATETIME,
  "templateId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Job_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Job_lessonVersionId_fkey"
    FOREIGN KEY ("lessonVersionId") REFERENCES "LessonVersion" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Job_blockId_fkey"
    FOREIGN KEY ("blockId") REFERENCES "Block" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Job" (
  "id",
  "workspaceId",
  "scope",
  "lessonVersionId",
  "blockId",
  "type",
  "status",
  "attempts",
  "error",
  "inputHash",
  "priority",
  "clientId",
  "requestId",
  "metaJson",
  "leaseExpiresAt",
  "canceledAt",
  "templateId",
  "createdAt",
  "updatedAt"
)
SELECT
  j."id",
  COALESCE(
    (
      SELECT lv."workspaceId"
      FROM "LessonVersion" lv
      WHERE lv."id" = j."lessonVersionId"
      LIMIT 1
    ),
    (
      SELECT b."workspaceId"
      FROM "Block" b
      WHERE b."id" = j."blockId"
      LIMIT 1
    ),
    (
      SELECT w."id"
      FROM "Workspace" w
      ORDER BY w."createdAt" ASC
      LIMIT 1
    )
  ) AS "workspaceId",
  j."scope",
  j."lessonVersionId",
  j."blockId",
  j."type",
  j."status",
  j."attempts",
  j."error",
  j."inputHash",
  j."priority",
  j."clientId",
  j."requestId",
  j."metaJson",
  j."leaseExpiresAt",
  j."canceledAt",
  j."templateId",
  j."createdAt",
  j."updatedAt"
FROM "Job" j;

DROP TABLE "Job";
ALTER TABLE "new_Job" RENAME TO "Job";
CREATE INDEX "Job_status_priority_idx" ON "Job"("status", "priority");
CREATE INDEX "Job_workspaceId_status_priority_idx" ON "Job"("workspaceId", "status", "priority");
CREATE INDEX "Job_lessonVersionId_idx" ON "Job"("lessonVersionId");
CREATE INDEX "Job_blockId_idx" ON "Job"("blockId");
CREATE INDEX "Job_workspaceId_createdAt_idx" ON "Job"("workspaceId", "createdAt");
CREATE INDEX "Job_templateId_idx" ON "Job"("templateId");

CREATE TABLE "new_Notification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "read" BOOLEAN NOT NULL DEFAULT false,
  "jobId" TEXT,
  "jobType" TEXT,
  "jobStatus" TEXT,
  "lessonId" TEXT,
  "lessonVersionId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Notification_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Notification" (
  "id",
  "workspaceId",
  "title",
  "message",
  "type",
  "read",
  "jobId",
  "jobType",
  "jobStatus",
  "lessonId",
  "lessonVersionId",
  "createdAt",
  "updatedAt"
)
SELECT
  n."id",
  COALESCE(
    (
      SELECT l."workspaceId"
      FROM "Lesson" l
      WHERE l."id" = n."lessonId"
      LIMIT 1
    ),
    (
      SELECT lv."workspaceId"
      FROM "LessonVersion" lv
      WHERE lv."id" = n."lessonVersionId"
      LIMIT 1
    ),
    (
      SELECT j."workspaceId"
      FROM "Job" j
      WHERE j."id" = n."jobId"
      LIMIT 1
    ),
    (
      SELECT w."id"
      FROM "Workspace" w
      ORDER BY w."createdAt" ASC
      LIMIT 1
    )
  ) AS "workspaceId",
  n."title",
  n."message",
  n."type",
  n."read",
  n."jobId",
  n."jobType",
  n."jobStatus",
  n."lessonId",
  n."lessonVersionId",
  n."createdAt",
  n."updatedAt"
FROM "Notification" n;

DROP TABLE "Notification";
ALTER TABLE "new_Notification" RENAME TO "Notification";
CREATE INDEX "Notification_workspaceId_read_createdAt_idx"
  ON "Notification"("workspaceId", "read", "createdAt");
CREATE INDEX "Notification_read_createdAt_idx" ON "Notification"("read", "createdAt");
CREATE INDEX "Notification_jobId_jobStatus_idx" ON "Notification"("jobId", "jobStatus");
CREATE INDEX "Notification_lessonId_idx" ON "Notification"("lessonId");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
