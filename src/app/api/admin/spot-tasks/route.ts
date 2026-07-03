import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertMemberAccess,
  canEditShiftCalendar,
  canLogOwnShift,
  canViewShiftCalendar,
  handleAdminError,
  requireAdminContext,
  resolveBranchFilter,
  BRANCH_OPERATOR_ROLE,
  parseAdminRole,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { staffDisplayName } from "@/lib/staff-user";
import { formatDateKey } from "@/lib/time";
import { formatMinutesLabel } from "@/lib/calendar-grid";

const createSchema = z
  .object({
    assigneeMemberId: z.string().optional(),
    branchId: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    description: z.string().min(1),
    category: z.string().optional(),
    plannedMinutes: z.number().int().positive().optional(),
    plannedTimeFrom: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    plannedTimeTo: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    branchWide: z.boolean().optional(),
  })
  .refine(
    (d) =>
      d.plannedMinutes || (d.plannedTimeFrom && d.plannedTimeTo),
    { message: "Укажите длительность или окно времени" },
  )
  .refine((d) => d.assigneeMemberId, {
    message: "Укажите сотрудника",
  });

function mapTask(
  t: {
    id: string;
    branchId: string;
    assigneeMemberId: string;
    date: string;
    description: string;
    category: string | null;
    plannedMinutes: number | null;
    plannedTimeFrom: string | null;
    plannedTimeTo: string | null;
    status: string;
    spotEntryId: string | null;
    branchWide: boolean;
    groupId: string | null;
    totalPlannedMinutes: number | null;
    assignee: { user: { name: string | null; lastName: string | null; login: string; email: string | null } };
  },
) {
  return {
    id: t.id,
    branchId: t.branchId,
    assigneeMemberId: t.assigneeMemberId,
    assigneeName: staffDisplayName(t.assignee.user),
    date: t.date,
    description: t.description,
    category: t.category,
    plannedMinutes: t.plannedMinutes,
    plannedTimeFrom: t.plannedTimeFrom,
    plannedTimeTo: t.plannedTimeTo,
    plannedLabel: t.plannedMinutes
      ? formatMinutesLabel(t.plannedMinutes)
      : t.plannedTimeFrom && t.plannedTimeTo
        ? `${t.plannedTimeFrom}–${t.plannedTimeTo}`
        : null,
    status: t.status,
    spotEntryId: t.spotEntryId,
    branchWide: t.branchWide,
    groupId: t.groupId,
    totalPlannedMinutes: t.totalPlannedMinutes,
  };
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    if (!canViewShiftCalendar(ctx)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") ?? formatDateKey(new Date());
    const branchId = resolveBranchFilter(ctx, searchParams.get("branchId"));

    const where: Record<string, unknown> = { date };
    if (branchId) where.branchId = branchId;

    if (!canEditShiftCalendar(ctx) || searchParams.get("mine")) {
      where.assigneeMemberId = ctx.memberId;
    }

    const tasks = await prisma.spotTask.findMany({
      where,
      include: {
        assignee: {
          include: { user: { select: { name: true, lastName: true, login: true, email: true } } },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      tasks: tasks.map(mapTask),
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
    const body = createSchema.parse(await req.json());
    const isSelfPlan =
      body.assigneeMemberId === ctx.memberId && canLogOwnShift(ctx);

    if (!canEditShiftCalendar(ctx) && !isSelfPlan) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const assignee = await assertMemberAccess(ctx, body.assigneeMemberId!);

    if (isSelfPlan) {
      if (!ctx.isSuperAdmin && body.branchId !== ctx.branchId) {
        return NextResponse.json({ error: "Нет доступа к филиалу" }, { status: 403 });
      }
    } else {
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

    const task = await prisma.spotTask.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: body.branchId,
        assigneeMemberId: body.assigneeMemberId!,
        assignedByMemberId: ctx.memberId,
        date: body.date,
        description: body.description.trim(),
        category: body.category,
        plannedMinutes: body.plannedMinutes,
        plannedTimeFrom: body.plannedTimeFrom,
        plannedTimeTo: body.plannedTimeTo,
      },
      include: {
        assignee: {
          include: { user: { select: { name: true, lastName: true, login: true, email: true } } },
        },
      },
    });

    return NextResponse.json({ task: mapTask(task) });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
