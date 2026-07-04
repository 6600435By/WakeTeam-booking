import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canEditShiftReadiness,
  canViewShiftReadiness,
  type AdminContext,
} from "@/lib/admin-access";
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

describe("canViewShiftReadiness", () => {
  it("allows super admin", () => {
    assert.equal(
      canViewShiftReadiness(ctx({ role: SUPER_ADMIN_ROLE, isSuperAdmin: true })),
      true,
    );
  });

  it("allows branch admin in branch", () => {
    assert.equal(
      canViewShiftReadiness(
        ctx({ role: BRANCH_ADMIN_ROLE, isBranchAdmin: true, branchId: "branch-a" }),
        "branch-a",
      ),
      true,
    );
  });

  it("allows operator with workAsAdmin elevation", () => {
    assert.equal(
      canViewShiftReadiness(ctx({ workAsAdminElevated: true })),
      true,
    );
  });

  it("denies plain operator", () => {
    assert.equal(canViewShiftReadiness(ctx({})), false);
  });
});

describe("canEditShiftReadiness", () => {
  it("allows branch admin in own branch", () => {
    assert.equal(
      canEditShiftReadiness(
        ctx({ role: BRANCH_ADMIN_ROLE, isBranchAdmin: true, branchId: "branch-a" }),
        "branch-a",
      ),
      true,
    );
  });

  it("allows manager in scoped branch", () => {
    assert.equal(
      canEditShiftReadiness(
        ctx({
          role: BRANCH_MANAGER_ROLE,
          isBranchManager: true,
          managedBranchIds: ["branch-a"],
        }),
        "branch-a",
      ),
      true,
    );
  });

  it("allows manager on duty at duty branch", () => {
    assert.equal(
      canEditShiftReadiness(
        ctx({
          role: BRANCH_MANAGER_ROLE,
          isBranchManager: true,
          managedBranchIds: ["branch-b"],
          managerOnDutyElevated: true,
          managerOnDutyBranchId: "branch-a",
        }),
        "branch-a",
      ),
      true,
    );
  });
});
