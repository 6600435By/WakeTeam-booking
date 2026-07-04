import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BRANCH_MANAGER_ROLE,
  resolveManagementBranchFilter,
  type AdminContext,
} from "@/lib/admin-access";

function managerCtx(managedBranchIds = ["b1", "b2"]): AdminContext {
  return {
    user: {} as AdminContext["user"],
    memberId: "m1",
    organizationId: "org",
    role: BRANCH_MANAGER_ROLE,
    branchId: "b1",
    branchName: null,
    isSuperAdmin: false,
    isBranchManager: true,
    isBranchAdmin: false,
    isBranchOperator: false,
    managedBranchIds,
    workAsAdminElevated: false,
    managerOnDutyElevated: false,
    managerOnDutyBranchId: null,
  };
}

describe("resolveManagementBranchFilter", () => {
  it("returns requested branch when in scope", () => {
    assert.equal(resolveManagementBranchFilter(managerCtx(), "b2"), "b2");
  });

  it("returns first managed branch when no request", () => {
    assert.equal(resolveManagementBranchFilter(managerCtx()), "b1");
  });
});
