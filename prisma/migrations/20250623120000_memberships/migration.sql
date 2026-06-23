-- Memberships integration (Google Sheets cache)

CREATE TABLE "Membership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "externalCode" TEXT NOT NULL,
    "category" TEXT,
    "ownerName" TEXT,
    "phone" TEXT NOT NULL,
    "saleDate" DATETIME,
    "initialMinutes" INTEGER NOT NULL DEFAULT 0,
    "sheetRemainingMinutes" INTEGER NOT NULL DEFAULT 0,
    "localDeductedMinutes" INTEGER NOT NULL DEFAULT 0,
    "comment" TEXT,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "MembershipTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "membershipId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "minutes" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MembershipTransaction_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Membership_organizationId_externalCode_key" ON "Membership"("organizationId", "externalCode");
CREATE INDEX "Membership_organizationId_phone_idx" ON "Membership"("organizationId", "phone");
CREATE INDEX "MembershipTransaction_membershipId_idx" ON "MembershipTransaction"("membershipId");
CREATE INDEX "MembershipTransaction_appointmentId_idx" ON "MembershipTransaction"("appointmentId");

-- Redefine Appointment with membership fields (SQLite)
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Appointment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "publicNumber" INTEGER NOT NULL,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "membershipId" TEXT,
    "membershipMinutesDeducted" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Appointment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Appointment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Appointment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Appointment_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Appointment" ("id", "publicNumber", "organizationId", "branchId", "clientId", "staffId", "serviceId", "startAt", "endAt", "durationMinutes", "price", "status", "cancelReason", "source", "comment", "createdAt", "updatedAt", "membershipId", "membershipMinutesDeducted")
SELECT "id", "publicNumber", "organizationId", "branchId", "clientId", "staffId", "serviceId", "startAt", "endAt", "durationMinutes", "price", "status", "cancelReason", "source", "comment", "createdAt", "updatedAt", "membershipId", "membershipMinutesDeducted" FROM "Appointment";
DROP TABLE "Appointment";
ALTER TABLE "new_Appointment" RENAME TO "Appointment";
CREATE UNIQUE INDEX "Appointment_publicNumber_key" ON "Appointment"("publicNumber");
CREATE UNIQUE INDEX "Appointment_staffId_startAt_key" ON "Appointment"("staffId", "startAt");
CREATE INDEX "Appointment_startAt_idx" ON "Appointment"("startAt");
CREATE INDEX "Appointment_organizationId_startAt_idx" ON "Appointment"("organizationId", "startAt");
PRAGMA foreign_keys=ON;
