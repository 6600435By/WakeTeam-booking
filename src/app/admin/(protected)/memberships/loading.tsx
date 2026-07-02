export default function MembershipsLoading() {
  return (
    <div className="animate-pulse space-y-4 p-4 sm:p-6" aria-busy="true" aria-live="polite">
      <p className="sr-only">Загрузка абонементов…</p>
      <div className="h-8 w-40 rounded-md bg-slate-200" />
      <div className="h-10 w-full max-w-md rounded-md bg-slate-100" />
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-10 rounded-md bg-slate-100" />
        ))}
      </div>
    </div>
  );
}
