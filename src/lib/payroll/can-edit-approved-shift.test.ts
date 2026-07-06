import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BRANCH_ADMIN_ROLE,
  BRANCH_MANAGER_ROLE,
  BRANCH_OPERATOR_ROLE,
  SUPER_ADMIN_ROLE,
  canEditApprovedShift,
  canDeleteShift,
  canViewBranchShiftSummary,
  type AdminContext,
} from "@/lib/admin-access";

function ctx(
  role: string,
  opts: {
    branchId?: string | null;
    managedBranchIds?: string[];
    workAsAdminElevated?: boolean;
  } = {},
): AdminContext {
  const isBranchManager = role === BRANCH_MANAGER_ROLE;
  return {
    user: {} as AdminContext["user"],
    memberId: "m1",
    organizationId: "org",
    role: role as AdminContext["role"],
    branchId: opts.branchId ?? "b1",
    branchName: null,
    isSuperAdmin: role === SUPER_ADMIN_ROLE,
    isBranchManager,
    isBranchAdmin: role === BRANCH_ADMIN_ROLE,
    isBranchOperator: role === BRANCH_OPERATOR_ROLE,
    managedBranchIds: opts.managedBranchIds ?? (isBranchManager ? ["b1", "b2"] : []),
    workAsAdminElevated: opts.workAsAdminElevated ?? false,
    managerOnDutyElevated: false,
    managerOnDutyBranchId: null,
  };
}

describe("canEditApprovedShift", () => {
  it("super_admin can edit any approved shift", () => {
    assert.equal(
      canEditApprovedShift(ctx(SUPER_ADMIN_ROLE), BRANCH_MANAGER_ROLE, "b1"),
      true,
    );
  });

  it("branch_manager can edit operator/admin in scope", () => {
    assert.equal(
      canEditApprovedShift(ctx(BRANCH_MANAGER_ROLE), BRANCH_OPERATOR_ROLE, "b1"),
      true,
    );
    assert.equal(
      canEditApprovedShift(ctx(BRANCH_MANAGER_ROLE), BRANCH_ADMIN_ROLE, "b2"),
      true,
    );
  });

  it("branch_manager cannot edit out of scope or peer managers", () => {
    assert.equal(
      canEditApprovedShift(ctx(BRANCH_MANAGER_ROLE), BRANCH_OPERATOR_ROLE, "b9"),
      false,
    );
    assert.equal(
      canEditApprovedShift(ctx(BRANCH_MANAGER_ROLE), BRANCH_MANAGER_ROLE, "b1"),
      false,
    );
  });

  it("branch_admin cannot edit approved shifts", () => {
    assert.equal(
      canEditApprovedShift(ctx(BRANCH_ADMIN_ROLE), BRANCH_OPERATOR_ROLE, "b1"),
      false,
    );
  });
});

describe("canDeleteShift", () => {
  it("requires approve scope", () => {
    assert.equal(
      canDeleteShift(ctx(BRANCH_ADMIN_ROLE), BRANCH_OPERATOR_ROLE, "b1"),
      true,
    );
    assert.equal(
      canDeleteShift(ctx(BRANCH_ADMIN_ROLE), BRANCH_ADMIN_ROLE, "b1"),
      false,
    );
    assert.equal(
      canDeleteShift(ctx(BRANCH_OPERATOR_ROLE), BRANCH_OPERATOR_ROLE, "b1"),
      false,
    );
  });
});

describe("canViewBranchShiftSummary", () => {
  it("allows management roles and workAsAdmin operator", () => {
    assert.equal(canViewBranchShiftSummary(ctx(BRANCH_ADMIN_ROLE)), true);
    assert.equal(canViewBranchShiftSummary(ctx(BRANCH_MANAGER_ROLE)), true);
    assert.equal(
      canViewBranchShiftSummary(
        ctx(BRANCH_OPERATOR_ROLE, { workAsAdminElevated: true }),
      ),
      true,
    );
    assert.equal(canViewBranchShiftSummary(ctx(BRANCH_OPERATOR_ROLE)), false);
  });
});
