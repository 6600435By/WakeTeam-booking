"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  BackupListItem,
  BackupStorageWarning,
  RestoreStatus,
} from "@/lib/backups/types";
import { formatBytes, RestoreProgress } from "./RestoreChecklist";
import { RestoreBackupWizard } from "./RestoreBackupWizard";

const btnSecondary =
  "min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium";

export function BackupsPage() {
  const [items, setItems] = useState<BackupListItem[]>([]);
  const [warning, setWarning] = useState<BackupStorageWarning | null>(null);
  const [seasonActive, setSeasonActive] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [runningRestore, setRunningRestore] = useState<RestoreStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [restoreTarget, setRestoreTarget] = useState<BackupListItem | null>(null);
  const [helpOpen, setHelpOpen] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/admin/backups");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Ошибка загрузки");
      setItems(d.items ?? []);
      setWarning(d.warning ?? null);
      setSeasonActive(Boolean(d.seasonActive));
      setConfigured(Boolean(d.configured));
      setMessage(d.message ?? null);
      setRunningRestore(d.runningRestore ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function downloadBackup(id: string, part: "db" | "files") {
    const r = await fetch(`/api/admin/backups/${id}/download?part=${part}`);
    const d = await r.json();
    if (!r.ok) throw new Error(d.error ?? "Ошибка скачивания");
    window.open(d.url, "_blank");
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Бэкапы</h1>
        <p className="mt-1 text-sm text-slate-500">
          Полные снимки базы и фото в сезоне (хранятся 5 ночных копий), архив сезона на зиму
        </p>
      </div>

      {warning?.message && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {warning.message}
        </div>
      )}

      {!seasonActive && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Межсезонье: новые бэкапы не создаются. Доступен архив последнего сезона.
        </div>
      )}

      {runningRestore && <RestoreProgress status={runningRestore} />}

      <div className="rounded-lg border border-slate-200">
        <button
          type="button"
          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-slate-800"
          onClick={() => setHelpOpen((v) => !v)}
        >
          Как восстановить
          <span>{helpOpen ? "▲" : "▼"}</span>
        </button>
        {helpOpen && (
          <div className="border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
            <ul className="list-inside list-disc space-y-1">
              <li>
                Каждый бэкап — полная копия всей базы на момент ночи, а не «данные за один
                день»
              </li>
              <li>
                Хранятся 5 последних ночных снимков — это глубина отката, а не объём данных в
                каждой копии
              </li>
              <li>
                Ошибка сегодня или вчера — выберите бэкап дня до ошибки: восстановится вся база
                целиком
              </li>
              <li>Зимой — используйте архив сезона</li>
              <li>Пропали только фото — восстановите без галочки «База данных»</li>
            </ul>
          </div>
        )}
      </div>

      {!configured && message && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {message}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-500">Загрузка…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">Бэкапов пока нет.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">Дата</th>
                <th className="px-3 py-2 font-medium">БД</th>
                <th className="px-3 py-2 font-medium">Фото</th>
                <th className="px-3 py-2 font-medium">Метка</th>
                <th className="px-3 py-2 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-900">{item.label}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {item.db ? formatBytes(item.db.sizeBytes) : "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {item.files ? formatBytes(item.files.sizeBytes) : "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {item.seasonArchive ? "Архив сезона" : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      {item.hasDb && (
                        <button
                          type="button"
                          className={btnSecondary}
                          onClick={() =>
                            void downloadBackup(item.dbManifestId ?? item.id, "db").catch((e) =>
                              setError(String(e)),
                            )
                          }
                        >
                          Скачать БД
                        </button>
                      )}
                      {item.hasFiles && (
                        <button
                          type="button"
                          className={btnSecondary}
                          onClick={() =>
                            void downloadBackup(item.filesManifestId ?? item.id, "files").catch(
                              (e) => setError(String(e)),
                            )
                          }
                        >
                          Скачать фото
                        </button>
                      )}
                      <button
                        type="button"
                        className="min-h-10 rounded-lg bg-lime-600 px-3 py-2 text-sm font-medium text-white"
                        onClick={() => setRestoreTarget(item)}
                      >
                        Восстановить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {restoreTarget && (
        <RestoreBackupWizard
          backup={restoreTarget}
          warning={warning}
          onClose={() => setRestoreTarget(null)}
          onDone={() => {
            setRestoreTarget(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
