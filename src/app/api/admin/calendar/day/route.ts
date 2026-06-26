import { NextRequest, NextResponse } from "next/server";
import {
  handleAdminError,
  requireAdminContext,
} from "@/lib/admin-access";
import { queryCalendarDay } from "@/lib/admin/calendar-day-data";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    const date = req.nextUrl.searchParams.get("date");
    if (!date) {
      return NextResponse.json({ error: "date required" }, { status: 400 });
    }

    const data = await queryCalendarDay(
      ctx,
      date,
      req.nextUrl.searchParams.get("branchId"),
    );

    return NextResponse.json(data);
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
