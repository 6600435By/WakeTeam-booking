import Link from "next/link";
import { ScheduleEditor } from "@/components/admin/ScheduleEditor";

export default async function StaffSchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div>
      <Link href="/admin/journal" className="text-sm text-sky-600 hover:underline">
        ← Журнал
      </Link>
      <h1 className="mt-4 text-xl font-bold sm:text-2xl">График работы</h1>
      <div className="mt-6 max-w-xl">
        <ScheduleEditor staffId={id} />
      </div>
    </div>
  );
}
