import { NextRequest, NextResponse } from "next/server";
import { enforcePublicReadLimit } from "@/lib/public-api-guard";
import { findFirstFreePublicDate } from "@/lib/slots/probe-free-dates";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const limited = enforcePublicReadLimit(req);
  if (limited) return limited;

  const serviceId = req.nextUrl.searchParams.get("serviceId");
  const staffId = req.nextUrl.searchParams.get("staffId") ?? undefined;
  const from = req.nextUrl.searchParams.get("from");
  const daysRaw = req.nextUrl.searchParams.get("days");
  const duration = req.nextUrl.searchParams.get("durationMinutes");

  if (!serviceId || !from) {
    return NextResponse.json(
      { error: "serviceId, from required" },
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
  if (service.kind !== "sup" && !staffId) {
    return NextResponse.json(
      { error: "staffId required for wake service" },
      { status: 400 },
    );
  }

  const maxDays = daysRaw ? parseInt(daysRaw, 10) : 10;
  if (!Number.isFinite(maxDays) || maxDays < 1) {
    return NextResponse.json({ error: "days must be >= 1" }, { status: 400 });
  }

  const result = await findFirstFreePublicDate({
    serviceId,
    staffId,
    fromDate: from,
    maxDays,
    durationMinutes: duration ? parseInt(duration, 10) : undefined,
  });

  return NextResponse.json(result);
}
