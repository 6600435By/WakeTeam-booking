const STORAGE_KEY = "booking-crm-super-admin-branch";

export function readSuperAdminBranchId(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(STORAGE_KEY) ?? "";
}

export function writeSuperAdminBranchId(branchId: string) {
  if (typeof window === "undefined") return;
  if (branchId) localStorage.setItem(STORAGE_KEY, branchId);
  else localStorage.removeItem(STORAGE_KEY);
}
