import { NextRequest, NextResponse } from "next/server";
import {
  branchListWhere,
  handleAdminError,
  requireAdminContext,
  resolveBranchFilter,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { formatDateKey, parseTimeOnDate } from "@/lib/time";
import { JOURNAL_HIDDEN_STATUSES } from "@/lib/appointment-status";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    const date = req.nextUrl.searchParams.get("date");
    if (!date) {
      return NextResponse.json({ error: "date required" }, { status: 400 });
    }

    const branchId = resolveBranchFilter(
      ctx,
      req.nextUrl.searchParams.get("branchId"),
    );

    const dayStart = parseTimeOnDate(date, "00:00");
    const nextDate = new Date(
      parseTimeOnDate(date, "12:00").getTime() + 24 * 60 * 60 * 1000,
    );
    const nextKey = formatDateKey(nextDate);
    const dayEnd = parseTimeOnDate(nextKey, "00:00");

    const staff = await prisma.staff.findMany({
      where: {
        isActive: true,
        organizationId: ctx.organizationId,
        ...(branchId ? { branchId } : {}),
      },
      orderBy: { sortOrder: "asc" },
      include: { schedules: true, branch: true },
    });

    const appointments = await prisma.appointment.findMany({
      where: {
        organizationId: ctx.organizationId,
        startAt: { gte: dayStart, lt: dayEnd },
        ...(branchId ? { branchId } : {}),
        status: { notIn: [...JOURNAL_HIDDEN_STATUSES] },
      },
      include: {
        client: true,
        service: true,
        staff: true,
      },
      orderBy: { startAt: "asc" },
    });

    const branches = await prisma.branch.findMany({
      where: branchListWhere(ctx),
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({
      staff,
      appointments,
      branches,
      date,
      admin: {
        role: ctx.role,
        branchId: ctx.branchId,
        isSuperAdmin: ctx.isSuperAdmin,
      },
    });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
