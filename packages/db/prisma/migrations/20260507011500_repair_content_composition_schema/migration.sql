PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "ProjectOutputDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL DEFAULT 'video',
    "destination" TEXT NOT NULL,
    "aspectRatio" TEXT NOT NULL DEFAULT '16:9',
    "presetId" TEXT NOT NULL DEFAULT 'clean-authority',
    "language" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectOutputDefinition_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectOutputDefinition_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ContentProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ProjectContentOutput" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "projectItemId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "outputDefinitionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL DEFAULT 'video',
    "channel" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "aspectRatio" TEXT NOT NULL DEFAULT '16:9',
    "presetId" TEXT NOT NULL DEFAULT 'clean-authority',
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "currentStage" TEXT,
    "targetDurationS" REAL,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectContentOutput_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectContentOutput_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ContentProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectContentOutput_projectItemId_fkey" FOREIGN KEY ("projectItemId") REFERENCES "ContentProjectItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectContentOutput_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ContentItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectContentOutput_outputDefinitionId_fkey" FOREIGN KEY ("outputDefinitionId") REFERENCES "ProjectOutputDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

DROP INDEX IF EXISTS "NarrativeUnit_workspaceId_variantId_order_idx";
DROP INDEX IF EXISTS "NarrativeUnit_variantId_order_key";
ALTER TABLE "NarrativeUnit" RENAME TO "NarrativeUnit_legacy_20260507011500";

DROP INDEX IF EXISTS "Composition_variantId_key";
DROP INDEX IF EXISTS "Composition_workspaceId_status_idx";
ALTER TABLE "Composition" RENAME TO "Composition_legacy_20260507011500";

CREATE TABLE "NarrativeUnit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "projectContentOutputId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "narrationText" TEXT,
    "title" TEXT,
    "durationEstimateS" REAL,
    "visualIntentJson" TEXT,
    "ctaIntentJson" TEXT,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NarrativeUnit_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NarrativeUnit_projectContentOutputId_fkey" FOREIGN KEY ("projectContentOutputId") REFERENCES "ProjectContentOutput" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Composition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "projectContentOutputId" TEXT NOT NULL,
    "fps" INTEGER NOT NULL DEFAULT 30,
    "width" INTEGER NOT NULL DEFAULT 1920,
    "height" INTEGER NOT NULL DEFAULT 1080,
    "durationFrames" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "timelineJson" TEXT NOT NULL,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Composition_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Composition_projectContentOutputId_fkey" FOREIGN KEY ("projectContentOutputId") REFERENCES "ProjectContentOutput" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProjectOutputDefinition_projectId_key_key" ON "ProjectOutputDefinition"("projectId", "key");
CREATE INDEX "ProjectOutputDefinition_workspaceId_projectId_createdAt_idx" ON "ProjectOutputDefinition"("workspaceId", "projectId", "createdAt");
CREATE INDEX "ProjectOutputDefinition_workspaceId_isActive_idx" ON "ProjectOutputDefinition"("workspaceId", "isActive");

CREATE UNIQUE INDEX "ProjectContentOutput_projectId_itemId_outputDefinitionId_key" ON "ProjectContentOutput"("projectId", "itemId", "outputDefinitionId");
CREATE INDEX "ProjectContentOutput_workspaceId_projectId_itemId_createdAt_idx" ON "ProjectContentOutput"("workspaceId", "projectId", "itemId", "createdAt");
CREATE INDEX "ProjectContentOutput_workspaceId_status_currentStage_idx" ON "ProjectContentOutput"("workspaceId", "status", "currentStage");

CREATE UNIQUE INDEX "NarrativeUnit_projectContentOutputId_order_key" ON "NarrativeUnit"("projectContentOutputId", "order");
CREATE INDEX "NarrativeUnit_workspaceId_projectContentOutputId_order_idx" ON "NarrativeUnit"("workspaceId", "projectContentOutputId", "order");

CREATE UNIQUE INDEX "Composition_projectContentOutputId_key" ON "Composition"("projectContentOutputId");
CREATE INDEX "Composition_workspaceId_status_idx" ON "Composition"("workspaceId", "status");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
