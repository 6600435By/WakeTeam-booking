import { NextResponse } from "next/server";
import { canViewClients, handleAdminError, requireAdminContext, resolveBranchFilter } from "@/lib/admin-access";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const ctx = await requireAdminContext();
    if (!canViewClients(ctx)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
    const url = new URL(req.url);
    const branchId = resolveBranchFilter(ctx, url.searchParams.get("branchId"));

    const clients = await prisma.client.findMany({
      where: {
        organizationId: ctx.organizationId,
        ...(branchId
          ? {
              appointments: {
                some: { branchId },
              },
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        _count: { select: { appointments: true } },
      },
    });
    return NextResponse.json({ clients });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
