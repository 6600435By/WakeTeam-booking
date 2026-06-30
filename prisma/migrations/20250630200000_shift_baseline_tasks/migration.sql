-- CreateTable
CREATE TABLE "ShiftBaselineTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "assignedByMemberId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ShiftBaselineCompletion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "workShiftId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShiftBaselineCompletion_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ShiftBaselineTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShiftBaselineCompletion_workShiftId_fkey" FOREIGN KEY ("workShiftId") REFERENCES "WorkShift" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShiftHandoffNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "targetDate" TEXT NOT NULL,
    "workShiftId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShiftHandoffNote_workShiftId_fkey" FOREIGN KEY ("workShiftId") REFERENCES "WorkShift" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ShiftBaselineTask_branchId_date_idx" ON "ShiftBaselineTask"("branchId", "date");

-- CreateIndex
CREATE INDEX "ShiftBaselineCompletion_workShiftId_idx" ON "ShiftBaselineCompletion"("workShiftId");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftBaselineCompletion_taskId_workShiftId_key" ON "ShiftBaselineCompletion"("taskId", "workShiftId");

-- CreateIndex
CREATE INDEX "ShiftHandoffNote_branchId_targetDate_idx" ON "ShiftHandoffNote"("branchId", "targetDate");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftHandoffNote_workShiftId_targetDate_key" ON "ShiftHandoffNote"("workShiftId", "targetDate");
