import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertCatalogAccess,
  assertStaffAccess,
  handleAdminError,
  requireAdminContext,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";

const scheduleSchema = z.object({
  schedules: z.array(
    z.object({
      weekday: z.number().int().min(1).max(7),
      isWorking: z.boolean(),
      timeFrom: z.string(),
      timeTo: z.string(),
    }),
  ),
  breaks: z
    .array(
      z.object({
        id: z.string().optional(),
        weekday: z.number().int().min(1).max(7).nullable().optional(),
        timeFrom: z.string(),
        timeTo: z.string(),
      }),
    )
    .optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    assertCatalogAccess(ctx);
    const { id } = await params;
    await assertStaffAccess(ctx, id);
    const staff = await prisma.staff.findUnique({
      where: { id },
      include: { schedules: true, breaks: true, branch: true },
    });
    if (!staff) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ staff });
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
    assertCatalogAccess(ctx);
    const { id } = await params;
    await assertStaffAccess(ctx, id);
    const body = scheduleSchema.parse(await req.json());

    for (const s of body.schedules) {
      await prisma.staffSchedule.upsert({
        where: { staffId_weekday: { staffId: id, weekday: s.weekday } },
        create: { staffId: id, ...s },
        update: s,
      });
    }

    if (body.breaks) {
      await prisma.staffBreak.deleteMany({ where: { staffId: id } });
      for (const b of body.breaks) {
        await prisma.staffBreak.create({
          data: {
            staffId: id,
            weekday: b.weekday ?? null,
            timeFrom: b.timeFrom,
            timeTo: b.timeTo,
          },
        });
      }
    }

    const staff = await prisma.staff.findUnique({
      where: { id },
      include: { schedules: true, breaks: true, branch: true },
    });
    return NextResponse.json({ ok: true, staff });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    console.error(e);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
