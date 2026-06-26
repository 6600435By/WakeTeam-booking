-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Appointment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "publicNumber" INTEGER,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "price" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'booked',
    "cancelReason" TEXT,
    "source" TEXT NOT NULL DEFAULT 'widget',
    "comment" TEXT,
    "bookingGroupId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "membershipId" TEXT,
    "membershipMinutesDeducted" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Appointment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Appointment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Appointment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Appointment_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Appointment" ("bookingGroupId", "branchId", "cancelReason", "clientId", "comment", "createdAt", "durationMinutes", "endAt", "id", "membershipId", "membershipMinutesDeducted", "organizationId", "price", "publicNumber", "serviceId", "source", "staffId", "startAt", "status", "updatedAt") SELECT "bookingGroupId", "branchId", "cancelReason", "clientId", "comment", "createdAt", "durationMinutes", "endAt", "id", "membershipId", "membershipMinutesDeducted", "organizationId", "price", "publicNumber", "serviceId", "source", "staffId", "startAt", "status", "updatedAt" FROM "Appointment";
DROP TABLE "Appointment";
ALTER TABLE "new_Appointment" RENAME TO "Appointment";
CREATE UNIQUE INDEX "Appointment_publicNumber_key" ON "Appointment"("publicNumber");
CREATE UNIQUE INDEX "Appointment_staffId_startAt_key" ON "Appointment"("staffId", "startAt");
CREATE INDEX "Appointment_startAt_idx" ON "Appointment"("startAt");
CREATE INDEX "Appointment_organizationId_startAt_idx" ON "Appointment"("organizationId", "startAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
