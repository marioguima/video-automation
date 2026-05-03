PRAGMA foreign_keys=OFF;

CREATE TABLE "new_ContentItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'video',
    "title" TEXT NOT NULL,
    "sourceText" TEXT,
    "orientation" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContentItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_ContentItem" (
    "id",
    "workspaceId",
    "kind",
    "title",
    "sourceText",
    "orientation",
    "status",
    "metadataJson",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "workspaceId",
    "kind",
    "title",
    "sourceText",
    "orientation",
    "status",
    "metadataJson",
    "createdAt",
    "updatedAt"
FROM "ContentItem";

DROP TABLE "ContentItem";
ALTER TABLE "new_ContentItem" RENAME TO "ContentItem";

CREATE INDEX "ContentItem_workspaceId_kind_status_idx" ON "ContentItem"("workspaceId", "kind", "status");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
