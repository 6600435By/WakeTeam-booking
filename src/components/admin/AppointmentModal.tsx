"use client";

import { useEffect, useMemo, useState } from "react";
import { APPOINTMENT_STATUS_OPTIONS, CANCEL_REASON_OPTIONS, type CancelReason } from "@/lib/appointment-status";
import {
  fromDatetimeLocalValue,
  todayDatetimeLocalValue,
  toDatetimeLocalValue,
} from "@/lib/time";

type Branch = { id: string; name: string };
type Service = {
  id: string;
  name: string;
  durationMinutes: number;
  allowedDurations: string;
  price: number;
  staff: { id: string; name: string }[];
};
type Staff = { id: string; name: string };
type MembershipOption = {
  id: string;
  externalCode: string;
  category: string | null;
  ownerName: string | null;
  effectiveRemainingMinutes: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  branches: Branch[];
  appointmentId?: string;
  initial?: {
    branchId?: string;
    serviceId?: string;
    staffId?: string;
    staffName?: string;
    startAt?: string;
    durationMinutes?: number;
    firstName?: string;
    lastName?: string;
    phone?: string;
    status?: string;
    comment?: string;
    membershipId?: string | null;
  };
};

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-sans text-sm text-slate-900";

export function AppointmentModal({
  open,
  onClose,
  onSaved,
  branches,
  appointmentId,
  initial,
}: Props) {
  const [branchId, setBranchId] = useState("");
  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [serviceId, setServiceId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [staffName, setStaffName] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState("booked");
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState<CancelReason | "">("");
  const [membershipId, setMembershipId] = useState<string>("");
  const [membershipOptions, setMembershipOptions] = useState<MembershipOption[]>([]);
  const [membershipsLoading, setMembershipsLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBranchId(initial?.branchId ?? branches[0]?.id ?? "");
    setServiceId(initial?.serviceId ?? "");
    setStaffId(initial?.staffId ?? "");
    setStaffName(initial?.staffName ?? "");
    if (initial?.startAt) {
      const local = toDatetimeLocalValue(initial.startAt);
      const [d, t] = local.split("T");
      setDate(d);
      setTime(t);
    } else {
      const now = todayDatetimeLocalValue();
      const [d, t] = now.split("T");
      setDate(d);
      setTime(t);
    }
    setDurationMinutes(initial?.durationMinutes ?? 30);
    setFirstName(initial?.firstName ?? "");
    setLastName(initial?.lastName ?? "");
    setPhone(initial?.phone ?? "");
    setStatus(initial?.status ?? "booked");
    setComment(initial?.comment ?? "");
    setError("");
    setDeleteOpen(false);
    setCancelReason("");
    setMembershipId(initial?.membershipId ?? "");
    setMembershipOptions([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when modal opens or record changes
  }, [
    open,
    appointmentId,
    initial?.branchId,
    initial?.serviceId,
    initial?.staffId,
    initial?.staffName,
    initial?.startAt,
    initial?.durationMinutes,
    initial?.firstName,
    initial?.lastName,
    initial?.phone,
    initial?.status,
    initial?.comment,
    initial?.membershipId,
    branches[0]?.id,
  ]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/admin/memberships/sync?ifStale=1", { method: "POST" }).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!branchId || !open) return;
    setServicesLoading(true);
    fetch(`/api/public/services?branchId=${branchId}`)
      .then((r) => r.json())
      .then((d) => setServices(d.services ?? []))
      .finally(() => setServicesLoading(false));
  }, [branchId, open]);

  useEffect(() => {
    if (!open) return;
    const trimmed = phone.replace(/\s/g, "");
    if (trimmed.length < 6) {
      setMembershipOptions([]);
      return;
    }
    const t = setTimeout(() => {
      setMembershipsLoading(true);
      const include =
        initial?.membershipId != null && initial.membershipId !== ""
          ? `&includeId=${encodeURIComponent(initial.membershipId)}`
          : "";
      Promise.all([
        fetch(
          `/api/admin/memberships?phone=${encodeURIComponent(phone)}${include}`,
        ).then((r) => r.json()),
        fetch(`/api/admin/memberships/suggest?phone=${encodeURIComponent(phone)}`).then(
          (r) => r.json(),
        ),
      ])
        .then(([listData, suggestData]) => {
          const list: MembershipOption[] = (listData.memberships ?? []).map(
            (m: MembershipOption & { id: string }) => ({
              id: m.id,
              externalCode: m.externalCode,
              category: m.category,
              ownerName: m.ownerName,
              effectiveRemainingMinutes: m.effectiveRemainingMinutes,
            }),
          );
          setMembershipOptions(list);
          if (!membershipId && suggestData.suggestion?.effectiveRemainingMinutes > 0) {
            setMembershipId(suggestData.suggestion.id);
          }
        })
        .finally(() => setMembershipsLoading(false));
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- phone drives lookup
  }, [open, phone, initial?.membershipId]);


  const staffOptions: Staff[] = useMemo(() => {
    const fromService =
      services.find((s) => s.id === serviceId)?.staff ?? [];
    if (staffId && !fromService.some((s) => s.id === staffId) && staffName) {
      return [{ id: staffId, name: staffName }, ...fromService];
    }
    return fromService;
  }, [services, serviceId, staffId, staffName]);

  const selectedMembership = membershipOptions.find((m) => m.id === membershipId);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!date || !time) {
      setError("Укажите дату и время");
      return;
    }
    setLoading(true);
    setError("");
    const isoStart = fromDatetimeLocalValue(`${date}T${time}`);
    try {
      const url = appointmentId
        ? `/api/admin/appointments/${appointmentId}`
        : "/api/admin/appointments";
      const method = appointmentId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId,
          staffId,
          startAt: isoStart,
          durationMinutes,
          firstName,
          lastName,
          phone,
          status,
          comment,
          membershipId: membershipId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!appointmentId || !cancelReason) {
      setError("Выберите причину удаления");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/appointments/${appointmentId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка удаления");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 font-sans sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-h-[90vh] sm:max-w-lg sm:rounded-xl sm:p-6">
        <h2 className="text-lg font-bold text-slate-900">
          {appointmentId ? "Редактировать запись" : "Новая запись"}
        </h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <select
            value={branchId}
            onChange={(e) => {
              setBranchId(e.target.value);
              setServiceId("");
              setStaffId("");
              setStaffName("");
            }}
            className={inputClass}
            required
          >
            <option value="">Филиал</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select
            value={serviceId}
            onChange={(e) => {
              setServiceId(e.target.value);
              setStaffId("");
              setStaffName("");
            }}
            className={inputClass}
            required
            disabled={servicesLoading}
          >
            <option value="">{servicesLoading ? "Загрузка…" : "Услуга"}</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={staffId}
            onChange={(e) => {
              setStaffId(e.target.value);
              const picked = staffOptions.find((s) => s.id === e.target.value);
              setStaffName(picked?.name ?? "");
            }}
            className={inputClass}
            required
            disabled={!serviceId || servicesLoading}
          >
            <option value="">Реверс / сапборд</option>
            {staffOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-slate-500">Дата</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Время</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className={inputClass}
                step={600}
                required
              />
            </div>
          </div>
          <input
            type="number"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10) || 10)}
            className={inputClass}
            min={10}
            step={10}
          />
          <input
            placeholder="Имя"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className={inputClass}
            required
          />
          <input
            placeholder="Фамилия"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className={inputClass}
          />
          <input
            placeholder="Телефон"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
            required
          />
          <div>
            <label className="mb-1 block text-xs text-slate-500">Абонемент</label>
            <select
              value={membershipId}
              onChange={(e) => setMembershipId(e.target.value)}
              className={inputClass}
              disabled={membershipsLoading || membershipOptions.length === 0}
            >
              <option value="">
                {membershipsLoading
                  ? "Абонементы…"
                  : membershipOptions.length === 0
                    ? "Нет абонементов по телефону"
                    : "Без абонемента"}
              </option>
              {membershipOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {[m.externalCode, m.category, m.ownerName]
                    .filter(Boolean)
                    .join(" · ")}{" "}
                  — {m.effectiveRemainingMinutes} мин
                </option>
              ))}
            </select>
            {selectedMembership && (
              <p className="mt-1 text-xs text-slate-600">
                Остаток:{" "}
                <span className="font-medium text-slate-900">
                  {selectedMembership.effectiveRemainingMinutes} мин
                </span>
              </p>
            )}
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={inputClass}
          >
            {APPOINTMENT_STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <textarea
            placeholder="Комментарий"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className={inputClass}
            rows={2}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-lime-600 py-2 text-sm font-medium text-white hover:bg-lime-700 disabled:opacity-50"
            >
              {loading ? "…" : "Сохранить"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
            >
              Закрыть
            </button>
          </div>
          {appointmentId && (
            <div className="border-t border-slate-200 pt-3">
              {!deleteOpen ? (
                <button
                  type="button"
                  onClick={() => setDeleteOpen(true)}
                  className="w-full rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  Удалить запись
                </button>
              ) : (
                <div className="space-y-2 rounded-lg border border-red-200 bg-red-50/50 p-3">
                  <p className="text-sm font-medium text-red-800">
                    Удалить запись из журнала?
                  </p>
                  <p className="text-xs text-red-700">
                    Слот освободится. Запись останется в истории со статусом «Удалена».
                  </p>
                  <label className="block text-xs text-slate-600">Причина удаления</label>
                  <select
                    value={cancelReason}
                    onChange={(e) =>
                      setCancelReason(e.target.value as CancelReason | "")
                    }
                    className={inputClass}
                    required
                  >
                    <option value="">Выберите причину…</option>
                    {CANCEL_REASON_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={loading || !cancelReason}
                      onClick={handleDelete}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {loading ? "…" : "Подтвердить удаление"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteOpen(false);
                        setCancelReason("");
                      }}
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
                    >
                      Назад
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
