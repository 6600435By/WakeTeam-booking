import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertBranchAccess,
  assertCatalogAccess,
  handleAdminError,
  requireAdminContext,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { isLegacyTariffServiceName, serviceResourceLabel } from "@/lib/admin/service-catalog";
import { catalogStaff } from "@/lib/admin/staff-catalog";

const createSchema = z.object({
  branchId: z.string(),
  kind: z.enum(["revers", "sup"]),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  copyScheduleFromStaffId: z.string().optional(),
  serviceId: z.string().optional(),
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
    assertCatalogAccess(ctx);
    const body = createSchema.parse(await req.json());
    assertBranchAccess(ctx, body.branchId);

    const branch = await prisma.branch.findFirst({
      where: { id: body.branchId, organizationId: ctx.organizationId },
    });
    if (!branch) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let dedicatedService: {
      id: string;
      kind: string;
      durationMinutes: number;
      name: string;
      resourceLabel: string | null;
    } | null = null;
    if (body.serviceId) {
      dedicatedService = await prisma.service.findFirst({
        where: { id: body.serviceId, branchId: body.branchId },
        select: {
          id: true,
          kind: true,
          durationMinutes: true,
          name: true,
          resourceLabel: true,
        },
      });
      if (!dedicatedService) {
        return NextResponse.json({ error: "Услуга не найдена" }, { status: 404 });
      }
      if (dedicatedService.kind === "sup") {
        return NextResponse.json(
          { error: "Для сапборда используйте общий список сапов" },
          { status: 400 },
        );
      }
    }

    const branchStaff = await prisma.staff.findMany({
      where: { branchId: body.branchId, kind: body.kind },
    });

    let defaultName = body.name;
    if (!defaultName) {
      if (dedicatedService) {
        const linkedCount = await prisma.serviceStaff.count({
          where: { serviceId: dedicatedService.id },
        });
        const label = serviceResourceLabel(dedicatedService);
        defaultName = `${label} №${linkedCount + 1}`;
      } else {
        const activeSameKind = catalogStaff(branchStaff).filter((s) => s.isActive).length;
        defaultName =
          body.kind === "revers"
            ? `Реверс №${activeSameKind + 1}`
            : `Сапборд №${activeSameKind + 1}`;
      }
    }

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
    } else if (dedicatedService) {
      const linked = await prisma.serviceStaff.findFirst({
        where: { serviceId: dedicatedService.id },
        include: { staff: { include: { schedules: true } } },
        orderBy: { staff: { sortOrder: "asc" } },
      });
      if (linked?.staff.schedules.length) {
        scheduleRows = linked.staff.schedules.map((s) => ({
          weekday: s.weekday,
          isWorking: s.isWorking,
          timeFrom: s.timeFrom,
          timeTo: s.timeTo,
        }));
      }
    } else {
      const templateMeta = catalogStaff(branchStaff)
        .filter((s) => s.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder)[0];
      if (templateMeta) {
        const template = await prisma.staff.findUnique({
          where: { id: templateMeta.id },
          include: { schedules: true },
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
    }

    const slotMinutes = dedicatedService
      ? dedicatedService.durationMinutes
      : body.kind === "sup"
        ? 60
        : 10;

    const staff = await prisma.staff.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: body.branchId,
        name: defaultName,
        kind: body.kind,
        description: body.description ?? null,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
        slotMinutes,
        schedules: {
          create: scheduleRows,
        },
      },
      include: { schedules: true },
    });

    if (dedicatedService) {
      await prisma.serviceStaff.create({
        data: { serviceId: dedicatedService.id, staffId: staff.id },
      });
    } else {
      const serviceKind = body.kind === "revers" ? "wake" : "sup";
      const branchServices = await prisma.service.findMany({
        where: {
          branchId: body.branchId,
          kind: serviceKind,
          isActive: true,
        },
        orderBy: { sortOrder: "asc" },
      });
      const service = branchServices.find((s) => !isLegacyTariffServiceName(s.name));
      if (service) {
        await prisma.serviceStaff.upsert({
          where: {
            serviceId_staffId: { serviceId: service.id, staffId: staff.id },
          },
          create: { serviceId: service.id, staffId: staff.id },
          update: {},
        });
      }
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
