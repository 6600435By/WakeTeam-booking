import Link from "next/link";
import { redirect } from "next/navigation";
import { WidgetSettingsEditor } from "@/components/admin/WidgetSettingsEditor";
import { canManageWidget, getAdminContext } from "@/lib/admin-access";

export default async function WidgetSettingsPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/admin/login?from=/admin/widget/settings");
  if (!canManageWidget(ctx)) redirect("/admin/journal");

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Настройки виджета</h1>
          <p className="mt-1 text-sm text-slate-600">
            Цвета, подписи и поведение публичной формы записи
          </p>
        </div>
        <Link
          href="/admin/widget"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          ← К проверке виджета
        </Link>
      </div>
      <div className="mt-6">
        <WidgetSettingsEditor />
      </div>
    </div>
  );
}
