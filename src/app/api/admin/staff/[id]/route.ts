import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertStaffAccess,
  handleAdminError,
  requireAdminContext,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  photoUrl: z.string().nullable().optional(),
  kind: z.enum(["revers", "sup"]).optional(),
  isActive: z.boolean().optional(),
  isVisible: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    const { id } = await params;
    await assertStaffAccess(ctx, id);
    const body = patchSchema.parse(await req.json());

    const staff = await prisma.staff.update({
      where: { id },
      data: {
        ...body,
        description: body.description === null ? null : body.description,
        photoUrl: body.photoUrl === null ? null : body.photoUrl,
      },
      include: { schedules: true },
    });

    return NextResponse.json({ ok: true, staff });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
