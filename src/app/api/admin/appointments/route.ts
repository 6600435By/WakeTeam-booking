import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertServiceAccess,
  assertStaffAccess,
  handleAdminError,
  requireAdminContext,
  resolveBranchFilter,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import {
  applyMembershipDeductionIfNeeded,
  setAppointmentMembership,
} from "@/lib/memberships/deduct";
import { createBooking } from "@/lib/slots/generateSlots";
import { formatDateKey, parseTimeOnDate } from "@/lib/time";

function rangeBounds(from: string, to: string) {
  const dayStart = parseTimeOnDate(from, "00:00");
  const toDate = parseTimeOnDate(to, "12:00");
  toDate.setDate(toDate.getDate() + 1);
  const nextKey = formatDateKey(toDate);
  const dayEnd = parseTimeOnDate(nextKey, "00:00");
  return { dayStart, dayEnd };
}

const createSchema = z.object({
  serviceId: z.string(),
  staffId: z.string(),
  startAt: z.string(),
  durationMinutes: z.number().int().positive().optional(),
  phone: z.string().min(6),
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  email: z.string().optional(),
  comment: z.string().optional(),
  status: z.string().optional(),
  membershipId: z.string().nullable().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    const from = req.nextUrl.searchParams.get("from");
    const to = req.nextUrl.searchParams.get("to");
    const branchId = resolveBranchFilter(
      ctx,
      req.nextUrl.searchParams.get("branchId"),
    );

    if (!from || !to) {
      return NextResponse.json(
        { error: "from and to date required (yyyy-MM-dd)" },
        { status: 400 },
      );
    }

    const { dayStart, dayEnd } = rangeBounds(from, to);

    const appointments = await prisma.appointment.findMany({
      where: {
        organizationId: ctx.organizationId,
        startAt: { gte: dayStart, lt: dayEnd },
        ...(branchId ? { branchId } : {}),
      },
      include: { client: true, service: true, staff: true },
      orderBy: { startAt: "desc" },
    });
    return NextResponse.json({ appointments });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    const body = createSchema.parse(await req.json());
    await assertServiceAccess(ctx, body.serviceId);
    await assertStaffAccess(ctx, body.staffId);

    const { membershipId, status: desiredStatus, ...bookingBody } = body;

    const result = await createBooking(
      {
        organizationId: ctx.organizationId,
        ...bookingBody,
        source: "admin",
      },
      { skipSlotCheck: true },
    );

    if (membershipId) {
      await setAppointmentMembership(result.id, membershipId);
    }

    if (desiredStatus && desiredStatus !== "booked") {
      await prisma.appointment.update({
        where: { id: result.id },
        data: { status: desiredStatus },
      });
      try {
        await applyMembershipDeductionIfNeeded(result.id, desiredStatus);
      } catch (err) {
        if (err instanceof Error && err.message === "MEMBERSHIP_INSUFFICIENT_MINUTES") {
          return NextResponse.json(
            { error: "Недостаточно минут на абонементе" },
            { status: 409 },
          );
        }
        throw err;
      }
    }

    const appt = await prisma.appointment.findUnique({
      where: { id: result.id },
      include: { client: true, service: true, staff: true, membership: true },
    });
    return NextResponse.json({ ok: true, appointment: appt, publicNumber: result.publicNumber });
  } catch (e) {
    if (e instanceof Error && e.message === "SLOT_UNAVAILABLE") {
      return NextResponse.json({ error: "Слот занят" }, { status: 409 });
    }
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    console.error(e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
