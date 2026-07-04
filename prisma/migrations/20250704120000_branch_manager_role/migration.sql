-- CreateTable
CREATE TABLE "MemberBranchScope" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,

    CONSTRAINT "MemberBranchScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollMonthlyAccrual" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "periodFrom" TEXT NOT NULL,
    "periodTo" TEXT NOT NULL,
    "suggestedAmount" DOUBLE PRECISION NOT NULL,
    "confirmedAmount" DOUBLE PRECISION,
    "comment" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmedByMemberId" TEXT,

    CONSTRAINT "PayrollMonthlyAccrual_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemberBranchScope_branchId_idx" ON "MemberBranchScope"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberBranchScope_memberId_branchId_key" ON "MemberBranchScope"("memberId", "branchId");

-- CreateIndex
CREATE INDEX "PayrollMonthlyAccrual_organizationId_periodFrom_periodTo_idx" ON "PayrollMonthlyAccrual"("organizationId", "periodFrom", "periodTo");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollMonthlyAccrual_memberId_periodFrom_periodTo_key" ON "PayrollMonthlyAccrual"("memberId", "periodFrom", "periodTo");

-- AddForeignKey
ALTER TABLE "MemberBranchScope" ADD CONSTRAINT "MemberBranchScope_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "OrganizationMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberBranchScope" ADD CONSTRAINT "MemberBranchScope_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollMonthlyAccrual" ADD CONSTRAINT "PayrollMonthlyAccrual_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "OrganizationMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
