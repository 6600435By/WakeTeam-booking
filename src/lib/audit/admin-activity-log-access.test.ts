import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canViewAdminActivityLog, type AdminContext } from "@/lib/admin-access";
import {
  BRANCH_ADMIN_ROLE,
  BRANCH_MANAGER_ROLE,
  BRANCH_OPERATOR_ROLE,
  SUPER_ADMIN_ROLE,
} from "@/lib/admin-roles";

function ctx(partial: Partial<AdminContext>): AdminContext {
  return {
    user: { id: "u1" } as AdminContext["user"],
    memberId: "m1",
    organizationId: "org1",
    role: BRANCH_OPERATOR_ROLE,
    branchId: "branch-a",
    branchName: null,
    isSuperAdmin: false,
    isBranchManager: false,
    isBranchAdmin: false,
    isBranchOperator: true,
    managedBranchIds: [],
    workAsAdminElevated: false,
    managerOnDutyElevated: false,
    managerOnDutyBranchId: null,
    ...partial,
  };
}

describe("canViewAdminActivityLog", () => {
  it("allows super admin only", () => {
    assert.equal(
      canViewAdminActivityLog(ctx({ role: SUPER_ADMIN_ROLE, isSuperAdmin: true })),
      true,
    );
  });

  it("denies branch admin", () => {
    assert.equal(
      canViewAdminActivityLog(ctx({ role: BRANCH_ADMIN_ROLE, isBranchAdmin: true })),
      false,
    );
  });

  it("denies branch manager", () => {
    assert.equal(
      canViewAdminActivityLog(
        ctx({ role: BRANCH_MANAGER_ROLE, isBranchManager: true, managedBranchIds: ["branch-a"] }),
      ),
      false,
    );
  });

  it("denies branch operator", () => {
    assert.equal(canViewAdminActivityLog(ctx({})), false);
  });
});
