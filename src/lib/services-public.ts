import { prisma } from "@/lib/db";
import { minPriceFromRules } from "@/lib/service-pricing";
import {
  DEFAULT_WIDGET_SETTINGS,
  parseWidgetSettings,
  type WidgetSettings,
} from "@/lib/widget-settings";

export async function getOrganizationBySlug(slug: string) {
  return prisma.organization.findUnique({
    where: { slug },
    include: {
      branches: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
}

export async function getPublicServices(branchId: string) {
  const services = await prisma.service.findMany({
    where: {
      branchId,
      isActive: true,
      isOnlineBookable: true,
    },
    orderBy: { sortOrder: "asc" },
    include: {
      priceRules: { orderBy: { sortOrder: "asc" } },
      staff: {
        include: {
          staff: {
            select: {
              id: true,
              name: true,
              kind: true,
              description: true,
              photoUrl: true,
              sortOrder: true,
              isActive: true,
              isVisible: true,
            },
          },
        },
      },
    },
  });

  return services.map((s) => {
    const staff = s.staff
      .map((x) => x.staff)
      .filter((st) => st.isActive && st.isVisible)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const priceRules = s.priceRules.map((r) => ({
      weekdays: r.weekdays,
      timeFrom: r.timeFrom,
      timeTo: r.timeTo,
      price: r.price,
    }));

    return {
      id: s.id,
      name: s.name,
      kind: s.kind,
      durationMinutes: s.durationMinutes,
      allowedDurations: s.allowedDurations,
      price: s.price,
      priceFrom: minPriceFromRules({ price: s.price, priceRules }),
      priceRules,
      bookableFrom: s.bookableFrom,
      bookableTo: s.bookableTo,
      weekdays: s.weekdays,
      maxBoards: s.kind === "sup" ? staff.length : undefined,
      staff: staff.map(({ id, name, kind, description, photoUrl }) => ({
        id,
        name,
        kind,
        description,
        photoUrl,
      })),
    };
  });
}

export async function getWidgetConfig(slug: string) {
  const org = await prisma.organization.findUnique({
    where: { slug },
    include: {
      branches: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!org) return null;

  const settings = parseWidgetSettings(org.widgetSettings);

  const branchesWithServices = await Promise.all(
    org.branches.map(async (b) => ({
      id: b.id,
      name: b.name,
      address: b.address,
      phone: b.phone,
      description: b.description,
      photoUrl: b.photoUrl,
      services: await getPublicServices(b.id),
    })),
  );

  return {
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      timezone: org.timezone,
      currency: org.currency,
    },
    branches: branchesWithServices.map(({ services: _s, ...b }) => b),
    servicesByBranch: Object.fromEntries(
      branchesWithServices.map((b) => [b.id, b.services]),
    ),
    settings,
    steps: ["branch", "activity", "staff", "datetime", "contacts"],
    texts: settings.texts,
    theme: settings.theme,
  };
}

export async function getWidgetSettingsForOrg(
  organizationId: string,
): Promise<WidgetSettings> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { widgetSettings: true },
  });
  return parseWidgetSettings(org?.widgetSettings);
}

export async function saveWidgetSettings(
  organizationId: string,
  settings: WidgetSettings,
): Promise<void> {
  await prisma.organization.update({
    where: { id: organizationId },
    data: { widgetSettings: JSON.stringify(settings) },
  });
}

export { DEFAULT_WIDGET_SETTINGS };
