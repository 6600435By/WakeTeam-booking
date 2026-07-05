import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  canViewShiftCalendar,
  handleAdminError,
  requireAdminContext,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { staffDisplayName } from "@/lib/staff-user";
import { formatMinutesLabel } from "@/lib/calendar-grid";

const querySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  branchId: z.string().optional(),
});

function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const from = `${month}-01`;
  const to = `${month}-${String(last).padStart(2, "0")}`;
  return { from, to };
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    if (!canViewShiftCalendar(ctx)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const { month, branchId: branchParam } = querySchema.parse({
      month: searchParams.get("month"),
      branchId: searchParams.get("branchId") ?? undefined,
    });

    const branchId = ctx.isSuperAdmin ? branchParam : ctx.branchId;
    if (!branchId && !ctx.isSuperAdmin) {
      return NextResponse.json({ error: "Филиал не указан" }, { status: 400 });
    }

    const { from, to } = monthBounds(month);

    const shiftWhere: Record<string, unknown> = {
      organizationId: ctx.organizationId,
      date: { gte: from, lte: to },
    };
    const taskWhere: Record<string, unknown> = {
      organizationId: ctx.organizationId,
      date: { gte: from, lte: to },
    };
    if (branchId) {
      shiftWhere.branchId = branchId;
      taskWhere.branchId = branchId;
    }

    const baselineWhere: Record<string, unknown> = {
      organizationId: ctx.organizationId,
      date: { gte: from, lte: to },
    };
    if (branchId) baselineWhere.branchId = branchId;
    taskWhere.branchWide = false;

    const [shifts, tasks, baselineTasks, branches] = await Promise.all([
      prisma.workShift.findMany({
        where: shiftWhere,
        include: {
          member: {
            include: { user: { select: { name: true, lastName: true, login: true, email: true } } },
          },
          plannedStaff: { select: { id: true, name: true } },
          plannedReverses: {
            select: { staff: { select: { id: true, name: true } } },
          },
        },
        orderBy: [{ date: "asc" }, { actualStart: "asc" }],
      }),
      prisma.spotTask.findMany({
        where: taskWhere,
        include: {
          assignee: {
            include: { user: { select: { name: true, lastName: true, login: true, email: true } } },
          },
        },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      }),
      prisma.shiftBaselineTask.findMany({
        where: baselineWhere,
        orderBy: [{ date: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      }),
      ctx.isSuperAdmin && !branchId
        ? prisma.branch.findMany({
            where: { organizationId: ctx.organizationId },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          })
        : Promise.resolve([]),
    ]);

    const branchNameById = new Map(branches.map((b) => [b.id, b.name]));

    return NextResponse.json({
      month,
      from,
      to,
      branchId: branchId ?? null,
      canEdit: ctx.isSuperAdmin,
      viewerMemberId: ctx.memberId,
      days: groupByDate(from, to, shifts, tasks, baselineTasks, branchNameById),
    });
  } catch (e) {
    console.error("[shift-calendar]", e);
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

type ShiftRow = {
  id: string;
  date: string;
  branchId: string;
  memberId: string;
  memberName: string;
  status: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  plannedStaffId: string | null;
  plannedStaffName: string | null;
  plannedStaffIds: string[];
  plannedStaffNames: string[];
  workAsAdmin: boolean;
  branchName?: string;
};

type TaskRow = {
  id: string;
  date: string;
  branchId: string;
  assigneeMemberId: string;
  assigneeName: string;
  description: string;
  category: string | null;
  plannedMinutes: number | null;
  plannedTimeFrom: string | null;
  plannedTimeTo: string | null;
  plannedLabel: string | null;
  status: string;
  branchName?: string;
  branchWide: boolean;
  groupId: string | null;
  totalPlannedMinutes: number | null;
  workerCount?: number;
};

type BaselineTaskRow = {
  id: string;
  date: string;
  branchId: string;
  description: string;
  branchName?: string;
};

function groupByDate(
  from: string,
  to: string,
  shifts: Awaited<ReturnType<typeof prisma.workShift.findMany>>,
  tasks: Awaited<ReturnType<typeof prisma.spotTask.findMany>>,
  baselineTasks: Awaited<ReturnType<typeof prisma.shiftBaselineTask.findMany>>,
  branchNames: Map<string, string>,
) {
  const map = new Map<
    string,
    { shifts: ShiftRow[]; tasks: TaskRow[]; baselineTasks: BaselineTaskRow[] }
  >();

  for (const s of shifts) {
    const member = (s as typeof s & {
      member: { user: { name: string | null; email: string } };
    }).member;
    const shiftWithReverses = s as typeof s & {
      plannedStaff?: { id: string; name: string } | null;
      plannedReverses?: { staff: { id: string; name: string } }[];
    };
    const fromJunction = shiftWithReverses.plannedReverses?.map((r) => r.staff) ?? [];
  const nameById = new Map(fromJunction.map((st) => [st.id, st.name]));
    const plannedStaffIds =
      fromJunction.length > 0
        ? fromJunction.map((st) => st.id)
        : s.plannedStaffId
          ? [s.plannedStaffId]
          : [];
    for (const id of plannedStaffIds) {
      if (!nameById.has(id) && shiftWithReverses.plannedStaff?.id === id) {
        nameById.set(id, shiftWithReverses.plannedStaff.name);
      }
    }
    const plannedStaffNames = plannedStaffIds.map((id) => nameById.get(id) ?? id);
    const row: ShiftRow = {
      id: s.id,
      date: s.date,
      branchId: s.branchId,
      memberId: s.memberId,
      memberName: staffDisplayName(member.user),
      status: s.status,
      plannedStart: s.plannedStart,
      plannedEnd: s.plannedEnd,
      plannedStaffId: s.plannedStaffId,
      plannedStaffName: shiftWithReverses.plannedStaff?.name ?? null,
      plannedStaffIds,
      plannedStaffNames,
      workAsAdmin: s.workAsAdmin,
      branchName: branchNames.get(s.branchId),
    };
    const bucket = map.get(s.date) ?? { shifts: [], tasks: [], baselineTasks: [] };
    bucket.shifts.push(row);
    map.set(s.date, bucket);
  }

  for (const t of tasks) {
    const assignee = (t as typeof t & {
      assignee: { user: { name: string | null; email: string } };
    }).assignee;
    const row: TaskRow = {
      id: t.id,
      date: t.date,
      branchId: t.branchId,
      assigneeMemberId: t.assigneeMemberId,
      assigneeName: staffDisplayName(assignee.user),
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
      branchName: branchNames.get(t.branchId),
      branchWide: t.branchWide,
      groupId: t.groupId,
      totalPlannedMinutes: t.totalPlannedMinutes,
    };
    const bucket = map.get(t.date) ?? { shifts: [], tasks: [], baselineTasks: [] };
    bucket.tasks.push(row);
    map.set(t.date, bucket);
  }

  for (const bt of baselineTasks) {
    const row: BaselineTaskRow = {
      id: bt.id,
      date: bt.date,
      branchId: bt.branchId,
      description: bt.description,
      branchName: branchNames.get(bt.branchId),
    };
    const bucket = map.get(bt.date) ?? { shifts: [], tasks: [], baselineTasks: [] };
    bucket.baselineTasks.push(row);
    map.set(bt.date, bucket);
  }

  const days: {
    date: string;
    shifts: ShiftRow[];
    tasks: TaskRow[];
    baselineTasks: BaselineTaskRow[];
  }[] = [];
  const [y, m] = from.split("-").map(Number);
  const last = Number(to.split("-")[2]);
  for (let d = 1; d <= last; d++) {
    const date = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const bucket = map.get(date) ?? { shifts: [], tasks: [], baselineTasks: [] };
    days.push({
      date,
      shifts: bucket.shifts,
      tasks: bucket.tasks,
      baselineTasks: bucket.baselineTasks,
    });
  }
  return days;
}
