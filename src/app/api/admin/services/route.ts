import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertBranchAccess,
  assertCatalogAccess,
  handleAdminError,
  requireAdminContext,
  resolveBranchFilter,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import {
  defaultWakeLikePriceRules,
  isLegacyTariffServiceName,
} from "@/lib/admin/service-catalog";

const createSchema = z.object({
  branchId: z.string(),
  kind: z.enum(["wake", "sup", "custom"]),
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
    assertCatalogAccess(ctx);
    const body = createSchema.parse(await req.json());
    assertBranchAccess(ctx, body.branchId);

    const branch = await prisma.branch.findFirst({
      where: { id: body.branchId, organizationId: ctx.organizationId },
    });
    if (!branch) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const isCustom = body.kind === "custom";
    if (isCustom && !body.name?.trim()) {
      return NextResponse.json(
        { error: "Укажите название новой услуги" },
        { status: 400 },
      );
    }

    if (!isCustom) {
      const existingServices = await prisma.service.findMany({
        where: { branchId: body.branchId, kind: body.kind },
      });
      const existing = existingServices.find(
        (s) => !isLegacyTariffServiceName(s.name),
      );
      if (existing) {
        return NextResponse.json(
          { error: `Услуга «${existing.name}» уже есть в этом филиале` },
          { status: 409 },
        );
      }
    } else {
      const duplicate = await prisma.service.findFirst({
        where: {
          branchId: body.branchId,
          name: body.name!.trim(),
        },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: `Услуга «${body.name}» уже есть в этом филиале` },
          { status: 409 },
        );
      }
    }

    const maxSort = await prisma.service.aggregate({
      where: { branchId: body.branchId },
      _max: { sortOrder: true },
    });

    const isWake = body.kind === "wake";
    const isSup = body.kind === "sup";
    const basePrice = body.price ?? (isSup ? 20 : 15);

    let staffLinks: { staffId: string }[] = [];
    if (!isCustom) {
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
      staffLinks = staff.map((s) => ({ staffId: s.id }));
    }

    const priceRuleRows =
      isSup
        ? [
            {
              weekdays: "1,2,3,4,5",
              timeFrom: "09:00",
              timeTo: "16:00",
              price: basePrice,
              sortOrder: 1,
            },
            {
              weekdays: "1,2,3,4,5",
              timeFrom: "16:00",
              timeTo: "21:00",
              price: 25,
              sortOrder: 2,
            },
            {
              weekdays: "6,7",
              timeFrom: "09:00",
              timeTo: "21:00",
              price: 25,
              sortOrder: 3,
            },
          ]
        : defaultWakeLikePriceRules(basePrice);

    const serviceName =
      body.name?.trim() ?? (isWake ? "Вейкбординг" : isSup ? "Сапборд" : "Услуга");

    const service = await prisma.service.create({
      data: {
        branchId: body.branchId,
        kind: body.kind,
        name: serviceName,
        resourceLabel: serviceName,
        price: basePrice,
        durationMinutes: isSup ? 60 : 10,
        allowedDurations: isSup ? "60" : "10,30,60",
        bookableFrom: isSup ? "09:00" : "10:00",
        bookableTo: "21:00",
        weekdays: "1,2,3,4,5,6,7",
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
        ...(staffLinks.length > 0
          ? { staff: { create: staffLinks } }
          : {}),
        priceRules: {
          create: priceRuleRows,
        },
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
