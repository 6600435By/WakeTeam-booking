import { prisma } from "@/lib/db";
import { formatDateKey } from "@/lib/time";

const ELEVATED_STATUSES = ["scheduled", "open", "closed"] as const;

/** Оператор на смене с workAsAdmin получает доступ к данным как у админа филиала. */
export async function memberHasWorkAsAdminElevation(
  memberId: string,
  date = formatDateKey(new Date()),
): Promise<boolean> {
  const shift = await prisma.workShift.findFirst({
    where: {
      memberId,
      date,
      workAsAdmin: true,
      status: { in: [...ELEVATED_STATUSES] },
    },
    select: { id: true },
  });
  return Boolean(shift);
}
