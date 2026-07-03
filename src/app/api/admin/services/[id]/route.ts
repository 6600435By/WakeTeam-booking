import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  assertCatalogAccess,
  assertServiceAccess,
  handleAdminError,
  requireAdminContext,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import {
  buildStaffSchedulesFromService,
} from "@/lib/admin/service-staff-schedule";
import { isServiceSlotDuration } from "@/lib/service-durations";

async function syncLinkedStaffSchedules(
  staffIds: string[],
  weekdays: string,
  bookableFrom: string | null,
  bookableTo: string | null,
) {
  if (staffIds.length === 0) return;
  const schedules = buildStaffSchedulesFromService(
    weekdays,
    bookableFrom,
    bookableTo,
  );
  for (const staffId of staffIds) {
    for (const s of schedules) {
      await prisma.staffSchedule.upsert({
        where: { staffId_weekday: { staffId, weekday: s.weekday } },
        create: { staffId, ...s },
        update: s,
      });
    }
  }
}

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  resourceLabel: z.string().nullable().optional(),
  price: z.number().nonnegative().optional(),
  durationMinutes: z.number().int().positive().optional(),
  allowedDurations: z.string().optional(),
  bookableFrom: z.string().nullable().optional(),
  bookableTo: z.string().nullable().optional(),
  weekdays: z.string().optional(),
  isActive: z.boolean().optional(),
  isOnlineBookable: z.boolean().optional(),
  staffIds: z.array(z.string()).optional(),
  priceRules: z
    .array(
      z.object({
        id: z.string().optional(),
        weekdays: z.string(),
        timeFrom: z.string(),
        timeTo: z.string(),
        price: z.number().nonnegative(),
        pricesByDuration: z.string().nullable().optional(),
        sortOrder: z.number().int().optional(),
      }),
    )
    .optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    assertCatalogAccess(ctx);
    const { id } = await params;
    await assertServiceAccess(ctx, id);
    const body = patchSchema.parse(await req.json());
    const { staffIds, priceRules, ...data } = body;

    if (data.durationMinutes !== undefined && !isServiceSlotDuration(data.durationMinutes)) {
      return NextResponse.json(
        { error: "Интервал тарифа должен быть 10, 30 или 60 минут" },
        { status: 400 },
      );
    }

    const existingService = await prisma.service.findUniqueOrThrow({
      where: { id },
      select: { kind: true, staff: { select: { staffId: true } } },
    });

    if (priceRules) {
      await prisma.servicePriceRule.deleteMany({ where: { serviceId: id } });
      for (let i = 0; i < priceRules.length; i++) {
        const rule = priceRules[i];
        await prisma.servicePriceRule.create({
          data: {
            serviceId: id,
            weekdays: rule.weekdays,
            timeFrom: rule.timeFrom,
            timeTo: rule.timeTo,
            price: rule.price,
            pricesByDuration: rule.pricesByDuration ?? null,
            sortOrder: rule.sortOrder ?? i + 1,
          },
        });
      }
    }

    if (staffIds) {
      const service = await prisma.service.findUniqueOrThrow({
        where: { id },
        select: { branchId: true },
      });
      const validStaff = await prisma.staff.findMany({
        where: { id: { in: staffIds }, branchId: service.branchId },
        select: { id: true },
      });
      const validIds = new Set(validStaff.map((s) => s.id));
      await prisma.serviceStaff.deleteMany({ where: { serviceId: id } });
      for (const staffId of staffIds) {
        if (validIds.has(staffId)) {
          await prisma.serviceStaff.create({ data: { serviceId: id, staffId } });
        }
      }
    }

    const service = await prisma.service.update({
      where: { id },
      data: {
        ...data,
        description: data.description === null ? null : data.description,
        resourceLabel: data.resourceLabel === null ? null : data.resourceLabel,
        bookableFrom: data.bookableFrom === null ? null : data.bookableFrom,
        bookableTo: data.bookableTo === null ? null : data.bookableTo,
      },
      include: {
        priceRules: { orderBy: { sortOrder: "asc" } },
        staff: { include: { staff: { select: { id: true, name: true } } } },
      },
    });

    const scheduleTouched =
      body.weekdays !== undefined ||
      body.bookableFrom !== undefined ||
      body.bookableTo !== undefined ||
      staffIds !== undefined;

    if (scheduleTouched) {
      const linkedStaffIds =
        staffIds ?? service.staff.map((link) => link.staff.id);
      await syncLinkedStaffSchedules(
        linkedStaffIds,
        service.weekdays,
        service.bookableFrom,
        service.bookableTo,
      );
    }

    if (body.durationMinutes !== undefined) {
      const fullService = await prisma.service.findUniqueOrThrow({
        where: { id },
        select: {
          kind: true,
          branchId: true,
          staff: { select: { staffId: true } },
        },
      });
      let linkedStaffIds = fullService.staff.map((link) => link.staffId);
      if (fullService.kind === "sup") {
        const boards = await prisma.staff.findMany({
          where: { branchId: fullService.branchId, kind: "sup" },
          select: { id: true },
        });
        linkedStaffIds = [
          ...new Set([...linkedStaffIds, ...boards.map((b) => b.id)]),
        ];
      }
      if (linkedStaffIds.length > 0) {
        await prisma.staff.updateMany({
          where: { id: { in: linkedStaffIds } },
          data: { slotMinutes: body.durationMinutes },
        });
      }
    }

    return NextResponse.json({ ok: true, service });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    if (e instanceof Prisma.PrismaClientValidationError) {
      console.error("service PATCH validation:", e.message);
      return NextResponse.json(
        {
          error:
            "Схема БД устарела. Перезапустите сервер (npm run dev) после обновления.",
        },
        { status: 500 },
      );
    }
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    console.error("service PATCH error:", e);
    const message =
      e instanceof Error && process.env.NODE_ENV !== "production"
        ? e.message
        : "Ошибка";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    assertCatalogAccess(ctx);
    const { id } = await params;
    await assertServiceAccess(ctx, id);

    const service = await prisma.service.findUnique({
      where: { id },
      include: { staff: { select: { staffId: true } } },
    });
    if (!service) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const appointments = await prisma.appointment.count({
      where: { serviceId: id },
    });
    if (appointments > 0) {
      return NextResponse.json(
        { error: "Нельзя удалить услугу с существующими записями" },
        { status: 409 },
      );
    }

    if (service.kind === "custom") {
      for (const link of service.staff) {
        const staffId = link.staffId;
        const [otherLinks, staffAppointments] = await Promise.all([
          prisma.serviceStaff.count({
            where: { staffId, serviceId: { not: id } },
          }),
          prisma.appointment.count({ where: { staffId } }),
        ]);
        if (otherLinks === 0 && staffAppointments === 0) {
          await prisma.staff.delete({ where: { id: staffId } });
        }
      }
    }

    await prisma.service.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
