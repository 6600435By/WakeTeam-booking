"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { adminFetch } from "@/lib/admin-fetch";
import {
  readSuperAdminBranchId,
  writeSuperAdminBranchId,
} from "@/lib/admin/super-admin-branch-storage";

type Branch = { id: string; name: string };

export type BranchPickerMode = "super" | "manager" | null;

type SuperAdminBranchContextValue = {
  /** @deprecated use branchPickerMode === "super" */
  isSuperAdmin: boolean;
  branchPickerMode: BranchPickerMode;
  branches: Branch[];
  branchId: string;
  setBranchId: (id: string) => void;
  loading: boolean;
};

const SuperAdminBranchContext = createContext<SuperAdminBranchContextValue | null>(
  null,
);

export function SuperAdminBranchProvider({
  branchPickerMode,
  managedBranchIds = [],
  children,
}: {
  branchPickerMode: BranchPickerMode;
  managedBranchIds?: string[];
  children: ReactNode;
}) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchIdState] = useState("");
  const [loading, setLoading] = useState(Boolean(branchPickerMode));

  useEffect(() => {
    if (!branchPickerMode) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    adminFetch("/api/admin/branches")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        let list: Branch[] = (d.branches ?? []).map((b: Branch) => ({
          id: b.id,
          name: b.name,
        }));
        if (branchPickerMode === "manager") {
          const allowed = new Set(managedBranchIds);
          list = list.filter((b) => allowed.has(b.id));
        }
        setBranches(list);
        const saved = readSuperAdminBranchId();
        const initial =
          saved && list.some((b) => b.id === saved)
            ? saved
            : list[0]?.id ?? "";
        setBranchIdState(initial);
        // Persist cookie mirror so next SSR matches localStorage.
        if (initial) writeSuperAdminBranchId(initial);
      })
      .catch(() => {
        if (!cancelled) setBranches([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [branchPickerMode, managedBranchIds.join(",")]);

  const setBranchId = useCallback((id: string) => {
    setBranchIdState(id);
    writeSuperAdminBranchId(id);
  }, []);

  const value = useMemo(
    () => ({
      isSuperAdmin: branchPickerMode === "super",
      branchPickerMode,
      branches,
      branchId,
      setBranchId,
      loading,
    }),
    [branchPickerMode, branches, branchId, setBranchId, loading],
  );

  return (
    <SuperAdminBranchContext.Provider value={value}>
      {children}
    </SuperAdminBranchContext.Provider>
  );
}

export function useSuperAdminBranch() {
  const ctx = useContext(SuperAdminBranchContext);
  if (!ctx) {
    throw new Error("useSuperAdminBranch requires SuperAdminBranchProvider");
  }
  return ctx;
}

export function useSuperAdminBranchOptional() {
  return useContext(SuperAdminBranchContext);
}

/** Глобальный переключатель филиала — только там, где нет своего фильтра на странице. */
function shouldShowGlobalBranchBar(
  pathname: string,
  branchPickerMode: BranchPickerMode,
): boolean {
  if (!branchPickerMode) return false;

  if (pathname.startsWith("/admin/shift-review")) return false;

  if (pathname.startsWith("/admin/shift")) return false;

  if (pathname.startsWith("/admin/journal")) {
    return branchPickerMode === "super";
  }

  return false;
}

export function SuperAdminBranchBar() {
  const pathname = usePathname();
  const ctx = useSuperAdminBranchOptional();
  if (
    !ctx?.branchPickerMode ||
    ctx.branches.length === 0 ||
    !shouldShowGlobalBranchBar(pathname, ctx.branchPickerMode)
  ) {
    return null;
  }

  const label =
    ctx.branchPickerMode === "manager"
      ? "Филиал (управление)"
      : "Филиал";

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm" data-onboarding="branch-picker">
      <label className="flex min-w-0 flex-1 items-center gap-2 text-sm sm:flex-none">
        <span className="shrink-0 font-medium text-slate-700">{label}</span>
        <select
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 sm:min-w-[12rem]"
          value={ctx.branchId}
          disabled={ctx.loading}
          onChange={(e) => ctx.setBranchId(e.target.value)}
        >
          {ctx.branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      {ctx.branchPickerMode === "manager" && (
        <span className="text-xs text-slate-500">
          В журнале доступны все филиалы
        </span>
      )}
      {ctx.loading && (
        <span className="text-xs text-slate-500">Загрузка…</span>
      )}
    </div>
  );
}
