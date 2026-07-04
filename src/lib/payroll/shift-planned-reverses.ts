import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

type Db = Prisma.TransactionClient | typeof prisma;

export async function listPlannedReverseIds(
  shiftId: string,
  db: Db = prisma,
): Promise<string[]> {
  const rows = await db.workShiftPlannedReverse.findMany({
    where: { shiftId },
    select: { staffId: true },
    orderBy: { staffId: "asc" },
  });
  return rows.map((r) => r.staffId);
}

export async function resolvePlannedReverseIds(
  shiftId: string,
  fallbackStaffId: string | null,
  db: Db = prisma,
): Promise<string[]> {
  const fromJunction = await listPlannedReverseIds(shiftId, db);
  if (fromJunction.length > 0) return fromJunction;
  return fallbackStaffId ? [fallbackStaffId] : [];
}

export async function setShiftPlannedReverses(
  shiftId: string,
  staffIds: string[],
  db: Db = prisma,
): Promise<string[]> {
  const unique = [...new Set(staffIds.filter(Boolean))];
  await db.workShiftPlannedReverse.deleteMany({ where: { shiftId } });
  if (unique.length > 0) {
    await db.workShiftPlannedReverse.createMany({
      data: unique.map((staffId) => ({ shiftId, staffId })),
    });
  }
  const primary = unique[0] ?? null;
  await db.workShift.update({
    where: { id: shiftId },
    data: { plannedStaffId: primary },
  });
  return unique;
}
