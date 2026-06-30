import { prisma } from "@/lib/db";
import { staffDisplayName } from "@/lib/staff-user";
import { formatDateKey } from "@/lib/time";

export function previousDateKey(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return formatDateKey(dt);
}

export async function listBaselineTasksForDay(branchId: string, date: string) {
  return prisma.shiftBaselineTask.findMany({
    where: { branchId, date },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function createBaselineTask(input: {
  organizationId: string;
  branchId: string;
  date: string;
  description: string;
  assignedByMemberId: string;
}) {
  const count = await prisma.shiftBaselineTask.count({
    where: { branchId: input.branchId, date: input.date },
  });
  return prisma.shiftBaselineTask.create({
    data: {
      organizationId: input.organizationId,
      branchId: input.branchId,
      date: input.date,
      description: input.description.trim(),
      sortOrder: count,
      assignedByMemberId: input.assignedByMemberId,
    },
  });
}

export async function saveBaselineCompletions(
  workShiftId: string,
  memberId: string,
  taskIds: string[],
) {
  const shift = await prisma.workShift.findUnique({
    where: { id: workShiftId },
    select: { id: true, branchId: true, date: true },
  });
  if (!shift) throw new Error("NOT_FOUND");

  const validTasks = await prisma.shiftBaselineTask.findMany({
    where: {
      id: { in: taskIds },
      branchId: shift.branchId,
      date: shift.date,
    },
    select: { id: true },
  });
  const validIds = new Set(validTasks.map((t) => t.id));

  await prisma.$transaction(async (tx) => {
    await tx.shiftBaselineCompletion.deleteMany({
      where: { workShiftId, taskId: { notIn: [...validIds] } },
    });
    for (const taskId of validIds) {
      await tx.shiftBaselineCompletion.upsert({
        where: {
          taskId_workShiftId: { taskId, workShiftId },
        },
        create: { taskId, workShiftId, memberId },
        update: { memberId, completedAt: new Date() },
      });
    }
  });
}

export async function saveHandoffNote(input: {
  organizationId: string;
  branchId: string;
  targetDate: string;
  workShiftId: string;
  memberId: string;
  comment: string;
}) {
  const trimmed = input.comment.trim();
  if (!trimmed) return null;

  return prisma.shiftHandoffNote.upsert({
    where: {
      workShiftId_targetDate: {
        workShiftId: input.workShiftId,
        targetDate: input.targetDate,
      },
    },
    create: {
      organizationId: input.organizationId,
      branchId: input.branchId,
      targetDate: input.targetDate,
      workShiftId: input.workShiftId,
      memberId: input.memberId,
      comment: trimmed,
    },
    update: {
      memberId: input.memberId,
      comment: trimmed,
    },
  });
}

export type BaselineReportRow = {
  date: string;
  branchId: string;
  branchName: string;
  tasks: { id: string; description: string }[];
  completions: {
    taskId: string;
    memberName: string;
    completedAt: string;
  }[];
  handoffNotes: {
    memberName: string;
    comment: string;
    createdAt: string;
  }[];
  completionRate: number | null;
};

export async function buildBaselineReport(
  organizationId: string,
  from: string,
  to: string,
  branchId?: string | null,
): Promise<BaselineReportRow[]> {
  const branches = await prisma.branch.findMany({
    where: {
      organizationId,
      isActive: true,
      ...(branchId ? { id: branchId } : {}),
    },
    select: { id: true, name: true },
  });
  const branchMap = new Map(branches.map((b) => [b.id, b.name]));

  const tasks = await prisma.shiftBaselineTask.findMany({
    where: {
      organizationId,
      date: { gte: from, lte: to },
      ...(branchId ? { branchId } : {}),
    },
    orderBy: [{ date: "asc" }, { sortOrder: "asc" }],
  });

  if (tasks.length === 0) return [];

  const taskIds = tasks.map((t) => t.id);
  const completions = await prisma.shiftBaselineCompletion.findMany({
    where: { taskId: { in: taskIds } },
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
  });

  const handoffs = await prisma.shiftHandoffNote.findMany({
    where: {
      organizationId,
      targetDate: { gte: from, lte: to },
      ...(branchId ? { branchId } : {}),
    },
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

  const byDateBranch = new Map<string, BaselineReportRow>();

  for (const task of tasks) {
    const key = `${task.date}:${task.branchId}`;
    if (!byDateBranch.has(key)) {
      byDateBranch.set(key, {
        date: task.date,
        branchId: task.branchId,
        branchName: branchMap.get(task.branchId) ?? task.branchId,
        tasks: [],
        completions: [],
        handoffNotes: [],
        completionRate: null,
      });
    }
    byDateBranch.get(key)!.tasks.push({
      id: task.id,
      description: task.description,
    });
  }

  for (const c of completions) {
    const task = tasks.find((t) => t.id === c.taskId);
    if (!task) continue;
    const key = `${task.date}:${task.branchId}`;
    const row = byDateBranch.get(key);
    if (!row) continue;
    row.completions.push({
      taskId: c.taskId,
      memberName: staffDisplayName(c.workShift.member.user),
      completedAt: c.completedAt.toISOString(),
    });
  }

  for (const h of handoffs) {
    const key = `${h.targetDate}:${h.branchId}`;
    const row = byDateBranch.get(key);
    if (!row) {
      byDateBranch.set(key, {
        date: h.targetDate,
        branchId: h.branchId,
        branchName: branchMap.get(h.branchId) ?? h.branchId,
        tasks: [],
        completions: [],
        handoffNotes: [],
        completionRate: null,
      });
    }
    byDateBranch.get(key)!.handoffNotes.push({
      memberName: staffDisplayName(h.workShift.member.user),
      comment: h.comment,
      createdAt: h.createdAt.toISOString(),
    });
  }

  const rows = [...byDateBranch.values()].sort((a, b) =>
    a.date === b.date
      ? a.branchName.localeCompare(b.branchName, "ru")
      : a.date.localeCompare(b.date),
  );

  for (const row of rows) {
    const shiftsOnDay = await prisma.workShift.count({
      where: { branchId: row.branchId, date: row.date },
    });
    const expected = row.tasks.length * Math.max(shiftsOnDay, 1);
    row.completionRate =
      expected > 0
        ? Math.round((row.completions.length / expected) * 100)
        : null;
  }

  return rows;
}
