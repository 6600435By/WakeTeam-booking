import { NextResponse } from "next/server";
import {
  getAdminContext,
  canEditJournalAppointments,
  canAssignShiftOnDuty,
  canManageUsers,
  canSetPayRates,
  canViewStaffUsers,
  handleAdminError,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const ctx = await getAdminContext();
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const member = await prisma.organizationMember.findUnique({
      where: { id: ctx.memberId },
      select: { onboardingCompletedAt: true },
    });
    return NextResponse.json({
      user: {
        id: ctx.user.id,
        login: ctx.user.login,
        email: ctx.user.email,
        name: ctx.user.name,
        lastName: ctx.user.lastName,
      },
      memberId: ctx.memberId,
      role: ctx.role,
      branchId: ctx.branchId,
      branchName: ctx.branchName,
      isSuperAdmin: ctx.isSuperAdmin,
      isBranchManager: ctx.isBranchManager,
      isBranchAdmin: ctx.isBranchAdmin,
      isBranchOperator: ctx.isBranchOperator,
      managedBranchIds: ctx.managedBranchIds,
      workAsAdminElevated: ctx.workAsAdminElevated,
      managerOnDutyElevated: ctx.managerOnDutyElevated,
      managerOnDutyBranchId: ctx.managerOnDutyBranchId,
      onboardingCompletedAt: member?.onboardingCompletedAt?.toISOString() ?? null,
      canEditJournal: canEditJournalAppointments(ctx),
      canAssignShiftOnDuty: canAssignShiftOnDuty(ctx),
      canManageUsers: canManageUsers(ctx),
      canSetPayRates: canSetPayRates(ctx),
      canViewStaffUsers: canViewStaffUsers(ctx),
    });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
