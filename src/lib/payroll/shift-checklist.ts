import { prisma } from "@/lib/db";

export async function listChecklistItemsForBranch(branchId: string) {
  return prisma.branchShiftChecklistItem.findMany({
    where: { branchId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function saveChecklistCompletions(
  workShiftId: string,
  memberId: string,
  itemIds: string[],
) {
  const shift = await prisma.workShift.findUnique({
    where: { id: workShiftId },
    select: { id: true, branchId: true },
  });
  if (!shift) throw new Error("NOT_FOUND");

  const validItems = await prisma.branchShiftChecklistItem.findMany({
    where: {
      id: { in: itemIds },
      branchId: shift.branchId,
      isActive: true,
    },
    select: { id: true },
  });
  const validIds = new Set(validItems.map((i) => i.id));

  const activeCount = await prisma.branchShiftChecklistItem.count({
    where: { branchId: shift.branchId, isActive: true },
  });

  if (activeCount > 0 && validIds.size < activeCount) {
    throw new Error("CHECKLIST_INCOMPLETE");
  }

  await prisma.$transaction(async (tx) => {
    await tx.shiftChecklistCompletion.deleteMany({
      where: { workShiftId, itemId: { notIn: [...validIds] } },
    });
    for (const itemId of validIds) {
      await tx.shiftChecklistCompletion.upsert({
        where: { itemId_workShiftId: { itemId, workShiftId } },
        create: { itemId, workShiftId, memberId },
        update: { memberId, completedAt: new Date() },
      });
    }
  });
}

export async function getChecklistForShift(workShiftId: string, branchId: string) {
  const items = await listChecklistItemsForBranch(branchId);
  const completions = await prisma.shiftChecklistCompletion.findMany({
    where: { workShiftId },
    select: { itemId: true },
  });
  const completedIds = new Set(completions.map((c) => c.itemId));
  return items.map((item) => ({
    id: item.id,
    label: item.label,
    completed: completedIds.has(item.id),
  }));
}
