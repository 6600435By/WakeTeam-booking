import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleAdminError, requireAdminContext, resolveBranchFilter } from "@/lib/admin-access";
import { resolveDefaultOperatorMemberId } from "@/lib/payroll/resolve-appointment-operator";

const querySchema = z.object({
  branchId: z.string(),
  staffId: z.string(),
  startAt: z.string(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    const params = querySchema.parse({
      branchId: req.nextUrl.searchParams.get("branchId"),
      staffId: req.nextUrl.searchParams.get("staffId"),
      startAt: req.nextUrl.searchParams.get("startAt"),
    });
    const branchId = resolveBranchFilter(ctx, params.branchId);
    if (!branchId) {
      return NextResponse.json({ error: "Укажите филиал" }, { status: 400 });
    }

    const startAt = new Date(params.startAt);
    if (Number.isNaN(startAt.getTime())) {
      return NextResponse.json({ error: "Некорректное время" }, { status: 400 });
    }

    const operatorMemberId = await resolveDefaultOperatorMemberId(
      branchId,
      params.staffId,
      startAt,
    );
    return NextResponse.json({ operatorMemberId });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
