import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleAdminError,
  requireAdminContext,
  resolveBranchFilter,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import {
  listBaselineTasksForDay,
  previousDateKey,
  saveHandoffNote,
} from "@/lib/payroll/shift-baseline-tasks";
import { staffDisplayName } from "@/lib/staff-user";

const postSchema = z.object({
  workShiftId: z.string(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  comment: z.string().min(1),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    const { searchParams } = new URL(req.url);
    const workShiftId = searchParams.get("workShiftId");
    const branchId = resolveBranchFilter(ctx, searchParams.get("branchId"));
    const shiftDate = searchParams.get("shiftDate");

    if (workShiftId && shiftDate && branchId) {
      const targetDate = previousDateKey(shiftDate);
      const prevTasks = await listBaselineTasksForDay(branchId, targetDate);
      const existing = await prisma.shiftHandoffNote.findUnique({
        where: {
          workShiftId_targetDate: { workShiftId, targetDate },
        },
      });
      return NextResponse.json({
        targetDate,
        needsHandoff: prevTasks.length > 0,
        existingComment: existing?.comment ?? null,
      });
    }

    const targetDate = searchParams.get("targetDate");
    if (!targetDate || !branchId) {
      return NextResponse.json(
        { error: "Укажите филиал и дату" },
        { status: 400 },
      );
    }

    const notes = await prisma.shiftHandoffNote.findMany({
      where: { branchId, targetDate },
      include: {
        workShift: {
          include: {
            member: {
              include: {
                user: {
                  select: { name: true, lastName: true, login: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      notes: notes.map((n) => ({
        id: n.id,
        targetDate: n.targetDate,
        comment: n.comment,
        memberName: staffDisplayName(n.workShift.member.user),
        createdAt: n.createdAt.toISOString(),
      })),
    });
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
    const body = postSchema.parse(await req.json());

    const shift = await prisma.workShift.findUnique({
      where: { id: body.workShiftId },
    });
    if (!shift || shift.organizationId !== ctx.organizationId) {
      return NextResponse.json({ error: "Смена не найдена" }, { status: 404 });
    }
    if (shift.memberId !== ctx.memberId) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const note = await saveHandoffNote({
      organizationId: ctx.organizationId,
      branchId: shift.branchId,
      targetDate: body.targetDate,
      workShiftId: body.workShiftId,
      memberId: ctx.memberId,
      comment: body.comment,
    });

    return NextResponse.json({ ok: true, note });
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
