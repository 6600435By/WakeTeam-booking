import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { patchAdminAppointment } from "@/lib/admin/appointment-mutations";
import {
  logAppointmentCancel,
  logAppointmentUpdate,
} from "@/lib/audit/appointment-audit";
import {
  assertAppointmentAccess,
  assertJournalEditAccess,
  assertServiceAccess,
  assertStaffAccess,
  handleAdminError,
  requireAdminContext,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { reconcileMembershipOnDelete } from "@/lib/memberships/deduct";
import { reconcileDailyRentalCharges } from "@/lib/rental-pricing";
import { resolveDefaultOperatorMemberId } from "@/lib/payroll/resolve-appointment-operator";
import { formatDateKey } from "@/lib/time";
import {
  validateOperatorForCompletedStatus,
  serviceRequiresOperator,
} from "@/lib/appointment-status";

const patchSchema = z.object({
  startAt: z.string().optional(),
  staffId: z.string().optional(),
  serviceId: z.string().optional(),
  durationMinutes: z.number().int().positive().optional(),
  status: z.string().optional(),
  comment: z.string().optional(),
  membershipId: z.string().nullable().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  paymentMethod: z.enum(["cash", "card", "corporate"]).nullable().optional(),
  price: z.number().nonnegative().optional(),
  priceManual: z.boolean().optional(),
  rentalItemId: z.string().nullable().optional(),
  rentalQuantity: z.number().int().nonnegative().optional(),
  operatorMemberId: z.string().nullable().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    const { id } = await params;
    await assertAppointmentAccess(ctx, id, "read");
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        client: true,
        service: true,
        staff: true,
        membership: true,
        rentalItem: true,
        operatorMember: {
          include: {
            user: { select: { name: true, lastName: true, login: true, email: true } },
          },
        },
      },
    });
    if (!appointment) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ appointment });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    const { id } = await params;
    const existing = await prisma.appointment.findUniqueOrThrow({
      where: { id },
      include: {
        client: true,
        service: true,
        staff: true,
        operatorMember: {
          include: {
            user: { select: { name: true, lastName: true, login: true, email: true } },
          },
        },
      },
    });
    assertJournalEditAccess(ctx, existing.branchId);
    await assertAppointmentAccess(ctx, id, "write");
    const body = patchSchema.parse(await req.json());
    if (body.staffId) await assertStaffAccess(ctx, body.staffId);
    if (body.serviceId) await assertServiceAccess(ctx, body.serviceId);

    const oldDateKey = formatDateKey(existing.startAt);
    const { membershipId, rentalItemId, rentalQuantity, price, priceManual, operatorMemberId, ...rest } = body;

    const nextServiceId = body.serviceId ?? existing.serviceId;
    const nextService = await prisma.service.findUnique({
      where: { id: nextServiceId },
      select: { kind: true },
    });
    const supService = !serviceRequiresOperator(nextService?.kind);

    const updateFields: typeof rest & { operatorMemberId?: string | null } = { ...rest };
    if (supService) {
      updateFields.operatorMemberId = null;
    } else if (operatorMemberId !== undefined) {
      updateFields.operatorMemberId = operatorMemberId;
    } else if (body.staffId || body.startAt) {
      const nextStaffId = body.staffId ?? existing.staffId;
      const nextStartAt = body.startAt ? new Date(body.startAt) : existing.startAt;
      updateFields.operatorMemberId = await resolveDefaultOperatorMemberId(
        existing.branchId,
        nextStaffId,
        nextStartAt,
      );
    }

    const nextStatus = body.status ?? existing.status;
    const finalOperatorMemberId =
      updateFields.operatorMemberId !== undefined
        ? updateFields.operatorMemberId
        : existing.operatorMemberId;
    const operatorError = validateOperatorForCompletedStatus(
      nextStatus,
      finalOperatorMemberId,
      nextService?.kind,
    );
    if (operatorError) {
      return NextResponse.json({ error: operatorError }, { status: 400 });
    }

    try {
      await patchAdminAppointment(id, { status: existing.status }, {
        membershipId,
        status: body.status,
        rentalItemId,
        rentalQuantity,
        price: priceManual ? price : undefined,
        updateFields,
      });
    } catch (err) {
      if (err instanceof Error && err.message === "MEMBERSHIP_INSUFFICIENT_MINUTES") {
        return NextResponse.json(
          { error: "Недостаточно минут на абонементе" },
          { status: 409 },
        );
      }
      throw err;
    }

    const newDateKey = formatDateKey(
      body.startAt ? new Date(body.startAt) : existing.startAt,
    );
    if (oldDateKey !== newDateKey && existing.rentalItemId) {
      await reconcileDailyRentalCharges(prisma, {
        clientId: existing.clientId,
        branchId: existing.branchId,
        dateKey: oldDateKey,
      });
    }

    void prisma.appointment
      .findUnique({
        where: { id },
        include: {
          client: true,
          service: true,
          staff: true,
          membership: true,
          rentalItem: true,
          operatorMember: {
            include: {
              user: { select: { name: true, lastName: true, login: true, email: true } },
            },
          },
        },
      })
      .then((fresh) => {
        if (fresh) logAppointmentUpdate(ctx, existing, fresh);
      });

    return NextResponse.json({ ok: true });
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

const deleteSchema = z.object({
  reason: z.enum(["client", "admin", "weather"]),
});

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    const { id } = await params;
    const existingForDelete = await prisma.appointment.findUniqueOrThrow({
      where: { id },
      include: {
        client: true,
        service: true,
        staff: true,
        operatorMember: {
          include: {
            user: { select: { name: true, lastName: true, login: true, email: true } },
          },
        },
      },
    });
    assertJournalEditAccess(ctx, existingForDelete.branchId);
    await assertAppointmentAccess(ctx, id, "write");
    const body = deleteSchema.parse(await req.json());
    await reconcileMembershipOnDelete(id);
    const appointment = await prisma.appointment.update({
      where: { id },
      data: {
        status: "deleted",
        cancelReason: body.reason,
      },
      include: {
        client: true,
        service: true,
        staff: true,
        membership: true,
        rentalItem: true,
        operatorMember: {
          include: {
            user: { select: { name: true, lastName: true, login: true, email: true } },
          },
        },
      },
    });
    logAppointmentCancel(ctx, existingForDelete, body.reason);
    return NextResponse.json({ ok: true, appointment });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Укажите причину удаления" },
        { status: 400 },
      );
    }
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
