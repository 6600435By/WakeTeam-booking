import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  canReviewShiftChangeRequests,
  handleAdminError,
  requireAdminContext,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";

const patchSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reviewComment: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    if (!canReviewShiftChangeRequests(ctx)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
    const { id } = await params;
    const body = patchSchema.parse(await req.json());

    const request = await prisma.shiftChangeRequest.findUnique({
      where: { id },
      include: { workShift: true },
    });
    if (!request || request.organizationId !== ctx.organizationId) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }
    if (request.status !== "pending") {
      return NextResponse.json({ error: "Заявка уже обработана" }, { status: 400 });
    }

    if (body.action === "approve" && request.workShiftId && request.workShift) {
      const shift = request.workShift;
      if (shift.status === "scheduled") {
        if (request.requestType === "cancel") {
          await prisma.workShift.delete({ where: { id: shift.id } });
        } else if (request.requestType === "change_time") {
          await prisma.workShift.update({
            where: { id: shift.id },
            data: {
              plannedStart: request.proposedStart ?? shift.plannedStart,
              plannedEnd: request.proposedEnd ?? shift.plannedEnd,
            },
          });
        } else if (request.requestType === "change_reverse" && request.proposedStaffId) {
          await prisma.workShift.update({
            where: { id: shift.id },
            data: { plannedStaffId: request.proposedStaffId },
          });
        }
      }
    }

    const updated = await prisma.shiftChangeRequest.update({
      where: { id },
      data: {
        status: body.action === "approve" ? "approved" : "rejected",
        reviewComment: body.reviewComment?.trim() || null,
        reviewedByMemberId: ctx.memberId,
      },
    });

    return NextResponse.json({ request: updated });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
