import { NextRequest, NextResponse } from "next/server";
import { getPublicServices } from "@/lib/services-public";

export async function GET(req: NextRequest) {
  const branchId = req.nextUrl.searchParams.get("branchId");
  if (!branchId) {
    return NextResponse.json({ error: "branchId required" }, { status: 400 });
  }
  const services = await getPublicServices(branchId);
  return NextResponse.json({ services });
}
