"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
};

const ROLES = [
  { value: "super_admin", label: "Супер-админ" },
  { value: "branch_admin", label: "Админ филиала" },
  { value: "branch_operator", label: "Оператор филиала" },
] as const;

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900";

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
};

export function UsersAdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Ошибка"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit(user: AdminUser) {
    setEditingId(user.id);
    loginTouchedRef.current = true;
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
    });
    setMsg("");
  }

  function cancelEdit() {
    setEditingId(null);
    loginTouchedRef.current = false;
    setForm(emptyForm);
    setMsg("");
  }

  function updateLastName(value: string) {
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
    const isCreate = !editingId;
    const payload: Record<string, unknown> = {
      lastName: form.lastName.trim(),
      login: form.login.trim(),
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      passportNumber: form.passportNumber.trim() || null,
      registrationAddress: form.registrationAddress.trim() || null,
      role: form.role,
      branchId: form.role === "super_admin" ? null : form.branchId || null,
    };
    if (form.password.trim()) {
      payload.password = form.password;
    } else if (isCreate) {
      setError("Укажите пароль");
      setSaving(false);
      return;
    }

    if (!payload.lastName || !payload.login || !payload.name) {
      setError("Заполните фамилию, логин и имя");
      setSaving(false);
      return;
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
      setError(typeof data.error === "string" ? data.error : "Ошибка сохранения");
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
        Карточки сотрудников, логины для входа, роли и доступ к филиалам
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
                    <td className="px-3 py-2">{u.branchName ?? "Все"}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => startEdit(u)}
                        className="text-lime-700 hover:underline"
                      >
                        Изменить
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(u)}
                        className="ml-3 text-red-600 hover:underline"
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 max-w-lg rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="font-semibold text-slate-900">
              {editingId ? "Редактирование" : "Новый сотрудник"}
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs text-slate-500">Фамилия</span>
                <input
                  className={inputClass}
                  value={form.lastName}
                  onChange={(e) => updateLastName(e.target.value)}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs text-slate-500">
                  Логин для входа
                </span>
                <input
                  className={inputClass}
                  value={form.login}
                  onChange={(e) => {
                    loginTouchedRef.current = true;
                    setForm((f) => ({ ...f, login: e.target.value }));
                  }}
                  placeholder="Подставляется из фамилии, можно изменить"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">Имя</span>
                <input
                  className={inputClass}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
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
                  className={inputClass}
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">Роль</span>
                <select
                  className={inputClass}
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              {form.role !== "super_admin" && (
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">Филиал</span>
                  <select
                    className={inputClass}
                    value={form.branchId}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, branchId: e.target.value }))
                    }
                  >
                    <option value="">Выберите филиал</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {editingId &&
              (form.role === "branch_operator" || form.role === "branch_admin") && (
                <PayRatesPanel userId={editingId} open={!!editingId} />
              )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="rounded-lg bg-lime-600 px-4 py-2 text-sm font-medium text-white hover:bg-lime-700 disabled:opacity-50"
              >
                {saving ? "Сохранение…" : editingId ? "Сохранить" : "Создать"}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
                >
                  Отмена
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
