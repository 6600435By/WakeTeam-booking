import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleAdminError,
  requireAdminContext,
  assertShiftSelfOrAdmin,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import {
  enrichShiftResponse,
  SHIFT_INCLUDE,
} from "@/lib/payroll/work-shift-service";

const schema = z.object({
  comment: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    const { id: shiftId, entryId } = await params;
    const body = schema.parse(await req.json());

    const shift = await prisma.workShift.findUnique({
      where: { id: shiftId },
      include: SHIFT_INCLUDE,
    });
    if (!shift || shift.organizationId !== ctx.organizationId) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }
    assertShiftSelfOrAdmin(ctx, shift.memberId, shift.branchId);

    const entry = shift.spotEntries.find((e) => e.id === entryId && e.isActive);
    if (!entry) {
      return NextResponse.json({ error: "Активная запись не найдена" }, { status: 404 });
    }

    const now = new Date();
    await prisma.spotWorkEntry.update({
      where: { id: entryId },
      data: {
        isActive: false,
        endedAt: now,
        comment: body.comment.trim(),
      },
    });

    if (entry.taskId) {
      await prisma.spotTask.update({
        where: { id: entry.taskId },
        data: { status: "done", spotEntryId: entryId },
      });
    }

    const updated = await prisma.workShift.findUnique({
      where: { id: shiftId },
      include: SHIFT_INCLUDE,
    });
    return NextResponse.json(await enrichShiftResponse(updated!));
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
