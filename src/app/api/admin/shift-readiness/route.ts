import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  canViewShiftReadiness,
  handleAdminError,
  isInManagementScope,
  requireAdminContext,
  resolveManagementBranchFilter,
} from "@/lib/admin-access";
import { queryShiftReadiness } from "@/lib/payroll/shift-readiness";
import { formatDateKey } from "@/lib/time";

const querySchema = z.object({
  branchId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    const params = querySchema.parse({
      branchId: req.nextUrl.searchParams.get("branchId"),
      date: req.nextUrl.searchParams.get("date") ?? undefined,
    });
    const branchId = resolveManagementBranchFilter(ctx, params.branchId);
    if (!branchId) {
      return NextResponse.json({ error: "Укажите филиал" }, { status: 400 });
    }
    if (!canViewShiftReadiness(ctx, branchId)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
    if (ctx.isBranchManager && !isInManagementScope(ctx, branchId)) {
      if (
        !ctx.managerOnDutyElevated ||
        ctx.managerOnDutyBranchId !== branchId
      ) {
        return NextResponse.json({ error: "Нет доступа к филиалу" }, { status: 403 });
      }
    }

    const date = params.date ?? formatDateKey(new Date());
    const payload = await queryShiftReadiness(ctx.organizationId, branchId, date);
    return NextResponse.json(payload);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    console.error(e);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
