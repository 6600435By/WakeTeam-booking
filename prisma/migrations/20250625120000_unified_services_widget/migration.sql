-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "widgetSettings" TEXT;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'wake';

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN "bookingGroupId" TEXT;

-- CreateTable
CREATE TABLE "ServicePriceRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serviceId" TEXT NOT NULL,
    "weekdays" TEXT NOT NULL,
    "timeFrom" TEXT NOT NULL,
    "timeTo" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ServicePriceRule_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
