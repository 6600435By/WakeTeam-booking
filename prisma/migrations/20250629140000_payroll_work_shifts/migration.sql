-- CreateTable
CREATE TABLE "MemberPayRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memberId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "effectiveFrom" TEXT NOT NULL,
    "effectiveTo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByMemberId" TEXT,
    CONSTRAINT "MemberPayRate_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "OrganizationMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkShift" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "plannedStart" TEXT,
    "plannedEnd" TEXT,
    "actualStart" DATETIME,
    "actualEnd" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'open',
    "panelMinutesOverride" INTEGER,
    "idleMinutesOverride" INTEGER,
    "ratesSnapshot" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkShift_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "OrganizationMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReverseAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shiftId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "endedAt" DATETIME,
    CONSTRAINT "ReverseAssignment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "WorkShift" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReverseAssignment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SpotTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "assigneeMemberId" TEXT NOT NULL,
    "assignedByMemberId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "plannedMinutes" INTEGER,
    "plannedTimeFrom" TEXT,
    "plannedTimeTo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "spotEntryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SpotTask_assigneeMemberId_fkey" FOREIGN KEY ("assigneeMemberId") REFERENCES "OrganizationMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SpotTask_assignedByMemberId_fkey" FOREIGN KEY ("assignedByMemberId") REFERENCES "OrganizationMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SpotWorkEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shiftId" TEXT NOT NULL,
    "taskId" TEXT,
    "category" TEXT,
    "comment" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "endedAt" DATETIME,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdByMemberId" TEXT NOT NULL,
    CONSTRAINT "SpotWorkEntry_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "WorkShift" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SpotWorkEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "SpotTask" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShiftAdjustment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shiftId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT NOT NULL,
    "newValue" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "createdByMemberId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShiftAdjustment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "WorkShift" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MemberPayRate_memberId_kind_effectiveFrom_idx" ON "MemberPayRate"("memberId", "kind", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "WorkShift_memberId_date_key" ON "WorkShift"("memberId", "date");

-- CreateIndex
CREATE INDEX "WorkShift_branchId_date_status_idx" ON "WorkShift"("branchId", "date", "status");

-- CreateIndex
CREATE INDEX "ReverseAssignment_shiftId_idx" ON "ReverseAssignment"("shiftId");

-- CreateIndex
CREATE INDEX "SpotTask_assigneeMemberId_date_idx" ON "SpotTask"("assigneeMemberId", "date");

-- CreateIndex
CREATE INDEX "SpotTask_branchId_date_status_idx" ON "SpotTask"("branchId", "date", "status");

-- CreateIndex
CREATE INDEX "SpotWorkEntry_shiftId_idx" ON "SpotWorkEntry"("shiftId");

-- CreateIndex
CREATE INDEX "ShiftAdjustment_shiftId_idx" ON "ShiftAdjustment"("shiftId");
