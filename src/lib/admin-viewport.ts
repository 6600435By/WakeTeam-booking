export type AdminViewport = "mobile" | "tablet" | "desktop";

export const ADMIN_VIEWPORT_MOBILE_MAX = 767;
export const ADMIN_VIEWPORT_TABLET_MAX = 1023;

export function getAdminViewport(width: number): AdminViewport {
  if (width <= ADMIN_VIEWPORT_MOBILE_MAX) return "mobile";
  if (width <= ADMIN_VIEWPORT_TABLET_MAX) return "tablet";
  return "desktop";
}

export function readAdminViewportWidth(): number {
  if (typeof window === "undefined") return ADMIN_VIEWPORT_MOBILE_MAX;
  return Math.round(window.innerWidth);
}

function isTouchDevice(): boolean {
  if (typeof window === "undefined") return true;
  if (navigator.maxTouchPoints > 0) return true;
  if (window.matchMedia("(hover: none)").matches) return true;
  return window.matchMedia("(pointer: coarse)").matches;
}

/** Viewport for admin UI; touch devices never use desktop layout. */
export function readAdminViewport(): AdminViewport {
  const width = readAdminViewportWidth();
  if (isTouchDevice()) {
    if (width <= ADMIN_VIEWPORT_MOBILE_MAX) return "mobile";
    return "tablet";
  }
  return getAdminViewport(width);
}

export function subscribeAdminViewport(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  let frame = 0;
  const notify = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => onChange());
  };

  window.addEventListener("resize", notify);
  window.addEventListener("orientationchange", notify);

  const visualViewport = window.visualViewport;
  visualViewport?.addEventListener("resize", notify);

  const mqMobile = window.matchMedia(
    `(max-width: ${ADMIN_VIEWPORT_MOBILE_MAX}px)`,
  );
  const mqTablet = window.matchMedia(
    `(max-width: ${ADMIN_VIEWPORT_TABLET_MAX}px)`,
  );
  const mqCoarse = window.matchMedia("(pointer: coarse)");
  const mqHoverNone = window.matchMedia("(hover: none)");

  mqMobile.addEventListener("change", notify);
  mqTablet.addEventListener("change", notify);
  mqCoarse.addEventListener("change", notify);
  mqHoverNone.addEventListener("change", notify);

  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", notify);
    window.removeEventListener("orientationchange", notify);
    visualViewport?.removeEventListener("resize", notify);
    mqMobile.removeEventListener("change", notify);
    mqTablet.removeEventListener("change", notify);
    mqCoarse.removeEventListener("change", notify);
    mqHoverNone.removeEventListener("change", notify);
  };
}

export function isAdminMobile(viewport: AdminViewport) {
  return viewport === "mobile";
}

export function isAdminCompact(viewport: AdminViewport) {
  return viewport !== "desktop";
}

export function isAdminTabletOrDesktop(viewport: AdminViewport) {
  return viewport === "tablet" || viewport === "desktop";
}
