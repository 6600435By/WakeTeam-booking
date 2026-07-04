import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BRANCH_ADMIN_ROLE,
  BRANCH_MANAGER_ROLE,
  BRANCH_OPERATOR_ROLE,
  SUPER_ADMIN_ROLE,
  canApproveShift,
  canCreateJournalInBranch,
  canEditJournalInBranch,
  isInManagementScope,
  type AdminContext,
} from "@/lib/admin-access";

function ctx(
  role: string,
  opts: {
    branchId?: string | null;
    managedBranchIds?: string[];
    managerOnDutyBranchId?: string | null;
    managerOnDutyElevated?: boolean;
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
    workAsAdminElevated: false,
    managerOnDutyElevated: opts.managerOnDutyElevated ?? false,
    managerOnDutyBranchId: opts.managerOnDutyBranchId ?? null,
  };
}

describe("canApproveShift", () => {
  it("super_admin approves anyone", () => {
    assert.equal(
      canApproveShift(ctx(SUPER_ADMIN_ROLE), BRANCH_ADMIN_ROLE, "b1"),
      true,
    );
    assert.equal(
      canApproveShift(ctx(SUPER_ADMIN_ROLE), BRANCH_MANAGER_ROLE, "b1"),
      true,
    );
  });

  it("branch_admin approves operators in same branch", () => {
    assert.equal(
      canApproveShift(ctx(BRANCH_ADMIN_ROLE), BRANCH_OPERATOR_ROLE, "b1"),
      true,
    );
    assert.equal(
      canApproveShift(ctx(BRANCH_ADMIN_ROLE), BRANCH_OPERATOR_ROLE, "b2"),
      false,
    );
  });

  it("branch_admin cannot approve branch_admin shifts", () => {
    assert.equal(
      canApproveShift(ctx(BRANCH_ADMIN_ROLE), BRANCH_ADMIN_ROLE, "b1"),
      false,
    );
  });

  it("branch_manager approves operators and admins in scoped branches", () => {
    assert.equal(
      canApproveShift(ctx(BRANCH_MANAGER_ROLE), BRANCH_OPERATOR_ROLE, "b1"),
      true,
    );
    assert.equal(
      canApproveShift(ctx(BRANCH_MANAGER_ROLE), BRANCH_ADMIN_ROLE, "b2"),
      true,
    );
    assert.equal(
      canApproveShift(ctx(BRANCH_MANAGER_ROLE), BRANCH_OPERATOR_ROLE, "b3"),
      false,
    );
  });

  it("branch_manager cannot approve other managers or super admins", () => {
    assert.equal(
      canApproveShift(ctx(BRANCH_MANAGER_ROLE), BRANCH_MANAGER_ROLE, "b1"),
      false,
    );
    assert.equal(
      canApproveShift(ctx(BRANCH_MANAGER_ROLE), SUPER_ADMIN_ROLE, "b1"),
      false,
    );
  });

  it("operator cannot approve", () => {
    assert.equal(
      canApproveShift(ctx(BRANCH_OPERATOR_ROLE), BRANCH_OPERATOR_ROLE, "b1"),
      false,
    );
  });
});

describe("branch manager journal access", () => {
  it("can create in any branch", () => {
    const m = ctx(BRANCH_MANAGER_ROLE);
    assert.equal(canCreateJournalInBranch(m, "b1"), true);
    assert.equal(canCreateJournalInBranch(m, "b99"), true);
  });

  it("can edit only in scoped branches", () => {
    const m = ctx(BRANCH_MANAGER_ROLE);
    assert.equal(canEditJournalInBranch(m, "b1"), true);
    assert.equal(canEditJournalInBranch(m, "b2"), true);
    assert.equal(canEditJournalInBranch(m, "b99"), false);
  });

  it("on duty can edit in duty branch outside scope list display", () => {
    const m = ctx(BRANCH_MANAGER_ROLE, {
      managerOnDutyElevated: true,
      managerOnDutyBranchId: "b3",
    });
    assert.equal(canEditJournalInBranch(m, "b3"), true);
  });

  it("isInManagementScope respects managed branches", () => {
    const m = ctx(BRANCH_MANAGER_ROLE);
    assert.equal(isInManagementScope(m, "b1"), true);
    assert.equal(isInManagementScope(m, "b9"), false);
  });
});
