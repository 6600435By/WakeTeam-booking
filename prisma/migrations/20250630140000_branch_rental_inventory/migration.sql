-- CreateTable
CREATE TABLE "BranchRentalItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "BranchRentalItem_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN "rentalItemId" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "rentalQuantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Appointment" ADD COLUMN "rentalAmount" REAL NOT NULL DEFAULT 0;

-- AddForeignKey
CREATE INDEX "Appointment_rentalItemId_idx" ON "Appointment"("rentalItemId");
CREATE INDEX "BranchRentalItem_branchId_idx" ON "BranchRentalItem"("branchId");
