export function AdminPageLoading({ label = "Загрузка…" }: { label?: string }) {
  return (
    <div className="animate-pulse space-y-4 p-4 sm:p-6" aria-busy="true" aria-live="polite">
      <p className="sr-only">{label}</p>
      <div className="h-8 w-48 rounded-md bg-slate-200" />
      <div className="h-64 rounded-xl bg-slate-100" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="h-24 rounded-lg bg-slate-100" />
        <div className="h-24 rounded-lg bg-slate-100" />
      </div>
    </div>
  );
}
