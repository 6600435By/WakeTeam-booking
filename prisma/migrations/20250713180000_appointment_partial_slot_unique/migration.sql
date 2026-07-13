-- Allow new bookings on slots with cancelled/deleted/completed/no_show records.
-- Uniqueness applies only to statuses that block the slot.
DROP INDEX IF EXISTS "Appointment_staffId_startAt_key";

CREATE UNIQUE INDEX "Appointment_staffId_startAt_blocking_key"
ON "Appointment"("staffId", "startAt")
WHERE status IN (
  'booked',
  'in_service',
  'awaiting_prepayment',
  'awaiting_confirmation',
  'in_cart',
  'rescheduling',
  'confirmed'
);
