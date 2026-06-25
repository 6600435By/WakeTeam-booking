import { NextRequest, NextResponse } from "next/server";
import { handleAdminError, requireAdminContext } from "@/lib/admin-access";
import { findMembershipsByPhone } from "@/lib/memberships/by-phone";
import { toMembershipDto } from "@/lib/memberships/effective";
import { isSearchablePhone } from "@/lib/phone";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    const phoneRaw = req.nextUrl.searchParams.get("phone");
    if (!phoneRaw?.trim() || !isSearchablePhone(phoneRaw.trim())) {
      return NextResponse.json({ suggestion: null });
    }

    const memberships = await findMembershipsByPhone(
      ctx.organizationId,
      phoneRaw.trim(),
    );
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
