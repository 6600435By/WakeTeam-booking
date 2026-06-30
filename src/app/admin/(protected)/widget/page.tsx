import { redirect } from "next/navigation";
import { WidgetAdminPreview } from "@/components/admin/WidgetAdminPreview";
import { canManageWidget, getAdminContext } from "@/lib/admin-access";

export default async function WidgetPreviewPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/admin/login?from=/admin/widget");
  if (!canManageWidget(ctx)) redirect("/admin/journal");

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Виджет записи</h1>
      <p className="mt-1 text-sm text-slate-600">
        Проверьте форму перед публикацией на сайте
      </p>
      <div className="mt-6">
        <WidgetAdminPreview />
      </div>
    </div>
  );
}
