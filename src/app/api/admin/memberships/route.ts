import { NextRequest, NextResponse } from "next/server";
import { canViewMemberships, handleAdminError, requireAdminContext } from "@/lib/admin-access";
import {
  findMembershipsByCode,
  findMembershipsByPhone,
  searchMemberships,
} from "@/lib/memberships/by-phone";
import { prisma } from "@/lib/db";
import { toMembershipDto } from "@/lib/memberships/effective";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    const qRaw = req.nextUrl.searchParams.get("q");
    const phoneRaw = req.nextUrl.searchParams.get("phone");
    const codeRaw = req.nextUrl.searchParams.get("code");
    const includeId = req.nextUrl.searchParams.get("includeId");

    if (codeRaw?.trim()) {
      const found = await findMembershipsByCode(
        ctx.organizationId,
        codeRaw.trim(),
      );
      if (found.length === 0) {
        return NextResponse.json({ error: "Абонемент не найден" }, { status: 404 });
      }
      const membership = found[0];
      return NextResponse.json({
        memberships: found.map(toMembershipDto),
        membership: toMembershipDto(membership),
      });
    }

    if (!codeRaw?.trim() && !phoneRaw?.trim() && !canViewMemberships(ctx)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    let memberships;
    let hideEmptyForPhone = false;

    if (qRaw?.trim()) {
      memberships = await searchMemberships(ctx.organizationId, qRaw.trim());
    } else if (phoneRaw?.trim()) {
      memberships = await findMembershipsByPhone(
        ctx.organizationId,
        phoneRaw.trim(),
      );
      hideEmptyForPhone = true;
    } else {
      memberships = await prisma.membership.findMany({
        where: { organizationId: ctx.organizationId },
        orderBy: [{ saleDate: "desc" }, { syncedAt: "desc" }],
        take: 200,
      });
    }

    let dtos = memberships.map(toMembershipDto);
    if (hideEmptyForPhone) {
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
