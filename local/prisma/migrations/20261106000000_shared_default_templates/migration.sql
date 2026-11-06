ALTER TABLE "LocalTemplate" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "LocalTemplate_isDefault_updatedAt_idx" ON "LocalTemplate"("isDefault", "updatedAt");
