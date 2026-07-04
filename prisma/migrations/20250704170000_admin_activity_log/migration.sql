-- CreateTable
CREATE TABLE "AdminActivityLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "actorMemberId" TEXT,
    "actorName" VARCHAR(80) NOT NULL,
    "branchId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "summary" VARCHAR(280) NOT NULL,

    CONSTRAINT "AdminActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminActivityLog_organizationId_createdAt_idx" ON "AdminActivityLog"("organizationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AdminActivityLog_organizationId_action_createdAt_idx" ON "AdminActivityLog"("organizationId", "action", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AdminActivityLog_createdAt_idx" ON "AdminActivityLog"("createdAt");
