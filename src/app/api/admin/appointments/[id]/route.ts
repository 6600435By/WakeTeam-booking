import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertAppointmentAccess,
  assertServiceAccess,
  assertStaffAccess,
  handleAdminError,
  requireAdminContext,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import {
  reconcileMembershipOnDelete,
  reconcileMembershipOnStatusChange,
  setAppointmentMembership,
} from "@/lib/memberships/deduct";
import { updateAppointment } from "@/lib/slots/generateSlots";

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
  price: z.number().nonnegative().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    const { id } = await params;
    await assertAppointmentAccess(ctx, id);
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: { client: true, service: true, staff: true, membership: true },
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
    await assertAppointmentAccess(ctx, id);
    const body = patchSchema.parse(await req.json());
    if (body.staffId) await assertStaffAccess(ctx, body.staffId);
    if (body.serviceId) await assertServiceAccess(ctx, body.serviceId);

    const existing = await prisma.appointment.findUniqueOrThrow({ where: { id } });
    const { membershipId, ...rest } = body;

    const appointment = await updateAppointment(id, rest, { skipSlotCheck: true });

    if (membershipId !== undefined) {
      await setAppointmentMembership(id, membershipId);
    }

    if (body.status && body.status !== existing.status) {
      try {
        await reconcileMembershipOnStatusChange(id, existing.status, body.status);
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

    const fresh = await prisma.appointment.findUnique({
      where: { id },
      include: { client: true, service: true, staff: true, membership: true },
    });
    return NextResponse.json({ ok: true, appointment: fresh });
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
    await assertAppointmentAccess(ctx, id);
    const body = deleteSchema.parse(await req.json());
    await reconcileMembershipOnDelete(id);
    const appointment = await prisma.appointment.update({
      where: { id },
      data: {
        status: "deleted",
        cancelReason: body.reason,
      },
      include: { client: true, service: true, staff: true, membership: true },
    });
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
