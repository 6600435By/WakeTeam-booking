import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  canEditShiftCalendar,
  handleAdminError,
  requireAdminContext,
  resolveBranchFilter,
} from "@/lib/admin-access";
import {
  createBaselineTask,
  listBaselineTasksForDay,
} from "@/lib/payroll/shift-baseline-tasks";

const createSchema = z.object({
  branchId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(1),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    const branchId = resolveBranchFilter(ctx, searchParams.get("branchId"));
    if (!date || !branchId) {
      return NextResponse.json(
        { error: "Укажите филиал и дату" },
        { status: 400 },
      );
    }

    const tasks = await listBaselineTasksForDay(branchId, date);
    return NextResponse.json({ tasks });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    if (!canEditShiftCalendar(ctx)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
    const body = createSchema.parse(await req.json());

    const task = await createBaselineTask({
      organizationId: ctx.organizationId,
      branchId: body.branchId,
      date: body.date,
      description: body.description,
      assignedByMemberId: ctx.memberId,
    });

    return NextResponse.json({ task });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
    }
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
