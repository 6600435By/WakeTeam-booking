import { NextRequest, NextResponse } from "next/server";
import { handleAdminError, requireAdminContext } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { toMembershipDto } from "@/lib/memberships/effective";
import { normalizePhone } from "@/lib/slots/generateSlots";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    const phoneRaw = req.nextUrl.searchParams.get("phone");
    if (!phoneRaw?.trim()) {
      return NextResponse.json({ suggestion: null });
    }
    const phone = normalizePhone(phoneRaw.trim());
    const memberships = await prisma.membership.findMany({
      where: { organizationId: ctx.organizationId, phone },
      orderBy: [{ saleDate: "desc" }, { syncedAt: "desc" }],
    });
    const withEffective = memberships.map(toMembershipDto);
    const suggestion =
      withEffective.find((m) => m.effectiveRemainingMinutes > 0) ?? null;
    return NextResponse.json({ suggestion });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
