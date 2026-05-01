ALTER TABLE "LessonVersion" ADD COLUMN "preferredVoiceId" TEXT;
ALTER TABLE "LessonVersion" ADD COLUMN "preferredTemplateId" TEXT;

CREATE INDEX "LessonVersion_preferredTemplateId_idx" ON "LessonVersion"("preferredTemplateId");
