import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { formatMinutesLabel } from "@/lib/calendar-grid";

export function splitMinutesEqually(totalMinutes: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(totalMinutes / count);
  const remainder = totalMinutes - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

export async function findShiftMemberIds(
  branchId: string,
  date: string,
): Promise<string[]> {
  const shifts = await prisma.workShift.findMany({
    where: { branchId, date },
    select: { memberId: true },
    orderBy: { memberId: "asc" },
  });
  return [...new Set(shifts.map((s) => s.memberId))];
}

/** @deprecated use findShiftMemberIds */
export const findSpotWorkerMemberIds = findShiftMemberIds;

export type BranchWideTaskInput = {
  organizationId: string;
  branchId: string;
  date: string;
  description: string;
  category?: string | null;
  totalPlannedMinutes: number;
  assignedByMemberId: string;
};

export async function createBranchWideSpotTasks(input: BranchWideTaskInput) {
  const memberIds = await findShiftMemberIds(input.branchId, input.date);
  if (memberIds.length === 0) {
    throw new Error("NO_SHIFT_MEMBERS");
  }

  const splits = splitMinutesEqually(input.totalPlannedMinutes, memberIds.length);
  const groupId = randomUUID();

  const tasks = await prisma.$transaction(
    memberIds.map((memberId, index) =>
      prisma.spotTask.create({
        data: {
          organizationId: input.organizationId,
          branchId: input.branchId,
          assigneeMemberId: memberId,
          assignedByMemberId: input.assignedByMemberId,
          date: input.date,
          description: input.description.trim(),
          category: input.category ?? null,
          plannedMinutes: splits[index],
          plannedTimeFrom: null,
          plannedTimeTo: null,
          branchWide: true,
          groupId,
          totalPlannedMinutes: input.totalPlannedMinutes,
        },
      }),
    ),
  );

  return { groupId, tasks, workerCount: memberIds.length };
}

export async function resyncBranchWideGroup(
  groupId: string,
  organizationId: string,
  updates: {
    description?: string;
    category?: string | null;
    totalPlannedMinutes?: number;
    date?: string;
    branchId?: string;
  },
) {
  const existing = await prisma.spotTask.findMany({
    where: { groupId, organizationId, branchWide: true },
  });
  if (!existing.length) {
    throw new Error("NOT_FOUND");
  }

  const branchId = updates.branchId ?? existing[0].branchId;
  const date = updates.date ?? existing[0].date;
  const description = updates.description ?? existing[0].description;
  const category =
    updates.category !== undefined ? updates.category : existing[0].category;
  const total =
    updates.totalPlannedMinutes ??
    existing[0].totalPlannedMinutes ??
    existing[0].plannedMinutes ??
    0;

  const memberIds = await findShiftMemberIds(branchId, date);
  if (memberIds.length === 0) {
    throw new Error("NO_SHIFT_MEMBERS");
  }

  const splits = splitMinutesEqually(total, memberIds.length);
  const assignedBy = existing[0].assignedByMemberId;

  for (const task of existing) {
    if (
      !memberIds.includes(task.assigneeMemberId) &&
      task.status === "pending" &&
      !task.spotEntryId
    ) {
      await prisma.spotTask.update({
        where: { id: task.id },
        data: { status: "cancelled" },
      });
    }
  }

  const refreshed = await prisma.spotTask.findMany({
    where: {
      groupId,
      organizationId,
      status: { not: "cancelled" },
    },
  });
  const byMember = new Map(refreshed.map((t) => [t.assigneeMemberId, t]));

  for (let i = 0; i < memberIds.length; i++) {
    const memberId = memberIds[i];
    const split = splits[i];
    const row = byMember.get(memberId);
    if (row) {
      await prisma.spotTask.update({
        where: { id: row.id },
        data: {
          description,
          category,
          date,
          branchId,
          totalPlannedMinutes: total,
          plannedMinutes: split,
          plannedTimeFrom: null,
          plannedTimeTo: null,
        },
      });
    } else {
      await prisma.spotTask.create({
        data: {
          organizationId,
          branchId,
          assigneeMemberId: memberId,
          assignedByMemberId: assignedBy,
          date,
          description,
          category,
          plannedMinutes: split,
          branchWide: true,
          groupId,
          totalPlannedMinutes: total,
        },
      });
    }
  }
}

export async function cancelBranchWideGroup(groupId: string, organizationId: string) {
  await prisma.spotTask.updateMany({
    where: {
      groupId,
      organizationId,
      branchWide: true,
      status: { notIn: ["done", "cancelled"] },
    },
    data: { status: "cancelled" },
  });
}

/** Пересчитать все общие задания дня после изменения состава смены. */
export async function resyncBranchWideTasksForDay(
  organizationId: string,
  branchId: string,
  date: string,
) {
  const groups = await prisma.spotTask.findMany({
    where: {
      organizationId,
      branchId,
      date,
      branchWide: true,
      groupId: { not: null },
      status: { notIn: ["cancelled", "done"] },
    },
    select: { groupId: true },
    distinct: ["groupId"],
  });

  for (const row of groups) {
    if (!row.groupId) continue;
    try {
      await resyncBranchWideGroup(row.groupId, organizationId, {});
    } catch (err) {
      if (err instanceof Error && err.message === "NO_SHIFT_MEMBERS") {
        await cancelBranchWideGroup(row.groupId, organizationId);
      } else {
        throw err;
      }
    }
  }
}

export function formatBranchWidePlannedLabel(
  totalPlannedMinutes: number,
  perPersonMinutes: number,
  workerCount: number,
): string {
  return `${formatMinutesLabel(totalPlannedMinutes)} на всех → по ${formatMinutesLabel(perPersonMinutes)} (${workerCount} чел.)`;
}

export function collapseBranchWideTasksForDisplay<
  T extends {
    id: string;
    branchWide: boolean;
    groupId: string | null;
    assigneeMemberId: string;
    assigneeName: string;
    plannedMinutes: number | null;
    totalPlannedMinutes: number | null;
    plannedTimeFrom: string | null;
    plannedTimeTo: string | null;
    plannedLabel: string | null;
    description: string;
    category: string | null;
    status: string;
    spotEntryId: string | null;
    branchId: string;
    date: string;
  },
>(tasks: T[]): T[] {
  const singles: T[] = [];
  const groups = new Map<string, T[]>();

  for (const task of tasks) {
    if (task.branchWide && task.groupId) {
      const list = groups.get(task.groupId) ?? [];
      list.push(task);
      groups.set(task.groupId, list);
    } else {
      singles.push(task);
    }
  }

  const collapsed: T[] = [...singles];
  for (const [, group] of groups) {
    const first = group[0];
    const workerCount = group.length;
    const perPerson = first.plannedMinutes ?? 0;
    const total =
      first.totalPlannedMinutes ?? perPerson * workerCount;
    collapsed.push({
      ...first,
      assigneeName: `Вся смена (${workerCount})`,
      totalPlannedMinutes: total,
      plannedLabel: formatBranchWidePlannedLabel(total, perPerson, workerCount),
    });
  }

  return collapsed;
}
