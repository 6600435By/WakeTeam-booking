import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleAdminError,
  requireAdminContext,
  assertShiftSelfOrAdmin,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { parseTimeOnDate, overlaps } from "@/lib/time";
import {
  enrichShiftResponse,
  SHIFT_INCLUDE,
} from "@/lib/payroll/work-shift-service";

const manualSchema = z
  .object({
    comment: z.string().min(1),
    category: z.string().optional(),
    startedAt: z.string().datetime().optional(),
    endedAt: z.string().datetime().optional(),
    timeFrom: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    timeTo: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    taskId: z.string().optional(),
  })
  .refine(
    (d) =>
      (d.startedAt && d.endedAt) || (d.timeFrom && d.timeTo),
    { message: "Укажите время" },
  );

const startSchema = z.object({
  category: z.string().optional(),
  taskId: z.string().optional(),
});

async function loadShift(id: string, orgId: string) {
  const shift = await prisma.workShift.findUnique({
    where: { id },
    include: SHIFT_INCLUDE,
  });
  if (!shift || shift.organizationId !== orgId) return null;
  return shift;
}

function assertWithinShift(
  shift: { actualStart: Date | null; actualEnd: Date | null; status: string },
  start: Date,
  end: Date,
) {
  if (shift.status !== "open" || !shift.actualStart) {
    throw new Error("SHIFT_CLOSED");
  }
  const shiftEnd = shift.actualEnd ?? new Date();
  if (start < shift.actualStart || end > shiftEnd) {
    throw new Error("OUT_OF_SHIFT");
  }
}

function assertNoOverlap(
  entries: { startedAt: Date; endedAt: Date | null; isActive: boolean; id?: string }[],
  start: Date,
  end: Date,
  excludeId?: string,
) {
  for (const e of entries) {
    if (excludeId && e.id === excludeId) continue;
    const eEnd = e.isActive ? new Date() : e.endedAt ?? start;
    if (overlaps(start, end, e.startedAt, eEnd)) {
      throw new Error("OVERLAP");
    }
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    const { id: shiftId } = await params;
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    const shift = await loadShift(shiftId, ctx.organizationId);
    if (!shift) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    assertShiftSelfOrAdmin(ctx, shift.memberId, shift.branchId);

    if (shift.status !== "open") {
      return NextResponse.json({ error: "Смена закрыта" }, { status: 400 });
    }

    if (action === "start") {
      const body = startSchema.parse(await req.json().catch(() => ({})));
      const active = shift.spotEntries.find((e) => e.isActive);
      if (active) {
        return NextResponse.json({ error: "Уже идёт работа на споте" }, { status: 400 });
      }
      const entry = await prisma.spotWorkEntry.create({
        data: {
          shiftId,
          taskId: body.taskId,
          category: body.category,
          comment: "",
          startedAt: new Date(),
          source: body.taskId ? "task" : "timer",
          isActive: true,
          createdByMemberId: ctx.memberId,
        },
      });
      if (body.taskId) {
        await prisma.spotTask.update({
          where: { id: body.taskId },
          data: { status: "in_progress" },
        });
      }
      const updated = await prisma.workShift.findUnique({
        where: { id: shiftId },
        include: SHIFT_INCLUDE,
      });
      return NextResponse.json({ entryId: entry.id, ...(await enrichShiftResponse(updated!)) });
    }

    const body = manualSchema.parse(await req.json());
    let start: Date;
    let end: Date;
    if (body.timeFrom && body.timeTo) {
      start = parseTimeOnDate(shift.date, body.timeFrom);
      end = parseTimeOnDate(shift.date, body.timeTo);
    } else {
      start = new Date(body.startedAt!);
      end = new Date(body.endedAt!);
    }
    if (end <= start) {
      return NextResponse.json({ error: "Некорректное время" }, { status: 400 });
    }
    assertWithinShift(shift, start, end);
    assertNoOverlap(shift.spotEntries, start, end);

    const entry = await prisma.spotWorkEntry.create({
      data: {
        shiftId,
        taskId: body.taskId,
        category: body.category,
        comment: body.comment.trim(),
        startedAt: start,
        endedAt: end,
        source: "manual",
        isActive: false,
        createdByMemberId: ctx.memberId,
      },
    });

    if (body.taskId) {
      await prisma.spotTask.update({
        where: { id: body.taskId },
        data: { status: "done", spotEntryId: entry.id },
      });
    }

    const updated = await prisma.workShift.findUnique({
      where: { id: shiftId },
      include: SHIFT_INCLUDE,
    });
    return NextResponse.json(await enrichShiftResponse(updated!));
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "OUT_OF_SHIFT") {
        return NextResponse.json({ error: "Вне времени смены" }, { status: 400 });
      }
      if (e.message === "OVERLAP") {
        return NextResponse.json({ error: "Пересечение с другой записью" }, { status: 400 });
      }
    }
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    console.error(e);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    const { id: shiftId } = await params;
    const body = z
      .object({
        entryId: z.string(),
        comment: z.string().min(1).optional(),
        startedAt: z.string().datetime().optional(),
        endedAt: z.string().datetime().optional(),
        adjustmentComment: z.string().min(1),
      })
      .parse(await req.json());

    const shift = await loadShift(shiftId, ctx.organizationId);
    if (!shift) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    assertShiftSelfOrAdmin(ctx, shift.memberId, shift.branchId);
    if (shift.status === "approved" && !ctx.isSuperAdmin) {
      return NextResponse.json({ error: "Смена утверждена" }, { status: 400 });
    }

    const entry = shift.spotEntries.find((e) => e.id === body.entryId);
    if (!entry || entry.isActive) {
      return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
    }

    const start = body.startedAt ? new Date(body.startedAt) : entry.startedAt;
    const end = body.endedAt ? new Date(body.endedAt) : entry.endedAt!;
    assertNoOverlap(shift.spotEntries, start, end, entry.id);

    await prisma.shiftAdjustment.create({
      data: {
        shiftId,
        field: "spot_entry",
        oldValue: JSON.stringify(entry),
        newValue: JSON.stringify({ ...entry, comment: body.comment ?? entry.comment, startedAt: start, endedAt: end }),
        comment: body.adjustmentComment,
        createdByMemberId: ctx.memberId,
      },
    });

    await prisma.spotWorkEntry.update({
      where: { id: entry.id },
      data: {
        comment: body.comment ?? entry.comment,
        startedAt: start,
        endedAt: end,
      },
    });

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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    const { id: shiftId } = await params;
    const entryId = new URL(req.url).searchParams.get("entryId");
    const comment = new URL(req.url).searchParams.get("comment");
    if (!entryId || !comment?.trim()) {
      return NextResponse.json({ error: "Укажите комментарий" }, { status: 400 });
    }

    const shift = await loadShift(shiftId, ctx.organizationId);
    if (!shift) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    assertShiftSelfOrAdmin(ctx, shift.memberId, shift.branchId);

    const entry = shift.spotEntries.find((e) => e.id === entryId);
    if (!entry) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

    await prisma.shiftAdjustment.create({
      data: {
        shiftId,
        field: "spot_entry_delete",
        oldValue: JSON.stringify(entry),
        newValue: "",
        comment: comment.trim(),
        createdByMemberId: ctx.memberId,
      },
    });

    await prisma.spotWorkEntry.delete({ where: { id: entryId } });

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
