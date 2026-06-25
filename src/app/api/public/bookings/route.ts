import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createBooking } from "@/lib/slots/generateSlots";
import { getOrganizationBySlug } from "@/lib/services-public";

const schema = z.object({
  slug: z.string().default("waketeam"),
  serviceId: z.string(),
  staffId: z.string().optional(),
  startAt: z.string(),
  durationMinutes: z.number().int().positive().optional(),
  quantity: z.number().int().positive().optional(),
  phone: z.string().min(6),
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  comment: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json());
    const org = await getOrganizationBySlug(body.slug);
    if (!org) {
      return NextResponse.json({ error: "Организация не найдена" }, { status: 404 });
    }
    const result = await createBooking({
      organizationId: org.id,
      serviceId: body.serviceId,
      staffId: body.staffId,
      startAt: body.startAt,
      durationMinutes: body.durationMinutes,
      quantity: body.quantity,
      phone: body.phone,
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email || undefined,
      comment: body.comment,
      source: "widget",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof Error && e.message === "SLOT_UNAVAILABLE") {
      return NextResponse.json({ error: "Слот уже занят" }, { status: 409 });
    }
    if (e instanceof Error && e.message === "STAFF_REQUIRED") {
      return NextResponse.json({ error: "Выберите реверс" }, { status: 400 });
    }
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
