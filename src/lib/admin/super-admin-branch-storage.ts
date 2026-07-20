const STORAGE_KEY = "booking-crm-super-admin-branch";
/** Cookie mirrors localStorage so SSR can load the preferred branch. */
export const SUPER_ADMIN_BRANCH_COOKIE = "booking-crm-sa-branch";

export function readSuperAdminBranchId(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(STORAGE_KEY) ?? "";
}

export function writeSuperAdminBranchId(branchId: string) {
  if (typeof window === "undefined") return;
  if (branchId) {
    localStorage.setItem(STORAGE_KEY, branchId);
    document.cookie = `${SUPER_ADMIN_BRANCH_COOKIE}=${encodeURIComponent(branchId)}; path=/; max-age=31536000; samesite=lax`;
  } else {
    localStorage.removeItem(STORAGE_KEY);
    document.cookie = `${SUPER_ADMIN_BRANCH_COOKIE}=; path=/; max-age=0; samesite=lax`;
  }
}
