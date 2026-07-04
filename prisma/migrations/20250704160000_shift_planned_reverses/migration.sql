-- CreateTable
CREATE TABLE "WorkShiftPlannedReverse" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,

    CONSTRAINT "WorkShiftPlannedReverse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkShiftPlannedReverse_shiftId_staffId_key" ON "WorkShiftPlannedReverse"("shiftId", "staffId");

-- CreateIndex
CREATE INDEX "WorkShiftPlannedReverse_shiftId_idx" ON "WorkShiftPlannedReverse"("shiftId");

-- CreateIndex
CREATE INDEX "WorkShiftPlannedReverse_staffId_idx" ON "WorkShiftPlannedReverse"("staffId");

-- AddForeignKey
ALTER TABLE "WorkShiftPlannedReverse" ADD CONSTRAINT "WorkShiftPlannedReverse_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "WorkShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkShiftPlannedReverse" ADD CONSTRAINT "WorkShiftPlannedReverse_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill from plannedStaffId
INSERT INTO "WorkShiftPlannedReverse" ("id", "shiftId", "staffId")
SELECT
  'wpr_' || "id",
  "id",
  "plannedStaffId"
FROM "WorkShift"
WHERE "plannedStaffId" IS NOT NULL
ON CONFLICT DO NOTHING;
