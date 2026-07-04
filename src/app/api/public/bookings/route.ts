import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enforcePublicWriteLimit } from "@/lib/public-api-guard";
import { logAppointmentCreateOnline } from "@/lib/audit/appointment-audit";
import { prisma } from "@/lib/db";
import { createBooking } from "@/lib/slots/generateSlots";
import { getOrganizationBySlug } from "@/lib/services-public";

const slotSchema = z.object({
  startAt: z.string(),
  quantity: z.number().int().positive().optional(),
});

const schema = z
  .object({
    slug: z.string().default("waketeam"),
    serviceId: z.string(),
    staffId: z.string().optional(),
    startAt: z.string().optional(),
    durationMinutes: z.number().int().positive().optional(),
    quantity: z.number().int().positive().optional(),
    slots: z.array(slotSchema).optional(),
    phone: z.string().min(6),
    firstName: z.string().min(1),
    lastName: z.string().optional(),
    email: z.string().email().optional().or(z.literal("")),
    comment: z.string().optional(),
  })
  .refine(
    (d) =>
      (d.slots && d.slots.length > 0) ||
      (d.startAt != null && d.startAt.length > 0),
    { message: "Укажите время записи" },
  );

export async function POST(req: NextRequest) {
  const limited = enforcePublicWriteLimit(req);
  if (limited) return limited;

  try {
    const body = schema.parse(await req.json());
    const org = await getOrganizationBySlug(body.slug);
    if (!org) {
      return NextResponse.json({ error: "Организация не найдена" }, { status: 404 });
    }

    const slots =
      body.slots ??
      (body.startAt
        ? [{ startAt: body.startAt, quantity: body.quantity }]
        : undefined);

    const result = await createBooking({
      organizationId: org.id,
      serviceId: body.serviceId,
      staffId: body.staffId,
      startAt: body.startAt,
      durationMinutes: body.durationMinutes,
      quantity: body.quantity,
      slots,
      phone: body.phone,
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email || undefined,
      comment: body.comment,
      source: "widget",
    });

    if ("id" in result && result.id) {
      const appt = await prisma.appointment.findUnique({
        where: { id: result.id },
        include: { client: true, service: true, staff: true },
      });
      if (appt) {
        logAppointmentCreateOnline(org.id, appt.branchId, appt);
      }
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof Error && e.message === "SLOT_UNAVAILABLE") {
      return NextResponse.json({ error: "Слот уже занят" }, { status: 409 });
    }
    if (e instanceof Error && e.message === "STAFF_REQUIRED") {
      return NextResponse.json({ error: "Выберите реверс" }, { status: 400 });
    }
    if (
      e instanceof Error &&
      (e.message === "SERVICE_NOT_BOOKABLE" || e.message === "SERVICE_ORG_MISMATCH")
    ) {
      return NextResponse.json({ error: "Услуга недоступна" }, { status: 400 });
    }
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
