"use client";

import { OnboardingProvider } from "@/components/admin/onboarding/OnboardingProvider";

export function AdminOnboardingShell({ children }: { children: React.ReactNode }) {
  return <OnboardingProvider>{children}</OnboardingProvider>;
}
