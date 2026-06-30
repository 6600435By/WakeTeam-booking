import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertBranchAccess,
  assertBranchSettingsAccess,
  handleAdminError,
  requireAdminContext,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { ensureBranchRentalDefaults } from "@/lib/rental-pricing";

const itemSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  price: z.number().nonnegative(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const putSchema = z.object({
  items: z.array(itemSchema),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    assertBranchSettingsAccess(ctx);
    const { id } = await params;
    assertBranchAccess(ctx, id);

    await ensureBranchRentalDefaults(prisma, id);
    const items = await prisma.branchRentalItem.findMany({
      where: { branchId: id },
      orderBy: { sortOrder: "asc" },
    });
    return NextResponse.json({ items });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    assertBranchSettingsAccess(ctx);
    const { id } = await params;
    assertBranchAccess(ctx, id);
    const body = putSchema.parse(await req.json());

    const branch = await prisma.branch.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });
    if (!branch) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const existing = await prisma.branchRentalItem.findMany({
      where: { branchId: id },
    });
    const keepIds = new Set(
      body.items.map((i) => i.id).filter((x): x is string => Boolean(x)),
    );

    await prisma.$transaction(async (tx) => {
      for (const old of existing) {
        if (!keepIds.has(old.id)) {
          await tx.branchRentalItem.delete({ where: { id: old.id } });
        }
      }
      for (let i = 0; i < body.items.length; i++) {
        const row = body.items[i];
        if (row.id && existing.some((e) => e.id === row.id)) {
          await tx.branchRentalItem.update({
            where: { id: row.id },
            data: {
              name: row.name.trim(),
              price: row.price,
              sortOrder: row.sortOrder ?? i,
              isActive: row.isActive ?? true,
            },
          });
        } else {
          await tx.branchRentalItem.create({
            data: {
              branchId: id,
              name: row.name.trim(),
              price: row.price,
              sortOrder: row.sortOrder ?? i,
              isActive: row.isActive ?? true,
            },
          });
        }
      }
    });

    const items = await prisma.branchRentalItem.findMany({
      where: { branchId: id },
      orderBy: { sortOrder: "asc" },
    });
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    console.error(e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
