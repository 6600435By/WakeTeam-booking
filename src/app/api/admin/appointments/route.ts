import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertJournalCreateAccess,
  assertServiceJournalAccess,
  assertStaffJournalAccess,
  handleAdminError,
  requireAdminContext,
  resolveJournalBranchFilter,
} from "@/lib/admin-access";
import { finalizeAdminAppointmentCreate } from "@/lib/admin/appointment-mutations";
import { logAppointmentCreate } from "@/lib/audit/appointment-audit";
import { prisma } from "@/lib/db";
import { serviceRequiresOperator } from "@/lib/appointment-status";
import { resolveDefaultOperatorMemberId } from "@/lib/payroll/resolve-appointment-operator";
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
  paymentMethod: z.enum(["cash", "card", "corporate"]).nullable().optional(),
  price: z.number().nonnegative().optional(),
  priceManual: z.boolean().optional(),
  rentalItemId: z.string().nullable().optional(),
  rentalQuantity: z.number().int().nonnegative().optional(),
  operatorMemberId: z.string().nullable().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    const from = req.nextUrl.searchParams.get("from");
    const to = req.nextUrl.searchParams.get("to");
    const branchId = resolveJournalBranchFilter(
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
      include: {
        client: true,
        service: true,
        staff: true,
        rentalItem: true,
        operatorMember: {
          include: {
            user: { select: { name: true, lastName: true, login: true, email: true } },
          },
        },
      },
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
    await assertServiceJournalAccess(ctx, body.serviceId);
    await assertStaffJournalAccess(ctx, body.staffId);

    const staff = await prisma.staff.findUnique({
      where: { id: body.staffId },
      select: { branchId: true },
    });
    if (!staff) {
      return NextResponse.json({ error: "Реверс не найден" }, { status: 404 });
    }
    assertJournalCreateAccess(ctx, staff.branchId);

    const { membershipId, paymentMethod, status: desiredStatus, rentalItemId, rentalQuantity, operatorMemberId, price, ...bookingBody } = body;

    const service = await prisma.service.findUnique({
      where: { id: body.serviceId },
      select: { kind: true },
    });

    const result = await createBooking(
      {
        organizationId: ctx.organizationId,
        ...bookingBody,
        price,
        source: "admin",
      },
      { skipSlotCheck: true, allowOverlap: true },
    );

    const startAt = new Date(bookingBody.startAt);
    const resolvedOperatorId = serviceRequiresOperator(service?.kind)
      ? operatorMemberId !== undefined
        ? operatorMemberId
        : await resolveDefaultOperatorMemberId(staff.branchId, body.staffId, startAt)
      : null;
    if (resolvedOperatorId) {
      await prisma.appointment.update({
        where: { id: result.id },
        data: { operatorMemberId: resolvedOperatorId },
      });
    }

    try {
      await finalizeAdminAppointmentCreate(result.id, {
        membershipId,
        desiredStatus,
        paymentMethod,
        rentalItemId,
        rentalQuantity,
      });
    } catch (err) {
      await prisma.appointment.delete({ where: { id: result.id } });
      if (err instanceof Error && err.message === "MEMBERSHIP_INSUFFICIENT_MINUTES") {
        return NextResponse.json(
          { error: "Недостаточно минут на абонементе" },
          { status: 409 },
        );
      }
      throw err;
    }

    void prisma.appointment
      .findUnique({
        where: { id: result.id },
        include: {
          client: true,
          service: true,
          staff: true,
          membership: true,
          operatorMember: {
            include: {
              user: { select: { name: true, lastName: true, login: true, email: true } },
            },
          },
        },
      })
      .then((appt) => {
        if (appt) logAppointmentCreate(ctx, appt);
      });

    return NextResponse.json({ ok: true, id: result.id, publicNumber: result.publicNumber });
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
