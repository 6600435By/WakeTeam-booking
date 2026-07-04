import { NextRequest, NextResponse } from "next/server";
import {
  BRANCH_ADMIN_ROLE,
  BRANCH_MANAGER_ROLE,
  BRANCH_OPERATOR_ROLE,
  canEditShiftCalendar,
  canViewShiftCalendar,
  handleAdminError,
  requireAdminContext,
  resolveBranchFilter,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { staffDisplayName } from "@/lib/staff-user";
import { formatDateKey } from "@/lib/time";

const ON_SHIFT_OPERATOR_ROLES = [BRANCH_OPERATOR_ROLE, BRANCH_MANAGER_ROLE];

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    const { searchParams } = new URL(req.url);
    const branchId = resolveBranchFilter(ctx, searchParams.get("branchId"));
    const dateParam = searchParams.get("date");
    if (!branchId) {
      return NextResponse.json({ error: "Укажите филиал" }, { status: 400 });
    }

    const reverses = await prisma.staff.findMany({
      where: { branchId, kind: "revers", isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    });

    let operators: { memberId: string; name: string }[] = [];
    let managers: { memberId: string; name: string }[] = [];
    let members: { memberId: string; name: string; role: string }[] = [];
    if (canViewShiftCalendar(ctx)) {
      const all = await prisma.organizationMember.findMany({
        where: {
          branchId,
          role: { in: [BRANCH_OPERATOR_ROLE, BRANCH_ADMIN_ROLE, BRANCH_MANAGER_ROLE] },
        },
        include: { user: { select: { name: true, lastName: true, login: true, email: true } } },
        orderBy: { user: { name: "asc" } },
      });
      const scopedManagers = await prisma.organizationMember.findMany({
        where: {
          organizationId: ctx.organizationId,
          role: BRANCH_MANAGER_ROLE,
          branchScopes: { some: { branchId } },
        },
        include: { user: { select: { name: true, lastName: true, login: true, email: true } } },
        orderBy: { user: { name: "asc" } },
      });
      const byId = new Map<string, { memberId: string; name: string; role: string }>();
      for (const m of all) {
        byId.set(m.id, {
          memberId: m.id,
          name: staffDisplayName(m.user),
          role: m.role,
        });
      }
      for (const m of scopedManagers) {
        if (!byId.has(m.id)) {
          byId.set(m.id, {
            memberId: m.id,
            name: staffDisplayName(m.user),
            role: m.role,
          });
        }
      }
      members = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
      operators = members
        .filter((m) => m.role === BRANCH_OPERATOR_ROLE)
        .map((m) => ({ memberId: m.memberId, name: m.name }));
      managers = members
        .filter((m) => m.role === BRANCH_MANAGER_ROLE)
        .map((m) => ({ memberId: m.memberId, name: m.name }));
    }

    const onShift: { memberId: string; name: string; role: string }[] = [];
    const date =
      dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : formatDateKey(new Date());
    if (canViewShiftCalendar(ctx)) {
      const shifts = await prisma.workShift.findMany({
        where: {
          branchId,
          date,
          status: { in: ["scheduled", "open"] },
          member: { role: { in: ON_SHIFT_OPERATOR_ROLES } },
        },
        include: {
          member: {
            include: {
              user: { select: { name: true, lastName: true, login: true, email: true } },
            },
          },
        },
        orderBy: { member: { user: { name: "asc" } } },
      });
      const seen = new Set<string>();
      for (const shift of shifts) {
        if (seen.has(shift.memberId)) continue;
        seen.add(shift.memberId);
        onShift.push({
          memberId: shift.memberId,
          name: staffDisplayName(shift.member.user),
          role: shift.member.role,
        });
      }
    }

    return NextResponse.json({ reverses, operators, managers, members, onShift, branchId });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
