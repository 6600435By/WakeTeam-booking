"use client";

import { useCallback, useState } from "react";
import type { ShiftData } from "./ShiftReportCard";

export type ShiftCorrectionInput = {
  shiftId: string;
  comment: string;
  timeFrom?: string;
  timeTo?: string;
  date: string;
  isOperator: boolean;
  panelOverride?: string;
  idleOverride?: string;
  closeIfOpen?: boolean;
  approveAfter?: boolean;
};

function dateTimeIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00+03:00`).toISOString();
}

export function useShiftPayrollActions() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const approveShift = useCallback(
    async (shiftId: string, comment: string, closeIfOpen = false) => {
      setSaving(true);
      setError("");
      try {
        const r = await fetch(`/api/admin/work-shifts/${shiftId}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comment, closeIfOpen }),
        });
        const d = await r.json();
        if (!r.ok) {
          throw new Error(typeof d.error === "string" ? d.error : "Ошибка утверждения");
        }
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const saveCorrection = useCallback(async (input: ShiftCorrectionInput) => {
    if (!input.comment.trim()) {
      setError("Укажите комментарий к изменению");
      return false;
    }
    setSaving(true);
    setError("");
    try {
      const body: Record<string, unknown> = { comment: input.comment.trim() };
      if (input.timeFrom) {
        body.actualStart = dateTimeIso(input.date, input.timeFrom);
      }
      if (input.timeTo) {
        body.actualEnd = dateTimeIso(input.date, input.timeTo);
      }
      if (input.isOperator && input.panelOverride !== undefined && input.panelOverride !== "") {
        body.panelMinutesOverride = Number(input.panelOverride);
      }
      if (input.isOperator && input.idleOverride !== undefined && input.idleOverride !== "") {
        body.idleMinutesOverride = Number(input.idleOverride);
      }
      const r = await fetch(`/api/admin/work-shifts/${input.shiftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) {
        throw new Error(typeof d.error === "string" ? d.error : "Ошибка сохранения");
      }
      if (input.approveAfter) {
        const approveR = await fetch(`/api/admin/work-shifts/${input.shiftId}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            comment: input.comment.trim(),
            closeIfOpen: input.closeIfOpen ?? false,
          }),
        });
        const approveData = await approveR.json();
        if (!approveR.ok) {
          throw new Error(
            typeof approveData.error === "string"
              ? approveData.error
              : "Ошибка утверждения",
          );
        }
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  const deleteShift = useCallback(async (shiftId: string, memberName?: string, date?: string) => {
    if (
      !window.confirm(
        `Удалить смену${date ? ` ${date}` : ""}${memberName ? ` (${memberName})` : ""}?`,
      )
    ) {
      return false;
    }
    setSaving(true);
    setError("");
    try {
      const r = await fetch(`/api/admin/work-shifts/${shiftId}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(typeof d.error === "string" ? d.error : "Не удалось удалить");
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  const loadShiftDetail = useCallback(async (shiftId: string): Promise<ShiftData | null> => {
    try {
      const r = await fetch(`/api/admin/work-shifts/${shiftId}`);
      const d = await r.json();
      if (!r.ok) return null;
      return d as ShiftData;
    } catch {
      return null;
    }
  }, []);

  const confirmMonthly = useCallback(
    async (input: {
      memberId: string;
      periodFrom: string;
      periodTo: string;
      confirmedAmount: number;
    }) => {
      setSaving(true);
      setError("");
      try {
        const r = await fetch("/api/admin/payroll-report", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const d = await r.json();
        if (!r.ok) {
          throw new Error(typeof d.error === "string" ? d.error : "Ошибка");
        }
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  return {
    saving,
    error,
    setError,
    approveShift,
    saveCorrection,
    deleteShift,
    loadShiftDetail,
    confirmMonthly,
  };
}
