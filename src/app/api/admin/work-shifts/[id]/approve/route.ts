import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  canApproveShift,
  handleAdminError,
  requireAdminContext,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import {
  approveShiftInternal,
  closeShiftForReview,
} from "@/lib/payroll/approve-shift";
import { SHIFT_INCLUDE } from "@/lib/payroll/work-shift-service";

const schema = z.object({
  comment: z.string().min(1),
  closeIfOpen: z.boolean().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    const { id } = await params;
    const body = schema.parse(await req.json());

    let shift = await prisma.workShift.findUnique({
      where: { id },
      include: { member: { select: { role: true } } },
    });
    if (!shift || shift.organizationId !== ctx.organizationId) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    if (!canApproveShift(ctx, shift.member.role, shift.branchId)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    if (shift.status === "open") {
      if (!body.closeIfOpen) {
        return NextResponse.json(
          { error: "Смена не закрыта сотрудником — используйте «Закрыть и утвердить»" },
          { status: 400 },
        );
      }
      await closeShiftForReview(id);
      shift = await prisma.workShift.findUnique({
        where: { id },
        include: { member: { select: { role: true } } },
      });
      if (!shift) {
        return NextResponse.json({ error: "Не удалось закрыть смену" }, { status: 400 });
      }
    }

    if (shift.status !== "closed") {
      return NextResponse.json(
        { error: "Можно утвердить только закрытую смену" },
        { status: 400 },
      );
    }

    const updated = await approveShiftInternal(id, ctx.memberId, body.comment);
    if (!updated) {
      return NextResponse.json({ error: "Не удалось утвердить смену" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, status: updated.status });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
