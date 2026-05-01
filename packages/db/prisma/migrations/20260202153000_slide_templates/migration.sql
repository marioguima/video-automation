-- CreateTable
CREATE TABLE "SlideTemplate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "label" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN "templateId" TEXT;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN "templateId" TEXT;

-- CreateIndex
CREATE INDEX "SlideTemplate_isActive_idx" ON "SlideTemplate"("isActive");

-- CreateIndex
CREATE INDEX "Asset_templateId_idx" ON "Asset"("templateId");

-- CreateIndex
CREATE INDEX "Job_templateId_idx" ON "Job"("templateId");
