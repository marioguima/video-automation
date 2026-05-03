CREATE TABLE "ContentProject" (
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

CREATE TABLE "ContentItem" (
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

CREATE INDEX "ContentProject_workspaceId_createdAt_idx" ON "ContentProject"("workspaceId", "createdAt");
CREATE INDEX "ContentProject_workspaceId_status_idx" ON "ContentProject"("workspaceId", "status");
CREATE INDEX "ContentItem_workspaceId_kind_status_idx" ON "ContentItem"("workspaceId", "kind", "status");
CREATE UNIQUE INDEX "ContentProjectItem_workspaceId_projectId_itemId_key" ON "ContentProjectItem"("workspaceId", "projectId", "itemId");
CREATE INDEX "ContentProjectItem_workspaceId_projectId_createdAt_idx" ON "ContentProjectItem"("workspaceId", "projectId", "createdAt");
CREATE INDEX "ContentProjectItem_workspaceId_itemId_createdAt_idx" ON "ContentProjectItem"("workspaceId", "itemId", "createdAt");
