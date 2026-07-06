"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  parseUserApiError,
  validateUserForm,
} from "@/lib/admin/user-form-errors";
import { PayRatesPanel } from "./PayRatesPanel";

type Branch = { id: string; name: string };

type AdminUser = {
  id: string;
  login: string;
  email: string | null;
  name: string | null;
  lastName: string | null;
  phone: string | null;
  passportNumber: string | null;
  registrationAddress: string | null;
  role: string;
  roleLabel: string;
  branchId: string | null;
  branchName: string | null;
  managedBranchIds?: string[];
  managedBranchNames?: string;
};

const ALL_ROLES = [
  { value: "super_admin", label: "Супер-админ" },
  { value: "branch_manager", label: "Управляющий филиалом" },
  { value: "branch_admin", label: "Админ филиала" },
  { value: "branch_operator", label: "Оператор филиала" },
] as const;

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900";

function fieldInputClass(hasError: boolean) {
  return hasError
    ? `${inputClass} border-red-400 ring-1 ring-red-200`
    : inputClass;
}

function FieldHint({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-600">{message}</p>;
}

type FormState = {
  lastName: string;
  login: string;
  name: string;
  phone: string;
  passportNumber: string;
  registrationAddress: string;
  password: string;
  role: string;
  branchId: string;
  branchIds: string[];
};

const emptyForm: FormState = {
  lastName: "",
  login: "",
  name: "",
  phone: "",
  passportNumber: "",
  registrationAddress: "",
  password: "",
  role: "branch_operator",
  branchId: "",
  branchIds: [],
};

export function UsersAdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [canManageUsers, setCanManageUsers] = useState(true);
  const [canCreateManagers, setCanCreateManagers] = useState(false);
  const [viewerRole, setViewerRole] = useState<string>("super_admin");
  const [canSetPayRates, setCanSetPayRates] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const loginTouchedRef = useRef(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetch("/api/admin/users")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Не удалось загрузить");
        setUsers(d.users ?? []);
        setBranches(d.branches ?? []);
        setCanManageUsers(d.canManageUsers ?? false);
        setCanCreateManagers(d.canCreateManagers ?? false);
        setViewerRole(d.viewerRole ?? "super_admin");
        setCanSetPayRates(d.canSetPayRates ?? false);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Ошибка"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const availableRoles = ALL_ROLES.filter((r) => {
    if (r.value === "branch_manager") return canCreateManagers;
    if (r.value === "super_admin") return canCreateManagers;
    return true;
  });

  function clearFieldError(field: string) {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function applyValidationErrors(fieldMessages: Record<string, string>, message: string) {
    setFieldErrors(fieldMessages);
    setError(message);
  }

  function startEdit(user: AdminUser) {
    setEditingId(user.id);
    loginTouchedRef.current = true;
    setFieldErrors({});
    setForm({
      lastName: user.lastName ?? "",
      login: user.login,
      name: user.name ?? "",
      phone: user.phone ?? "",
      passportNumber: user.passportNumber ?? "",
      registrationAddress: user.registrationAddress ?? "",
      password: "",
      role: user.role === "admin" ? "super_admin" : user.role,
      branchId: user.branchId ?? "",
      branchIds: user.managedBranchIds ?? [],
    });
    setMsg("");
  }

  function cancelEdit() {
    setEditingId(null);
    loginTouchedRef.current = false;
    setFieldErrors({});
    setForm(emptyForm);
    setMsg("");
  }

  function updateLastName(value: string) {
    clearFieldError("lastName");
    clearFieldError("login");
    setForm((f) => ({
      ...f,
      lastName: value,
      login: loginTouchedRef.current ? f.login : value.trim(),
    }));
  }

  async function save() {
    setSaving(true);
    setMsg("");
    setError("");
    setFieldErrors({});
    const isCreate = !editingId;

    const validation = validateUserForm(form, isCreate);
    if (validation) {
      applyValidationErrors(validation.fieldMessages, validation.message);
      setSaving(false);
      return;
    }

    const payload: Record<string, unknown> = {
      lastName: form.lastName.trim(),
      login: form.login.trim(),
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      passportNumber: form.passportNumber.trim() || null,
      registrationAddress: form.registrationAddress.trim() || null,
      role: form.role,
      branchId:
        form.role === "super_admin" || form.role === "branch_manager"
          ? null
          : form.branchId || null,
      branchIds: form.role === "branch_manager" ? form.branchIds : undefined,
    };
    if (form.password.trim()) {
      payload.password = form.password;
    }

    const res = await fetch(
      isCreate ? "/api/admin/users" : `/api/admin/users/${editingId}`,
      {
        method: isCreate ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      const parsed = parseUserApiError(data);
      applyValidationErrors(parsed.fieldMessages, parsed.message);
      return;
    }
    setMsg(isCreate ? "Сотрудник создан" : "Сохранено");
    cancelEdit();
    load();
  }

  async function remove(user: AdminUser) {
    const label = [user.lastName, user.name].filter(Boolean).join(" ") || user.login;
    if (!window.confirm(`Удалить сотрудника ${label}? Это действие нельзя отменить.`)) {
      return;
    }
    setError("");
    const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Ошибка удаления");
      return;
    }
    setMsg("Сотрудник удалён");
    if (editingId === user.id) cancelEdit();
    load();
  }

  return (
    <div className="pb-8">
      <h1 className="text-xl font-bold sm:text-2xl">Сотрудники</h1>
      <p className="mt-1 text-sm text-slate-500">
        {canManageUsers
          ? "Карточки сотрудников, логины для входа, роли и доступ к филиалам"
          : "Сотрудники вашего филиала — назначение тарифов за работу"}
      </p>

      {loading && <p className="mt-4 text-slate-500">Загрузка…</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {msg && <p className="mt-4 text-sm text-lime-700">{msg}</p>}

      {!loading && (
        <>
          <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Логин</th>
                  <th className="px-3 py-2 font-medium">Фамилия</th>
                  <th className="px-3 py-2 font-medium">Имя</th>
                  <th className="px-3 py-2 font-medium">Тел.</th>
                  <th className="px-3 py-2 font-medium">Роль</th>
                  <th className="px-3 py-2 font-medium">Филиал</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-slate-100">
                    <td className="px-3 py-2 font-medium">{u.login}</td>
                    <td className="px-3 py-2">{u.lastName ?? "—"}</td>
                    <td className="px-3 py-2">{u.name ?? "—"}</td>
                    <td className="px-3 py-2">{u.phone ?? "—"}</td>
                    <td className="px-3 py-2">{u.roleLabel}</td>
                    <td className="px-3 py-2">
                      {u.role === "branch_manager"
                        ? u.managedBranchNames || u.branchName || "—"
                        : u.branchName ?? "Все"}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => startEdit(u)}
                        className="text-lime-700 hover:underline"
                      >
                        {canManageUsers ? "Изменить" : "Тарифы"}
                      </button>
                      {canCreateManagers && (
                        <button
                          type="button"
                          onClick={() => void remove(u)}
                          className="ml-3 text-red-600 hover:underline"
                        >
                          Удалить
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(canManageUsers || editingId) && (
          <div className="mt-6 max-w-lg rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="font-semibold text-slate-900">
              {editingId
                ? canManageUsers
                  ? "Редактирование"
                  : "Тарифы сотрудника"
                : "Новый сотрудник"}
            </h2>
            {canManageUsers && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs text-slate-500">Фамилия</span>
                <input
                  className={fieldInputClass(!!fieldErrors.lastName)}
                  value={form.lastName}
                  onChange={(e) => updateLastName(e.target.value)}
                />
                <FieldHint message={fieldErrors.lastName} />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs text-slate-500">
                  Логин для входа
                </span>
                <input
                  className={fieldInputClass(!!fieldErrors.login)}
                  value={form.login}
                  onChange={(e) => {
                    loginTouchedRef.current = true;
                    clearFieldError("login");
                    setForm((f) => ({ ...f, login: e.target.value }));
                  }}
                  placeholder="Подставляется из фамилии, можно изменить"
                />
                <FieldHint message={fieldErrors.login} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">Имя</span>
                <input
                  className={fieldInputClass(!!fieldErrors.name)}
                  value={form.name}
                  onChange={(e) => {
                    clearFieldError("name");
                    setForm((f) => ({ ...f, name: e.target.value }));
                  }}
                />
                <FieldHint message={fieldErrors.name} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">Тел.</span>
                <input
                  className={inputClass}
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+375 …"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs text-slate-500">
                  Паспорт (серия, номер)
                </span>
                <input
                  className={inputClass}
                  value={form.passportNumber}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, passportNumber: e.target.value }))
                  }
                  placeholder="MP 1234567"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs text-slate-500">Прописка</span>
                <input
                  className={inputClass}
                  value={form.registrationAddress}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, registrationAddress: e.target.value }))
                  }
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs text-slate-500">
                  {editingId ? "Новый пароль (оставьте пустым, чтобы не менять)" : "Пароль"}
                </span>
                <input
                  className={fieldInputClass(!!fieldErrors.password)}
                  type="password"
                  value={form.password}
                  onChange={(e) => {
                    clearFieldError("password");
                    setForm((f) => ({ ...f, password: e.target.value }));
                  }}
                />
                <FieldHint message={fieldErrors.password} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">Роль</span>
                <select
                  className={inputClass}
                  value={form.role}
                  onChange={(e) => {
                    clearFieldError("branchId");
                    clearFieldError("branchIds");
                    setForm((f) => ({ ...f, role: e.target.value }));
                  }}
                >
                  {availableRoles.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              {form.role === "branch_manager" && canCreateManagers && (
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs text-slate-500">
                    Закреплённые филиалы
                  </span>
                  <div
                    className={
                      fieldErrors.branchIds
                        ? "flex flex-wrap gap-2 rounded-lg border border-red-400 p-2 ring-1 ring-red-200"
                        : "flex flex-wrap gap-2 rounded-lg border border-slate-300 p-2"
                    }
                  >
                    {branches.map((b) => (
                      <label key={b.id} className="flex items-center gap-1.5 text-sm">
                        <input
                          type="checkbox"
                          checked={form.branchIds.includes(b.id)}
                          onChange={(e) => {
                            clearFieldError("branchIds");
                            setForm((f) => ({
                              ...f,
                              branchIds: e.target.checked
                                ? [...f.branchIds, b.id]
                                : f.branchIds.filter((id) => id !== b.id),
                            }));
                          }}
                        />
                        {b.name}
                      </label>
                    ))}
                  </div>
                  <FieldHint message={fieldErrors.branchIds} />
                </label>
              )}
              {form.role !== "super_admin" && form.role !== "branch_manager" && (
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">Филиал</span>
                  <select
                    className={fieldInputClass(!!fieldErrors.branchId)}
                    value={form.branchId}
                    onChange={(e) => {
                      clearFieldError("branchId");
                      setForm((f) => ({ ...f, branchId: e.target.value }));
                    }}
                  >
                    <option value="">Выберите филиал</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  <FieldHint message={fieldErrors.branchId} />
                </label>
              )}
            </div>
            )}
            {!canManageUsers && editingId && (
              <div className="mt-3 space-y-1 text-sm text-slate-700">
                <p>
                  {[form.lastName, form.name].filter(Boolean).join(" ") || form.login}
                </p>
                <p className="text-slate-500">
                  {ALL_ROLES.find((r) => r.value === form.role)?.label ?? form.role}
                  {form.branchId
                    ? ` · ${branches.find((b) => b.id === form.branchId)?.name ?? ""}`
                    : ""}
                </p>
              </div>
            )}
            {editingId && canSetPayRates && (
                <PayRatesPanel userId={editingId} open={!!editingId} />
              )}
            <div className="mt-4 flex flex-wrap gap-2">
              {canManageUsers && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="rounded-lg bg-lime-600 px-4 py-2 text-sm font-medium text-white hover:bg-lime-700 disabled:opacity-50"
              >
                {saving ? "Сохранение…" : editingId ? "Сохранить" : "Создать"}
              </button>
              )}
              {editingId && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
                >
                  {canManageUsers ? "Отмена" : "Закрыть"}
                </button>
              )}
            </div>
          </div>
          )}
        </>
      )}
    </div>
  );
}
