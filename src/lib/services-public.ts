import { prisma } from "@/lib/db";

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
      staff: {
        include: {
          staff: {
            select: { id: true, name: true, kind: true, sortOrder: true, isActive: true, isVisible: true },
          },
        },
      },
    },
  });

  return services.map((s) => ({
    id: s.id,
    name: s.name,
    durationMinutes: s.durationMinutes,
    allowedDurations: s.allowedDurations,
    price: s.price,
    bookableFrom: s.bookableFrom,
    bookableTo: s.bookableTo,
    weekdays: s.weekdays,
    staff: s.staff
      .map((x) => x.staff)
      .filter((st) => st.isActive && st.isVisible)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(({ id, name, kind }) => ({ id, name, kind })),
  }));
}

export async function getWidgetConfig(slug: string) {
  const org = await getOrganizationBySlug(slug);
  if (!org) return null;

  return {
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      timezone: org.timezone,
      currency: org.currency,
    },
    branches: org.branches.map((b) => ({
      id: b.id,
      name: b.name,
      address: b.address,
      phone: b.phone,
      description: b.description,
    })),
    steps: ["branch", "service", "staff", "datetime", "contacts"],
    texts: {
      title: "Онлайн-запись",
      submitButton: "Записаться",
    },
    theme: {
      primaryColor: "#c0c100",
      accentColor: "#fcff00",
    },
  };
}
