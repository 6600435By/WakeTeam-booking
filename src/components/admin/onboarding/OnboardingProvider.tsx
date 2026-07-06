"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import type { AdminRole } from "@/lib/admin-roles";
import { OnboardingTour } from "./OnboardingTour";

type MePayload = {
  user: { name: string | null; lastName: string | null };
  memberId: string;
  role: AdminRole;
  onboardingCompletedAt: string | null;
};

type OnboardingContextValue = {
  restartTour: () => Promise<void>;
  tourActive: boolean;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error("useOnboarding must be used within OnboardingProvider");
  }
  return ctx;
}

export function useOnboardingOptional() {
  return useContext(OnboardingContext);
}

type Props = {
  children: ReactNode;
};

export function OnboardingProvider({ children }: Props) {
  const pathname = usePathname();
  const [me, setMe] = useState<MePayload | null>(null);
  const [tourActive, setTourActive] = useState(false);
  const autoStarted = useRef(false);

  const loadMe = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/me");
      if (!r.ok) return null;
      return (await r.json()) as MePayload;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    void loadMe().then((data) => {
      if (data) setMe(data);
    });
  }, [loadMe]);

  useEffect(() => {
    if (!me || autoStarted.current || me.onboardingCompletedAt) return;
    if (pathname.startsWith("/admin/help")) return;
    autoStarted.current = true;
    const t = window.setTimeout(() => setTourActive(true), 800);
    return () => window.clearTimeout(t);
  }, [me, pathname]);

  const completeTour = useCallback(async () => {
    await fetch("/api/admin/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "complete" }),
    });
    setMe((prev) =>
      prev ? { ...prev, onboardingCompletedAt: new Date().toISOString() } : prev,
    );
    setTourActive(false);
  }, []);

  const restartTour = useCallback(async () => {
    await fetch("/api/admin/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset" }),
    });
    const data = await loadMe();
    if (data) {
      setMe({ ...data, onboardingCompletedAt: null });
    }
    autoStarted.current = true;
    setTourActive(true);
  }, [loadMe]);

  const userName =
    [me?.user.name, me?.user.lastName].filter(Boolean).join(" ") || null;

  return (
    <OnboardingContext.Provider value={{ restartTour, tourActive }}>
      {children}
      {me && tourActive && (
        <OnboardingTour
          role={me.role}
          userName={userName}
          onComplete={completeTour}
          onDismiss={completeTour}
        />
      )}
    </OnboardingContext.Provider>
  );
}
