import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertJournalCreateAccess,
  assertServiceJournalAccess,
  assertStaffJournalAccess,
  requireAdminContext,
  resolveJournalBranchFilter,
} from "@/lib/admin-access";
import { adminCatchResponse } from "@/lib/admin/admin-api-error";
import { finalizeAdminAppointmentCreate } from "@/lib/admin/appointment-mutations";
import { appointmentSaveErrorResponse } from "@/lib/admin/appointment-save-errors";
import { logAppointmentCreate } from "@/lib/audit/appointment-audit";
import { prisma } from "@/lib/db";
import { serviceRequiresOperator } from "@/lib/appointment-status";
import { resolveDefaultOperatorMemberId } from "@/lib/payroll/resolve-appointment-operator";
import { ensureOperatorOnShift } from "@/lib/payroll/ensure-operator-shift";
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
  paymentMethod: z.enum(["cash", "card", "corporate", "split"]).nullable().optional(),
  cashAmount: z.number().nonnegative().optional(),
  cardAmount: z.number().nonnegative().optional(),
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
      select: {
        id: true,
        publicNumber: true,
        startAt: true,
        endAt: true,
        status: true,
        price: true,
        durationMinutes: true,
        comment: true,
        membershipId: true,
        paymentMethod: true,
        cashAmount: true,
        cardAmount: true,
        rentalItemId: true,
        rentalQuantity: true,
        rentalAmount: true,
        cancelReason: true,
        branchId: true,
        bookingGroupId: true,
        operatorMemberId: true,
        client: { select: { firstName: true, lastName: true, phone: true } },
        service: { select: { id: true, name: true } },
        staff: { select: { id: true, name: true } },
        operatorMember: {
          select: {
            id: true,
            user: {
              select: { name: true, lastName: true, login: true, email: true },
            },
          },
        },
      },
      orderBy: { startAt: "desc" },
      take: 1500,
    });
    return NextResponse.json({ appointments });
  } catch (e) {
    return adminCatchResponse(
      e,
      "Проверьте даты и филиал. Обновите страницу и повторите.",
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    const body = createSchema.parse(await req.json());
    const [service, staff] = await Promise.all([
      assertServiceJournalAccess(ctx, body.serviceId),
      assertStaffJournalAccess(ctx, body.staffId),
    ]);
    assertJournalCreateAccess(ctx, staff.branchId);

    const { membershipId, paymentMethod, cashAmount, cardAmount, status: desiredStatus, rentalItemId, rentalQuantity, operatorMemberId, price, ...bookingBody } = body;

    const startAt = new Date(bookingBody.startAt);
    const resolvedOperatorId = !serviceRequiresOperator(service.kind)
      ? null
      : operatorMemberId !== undefined
        ? operatorMemberId
        : await resolveDefaultOperatorMemberId(staff.branchId, body.staffId, startAt);

    const result = await createBooking(
      {
        organizationId: ctx.organizationId,
        ...bookingBody,
        price,
        source: "admin",
        operatorMemberId: resolvedOperatorId,
      },
      { skipSlotCheck: true, allowOverlap: true },
    );

    if (resolvedOperatorId) {
      void ensureOperatorOnShift({
        organizationId: ctx.organizationId,
        branchId: staff.branchId,
        memberId: resolvedOperatorId,
        at: startAt,
      });
    }

    const needsFinalize =
      Boolean(membershipId) ||
      Boolean(rentalItemId) ||
      paymentMethod != null ||
      cashAmount !== undefined ||
      cardAmount !== undefined ||
      (Boolean(desiredStatus) && desiredStatus !== "booked");

    if (needsFinalize) {
      try {
        await finalizeAdminAppointmentCreate(result.id, {
          membershipId,
          desiredStatus,
          paymentMethod,
          cashAmount,
          cardAmount,
          price,
          rentalItemId,
          rentalQuantity,
        });
      } catch (err) {
        await prisma.appointment.delete({ where: { id: result.id } });
        const mapped = appointmentSaveErrorResponse(err);
        if (mapped) {
          return NextResponse.json(mapped.body, { status: mapped.status });
        }
        throw err;
      }
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

    return NextResponse.json({
      ok: true,
      id: result.id,
      publicNumber: result.publicNumber,
      appointment: {
        id: result.id,
        startAt: bookingBody.startAt,
        durationMinutes: bookingBody.durationMinutes,
      },
    });
  } catch (e) {
    const mapped = appointmentSaveErrorResponse(e);
    if (mapped) {
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
    return adminCatchResponse(
      e,
      "Проверьте услугу, реверс, время, телефон и суммы оплаты. Если ошибка повторяется — обновите страницу или перелогиньтесь.",
    );
  }
}
