import { NextRequest, NextResponse } from "next/server";
import {
  assertBranchAccess,
  handleAdminError,
  requireAdminContext,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    const { id } = await params;
    assertBranchAccess(ctx, id);

    const branch = await prisma.branch.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: {
        staff: {
          orderBy: { sortOrder: "asc" },
          include: { schedules: true },
        },
        services: {
          orderBy: { sortOrder: "asc" },
          include: {
            priceRules: { orderBy: { sortOrder: "asc" } },
            staff: { include: { staff: { select: { id: true, name: true } } } },
          },
        },
      },
    });

    if (!branch) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ branch });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
