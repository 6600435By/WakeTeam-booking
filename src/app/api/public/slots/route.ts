import { NextRequest, NextResponse } from "next/server";
import { getDaySlots } from "@/lib/slots/generateSlots";

export async function GET(req: NextRequest) {
  const serviceId = req.nextUrl.searchParams.get("serviceId");
  const staffId = req.nextUrl.searchParams.get("staffId");
  const date = req.nextUrl.searchParams.get("date");
  const duration = req.nextUrl.searchParams.get("durationMinutes");

  if (!serviceId || !staffId || !date) {
    return NextResponse.json(
      { error: "serviceId, staffId, date required" },
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
