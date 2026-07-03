import { NextRequest, NextResponse } from "next/server";
import { enforcePublicReadLimit } from "@/lib/public-api-guard";
import { getDaySlots, getSupDaySlots } from "@/lib/slots/generateSlots";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const limited = enforcePublicReadLimit(req);
  if (limited) return limited;

  const serviceId = req.nextUrl.searchParams.get("serviceId");
  const staffId = req.nextUrl.searchParams.get("staffId");
  const date = req.nextUrl.searchParams.get("date");
  const duration = req.nextUrl.searchParams.get("durationMinutes");

  if (!serviceId || !date) {
    return NextResponse.json(
      { error: "serviceId, date required" },
      { status: 400 },
    );
  }

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { kind: true, isActive: true, isOnlineBookable: true },
  });
  if (!service || !service.isActive || !service.isOnlineBookable) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  if (service.kind === "sup") {
    const durationMinutes = duration ? parseInt(duration, 10) : undefined;
    const result = await getSupDaySlots({
      serviceId,
      date,
      durationMinutes,
    });
    return NextResponse.json(result);
  }

  if (!staffId) {
    return NextResponse.json(
      { error: "staffId required for wake service" },
      { status: 400 },
    );
  }

  const result = await getDaySlots({
    serviceId,
    staffId,
    date,
    durationMinutes: duration ? parseInt(duration, 10) : undefined,
  });

  return NextResponse.json(result);
}
