PRAGMA foreign_keys=OFF;

CREATE TABLE "new_ContentProject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "language" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContentProject_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_ContentProject" (
    "id",
    "workspaceId",
    "name",
    "description",
    "language",
    "status",
    "metadataJson",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "workspaceId",
    "name",
    "description",
    "language",
    "status",
    "metadataJson",
    "createdAt",
    "updatedAt"
FROM "ContentProject";

DROP TABLE "ContentProject";
ALTER TABLE "new_ContentProject" RENAME TO "ContentProject";

CREATE INDEX "ContentProject_workspaceId_createdAt_idx" ON "ContentProject"("workspaceId", "createdAt");
CREATE INDEX "ContentProject_workspaceId_status_idx" ON "ContentProject"("workspaceId", "status");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
