import { NextRequest, NextResponse } from "next/server";
import { handleAdminError, requireAdminContext } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { toMembershipDto } from "@/lib/memberships/effective";
import { normalizePhone } from "@/lib/slots/generateSlots";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    const phoneRaw = req.nextUrl.searchParams.get("phone");
    const includeId = req.nextUrl.searchParams.get("includeId");
    const where = { organizationId: ctx.organizationId } as { organizationId: string; phone?: string };
    if (phoneRaw?.trim()) {
      where.phone = normalizePhone(phoneRaw.trim());
    }
    const memberships = await prisma.membership.findMany({
      where,
      orderBy: [{ saleDate: "desc" }, { syncedAt: "desc" }],
      take: phoneRaw?.trim() ? undefined : 200,
    });
    let dtos = memberships.map(toMembershipDto);
    if (phoneRaw?.trim()) {
      dtos = dtos.filter((m) => m.effectiveRemainingMinutes > 0);
    }
    if (includeId && !dtos.some((m) => m.id === includeId)) {
      const extra = await prisma.membership.findFirst({
        where: { id: includeId, organizationId: ctx.organizationId },
      });
      if (extra) dtos = [toMembershipDto(extra), ...dtos];
    }
    return NextResponse.json({
      memberships: dtos,
    });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
