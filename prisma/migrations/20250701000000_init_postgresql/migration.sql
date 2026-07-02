-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Minsk',
    "currency" TEXT NOT NULL DEFAULT 'BYN',
    "widgetSettings" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "lastName" TEXT,
    "phone" TEXT,
    "passportNumber" TEXT,
    "registrationAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'branch_admin',
    "branchId" TEXT,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "description" TEXT,
    "photoUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchRentalItem" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "BranchRentalItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'revers',
    "description" TEXT,
    "photoUrl" TEXT,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "slotMinutes" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffSchedule" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "isWorking" BOOLEAN NOT NULL DEFAULT true,
    "timeFrom" TEXT NOT NULL,
    "timeTo" TEXT NOT NULL,

    CONSTRAINT "StaffSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffBreak" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "weekday" INTEGER,
    "timeFrom" TEXT NOT NULL,
    "timeTo" TEXT NOT NULL,

    CONSTRAINT "StaffBreak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "resourceLabel" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'wake',
    "durationMinutes" INTEGER NOT NULL DEFAULT 10,
    "allowedDurations" TEXT NOT NULL DEFAULT '10,30,60',
    "price" DOUBLE PRECISION NOT NULL,
    "bookableFrom" TEXT,
    "bookableTo" TEXT,
    "weekdays" TEXT NOT NULL DEFAULT '1,2,3,4,5,6,7',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isOnlineBookable" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicePriceRule" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "weekdays" TEXT NOT NULL,
    "timeFrom" TEXT NOT NULL,
    "timeTo" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ServicePriceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceStaff" (
    "serviceId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,

    CONSTRAINT "ServiceStaff_pkey" PRIMARY KEY ("serviceId","staffId")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "publicNumber" INTEGER,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "paymentMethod" TEXT,
    "status" TEXT NOT NULL DEFAULT 'booked',
    "cancelReason" TEXT,
    "source" TEXT NOT NULL DEFAULT 'widget',
    "comment" TEXT,
    "bookingGroupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "membershipId" TEXT,
    "membershipMinutesDeducted" INTEGER NOT NULL DEFAULT 0,
    "rentalItemId" TEXT,
    "rentalQuantity" INTEGER NOT NULL DEFAULT 0,
    "rentalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "externalCode" TEXT NOT NULL,
    "category" TEXT,
    "ownerName" TEXT,
    "phone" TEXT NOT NULL,
    "saleDate" TIMESTAMP(3),
    "initialMinutes" INTEGER NOT NULL DEFAULT 0,
    "pricePerMinute" DOUBLE PRECISION,
    "sheetRemainingMinutes" INTEGER NOT NULL DEFAULT 0,
    "localDeductedMinutes" INTEGER NOT NULL DEFAULT 0,
    "comment" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipTransaction" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "minutes" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberPayRate" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "effectiveFrom" TEXT NOT NULL,
    "effectiveTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByMemberId" TEXT,

    CONSTRAINT "MemberPayRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkShift" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "plannedStart" TEXT,
    "plannedEnd" TEXT,
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "panelMinutesOverride" INTEGER,
    "idleMinutesOverride" INTEGER,
    "ratesSnapshot" TEXT,
    "plannedStaffId" TEXT,
    "workAsAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReverseAssignment" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "ReverseAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpotWorkEntry" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "taskId" TEXT,
    "category" TEXT,
    "comment" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'manual',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdByMemberId" TEXT NOT NULL,

    CONSTRAINT "SpotWorkEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpotTask" (
    "id" TEXT NOT NULL,
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
    "branchWide" BOOLEAN NOT NULL DEFAULT false,
    "groupId" TEXT,
    "totalPlannedMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpotTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftBaselineTask" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "assignedByMemberId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftBaselineTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftBaselineCompletion" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "workShiftId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftBaselineCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftHandoffNote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "targetDate" TEXT NOT NULL,
    "workShiftId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftHandoffNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftAdjustment" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT NOT NULL,
    "newValue" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "createdByMemberId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftChangeRequest" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_login_key" ON "User"("login");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_organizationId_userId_key" ON "OrganizationMember"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffSchedule_staffId_weekday_key" ON "StaffSchedule"("staffId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "Client_organizationId_phone_key" ON "Client"("organizationId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_publicNumber_key" ON "Appointment"("publicNumber");

-- CreateIndex
CREATE INDEX "Appointment_startAt_idx" ON "Appointment"("startAt");

-- CreateIndex
CREATE INDEX "Appointment_organizationId_startAt_idx" ON "Appointment"("organizationId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_staffId_startAt_key" ON "Appointment"("staffId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppSetting_key_key" ON "AppSetting"("key");

-- CreateIndex
CREATE INDEX "Membership_organizationId_phone_idx" ON "Membership"("organizationId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_organizationId_externalCode_key" ON "Membership"("organizationId", "externalCode");

-- CreateIndex
CREATE INDEX "MembershipTransaction_membershipId_idx" ON "MembershipTransaction"("membershipId");

-- CreateIndex
CREATE INDEX "MembershipTransaction_appointmentId_idx" ON "MembershipTransaction"("appointmentId");

-- CreateIndex
CREATE INDEX "MemberPayRate_memberId_kind_effectiveFrom_idx" ON "MemberPayRate"("memberId", "kind", "effectiveFrom");

-- CreateIndex
CREATE INDEX "WorkShift_branchId_date_status_idx" ON "WorkShift"("branchId", "date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkShift_memberId_date_key" ON "WorkShift"("memberId", "date");

-- CreateIndex
CREATE INDEX "ReverseAssignment_shiftId_idx" ON "ReverseAssignment"("shiftId");

-- CreateIndex
CREATE INDEX "SpotWorkEntry_shiftId_idx" ON "SpotWorkEntry"("shiftId");

-- CreateIndex
CREATE INDEX "SpotTask_assigneeMemberId_date_idx" ON "SpotTask"("assigneeMemberId", "date");

-- CreateIndex
CREATE INDEX "SpotTask_branchId_date_status_idx" ON "SpotTask"("branchId", "date", "status");

-- CreateIndex
CREATE INDEX "SpotTask_groupId_idx" ON "SpotTask"("groupId");

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

-- CreateIndex
CREATE INDEX "ShiftAdjustment_shiftId_idx" ON "ShiftAdjustment"("shiftId");

-- CreateIndex
CREATE INDEX "ShiftChangeRequest_memberId_status_idx" ON "ShiftChangeRequest"("memberId", "status");

-- CreateIndex
CREATE INDEX "ShiftChangeRequest_branchId_status_date_idx" ON "ShiftChangeRequest"("branchId", "status", "date");

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchRentalItem" ADD CONSTRAINT "BranchRentalItem_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffSchedule" ADD CONSTRAINT "StaffSchedule_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffBreak" ADD CONSTRAINT "StaffBreak_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePriceRule" ADD CONSTRAINT "ServicePriceRule_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceStaff" ADD CONSTRAINT "ServiceStaff_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceStaff" ADD CONSTRAINT "ServiceStaff_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_rentalItemId_fkey" FOREIGN KEY ("rentalItemId") REFERENCES "BranchRentalItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipTransaction" ADD CONSTRAINT "MembershipTransaction_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberPayRate" ADD CONSTRAINT "MemberPayRate_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "OrganizationMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkShift" ADD CONSTRAINT "WorkShift_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "OrganizationMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkShift" ADD CONSTRAINT "WorkShift_plannedStaffId_fkey" FOREIGN KEY ("plannedStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReverseAssignment" ADD CONSTRAINT "ReverseAssignment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "WorkShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReverseAssignment" ADD CONSTRAINT "ReverseAssignment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpotWorkEntry" ADD CONSTRAINT "SpotWorkEntry_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "WorkShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpotWorkEntry" ADD CONSTRAINT "SpotWorkEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "SpotTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpotTask" ADD CONSTRAINT "SpotTask_assigneeMemberId_fkey" FOREIGN KEY ("assigneeMemberId") REFERENCES "OrganizationMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpotTask" ADD CONSTRAINT "SpotTask_assignedByMemberId_fkey" FOREIGN KEY ("assignedByMemberId") REFERENCES "OrganizationMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftBaselineCompletion" ADD CONSTRAINT "ShiftBaselineCompletion_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ShiftBaselineTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftBaselineCompletion" ADD CONSTRAINT "ShiftBaselineCompletion_workShiftId_fkey" FOREIGN KEY ("workShiftId") REFERENCES "WorkShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftHandoffNote" ADD CONSTRAINT "ShiftHandoffNote_workShiftId_fkey" FOREIGN KEY ("workShiftId") REFERENCES "WorkShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAdjustment" ADD CONSTRAINT "ShiftAdjustment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "WorkShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftChangeRequest" ADD CONSTRAINT "ShiftChangeRequest_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "OrganizationMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftChangeRequest" ADD CONSTRAINT "ShiftChangeRequest_workShiftId_fkey" FOREIGN KEY ("workShiftId") REFERENCES "WorkShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

