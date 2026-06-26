import { redirect } from "next/navigation";
import { JournalDay } from "@/components/admin/JournalDay";
import { getAdminContext } from "@/lib/admin-access";
import {
  queryCalendarDay,
  resolveInitialBranchId,
} from "@/lib/admin/calendar-day-data";
import { serializeCalendarDay } from "@/lib/admin/calendar-day-serialize";
import { todayDateKeyMinsk } from "@/lib/time";

export default async function JournalPage() {
  const ctx = await getAdminContext();
  if (!ctx) {
    redirect("/admin/login?from=/admin/journal");
  }

  const date = todayDateKeyMinsk();
  let initial;

  try {
    const overview = await queryCalendarDay(ctx, date);
    const branchId = resolveInitialBranchId(ctx, overview.branches);
    const data = branchId
      ? await queryCalendarDay(ctx, date, branchId)
      : overview;

    initial = {
      ...serializeCalendarDay(data),
      branchId,
    };
  } catch {
    initial = undefined;
  }

  return <JournalDay initial={initial} />;
}
