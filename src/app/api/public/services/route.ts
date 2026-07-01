import { NextRequest, NextResponse } from "next/server";
import { enforcePublicReadLimit } from "@/lib/public-api-guard";
import { getPublicServices } from "@/lib/services-public";

export async function GET(req: NextRequest) {
  const limited = enforcePublicReadLimit(req);
  if (limited) return limited;

  const branchId = req.nextUrl.searchParams.get("branchId");
  if (!branchId) {
    return NextResponse.json({ error: "branchId required" }, { status: 400 });
  }
  const services = await getPublicServices(branchId);
  return NextResponse.json({ services });
}
