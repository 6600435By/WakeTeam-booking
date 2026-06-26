export type AdminViewport = "mobile" | "tablet" | "desktop";

export const ADMIN_VIEWPORT_MOBILE_MAX = 767;
export const ADMIN_VIEWPORT_TABLET_MAX = 1023;

export function getAdminViewport(width: number): AdminViewport {
  if (width <= ADMIN_VIEWPORT_MOBILE_MAX) return "mobile";
  if (width <= ADMIN_VIEWPORT_TABLET_MAX) return "tablet";
  return "desktop";
}

export function isAdminMobile(viewport: AdminViewport) {
  return viewport === "mobile";
}

export function isAdminTabletOrDesktop(viewport: AdminViewport) {
  return viewport === "tablet" || viewport === "desktop";
}
