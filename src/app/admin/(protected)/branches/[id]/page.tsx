"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BranchEditor } from "@/components/admin/BranchEditor";

export default function BranchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [branchId, setBranchId] = useState<string | null>(null);

  useEffect(() => {
    void params.then((p) => setBranchId(p.id));
  }, [params]);

  if (!branchId) {
    return <p className="text-slate-500">Загрузка…</p>;
  }

  return (
    <div>
      <Link
        href="/admin/branches"
        className="text-sm text-sky-600 hover:underline"
      >
        ← Все филиалы
      </Link>
      <h1 className="mt-4 text-xl font-bold sm:text-2xl">Настройки филиала</h1>
      <p className="mt-1 text-sm text-slate-500">
        Изменения применяются в журнале записей и онлайн-виджете
      </p>
      <div className="mt-6">
        <BranchEditor branchId={branchId} />
      </div>
    </div>
  );
}
