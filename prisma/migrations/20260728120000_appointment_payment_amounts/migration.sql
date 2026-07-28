-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN "cashAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Appointment" ADD COLUMN "cardAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Backfill from legacy paymentMethod + price
UPDATE "Appointment"
SET "cashAmount" = "price",
    "cardAmount" = 0
WHERE "paymentMethod" = 'cash';

UPDATE "Appointment"
SET "cashAmount" = 0,
    "cardAmount" = "price"
WHERE "paymentMethod" IS DISTINCT FROM 'cash';
