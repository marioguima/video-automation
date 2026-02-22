PRAGMA foreign_keys=OFF;

INSERT INTO "Workspace" ("id", "name", "createdAt", "updatedAt")
SELECT
  'legacy-workspace',
  'Legacy Workspace',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Workspace");

CREATE TABLE "new_Invitation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "inviteeName" TEXT,
  "email" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "revokedAt" DATETIME,
  "acceptedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "invitedByUserId" TEXT NOT NULL,
  CONSTRAINT "Invitation_invitedByUserId_fkey"
    FOREIGN KEY ("invitedByUserId") REFERENCES "User" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Invitation_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Invitation" (
  "id",
  "workspaceId",
  "inviteeName",
  "email",
  "role",
  "tokenHash",
  "expiresAt",
  "revokedAt",
  "acceptedAt",
  "createdAt",
  "invitedByUserId"
)
SELECT
  i."id",
  COALESCE(
    (
      SELECT wm."workspaceId"
      FROM "WorkspaceMembership" wm
      WHERE wm."userId" = i."invitedByUserId"
      ORDER BY wm."createdAt" ASC
      LIMIT 1
    ),
    (
      SELECT w."id"
      FROM "Workspace" w
      ORDER BY w."createdAt" ASC
      LIMIT 1
    )
  ) AS "workspaceId",
  i."inviteeName",
  i."email",
  i."role",
  i."tokenHash",
  i."expiresAt",
  i."revokedAt",
  i."acceptedAt",
  i."createdAt",
  i."invitedByUserId"
FROM "Invitation" i;

DROP TABLE "Invitation";
ALTER TABLE "new_Invitation" RENAME TO "Invitation";
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");
CREATE INDEX "Invitation_workspaceId_createdAt_idx" ON "Invitation"("workspaceId", "createdAt");
CREATE INDEX "Invitation_email_createdAt_idx" ON "Invitation"("email", "createdAt");
CREATE INDEX "Invitation_expiresAt_revokedAt_acceptedAt_idx"
  ON "Invitation"("expiresAt", "revokedAt", "acceptedAt");

CREATE TABLE "new_Course" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "categoryId" TEXT,
  "productLanguage" TEXT,
  "emailLanguage" TEXT,
  "primarySalesCountry" TEXT,
  "salesPageUrl" TEXT,
  "imageAssetId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Course_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Course" (
  "id",
  "workspaceId",
  "name",
  "description",
  "categoryId",
  "productLanguage",
  "emailLanguage",
  "primarySalesCountry",
  "salesPageUrl",
  "imageAssetId",
  "status",
  "createdAt",
  "updatedAt"
)
SELECT
  c."id",
  COALESCE(
    (
      SELECT wm."workspaceId"
      FROM "WorkspaceMembership" wm
      ORDER BY wm."createdAt" ASC
      LIMIT 1
    ),
    (
      SELECT w."id"
      FROM "Workspace" w
      ORDER BY w."createdAt" ASC
      LIMIT 1
    )
  ) AS "workspaceId",
  c."name",
  c."description",
  c."categoryId",
  c."productLanguage",
  c."emailLanguage",
  c."primarySalesCountry",
  c."salesPageUrl",
  c."imageAssetId",
  c."status",
  c."createdAt",
  c."updatedAt"
FROM "Course" c;

DROP TABLE "Course";
ALTER TABLE "new_Course" RENAME TO "Course";
CREATE INDEX "Course_workspaceId_createdAt_idx" ON "Course"("workspaceId", "createdAt");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
