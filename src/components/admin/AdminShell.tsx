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
          "px-3 pb-6 pt-3 pt-[max(0.75rem,env(safe-area-inset-top))]",
        viewport === "tablet" &&
          "mx-auto max-w-5xl overflow-x-hidden px-3 pb-6 pt-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4",
        viewport === "desktop" &&
          "flex h-dvh max-h-dvh flex-col overflow-hidden px-4 py-3 pb-4",
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
