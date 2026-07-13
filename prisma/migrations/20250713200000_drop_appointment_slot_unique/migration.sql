-- Admin journal allows overlapping appointments; widget still validates slots in app code.
DROP INDEX IF EXISTS "Appointment_staffId_startAt_blocking_key";
