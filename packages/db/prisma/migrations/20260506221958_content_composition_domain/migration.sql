-- CreateTable
CREATE TABLE "PromotionTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "destinationUrl" TEXT NOT NULL,
    "ctaLabel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PromotionTarget_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PromotionTarget_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ContentProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShortLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "promotionTargetId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShortLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShortLink_promotionTargetId_fkey" FOREIGN KEY ("promotionTargetId") REFERENCES "PromotionTarget" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Variant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "itemId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL DEFAULT 'video',
    "aspectRatio" TEXT NOT NULL DEFAULT '16:9',
    "presetId" TEXT NOT NULL DEFAULT 'clean-authority',
    "language" TEXT,
    "targetDurationS" REAL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Variant_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Variant_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ContentProject" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Variant_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ContentItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NarrativeUnit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
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
    CONSTRAINT "NarrativeUnit_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Composition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
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
    CONSTRAINT "Composition_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PromotionTarget_workspaceId_projectId_createdAt_idx" ON "PromotionTarget"("workspaceId", "projectId", "createdAt");

-- CreateIndex
CREATE INDEX "PromotionTarget_workspaceId_status_idx" ON "PromotionTarget"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ShortLink_code_key" ON "ShortLink"("code");

-- CreateIndex
CREATE INDEX "ShortLink_workspaceId_promotionTargetId_createdAt_idx" ON "ShortLink"("workspaceId", "promotionTargetId", "createdAt");

-- CreateIndex
CREATE INDEX "ShortLink_workspaceId_status_idx" ON "ShortLink"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Variant_workspaceId_itemId_createdAt_idx" ON "Variant"("workspaceId", "itemId", "createdAt");

-- CreateIndex
CREATE INDEX "Variant_workspaceId_projectId_createdAt_idx" ON "Variant"("workspaceId", "projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Variant_workspaceId_status_idx" ON "Variant"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "NarrativeUnit_workspaceId_variantId_order_idx" ON "NarrativeUnit"("workspaceId", "variantId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "NarrativeUnit_variantId_order_key" ON "NarrativeUnit"("variantId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Composition_variantId_key" ON "Composition"("variantId");

-- CreateIndex
CREATE INDEX "Composition_workspaceId_status_idx" ON "Composition"("workspaceId", "status");
