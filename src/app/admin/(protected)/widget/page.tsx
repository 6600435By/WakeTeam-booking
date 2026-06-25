import { WidgetAdminPreview } from "@/components/admin/WidgetAdminPreview";

export default function WidgetPreviewPage() {
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
