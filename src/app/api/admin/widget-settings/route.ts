import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertSuperAdmin,
  handleAdminError,
  requireAdminContext,
} from "@/lib/admin-access";
import {
  DEFAULT_WIDGET_SETTINGS,
  type WidgetSettings,
} from "@/lib/widget-settings";
import {
  getWidgetSettingsForOrg,
  saveWidgetSettings,
} from "@/lib/services-public";

const settingsSchema = z.object({
  theme: z.object({
    primaryColor: z.string(),
    accentColor: z.string(),
    buttonBg: z.string(),
    buttonText: z.string(),
    pageBackground: z.string(),
    cardBackground: z.string(),
    stepActiveBg: z.string(),
    stepInactiveBg: z.string(),
  }),
  texts: z.object({
    title: z.string(),
    subtitle: z.string(),
    submitButton: z.string(),
    stepLabels: z.array(z.string()),
    wakeLabel: z.string(),
    supLabel: z.string(),
    emptySlotsHint: z.string(),
    callAdminLabel: z.string(),
    callAdminPhone: z.string(),
    successTitle: z.string(),
    successMessage: z.string(),
    successCancelReminder: z.string(),
  }),
  behavior: z.object({
    hideBranchStep: z.boolean(),
    showTariffsExpandable: z.boolean(),
  }),
});

export async function GET() {
  try {
    const ctx = await requireAdminContext();
    assertSuperAdmin(ctx);
    const settings = await getWidgetSettingsForOrg(ctx.organizationId);
    const org = await import("@/lib/db").then((m) =>
      m.prisma.organization.findUnique({
        where: { id: ctx.organizationId },
        select: { slug: true },
      }),
    );
    return NextResponse.json({
      settings,
      slug: org?.slug ?? "waketeam",
      defaults: DEFAULT_WIDGET_SETTINGS,
    });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    assertSuperAdmin(ctx);
    const body = settingsSchema.parse(await req.json()) as WidgetSettings;
    await saveWidgetSettings(ctx.organizationId, body);
    return NextResponse.json({ ok: true, settings: body });
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
