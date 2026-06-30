-- CreateTable
CREATE TABLE "ShiftChangeRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "workShiftId" TEXT,
    "date" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "proposedStart" TEXT,
    "proposedEnd" TEXT,
    "proposedStaffId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewComment" TEXT,
    "reviewedByMemberId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShiftChangeRequest_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "OrganizationMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShiftChangeRequest_workShiftId_fkey" FOREIGN KEY ("workShiftId") REFERENCES "WorkShift" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ShiftChangeRequest_memberId_status_idx" ON "ShiftChangeRequest"("memberId", "status");
CREATE INDEX "ShiftChangeRequest_branchId_status_date_idx" ON "ShiftChangeRequest"("branchId", "status", "date");
