"use client";

import Link from "next/link";
import type { BackupListItem, BackupStorageWarning, RestoreStatus } from "@/lib/backups/types";

type Props = {
  warning: BackupStorageWarning | null;
};

export function RestoreChecklist({ warning }: Props) {
  return (
    <div className="space-y-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
      <p className="font-medium">Восстановление завершено. Проверьте:</p>
      <ul className="list-inside list-disc space-y-1">
        <li>
          <Link href="/admin/journal" className="underline">
            Журнал записей
          </Link>
        </li>
        <li>
          <Link href="/book/waketeam" className="underline" target="_blank">
            Виджет записи
          </Link>
        </li>
        <li>
          <Link href="/admin/branches" className="underline">
            Фото филиалов
          </Link>
        </li>
        <li>
          <Link href="/admin/memberships" className="underline">
            Синхронизация абонементов
          </Link>{" "}
          (Google Sheets)
        </li>
      </ul>
      {warning?.message && (
        <p className="text-amber-800">{warning.message}</p>
      )}
    </div>
  );
}

export function RestoreProgress({ status }: { status: RestoreStatus }) {
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
      <p className="font-medium text-slate-900">
        {status.status === "running" && "Идёт восстановление…"}
        {status.status === "success" && "Готово"}
        {status.status === "failed" && "Ошибка восстановления"}
      </p>
      <ul className="space-y-1">
        {status.steps.map((step) => (
          <li key={step.name} className="flex items-center gap-2 text-slate-700">
            <span>
              {step.status === "done" && "✓"}
              {step.status === "running" && "⏳"}
              {step.status === "pending" && "○"}
              {step.status === "failed" && "✗"}
            </span>
            {step.label}
          </li>
        ))}
      </ul>
      {status.error && <p className="text-red-700">{status.error}</p>}
      {status.githubRunUrl && (
        <a
          href={status.githubRunUrl}
          target="_blank"
          rel="noreferrer"
          className="text-slate-600 underline"
        >
          Лог выполнения
        </a>
      )}
    </div>
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type { BackupListItem };
