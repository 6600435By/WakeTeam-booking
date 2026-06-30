import { NextRequest, NextResponse } from "next/server";
import {
  BRANCH_ADMIN_ROLE,
  BRANCH_OPERATOR_ROLE,
  canEditShiftCalendar,
  canViewShiftCalendar,
  handleAdminError,
  requireAdminContext,
  resolveBranchFilter,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { staffDisplayName } from "@/lib/staff-user";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    const branchId = resolveBranchFilter(
      ctx,
      new URL(req.url).searchParams.get("branchId"),
    );
    if (!branchId) {
      return NextResponse.json({ error: "Укажите филиал" }, { status: 400 });
    }

    const reverses = await prisma.staff.findMany({
      where: { branchId, kind: "revers", isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    });

    let operators: { memberId: string; name: string }[] = [];
    let members: { memberId: string; name: string; role: string }[] = [];
    if (canViewShiftCalendar(ctx)) {
      const all = await prisma.organizationMember.findMany({
        where: {
          branchId,
          role: { in: [BRANCH_OPERATOR_ROLE, BRANCH_ADMIN_ROLE] },
        },
        include: { user: { select: { name: true, lastName: true, login: true, email: true } } },
        orderBy: { user: { name: "asc" } },
      });
      members = all.map((m) => ({
        memberId: m.id,
        name: staffDisplayName(m.user),
        role: m.role,
      }));
      operators = all
        .filter((m) => m.role === BRANCH_OPERATOR_ROLE)
        .map((m) => ({
          memberId: m.id,
          name: staffDisplayName(m.user),
        }));
    }

    return NextResponse.json({ reverses, operators, members, branchId });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
