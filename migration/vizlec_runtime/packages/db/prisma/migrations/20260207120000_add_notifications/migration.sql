-- CreateTable
CREATE TABLE "Notification" (
  "id" TEXT NOT NULL PRIMARY KEY,
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
  "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Notification_read_createdAt_idx" ON "Notification"("read", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_jobId_jobStatus_idx" ON "Notification"("jobId", "jobStatus");

-- CreateIndex
CREATE INDEX "Notification_lessonId_idx" ON "Notification"("lessonId");
