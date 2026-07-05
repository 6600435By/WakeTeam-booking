import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  canReviewShifts,
  handleAdminError,
  requireAdminContext,
  resolveManagementBranchFilter,
  branchListWhere,
  BRANCH_OPERATOR_ROLE,
  BRANCH_ADMIN_ROLE,
} from "@/lib/admin-access";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    if (!canReviewShifts(ctx)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (!from || !to) {
      return NextResponse.json(
        { error: "Укажите период (from, to)" },
        { status: 400 },
      );
    }

    const branchId = resolveManagementBranchFilter(ctx, searchParams.get("branchId"));
    const memberIdsParam = searchParams.get("memberIds");
    const memberIds = memberIdsParam
      ? memberIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
      : null;

    const stats = await buildPayrollStats({
      ctx,
      from,
      to,
      branchId,
      memberIds,
      status: searchParams.get("status"),
      role: searchParams.get("role"),
    });

    const employees = await prisma.organizationMember.findMany({
      where: {
        organizationId: ctx.organizationId,
        role: { in: [BRANCH_OPERATOR_ROLE, BRANCH_ADMIN_ROLE] },
        ...(branchId ? { branchId } : ctx.isBranchAdmin ? { branchId: ctx.branchId } : {}),
      },
      include: {
        user: { select: { name: true, lastName: true, login: true, email: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { user: { name: "asc" } },
    });

    const branches = await prisma.branch.findMany({
      where: branchListWhere(ctx),
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      ...stats,
      employees: employees.map((m) => ({
        memberId: m.id,
        name: staffDisplayName(m.user),
        role: m.role,
        branchId: m.branchId,
        branchName: m.branch?.name ?? null,
      })),
      branches,
    });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    console.error("[payroll-stats]", e);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

const exportSchema = z.object({
  from: z.string(),
  to: z.string(),
  branchId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    if (!ctx.isSuperAdmin) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
    const body = exportSchema.parse(await req.json());
    const stats = await buildPayrollStats({
      ctx,
      from: body.from,
      to: body.to,
      branchId: body.branchId ?? null,
      status: "approved",
    });

    const header =
      "branch,member,date,panel_h,spot_h,idle_h,shift_h,amount_byn\n";
    const lines = stats.members.flatMap((m) =>
      m.shifts.map((s) => {
        const panel = (s.panelMinutes / 60).toFixed(2);
        const spot = (s.spotMinutes / 60).toFixed(2);
        const idle = (s.idleMinutes / 60).toFixed(2);
        const shift = (s.shiftMinutes / 60).toFixed(2);
        return `${m.branchName ?? ""},${m.memberName},${s.date},${panel},${spot},${idle},${shift},${s.totalAmount.toFixed(2)}`;
      }),
    );

    return new NextResponse(header + lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="payroll-${body.from}-${body.to}.csv"`,
      },
    });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
