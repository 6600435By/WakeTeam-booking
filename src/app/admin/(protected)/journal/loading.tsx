export default function JournalLoading() {
  return (
    <div className="animate-pulse p-3 sm:p-4" aria-busy="true" aria-live="polite">
      <p className="sr-only">Загрузка журнала…</p>
      <div className="mb-3 flex gap-2">
        <div className="h-9 w-32 rounded-md bg-slate-200" />
        <div className="h-9 w-24 rounded-md bg-slate-200" />
        <div className="h-9 flex-1 rounded-md bg-slate-100" />
      </div>
      <div className="h-[70vh] rounded-xl border border-slate-200 bg-slate-50" />
    </div>
  );
}
