"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppointmentModal } from "./AppointmentModal";
import { JournalGrid } from "./JournalGrid";
import { StatusBadge, StatusLegend } from "./StatusBadge";
import { cancelReasonLabel, JOURNAL_HIDDEN_STATUSES } from "@/lib/appointment-status";
import { periodToday, periodWeek } from "@/lib/date-ranges";
import { formatDateKey, formatTimeMinsk, weekdayMinsk } from "@/lib/time";

type StaffRow = {
  id: string;
  name: string;
  branchId: string;
  schedules: { weekday: number; timeFrom: string; timeTo: string; isWorking: boolean }[];
};

type Appointment = {
  id: string;
  publicNumber: number;
  startAt: string;
  endAt: string;
  status: string;
  price: number;
  durationMinutes: number;
  comment: string | null;
  membershipId?: string | null;
  cancelReason?: string | null;
  branchId: string;
  client: { firstName: string | null; lastName: string | null; phone: string };
  service: { id: string; name: string };
  staff: { id: string; name: string };
};

type Branch = { id: string; name: string };

type ModalInitial = {
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

function todayStr() {
  return formatDateKey(new Date());
}

function formatDateTitle(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "long",
  });
}

function shiftDateStr(dateStr: string, days: number) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return formatDateKey(d);
}

function isHiddenFromJournal(status: string) {
  return (JOURNAL_HIDDEN_STATUSES as readonly string[]).includes(status);
}

export function JournalDay() {
  const [date, setDate] = useState(todayStr());
  const [branchId, setBranchId] = useState("");
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [listRecords, setListRecords] = useState<Appointment[]>([]);
  const [listFrom, setListFrom] = useState(() => periodToday().from);
  const [listTo, setListTo] = useState(() => periodToday().to);
  const [listLoading, setListLoading] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editAppt, setEditAppt] = useState<Appointment | null>(null);
  const [modalInitial, setModalInitial] = useState<ModalInitial>({});
  const [isSuperAdmin, setIsSuperAdmin] = useState(true);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!silent) setLoading(true);
    setError("");
    const q = new URLSearchParams({ date });
    if (branchId) q.set("branchId", branchId);

    try {
      const res = await fetch(`/api/admin/calendar/day?${q}`);
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "Не удалось загрузить журнал");
        if (!silent) {
          setStaff([]);
          setAppointments([]);
        }
        return;
      }

      setStaff(d.staff ?? []);
      setAppointments(d.appointments ?? []);
      setBranches(d.branches ?? []);

      if (d.admin) {
        setIsSuperAdmin(d.admin.isSuperAdmin);
        if (!d.admin.isSuperAdmin && d.admin.branchId) {
          setBranchId(d.admin.branchId);
        } else if (!branchId && d.branches?.[0]?.id) {
          setBranchId(d.branches[0].id);
        }
      } else if (!branchId && d.branches?.[0]?.id) {
        setBranchId(d.branches[0].id);
      }
    } catch {
      setError("Ошибка сети при загрузке журнала");
      if (!silent) {
        setStaff([]);
        setAppointments([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [date, branchId]);

  const loadList = useCallback(async () => {
    if (listFrom > listTo) return;
    setListLoading(true);
    const q = new URLSearchParams({ from: listFrom, to: listTo });
    if (branchId) q.set("branchId", branchId);
    try {
      const res = await fetch(`/api/admin/appointments?${q}`);
      const d = await res.json();
      if (res.ok) {
        setListRecords(d.appointments ?? []);
      }
    } catch {
      setListRecords([]);
    } finally {
      setListLoading(false);
    }
  }, [listFrom, listTo, branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  function refreshAll() {
    void load();
    void loadList();
  }

  const wd = weekdayMinsk(date);

  const sortedAppointments = useMemo(
    () =>
      [...appointments].sort(
        (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
      ),
    [appointments],
  );

  function openNew(initial: ModalInitial = {}) {
    setEditAppt(null);
    setModalInitial({
      branchId: branchId || branches[0]?.id,
      ...initial,
    });
    setModalOpen(true);
  }

  function openEdit(appt: Appointment) {
    setEditAppt(appt);
    setModalInitial({});
    setModalOpen(true);
  }

  const modalProps: ModalInitial = editAppt
    ? {
        branchId: editAppt.branchId,
        serviceId: editAppt.service.id,
        staffId: editAppt.staff.id,
        staffName: editAppt.staff.name,
        startAt: editAppt.startAt,
        durationMinutes: editAppt.durationMinutes,
        firstName: editAppt.client.firstName ?? "",
        lastName: editAppt.client.lastName ?? "",
        phone: editAppt.client.phone,
        status: editAppt.status,
        comment: editAppt.comment ?? "",
        membershipId: editAppt.membershipId ?? null,
      }
    : modalInitial;

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Журнал записей</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setDate((d) => shiftDateStr(d, -1))}
              className="min-h-[44px] rounded-lg border border-slate-300 px-3 py-2 text-slate-600 hover:bg-slate-50"
              aria-label="Предыдущий день"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setDate(todayStr())}
              className="min-h-[44px] rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
            >
              Сегодня
            </button>
            <button
              type="button"
              onClick={() => setDate((d) => shiftDateStr(d, 1))}
              className="min-h-[44px] rounded-lg border border-slate-300 px-3 py-2 text-slate-600 hover:bg-slate-50"
              aria-label="Следующий день"
            >
              ›
            </button>
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-base sm:flex-none sm:text-sm"
          />
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            disabled={!isSuperAdmin || branches.length === 0}
            className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-base sm:w-auto sm:min-w-[160px] sm:text-sm disabled:bg-slate-100 disabled:text-slate-600"
          >
            {branches.length === 0 ? (
              <option value="">Филиал…</option>
            ) : (
              branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))
            )}
          </select>
          <button
            type="button"
            onClick={() => openNew()}
            className="min-h-[44px] w-full rounded-lg bg-lime-600 px-4 py-2 text-sm font-medium text-white hover:bg-lime-700 sm:w-auto"
          >
            + Запись
          </button>
        </div>
      </div>

      <p className="mt-2 text-sm text-slate-600">{formatDateTitle(date)}</p>
      <p className="mt-1 hidden text-xs text-slate-400 md:block">
        Клик по свободному слоту — новая запись. Удерживайте запись и перетащите для смены времени.
      </p>
      <p className="mt-1 text-xs text-slate-400 md:hidden">
        Нажмите на запись для редактирования.
      </p>
      <StatusLegend />

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}. Попробуйте{" "}
          <button
            type="button"
            onClick={() => void load()}
            className="font-medium underline"
          >
            обновить
          </button>{" "}
          или перелогиниться.
        </p>
      )}

      {loading && staff.length === 0 ? (
        <p className="mt-8 text-slate-500">Загрузка…</p>
      ) : (
        <div className="relative mt-4">
          {loading && (
            <div className="pointer-events-none absolute inset-0 z-40 flex items-start justify-center bg-white/40 pt-4">
              <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-500 shadow">
                Обновление…
              </span>
            </div>
          )}

          <div className="space-y-2 md:hidden">
            {sortedAppointments.length === 0 ? (
              <p className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-400">
                Нет записей за этот день
              </p>
            ) : (
              sortedAppointments.map((a) => {
                const name =
                  [a.client.firstName, a.client.lastName].filter(Boolean).join(" ") ||
                  a.client.phone;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => openEdit(a)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-left shadow-sm active:bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">
                          {formatTimeMinsk(a.startAt)} · {name}
                        </p>
                        <p className="mt-0.5 truncate text-sm text-slate-600">
                          {a.service.name} · {a.staff.name}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          #{a.publicNumber} · {a.price} Br
                        </p>
                      </div>
                      <StatusBadge status={a.status} />
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="hidden md:block">
            <JournalGrid
              date={date}
              weekday={wd}
              branchId={branchId}
              staff={staff}
              appointments={appointments}
              onSlotClick={openNew}
              onAppointmentClick={openEdit}
              onMoved={() => {
                void load({ silent: true });
                void loadList();
              }}
            />
          </div>
        </div>
      )}

      <section className="mt-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Записи за период</h2>
            <p className="mt-1 text-xs text-slate-400">
              Все записи, включая удалённые и отменённые
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 invisible select-none" aria-hidden="true">
                —
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const { from, to } = periodToday();
                    setListFrom(from);
                    setListTo(to);
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Сегодня
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const { from, to } = periodWeek();
                    setListFrom(from);
                    setListTo(to);
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Неделя
                </button>
              </div>
            </div>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              С
              <input
                type="date"
                value={listFrom}
                max={listTo}
                onChange={(e) => setListFrom(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              По
              <input
                type="date"
                value={listTo}
                min={listFrom}
                onChange={(e) => setListTo(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
        </div>

        {listLoading ? (
          <p className="mt-4 text-sm text-slate-500">Загрузка…</p>
        ) : listRecords.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">Нет записей за выбранный период</p>
        ) : (
          <>
            <div className="mt-4 space-y-2 md:hidden">
              {listRecords.map((a) => {
                const name =
                  [a.client.firstName, a.client.lastName].filter(Boolean).join(" ") ||
                  a.client.phone;
                const reason = cancelReasonLabel(a.cancelReason);
                const hidden = isHiddenFromJournal(a.status);
                const Wrapper = hidden ? "div" : "button";
                return (
                  <Wrapper
                    key={a.id}
                    type={hidden ? undefined : "button"}
                    onClick={hidden ? undefined : () => openEdit(a)}
                    className={`w-full rounded-lg border px-4 py-3 text-left text-sm ${
                      hidden
                        ? "border-red-100 bg-red-50/40 text-slate-600"
                        : "border-slate-200 bg-white shadow-sm active:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800">
                          {new Date(a.startAt).toLocaleString("ru-RU", {
                            timeZone: "Europe/Minsk",
                          })}{" "}
                          · {name}
                        </p>
                        <p className="mt-0.5 text-slate-600">
                          {a.service.name} · {a.staff.name}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          #{a.publicNumber} · {a.price} Br
                          {reason ? ` · ${reason}` : ""}
                        </p>
                      </div>
                      <StatusBadge status={a.status} />
                    </div>
                  </Wrapper>
                );
              })}
            </div>
            <div className="mt-4 hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b text-slate-500">
                    <th className="py-2">#</th>
                    <th>Клиент</th>
                    <th>Услуга</th>
                    <th>Ресурс</th>
                    <th>Время</th>
                    <th>Цена</th>
                    <th>Причина</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {listRecords.map((a) => {
                    const hidden = isHiddenFromJournal(a.status);
                    return (
                      <tr
                        key={a.id}
                        onClick={hidden ? undefined : () => openEdit(a)}
                        className={`border-b border-slate-100 ${
                          hidden
                            ? "text-slate-500"
                            : "cursor-pointer hover:bg-slate-50"
                        }`}
                      >
                        <td className="py-2">{a.publicNumber}</td>
                        <td>
                          {a.client.phone}
                          <br />
                          <span className="text-slate-500">
                            {[a.client.firstName, a.client.lastName]
                              .filter(Boolean)
                              .join(" ")}
                          </span>
                        </td>
                        <td>{a.service.name}</td>
                        <td>{a.staff.name}</td>
                        <td>
                          {new Date(a.startAt).toLocaleString("ru-RU", {
                            timeZone: "Europe/Minsk",
                          })}
                        </td>
                        <td>{a.price} Br</td>
                        <td>{cancelReasonLabel(a.cancelReason) || "—"}</td>
                        <td>
                          <StatusBadge status={a.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <AppointmentModal
        key={editAppt?.id ?? `new-${modalInitial.startAt ?? ""}-${modalInitial.staffId ?? ""}`}
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditAppt(null);
          setModalInitial({});
        }}
        onSaved={refreshAll}
        branches={branches}
        appointmentId={editAppt?.id}
        initial={modalProps}
      />
    </div>
  );
}
