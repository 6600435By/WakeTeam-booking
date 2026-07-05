"use client";

import { useEffect, useState } from "react";
import type { BackupListItem, BackupStorageWarning, RestoreStatus } from "@/lib/backups/types";
import { RestoreChecklist, RestoreProgress } from "./RestoreChecklist";

type Props = {
  backup: BackupListItem;
  warning: BackupStorageWarning | null;
  onClose: () => void;
  onDone: () => void;
};

const btnPrimary =
  "min-h-10 rounded-lg bg-lime-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50";
const btnSecondary =
  "min-h-10 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium";

export function RestoreBackupWizard({ backup, warning, onClose, onDone }: Props) {
  const [step, setStep] = useState(1);
  const [restoreDb, setRestoreDb] = useState(Boolean(backup.hasDb));
  const [restoreFiles, setRestoreFiles] = useState(Boolean(backup.hasFiles));
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [status, setStatus] = useState<RestoreStatus | null>(null);

  const confirmDate = backup.confirmDate;

  const filesBackupId = backup.filesManifestId;

  useEffect(() => {
    if (!restoreId || status?.status !== "running") return;
    const timer = setInterval(() => {
      void fetch(`/api/admin/backups/restore/${restoreId}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.status) setStatus(d.status as RestoreStatus);
        })
        .catch(() => undefined);
    }, 5000);
    return () => clearInterval(timer);
  }, [restoreId, status?.status]);

  async function startRestore() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`/api/admin/backups/${backup.id}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restoreDb,
          restoreFiles,
          confirmText,
          ...(filesBackupId ? { filesBackupId } : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Ошибка");
      setRestoreId(d.restoreId);
      setStep(4);
      const statusRes = await fetch(`/api/admin/backups/restore/${d.restoreId}`);
      const statusData = await statusRes.json();
      if (statusData.status) setStatus(statusData.status as RestoreStatus);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">Восстановление бэкапа</h2>
        <p className="mt-1 text-sm text-slate-500">{backup.label}</p>

        {step === 1 && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-slate-700">Что восстановить?</p>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={restoreDb}
                disabled={!backup.hasDb}
                onChange={(e) => setRestoreDb(e.target.checked)}
              />
              <span>
                <strong>База данных</strong> — записи, клиенты, календарь сотрудников, смены,
                абонементы.
                {!backup.hasDb && " (нет в этом бэкапе)"}
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={restoreFiles}
                disabled={!backup.hasFiles}
                onChange={(e) => setRestoreFiles(e.target.checked)}
              />
              <span>
                <strong>Фото</strong> — картинки филиалов и ресурсов в виджете.
                {!backup.hasFiles && " (нет в этом бэкапе)"}
              </span>
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className={btnSecondary} onClick={onClose}>
                Отмена
              </button>
              <button
                type="button"
                className={btnPrimary}
                disabled={!restoreDb && !restoreFiles}
                onClick={() => setStep(2)}
              >
                Далее
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Восстановление займёт 3–10 минут. Попросите сотрудников не создавать записи в это
              время. Данные после даты бэкапа ({confirmDate}) будут заменены.
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-700">
                Введите <strong>{confirmDate}</strong> или слово <strong>ВОССТАНОВИТЬ</strong>
              </span>
              <input
                className="min-h-10 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
              />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className={btnSecondary} onClick={() => setStep(1)}>
                Назад
              </button>
              <button
                type="button"
                className={btnPrimary}
                disabled={loading || !confirmText.trim()}
                onClick={() => void startRestore()}
              >
                {loading ? "Запуск…" : "Восстановить"}
              </button>
            </div>
          </div>
        )}

        {step === 4 && status && (
          <div className="mt-4 space-y-4">
            <RestoreProgress status={status} />
            {status.status === "success" && (
              <>
                <RestoreChecklist warning={warning} />
                <div className="flex justify-end">
                  <button type="button" className={btnPrimary} onClick={onDone}>
                    Готово
                  </button>
                </div>
              </>
            )}
            {status.status === "failed" && (
              <div className="flex justify-end gap-2">
                <button type="button" className={btnSecondary} onClick={onClose}>
                  Закрыть
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
