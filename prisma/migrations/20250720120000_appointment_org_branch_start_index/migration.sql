-- Faster journal day queries scoped by branch
CREATE INDEX IF NOT EXISTS "Appointment_organizationId_branchId_startAt_idx"
ON "Appointment"("organizationId", "branchId", "startAt");
