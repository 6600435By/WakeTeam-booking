import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertBranchAccess,
  handleAdminError,
  requireAdminContext,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";

const createSchema = z.object({
  branchId: z.string(),
  kind: z.enum(["revers", "sup"]),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  copyScheduleFromStaffId: z.string().optional(),
});

const DEFAULT_SCHEDULE = Array.from({ length: 7 }, (_, i) => ({
  weekday: i + 1,
  isWorking: true,
  timeFrom: "10:00",
  timeTo: "21:00",
}));

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    const body = createSchema.parse(await req.json());
    assertBranchAccess(ctx, body.branchId);

    const branch = await prisma.branch.findFirst({
      where: { id: body.branchId, organizationId: ctx.organizationId },
    });
    if (!branch) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const activeSameKind = await prisma.staff.count({
      where: { branchId: body.branchId, kind: body.kind, isActive: true },
    });
    const defaultName =
      body.name ??
      (body.kind === "revers"
        ? `Реверс №${activeSameKind + 1}`
        : `Сапборд №${activeSameKind + 1}`);

    const maxSort = await prisma.staff.aggregate({
      where: { branchId: body.branchId, kind: body.kind },
      _max: { sortOrder: true },
    });

    let scheduleRows = DEFAULT_SCHEDULE;
    const templateStaffId = body.copyScheduleFromStaffId;
    if (templateStaffId) {
      const templateSchedules = await prisma.staffSchedule.findMany({
        where: { staffId: templateStaffId },
      });
      if (templateSchedules.length > 0) {
        scheduleRows = templateSchedules.map((s) => ({
          weekday: s.weekday,
          isWorking: s.isWorking,
          timeFrom: s.timeFrom,
          timeTo: s.timeTo,
        }));
      }
    } else {
      const template = await prisma.staff.findFirst({
        where: { branchId: body.branchId, kind: body.kind, isActive: true },
        include: { schedules: true },
        orderBy: { sortOrder: "asc" },
      });
      if (template?.schedules.length) {
        scheduleRows = template.schedules.map((s) => ({
          weekday: s.weekday,
          isWorking: s.isWorking,
          timeFrom: s.timeFrom,
          timeTo: s.timeTo,
        }));
      }
    }

    const staff = await prisma.staff.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: body.branchId,
        name: defaultName,
        kind: body.kind,
        description: body.description ?? null,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
        slotMinutes: body.kind === "sup" ? 60 : 10,
        schedules: {
          create: scheduleRows,
        },
      },
      include: { schedules: true },
    });

    const serviceKind = body.kind === "revers" ? "wake" : "sup";
    const service = await prisma.service.findFirst({
      where: {
        branchId: body.branchId,
        kind: serviceKind,
        isActive: true,
      },
      orderBy: { sortOrder: "asc" },
    });
    if (service) {
      await prisma.serviceStaff.upsert({
        where: {
          serviceId_staffId: { serviceId: service.id, staffId: staff.id },
        },
        create: { serviceId: service.id, staffId: staff.id },
        update: {},
      });
    }

    return NextResponse.json({ ok: true, staff });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    console.error("staff create error:", e);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
