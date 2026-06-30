export function normalizeStaffLogin(value: string): string {
  return value.trim();
}

export function staffDisplayName(user: {
  name?: string | null;
  lastName?: string | null;
  login?: string | null;
}): string {
  const parts = [user.lastName, user.name].filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  return user.login ?? "—";
}

export function staffLoginLabel(user: {
  login?: string | null;
  email?: string | null;
}): string {
  return user.login ?? user.email ?? "—";
}
