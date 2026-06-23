import { NextResponse } from "next/server";
import {
  handleAdminError,
  requireAdminContext,
  resolveBranchFilter,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const ctx = await requireAdminContext();
    const url = new URL(req.url);
    const branchId = resolveBranchFilter(ctx, url.searchParams.get("branchId"));

    const services = await prisma.service.findMany({
      where: {
        ...(branchId ? { branchId } : { branch: { organizationId: ctx.organizationId } }),
      },
      orderBy: [{ branchId: "asc" }, { sortOrder: "asc" }],
      include: {
        branch: { select: { id: true, name: true } },
        staff: { include: { staff: { select: { id: true, name: true } } } },
      },
    });
    return NextResponse.json({ services });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
