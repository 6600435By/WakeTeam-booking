-- CreateIndex
CREATE INDEX "Staff_organizationId_branchId_isActive_idx" ON "Staff"("organizationId", "branchId", "isActive");

-- CreateIndex
CREATE INDEX "Staff_branchId_isActive_sortOrder_idx" ON "Staff"("branchId", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "Service_branchId_isActive_sortOrder_idx" ON "Service"("branchId", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "WorkShift_organizationId_date_idx" ON "WorkShift"("organizationId", "date");

-- CreateIndex
CREATE INDEX "WorkShift_organizationId_branchId_date_idx" ON "WorkShift"("organizationId", "branchId", "date");
