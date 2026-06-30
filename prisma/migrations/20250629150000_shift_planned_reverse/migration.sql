-- AlterTable
ALTER TABLE "WorkShift" ADD COLUMN "plannedStaffId" TEXT;
ALTER TABLE "WorkShift" ADD COLUMN "workAsAdmin" BOOLEAN NOT NULL DEFAULT false;
