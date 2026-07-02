"use client";

import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  readAdminViewport,
  subscribeAdminViewport,
  type AdminViewport,
} from "@/lib/admin-viewport";

const AdminViewportContext = createContext<AdminViewport>("mobile");

function getServerSnapshot(): AdminViewport {
  return "mobile";
}

export function AdminViewportProvider({ children }: { children: ReactNode }) {
  const viewport = useSyncExternalStore(
    subscribeAdminViewport,
    readAdminViewport,
    getServerSnapshot,
  );

  return (
    <AdminViewportContext.Provider value={viewport}>
      {children}
    </AdminViewportContext.Provider>
  );
}

export function useAdminViewport() {
  return useContext(AdminViewportContext);
}
