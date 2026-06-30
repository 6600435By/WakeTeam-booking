import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertMemberAccess,
  canEditShiftCalendar,
  handleAdminError,
  requireAdminContext,
  BRANCH_OPERATOR_ROLE,
  parseAdminRole,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import {
  cancelBranchWideGroup,
  resyncBranchWideGroup,
} from "@/lib/payroll/branch-wide-spot-tasks";

const patchSchema = z
  .object({
    assigneeMemberId: z.string().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    description: z.string().min(1).optional(),
    category: z.string().nullable().optional(),
    plannedMinutes: z.number().int().positive().nullable().optional(),
    totalPlannedMinutes: z.number().int().positive().optional(),
    plannedTimeFrom: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullable()
      .optional(),
    plannedTimeTo: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullable()
      .optional(),
    status: z.enum(["pending", "in_progress", "done", "cancelled"]).optional(),
    branchWide: z.boolean().optional(),
  })
  .refine(
    (d) => {
      if (d.plannedMinutes === undefined && d.plannedTimeFrom === undefined) {
        return true;
      }
      if (d.plannedMinutes || d.totalPlannedMinutes) return true;
      return Boolean(d.plannedTimeFrom && d.plannedTimeTo);
    },
    { message: "Укажите длительность или окно времени" },
  );

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    if (!canEditShiftCalendar(ctx)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
    const { id } = await params;
    const body = patchSchema.parse(await req.json());

    const task = await prisma.spotTask.findUnique({ where: { id } });
    if (!task || task.organizationId !== ctx.organizationId) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }
    if (task.spotEntryId && body.status && body.status !== task.status) {
      return NextResponse.json(
        { error: "Статус задания с записью работы меняется через смену" },
        { status: 400 },
      );
    }

    if (task.branchWide && task.groupId) {
      try {
        await resyncBranchWideGroup(task.groupId, ctx.organizationId, {
          ...(body.description ? { description: body.description } : {}),
          ...(body.category !== undefined ? { category: body.category } : {}),
          ...(body.date ? { date: body.date } : {}),
          ...(body.totalPlannedMinutes
            ? { totalPlannedMinutes: body.totalPlannedMinutes }
            : body.plannedMinutes
              ? { totalPlannedMinutes: body.plannedMinutes }
              : {}),
        });
        if (body.status && body.status !== task.status) {
          await prisma.spotTask.updateMany({
            where: {
              groupId: task.groupId,
              organizationId: ctx.organizationId,
              status: { notIn: ["done", "cancelled"] },
            },
            data: { status: body.status },
          });
        }
        return NextResponse.json({ ok: true });
      } catch (err) {
        if (err instanceof Error && err.message === "NO_SHIFT_MEMBERS") {
          return NextResponse.json(
            { error: "На этот день нет сотрудников на смене" },
            { status: 400 },
          );
        }
        throw err;
      }
    }

    if (body.assigneeMemberId) {
      const assignee = await assertMemberAccess(ctx, body.assigneeMemberId);
      const role = parseAdminRole(
        (
          await prisma.organizationMember.findUnique({
            where: { id: assignee.id },
            select: { role: true },
          })
        )?.role ?? "",
      );
      if (role !== BRANCH_OPERATOR_ROLE) {
        return NextResponse.json(
          { error: "Задания назначаются только операторам" },
          { status: 400 },
        );
      }
    }

    const data: Record<string, unknown> = { ...body };
    delete data.branchWide;
    delete data.totalPlannedMinutes;
    if (body.description) data.description = body.description.trim();
    if (body.plannedMinutes) {
      data.plannedTimeFrom = null;
      data.plannedTimeTo = null;
    }
    if (body.plannedTimeFrom && body.plannedTimeTo) {
      data.plannedMinutes = null;
    }

    const updated = await prisma.spotTask.update({
      where: { id },
      data,
    });
    return NextResponse.json({ task: updated });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    if (!canEditShiftCalendar(ctx)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
    const { id } = await params;
    const task = await prisma.spotTask.findUnique({ where: { id } });
    if (!task || task.organizationId !== ctx.organizationId) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }
    if (task.status === "done") {
      return NextResponse.json({ error: "Задание выполнено" }, { status: 400 });
    }

    if (task.branchWide && task.groupId) {
      await cancelBranchWideGroup(task.groupId, ctx.organizationId);
      return NextResponse.json({ ok: true });
    }

    await prisma.spotTask.update({
      where: { id },
      data: { status: "cancelled" },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
