-- CreateTable
CREATE TABLE "BranchWeekdaySchedule" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "isWorking" BOOLEAN NOT NULL DEFAULT true,
    "timeFrom" TEXT NOT NULL,
    "timeTo" TEXT NOT NULL,

    CONSTRAINT "BranchWeekdaySchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchHoliday" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "label" TEXT,
    "isWorking" BOOLEAN NOT NULL DEFAULT true,
    "timeFrom" TEXT,
    "timeTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BranchHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BranchWeekdaySchedule_branchId_weekday_key" ON "BranchWeekdaySchedule"("branchId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "BranchHoliday_branchId_date_key" ON "BranchHoliday"("branchId", "date");

-- CreateIndex
CREATE INDEX "BranchHoliday_branchId_date_idx" ON "BranchHoliday"("branchId", "date");

-- AddForeignKey
ALTER TABLE "BranchWeekdaySchedule" ADD CONSTRAINT "BranchWeekdaySchedule_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchHoliday" ADD CONSTRAINT "BranchHoliday_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
