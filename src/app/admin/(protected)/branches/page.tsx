import Link from "next/link";
import { redirect } from "next/navigation";
import { branchListWhere, canManageBranchSettings, getAdminContext } from "@/lib/admin-access";
import { prisma } from "@/lib/db";

export default async function BranchesPage() {
  const ctx = await getAdminContext();
  if (!ctx) {
    redirect("/admin/login?from=/admin/branches");
  }
  if (!canManageBranchSettings(ctx)) {
    redirect("/admin/journal");
  }

  const branches = await prisma.branch.findMany({
    where: branchListWhere(ctx),
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { staff: true, services: true } } },
  });

  return (
    <div>
      <h1 className="text-xl font-bold sm:text-2xl">Филиалы</h1>
      <p className="mt-1 text-sm text-slate-500">
        Услуги, ресурсы и расписание настраиваются внутри каждого филиала
      </p>
      {branches.length === 0 ? (
        <p className="mt-4 text-slate-500">Филиалы не найдены</p>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {branches.map((b) => (
            <Link
              key={b.id}
              href={`/admin/branches/${b.id}`}
              className="block rounded-lg bg-white p-4 shadow ring-1 ring-slate-200 transition hover:ring-lime-300"
            >
              {b.photoUrl && (
                <div
                  className="mb-3 w-full overflow-hidden rounded-lg"
                  style={{ aspectRatio: "20 / 3" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={b.photoUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
              <h2 className="font-semibold text-slate-900">{b.name}</h2>
              {b.address && (
                <p className="mt-1 text-sm text-slate-600">{b.address}</p>
              )}
              {b.description && (
                <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                  {b.description}
                </p>
              )}
              <p className="mt-2 text-xs text-slate-400">
                Ресурсов: {b._count.staff} · Услуг: {b._count.services}
              </p>
              <p className="mt-2 text-sm font-medium text-lime-700">
                Редактировать →
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
