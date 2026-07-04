export const SUPER_ADMIN_ROLE = "super_admin";
export const BRANCH_MANAGER_ROLE = "branch_manager";
export const BRANCH_ADMIN_ROLE = "branch_admin";
export const BRANCH_OPERATOR_ROLE = "branch_operator";

export type AdminRole =
  | typeof SUPER_ADMIN_ROLE
  | typeof BRANCH_MANAGER_ROLE
  | typeof BRANCH_ADMIN_ROLE
  | typeof BRANCH_OPERATOR_ROLE;

export function parseAdminRole(raw: string): AdminRole | null {
  if (raw === SUPER_ADMIN_ROLE || raw === "admin") return SUPER_ADMIN_ROLE;
  if (raw === BRANCH_MANAGER_ROLE) return BRANCH_MANAGER_ROLE;
  if (raw === BRANCH_ADMIN_ROLE) return BRANCH_ADMIN_ROLE;
  if (raw === BRANCH_OPERATOR_ROLE) return BRANCH_OPERATOR_ROLE;
  return null;
}
