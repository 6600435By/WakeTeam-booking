"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import { toast } from "sonner";
import type { AdminRole } from "@/lib/admin-roles";
import { getTourSteps, type TourStepDef } from "@/lib/onboarding/tour-steps";
import { useAdminViewport } from "@/components/admin/AdminViewportContext";
import { isAdminCompact } from "@/lib/admin-viewport";

type Props = {
  role: AdminRole;
  userName: string | null;
  onComplete: () => void;
  onDismiss: () => void;
};

function waitForElement(selector: string, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (document.querySelector(selector)) {
        resolve();
        return;
      }
      if (Date.now() - started > timeoutMs) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function OnboardingTour({ role, userName, onComplete, onDismiss }: Props) {
  const router = useRouter();
  const viewport = useAdminViewport();
  const compact = isAdminCompact(viewport);
  const runningRef = useRef(false);

  useEffect(() => {
    if (runningRef.current) return;
    runningRef.current = true;

    const steps = getTourSteps(role, userName, compact);
    let drv: Driver | null = null;
    let cancelled = false;

    const cleanup = () => {
      drv?.destroy();
      drv = null;
    };

    const finish = (skipped: boolean) => {
      if (cancelled) return;
      cancelled = true;
      cleanup();
      if (skipped) onDismiss();
      else {
        onComplete();
        toast.success("Тур завершён. Подробности — в разделе «Справка».");
      }
    };

    const showStep = async (index: number) => {
      if (cancelled) return;
      const def: TourStepDef = steps[index];
      if (!def) {
        finish(false);
        return;
      }

      if (def.navigateTo) {
        router.push(def.navigateTo);
        await delay(350);
        if (def.element) await waitForElement(def.element);
        else await delay(200);
      }

      if (cancelled) return;

      const isLast = index === steps.length - 1;

      drv = driver({
        showProgress: true,
        progressText: `${index + 1} из ${steps.length}`,
        allowClose: true,
        overlayOpacity: 0.55,
        stagePadding: 8,
        nextBtnText: isLast ? "Готово" : "Далее",
        prevBtnText: "Назад",
        doneBtnText: "Готово",
        onCloseClick: () => finish(true),
      });

      drv.highlight({
        element: def.element,
        popover: {
          title: def.title,
          description: def.description,
          side: def.side,
          showButtons: index > 0 ? ["previous", "next", "close"] : ["next", "close"],
          onNextClick: () => {
            cleanup();
            if (isLast) finish(false);
            else void showStep(index + 1);
          },
          onPrevClick: () => {
            cleanup();
            void showStep(Math.max(0, index - 1));
          },
          onCloseClick: () => finish(true),
        },
      });
    };

    const t = window.setTimeout(() => void showStep(0), 400);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
      cleanup();
      runningRef.current = false;
    };
  }, [role, userName, compact, router, onComplete, onDismiss]);

  return null;
}
