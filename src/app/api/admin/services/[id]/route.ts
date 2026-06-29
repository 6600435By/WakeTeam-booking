import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertServiceAccess,
  handleAdminError,
  requireAdminContext,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
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
    const { id } = await params;
    await assertServiceAccess(ctx, id);
    const body = patchSchema.parse(await req.json());
    const { staffIds, priceRules, ...data } = body;

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

    return NextResponse.json({ ok: true, service });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
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
