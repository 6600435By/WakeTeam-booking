import { prisma } from "@/lib/db";
import { SHIFT_INCLUDE, snapshotRatesOnClose } from "./work-shift-service";

export async function closeShiftForReview(shiftId: string) {
  const shift = await prisma.workShift.findUnique({
    where: { id: shiftId },
    include: SHIFT_INCLUDE,
  });
  if (!shift || shift.status !== "open") return shift;

  const activeSpot = shift.spotEntries.find((e) => e.isActive);
  if (activeSpot) {
    await prisma.spotWorkEntry.update({
      where: { id: activeSpot.id },
      data: { isActive: false, endedAt: new Date() },
    });
  }
  const openAssign = shift.reverseAssignments.find((a) => !a.endedAt);
  if (openAssign) {
    await prisma.reverseAssignment.update({
      where: { id: openAssign.id },
      data: { endedAt: new Date() },
    });
  }
  const ratesSnapshot = await snapshotRatesOnClose(shift.memberId, shift.date);
  return prisma.workShift.update({
    where: { id: shiftId },
    data: {
      status: "closed",
      actualEnd: shift.actualEnd ?? new Date(),
      ratesSnapshot,
    },
  });
}

export async function approveShiftInternal(
  shiftId: string,
  approverMemberId: string,
  comment: string,
) {
  const shift = await prisma.workShift.findUnique({
    where: { id: shiftId },
    include: { member: { select: { role: true } } },
  });
  if (!shift) return null;

  if (shift.status === "open") {
    await closeShiftForReview(shiftId);
  }

  const current = await prisma.workShift.findUnique({ where: { id: shiftId } });
  if (!current || current.status !== "closed") {
    return null;
  }

  await prisma.shiftAdjustment.create({
    data: {
      shiftId,
      field: "status",
      oldValue: current.status,
      newValue: "approved",
      comment,
      createdByMemberId: approverMemberId,
    },
  });

  const updated = await prisma.workShift.update({
    where: { id: shiftId },
    data: { status: "approved" },
    include: SHIFT_INCLUDE,
  });

  await prisma.spotWorkEntry.updateMany({
    where: {
      shiftId,
      confirmedAt: null,
      isActive: false,
    },
    data: {
      confirmedAt: new Date(),
      confirmedById: approverMemberId,
    },
  });

  return updated;
}
