import { NextRequest, NextResponse } from "next/server";
import {
  handleAdminError,
  requireAdminContext,
  resolveBranchFilter,
} from "@/lib/admin-access";
import { getDaySlots, getSupDaySlots } from "@/lib/slots/generateSlots";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    const serviceId = req.nextUrl.searchParams.get("serviceId");
    const staffId = req.nextUrl.searchParams.get("staffId");
    const date = req.nextUrl.searchParams.get("date");
    const duration = req.nextUrl.searchParams.get("durationMinutes");
    const excludeAppointmentId =
      req.nextUrl.searchParams.get("excludeAppointmentId") ?? undefined;

    if (!serviceId || !date) {
      return NextResponse.json(
        { error: "serviceId и date обязательны" },
        { status: 400 },
      );
    }

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      select: {
        id: true,
        kind: true,
        isActive: true,
        branchId: true,
        durationMinutes: true,
      },
    });
    if (!service || !service.isActive) {
      return NextResponse.json({ error: "Услуга не найдена" }, { status: 404 });
    }

    const branchId = resolveBranchFilter(ctx, service.branchId);
    if (!branchId || service.branchId !== branchId) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const durationMinutes = duration ? parseInt(duration, 10) : undefined;
    const slotParams = {
      forAdmin: true as const,
      excludeAppointmentId,
    };

    if (service.kind === "sup") {
      const result = await getSupDaySlots({
        serviceId,
        date,
        ...slotParams,
      });
      return NextResponse.json({
        kind: "sup",
        slots: result.slots.filter((s) => s.availableBoards > 0),
        allowedDurations: result.allowedDurations,
      });
    }

    if (!staffId) {
      return NextResponse.json(
        { error: "staffId обязателен для этой услуги" },
        { status: 400 },
      );
    }

    const result = await getDaySlots({
      serviceId,
      staffId,
      date,
      durationMinutes,
      ...slotParams,
    });

    return NextResponse.json({
      kind: "wake",
      slots: result.slots.filter((s) => s.status === "free"),
      allowedDurations: result.allowedDurations,
    });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
