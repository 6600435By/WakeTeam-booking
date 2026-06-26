import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertBranchAccess,
  handleAdminError,
  requireAdminContext,
  resolveBranchFilter,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";

const createSchema = z.object({
  branchId: z.string(),
  kind: z.enum(["wake", "sup"]),
  name: z.string().min(1).optional(),
  price: z.number().nonnegative().optional(),
});

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
        priceRules: { orderBy: { sortOrder: "asc" } },
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

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    const body = createSchema.parse(await req.json());
    assertBranchAccess(ctx, body.branchId);

    const branch = await prisma.branch.findFirst({
      where: { id: body.branchId, organizationId: ctx.organizationId },
    });
    if (!branch) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const existing = await prisma.service.findFirst({
      where: { branchId: body.branchId, kind: body.kind, isActive: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: `Услуга «${existing.name}» уже есть в этом филиале` },
        { status: 409 },
      );
    }

    const maxSort = await prisma.service.aggregate({
      where: { branchId: body.branchId },
      _max: { sortOrder: true },
    });

    const isWake = body.kind === "wake";
    const staffKind = isWake ? "revers" : "sup";
    const staff = await prisma.staff.findMany({
      where: {
        branchId: body.branchId,
        kind: staffKind,
        isActive: true,
        isVisible: true,
      },
      orderBy: { sortOrder: "asc" },
    });

    const service = await prisma.service.create({
      data: {
        branchId: body.branchId,
        kind: body.kind,
        name: body.name ?? (isWake ? "Вейкбординг" : "Сапборд"),
        price: body.price ?? (isWake ? 15 : 20),
        durationMinutes: isWake ? 10 : 60,
        allowedDurations: isWake ? "10,30,60" : "60",
        bookableFrom: isWake ? "10:00" : "09:00",
        bookableTo: isWake ? "21:00" : "21:00",
        weekdays: "1,2,3,4,5,6,7",
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
        staff: {
          create: staff.map((s) => ({ staffId: s.id })),
        },
        ...(isWake
          ? {
              priceRules: {
                create: [
                  {
                    weekdays: "1,2,3,4,5",
                    timeFrom: "10:00",
                    timeTo: "16:00",
                    price: body.price ?? 15,
                    sortOrder: 1,
                  },
                  {
                    weekdays: "1,2,3,4,5",
                    timeFrom: "16:00",
                    timeTo: "21:00",
                    price: 30,
                    sortOrder: 2,
                  },
                  {
                    weekdays: "6,7",
                    timeFrom: "09:00",
                    timeTo: "21:00",
                    price: 30,
                    sortOrder: 3,
                  },
                ],
              },
            }
          : {}),
      },
      include: {
        priceRules: { orderBy: { sortOrder: "asc" } },
        staff: { include: { staff: { select: { id: true, name: true } } } },
      },
    });

    return NextResponse.json({ ok: true, service });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    console.error("service create error:", e);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
