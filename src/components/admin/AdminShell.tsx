"use client";

import { cn } from "@/lib/utils";
import { AdminViewportProvider, useAdminViewport } from "./AdminViewportContext";

function AdminShellInner({ children }: { children: React.ReactNode }) {
  const viewport = useAdminViewport();

  return (
    <div
      data-admin-viewport={viewport}
      className={cn(
        "admin-shell min-h-dvh w-full",
        viewport === "mobile" &&
          "px-3 pb-[calc(4.75rem+env(safe-area-inset-bottom))] pt-[calc(3rem+env(safe-area-inset-top))]",
        viewport === "tablet" &&
          "mx-auto max-w-5xl px-4 pb-[calc(4.75rem+env(safe-area-inset-bottom))] pt-[calc(3rem+env(safe-area-inset-top))]",
        viewport === "desktop" &&
          "flex min-h-dvh max-w-none flex-col px-5 py-4 pb-6",
      )}
    >
      {children}
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <AdminViewportProvider>
      <AdminShellInner>{children}</AdminShellInner>
    </AdminViewportProvider>
  );
}
