"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getAdminViewport, type AdminViewport } from "@/lib/admin-viewport";

const AdminViewportContext = createContext<AdminViewport>("desktop");

export function AdminViewportProvider({ children }: { children: ReactNode }) {
  const [viewport, setViewport] = useState<AdminViewport>(() =>
    typeof window !== "undefined"
      ? getAdminViewport(window.innerWidth)
      : "desktop",
  );

  useEffect(() => {
    function sync() {
      setViewport(getAdminViewport(window.innerWidth));
    }
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  return (
    <AdminViewportContext.Provider value={viewport}>
      {children}
    </AdminViewportContext.Provider>
  );
}

export function useAdminViewport() {
  return useContext(AdminViewportContext);
}
