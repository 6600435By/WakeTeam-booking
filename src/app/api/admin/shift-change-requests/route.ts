import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  canReviewShiftChangeRequests,
  canSubmitShiftChangeRequest,
  canViewShiftCalendar,
  handleAdminError,
  requireAdminContext,
  resolveBranchFilter,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { staffDisplayName } from "@/lib/staff-user";
import { shiftChangeRequestTypeLabel } from "@/lib/payroll/shift-change-request";

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  requestType: z.enum(["cancel", "change_time", "change_reverse", "other"]),
  message: z.string().min(1),
  workShiftId: z.string().optional(),
  proposedStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  proposedEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  proposedStaffId: z.string().optional(),
});

type RequestRow = {
  id: string;
  date: string;
  requestType: string;
  message: string;
  proposedStart: string | null;
  proposedEnd: string | null;
  proposedStaffId: string | null;
  status: string;
  reviewComment: string | null;
  workShiftId: string | null;
  memberId: string;
  createdAt: Date;
  member: { user: { name: string | null; lastName: string | null; login: string; email: string | null } };
};

function mapRequest(r: RequestRow) {
  return {
    id: r.id,
    date: r.date,
    requestType: r.requestType,
    requestTypeLabel: shiftChangeRequestTypeLabel(r.requestType),
    message: r.message,
    proposedStart: r.proposedStart,
    proposedEnd: r.proposedEnd,
    proposedStaffId: r.proposedStaffId,
    status: r.status,
    reviewComment: r.reviewComment,
    workShiftId: r.workShiftId,
    memberId: r.memberId,
    memberName: staffDisplayName(r.member.user),
    createdAt: r.createdAt.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    if (!canViewShiftCalendar(ctx)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const branchId = resolveBranchFilter(ctx, searchParams.get("branchId"));

    const where: Record<string, unknown> = {
      organizationId: ctx.organizationId,
    };
    if (status) where.status = status;
    if (branchId) where.branchId = branchId;

    if (canReviewShiftChangeRequests(ctx)) {
      if (!status) where.status = "pending";
    } else {
      where.memberId = ctx.memberId;
    }

    const requests = await prisma.shiftChangeRequest.findMany({
      where,
      include: {
        member: {
          include: { user: { select: { name: true, lastName: true, login: true, email: true } } },
        },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ requests: requests.map(mapRequest) });
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
    if (!canSubmitShiftChangeRequest(ctx)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
    if (!ctx.branchId) {
      return NextResponse.json({ error: "Филиал не указан" }, { status: 400 });
    }

    const body = createSchema.parse(await req.json());

    let workShiftId = body.workShiftId ?? null;
    if (workShiftId) {
      const shift = await prisma.workShift.findUnique({ where: { id: workShiftId } });
      if (!shift || shift.memberId !== ctx.memberId) {
        return NextResponse.json({ error: "Смена не найдена" }, { status: 404 });
      }
    } else {
      const shift = await prisma.workShift.findUnique({
        where: { memberId_date: { memberId: ctx.memberId, date: body.date } },
      });
      workShiftId = shift?.id ?? null;
    }

    const existing = await prisma.shiftChangeRequest.findFirst({
      where: {
        memberId: ctx.memberId,
        date: body.date,
        status: "pending",
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Уже есть ожидающая заявка на эту дату" },
        { status: 400 },
      );
    }

    if (body.requestType === "change_reverse" && body.proposedStaffId) {
      const staff = await prisma.staff.findFirst({
        where: {
          id: body.proposedStaffId,
          branchId: ctx.branchId,
          kind: "revers",
          isActive: true,
        },
      });
      if (!staff) {
        return NextResponse.json({ error: "Реверс не найден" }, { status: 400 });
      }
    }

    const created = await prisma.shiftChangeRequest.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: ctx.branchId,
        memberId: ctx.memberId,
        workShiftId,
        date: body.date,
        requestType: body.requestType,
        message: body.message.trim(),
        proposedStart: body.proposedStart,
        proposedEnd: body.proposedEnd,
        proposedStaffId: body.proposedStaffId,
      },
      include: {
        member: {
          include: { user: { select: { name: true, lastName: true, login: true, email: true } } },
        },
      },
    });

    return NextResponse.json({ request: mapRequest(created) });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
