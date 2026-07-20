import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { JournalDay } from "@/components/admin/JournalDay";
import { getAdminContext } from "@/lib/admin-access";
import {
  queryCalendarDay,
  queryJournalBranchesList,
  resolveInitialBranchId,
} from "@/lib/admin/calendar-day-data";
import { SUPER_ADMIN_BRANCH_COOKIE } from "@/lib/admin/super-admin-branch-storage";
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
    if (!ctx.isSuperAdmin && !ctx.isBranchManager && ctx.branchId) {
      const data = await queryCalendarDay(ctx, date, ctx.branchId);
      initial = {
        ...serializeCalendarDay(data),
        branchId: ctx.branchId,
      };
    } else {
      const cookieStore = await cookies();
      const preferred =
        cookieStore.get(SUPER_ADMIN_BRANCH_COOKIE)?.value ?? undefined;
      const branches = await queryJournalBranchesList(ctx);
      const branchId = resolveInitialBranchId(ctx, branches, preferred);
      const data = await queryCalendarDay(ctx, date, branchId || undefined);

      initial = {
        ...serializeCalendarDay(data),
        branchId,
      };
    }
  } catch {
    initial = undefined;
  }

  return <JournalDay initial={initial} />;
}
