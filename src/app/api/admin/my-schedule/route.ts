import { NextRequest, NextResponse } from "next/server";
import {
  canViewShiftCalendar,
  handleAdminError,
  requireAdminContext,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { formatDateKey } from "@/lib/time";
import { formatMinutesLabel } from "@/lib/calendar-grid";

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return formatDateKey(dt);
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    if (!canViewShiftCalendar(ctx)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const today = formatDateKey(new Date());
    const date = searchParams.get("date") ?? addDays(today, 1);

    const shift = await prisma.workShift.findUnique({
      where: { memberId_date: { memberId: ctx.memberId, date } },
      include: {
        plannedStaff: { select: { name: true } },
        member: {
          include: { user: { select: { name: true, email: true } } },
        },
      },
    });

    const tasks = await prisma.spotTask.findMany({
      where: {
        assigneeMemberId: ctx.memberId,
        date,
        status: { in: ["pending", "in_progress"] },
      },
      orderBy: { createdAt: "asc" },
    });

    if (!shift && tasks.length === 0) {
      return NextResponse.json({ date, shift: null, tasks: [] });
    }

    return NextResponse.json({
      date,
      isTomorrow: date === addDays(today, 1),
      shift: shift
        ? {
            id: shift.id,
            date: shift.date,
            status: shift.status,
            plannedStart: shift.plannedStart,
            plannedEnd: shift.plannedEnd,
            plannedStaffName: shift.plannedStaff?.name ?? null,
            workAsAdmin: shift.workAsAdmin,
          }
        : null,
      tasks: tasks.map((t) => ({
        id: t.id,
        description: t.description,
        plannedLabel: t.plannedMinutes
          ? formatMinutesLabel(t.plannedMinutes)
          : t.plannedTimeFrom && t.plannedTimeTo
            ? `${t.plannedTimeFrom}–${t.plannedTimeTo}`
            : null,
        status: t.status,
      })),
    });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
