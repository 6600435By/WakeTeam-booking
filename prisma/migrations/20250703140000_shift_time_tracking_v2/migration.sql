-- AlterTable
ALTER TABLE "SpotWorkEntry" ADD COLUMN "confirmedAt" TIMESTAMP(3),
ADD COLUMN "confirmedById" TEXT;

-- AlterTable
ALTER TABLE "WorkShift" ADD COLUMN "employeeSubmittedAt" TIMESTAMP(3),
ADD COLUMN "employeeSubmitComment" TEXT;

-- CreateTable
CREATE TABLE "BranchShiftChecklistItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchShiftChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftChecklistCompletion" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "workShiftId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftChecklistCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BranchShiftChecklistItem_branchId_isActive_sortOrder_idx" ON "BranchShiftChecklistItem"("branchId", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "ShiftChecklistCompletion_workShiftId_idx" ON "ShiftChecklistCompletion"("workShiftId");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftChecklistCompletion_itemId_workShiftId_key" ON "ShiftChecklistCompletion"("itemId", "workShiftId");

-- AddForeignKey
ALTER TABLE "ShiftChecklistCompletion" ADD CONSTRAINT "ShiftChecklistCompletion_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "BranchShiftChecklistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftChecklistCompletion" ADD CONSTRAINT "ShiftChecklistCompletion_workShiftId_fkey" FOREIGN KEY ("workShiftId") REFERENCES "WorkShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;
