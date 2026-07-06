import { getBranchPlannedWindowFromHours } from "@/lib/branch-hours";

export async function getBranchPlannedWindow(
  branchId: string,
  date: string,
): Promise<{ start: string | null; end: string | null }> {
  return getBranchPlannedWindowFromHours(branchId, date);
}
