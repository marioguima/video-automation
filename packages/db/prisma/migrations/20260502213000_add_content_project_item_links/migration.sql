CREATE TABLE "ContentProjectItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContentProjectItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContentProjectItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ContentProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContentProjectItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ContentItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "ContentProjectItem" ("id", "workspaceId", "projectId", "itemId", "createdAt")
SELECT
    "id" || '_' || "projectId",
    "workspaceId",
    "projectId",
    "id",
    "createdAt"
FROM "ContentItem"
WHERE "projectId" IS NOT NULL;

CREATE UNIQUE INDEX "ContentProjectItem_workspaceId_projectId_itemId_key" ON "ContentProjectItem"("workspaceId", "projectId", "itemId");
CREATE INDEX "ContentProjectItem_workspaceId_projectId_createdAt_idx" ON "ContentProjectItem"("workspaceId", "projectId", "createdAt");
CREATE INDEX "ContentProjectItem_workspaceId_itemId_createdAt_idx" ON "ContentProjectItem"("workspaceId", "itemId", "createdAt");
