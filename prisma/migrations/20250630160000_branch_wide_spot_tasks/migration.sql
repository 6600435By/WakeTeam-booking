ALTER TABLE "SpotTask" ADD COLUMN "branchWide" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SpotTask" ADD COLUMN "groupId" TEXT;
ALTER TABLE "SpotTask" ADD COLUMN "totalPlannedMinutes" INTEGER;
CREATE INDEX "SpotTask_groupId_idx" ON "SpotTask"("groupId");
