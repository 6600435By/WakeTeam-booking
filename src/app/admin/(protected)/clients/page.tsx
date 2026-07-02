import { redirect } from "next/navigation";
import { canViewClients, getAdminContext } from "@/lib/admin-access";
import { prisma } from "@/lib/db";

export default async function ClientsPage() {
  const ctx = await getAdminContext();
  if (!ctx) {
    redirect("/admin/login?from=/admin/clients");
  }
  if (!canViewClients(ctx)) {
    return <p className="mt-4 text-red-600">Нет доступа</p>;
  }

  const clients = await prisma.client.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      _count: { select: { appointments: true } },
    },
  });

  return (
    <div>
      <h1 className="text-xl font-bold sm:text-2xl">Клиенты</h1>
      {clients.length === 0 ? (
        <p className="mt-4 text-slate-500">Нет клиентов</p>
      ) : (
        <>
          <div className="mt-4 space-y-2 md:hidden">
            {clients.map((c) => (
              <div
                key={c.id}
                className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm"
              >
                <p className="font-semibold text-slate-900">{c.phone}</p>
                <p className="mt-0.5 text-sm text-slate-600">
                  {[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}
                </p>
                {c.email && (
                  <p className="mt-0.5 truncate text-sm text-slate-500">{c.email}</p>
                )}
                <p className="mt-1 text-xs text-slate-400">
                  Записей: {c._count.appointments} ·{" "}
                  {c.createdAt.toLocaleDateString("ru-RU")}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2">Телефон</th>
                  <th>Имя</th>
                  <th>Email</th>
                  <th>Записей</th>
                  <th>Создан</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100">
                    <td className="py-2">{c.phone}</td>
                    <td>
                      {[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td>{c.email ?? "—"}</td>
                    <td>{c._count.appointments}</td>
                    <td>{c.createdAt.toLocaleDateString("ru-RU")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
