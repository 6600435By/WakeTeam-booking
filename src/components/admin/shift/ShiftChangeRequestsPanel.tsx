"use client";

import { useCallback, useEffect, useState } from "react";
import {
  SHIFT_CHANGE_REQUEST_TYPES,
  shiftChangeRequestStatusClass,
  shiftChangeRequestStatusLabel,
} from "@/lib/payroll/shift-change-request";

type ChangeRequest = {
  id: string;
  date: string;
  requestType: string;
  requestTypeLabel: string;
  message: string;
  proposedStart: string | null;
  proposedEnd: string | null;
  status: string;
  reviewComment: string | null;
  memberName: string;
  workShiftId: string | null;
  createdAt: string;
};

type Reverse = { id: string; name: string };

type RequestFormState = {
  date: string;
  workShiftId: string;
  requestType: string;
  message: string;
  proposedStart: string;
  proposedEnd: string;
  proposedStaffId: string;
};

const btn =
  "rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50";
const btnPrimary = `${btn} bg-slate-900 text-white`;
const btnSecondary = `${btn} border border-slate-300 bg-white text-slate-800`;
const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

type Props = {
  canReview: boolean;
  canSubmit: boolean;
  branchId: string | null;
  initialForm?: Partial<RequestFormState> | null;
  onFormConsumed?: () => void;
};

export function ShiftChangeRequestsPanel({
  canReview,
  canSubmit,
  branchId,
  initialForm,
  onFormConsumed,
}: Props) {
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [reverses, setReverses] = useState<Reverse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<RequestFormState>({
    date: new Date().toISOString().slice(0, 10),
    workShiftId: "",
    requestType: "cancel",
    message: "",
    proposedStart: "10:00",
    proposedEnd: "22:00",
    proposedStaffId: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = branchId ? `?branchId=${branchId}` : "";
      const r = await fetch(`/api/admin/shift-change-requests${q}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Ошибка");
      setRequests(d.requests ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (branchId) {
      fetch(`/api/admin/shift-resources?branchId=${branchId}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.reverses) setReverses(d.reverses);
        });
    }
  }, [branchId]);

  useEffect(() => {
    if (initialForm) {
      setForm((f) => ({ ...f, ...initialForm }));
      setFormOpen(true);
      onFormConsumed?.();
    }
  }, [initialForm, onFormConsumed]);

  async function submitRequest() {
    if (!form.message.trim()) {
      setError("Укажите комментарий");
      return;
    }
    setError("");
    const r = await fetch("/api/admin/shift-change-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: form.date,
        workShiftId: form.workShiftId || undefined,
        requestType: form.requestType,
        message: form.message.trim(),
        proposedStart:
          form.requestType === "change_time" ? form.proposedStart : undefined,
        proposedEnd:
          form.requestType === "change_time" ? form.proposedEnd : undefined,
        proposedStaffId:
          form.requestType === "change_reverse" ? form.proposedStaffId : undefined,
      }),
    });
    const d = await r.json();
    if (!r.ok) {
      setError(d.error ?? "Ошибка");
      return;
    }
    setFormOpen(false);
    setForm({
      date: new Date().toISOString().slice(0, 10),
      workShiftId: "",
      requestType: "cancel",
      message: "",
      proposedStart: "10:00",
      proposedEnd: "22:00",
      proposedStaffId: "",
    });
    load();
  }

  async function review(id: string, action: "approve" | "reject") {
    const comment = window.prompt(
      action === "approve"
        ? "Комментарий (необязательно):"
        : "Причина отклонения:",
    );
    if (action === "reject" && comment === null) return;
    const r = await fetch(`/api/admin/shift-change-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reviewComment: comment || undefined }),
    });
    const d = await r.json();
    if (!r.ok) {
      setError(d.error ?? "Ошибка");
      return;
    }
    load();
  }

  return (
    <div className="space-y-3">
      {canSubmit && (
        <button type="button" className={btnPrimary} onClick={() => setFormOpen(true)}>
          + Новая заявка
        </button>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {loading && <p className="text-sm text-slate-500">Загрузка…</p>}

      {!loading && requests.length === 0 && (
        <p className="text-sm text-slate-500">
          {canReview ? "Нет ожидающих заявок" : "Заявок пока нет"}
        </p>
      )}

      <ul className="space-y-2">
        {requests.map((req) => (
          <li key={req.id} className="rounded-lg border border-slate-200 p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">
                  {req.requestTypeLabel} · {req.date}
                </p>
                {canReview && (
                  <p className="text-xs text-slate-500">{req.memberName}</p>
                )}
                <p className="mt-1 text-slate-700">{req.message}</p>
                {req.proposedStart && req.proposedEnd && (
                  <p className="text-xs text-slate-500">
                    Предложено: {req.proposedStart}–{req.proposedEnd}
                  </p>
                )}
                {req.reviewComment && (
                  <p className="mt-1 text-xs text-slate-500">
                    Ответ: {req.reviewComment}
                  </p>
                )}
              </div>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${shiftChangeRequestStatusClass(req.status)}`}
              >
                {shiftChangeRequestStatusLabel(req.status)}
              </span>
            </div>
            {canReview && req.status === "pending" && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={btnSecondary}
                  onClick={() => review(req.id, "reject")}
                >
                  Отклонить
                </button>
                <button
                  type="button"
                  className={btnPrimary}
                  onClick={() => review(req.id, "approve")}
                >
                  Одобрить
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {formOpen && canSubmit && (
        <div className="fixed inset-0 z-[70] flex items-end bg-black/40 p-4 admin-desktop:items-center admin-desktop:justify-center">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-4 space-y-3">
            <h3 className="font-semibold">Заявка на изменение графика</h3>
            <input
              type="date"
              className={inputClass}
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
            <select
              className={inputClass}
              value={form.requestType}
              onChange={(e) =>
                setForm((f) => ({ ...f, requestType: e.target.value }))
              }
            >
              {SHIFT_CHANGE_REQUEST_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            {form.requestType === "change_time" && (
              <div className="flex gap-2">
                <input
                  type="time"
                  className={inputClass}
                  value={form.proposedStart}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, proposedStart: e.target.value }))
                  }
                />
                <input
                  type="time"
                  className={inputClass}
                  value={form.proposedEnd}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, proposedEnd: e.target.value }))
                  }
                />
              </div>
            )}
            {form.requestType === "change_reverse" && (
              <select
                className={inputClass}
                value={form.proposedStaffId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, proposedStaffId: e.target.value }))
                }
              >
                <option value="">Новый реверс</option>
                {reverses.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            )}
            <textarea
              className={inputClass}
              rows={3}
              placeholder="Комментарий: причина, детали…"
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            />
            <div className="flex gap-2">
              <button
                type="button"
                className={`${btnSecondary} flex-1`}
                onClick={() => setFormOpen(false)}
              >
                Отмена
              </button>
              <button
                type="button"
                className={`${btnPrimary} flex-1`}
                onClick={submitRequest}
              >
                Отправить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
