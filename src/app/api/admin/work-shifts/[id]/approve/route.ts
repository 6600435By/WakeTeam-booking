import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  canReviewShifts,
  handleAdminError,
  requireAdminContext,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import {
  SHIFT_INCLUDE,
  snapshotRatesOnClose,
} from "@/lib/payroll/work-shift-service";

const schema = z.object({
  comment: z.string().min(1),
  closeIfOpen: z.boolean().optional(),
});

async function closeShiftForReview(shiftId: string) {
  const shift = await prisma.workShift.findUnique({
    where: { id: shiftId },
    include: SHIFT_INCLUDE,
  });
  if (!shift || shift.status !== "open") return shift;

  const activeSpot = shift.spotEntries.find((e) => e.isActive);
  if (activeSpot) {
    await prisma.spotWorkEntry.update({
      where: { id: activeSpot.id },
      data: { isActive: false, endedAt: new Date() },
    });
  }
  const openAssign = shift.reverseAssignments.find((a) => !a.endedAt);
  if (openAssign) {
    await prisma.reverseAssignment.update({
      where: { id: openAssign.id },
      data: { endedAt: new Date() },
    });
  }
  const ratesSnapshot = await snapshotRatesOnClose(shift.memberId, shift.date);
  return prisma.workShift.update({
    where: { id: shiftId },
    data: {
      status: "closed",
      actualEnd: shift.actualEnd ?? new Date(),
      ratesSnapshot,
    },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    if (!canReviewShifts(ctx)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
    const { id } = await params;
    const body = schema.parse(await req.json());

    let shift = await prisma.workShift.findUnique({ where: { id } });
    if (!shift || shift.organizationId !== ctx.organizationId) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    if (shift.status === "open") {
      if (!body.closeIfOpen) {
        return NextResponse.json(
          { error: "Смена не закрыта сотрудником — используйте «Закрыть и утвердить»" },
          { status: 400 },
        );
      }
      shift = await closeShiftForReview(id);
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

    await prisma.shiftAdjustment.create({
      data: {
        shiftId: id,
        field: "status",
        oldValue: shift.status,
        newValue: "approved",
        comment: body.comment,
        createdByMemberId: ctx.memberId,
      },
    });

    const updated = await prisma.workShift.update({
      where: { id },
      data: { status: "approved" },
      include: SHIFT_INCLUDE,
    });

    return NextResponse.json({ ok: true, status: updated.status });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
