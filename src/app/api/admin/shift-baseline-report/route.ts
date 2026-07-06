import { NextRequest, NextResponse } from "next/server";
import {
  canReviewShifts,
  handleAdminError,
  requireAdminContext,
  resolveManagementBranchFilter,
} from "@/lib/admin-access";
import { buildShiftAssignmentsReport } from "@/lib/payroll/shift-baseline-tasks";

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
        { error: "Укажите период from и to" },
        { status: 400 },
      );
    }

    const branchId = resolveManagementBranchFilter(ctx, searchParams.get("branchId"));
    const rows = await buildShiftAssignmentsReport(
      ctx.organizationId,
      from,
      to,
      branchId,
    );

    return NextResponse.json({ rows });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
