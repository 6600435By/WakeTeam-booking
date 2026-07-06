import { prisma } from "@/lib/db";

export type BranchShiftSales = {
  cash: number;
  cashless: number;
  total: number;
  appointmentCount: number;
};

const COUNTED_STATUSES = new Set(["completed"]);

/** Продажи филиала за интервал смены (завершённые записи). */
export async function computeBranchShiftSales(
  branchId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<BranchShiftSales> {
  const appointments = await prisma.appointment.findMany({
    where: {
      branchId,
      status: { in: [...COUNTED_STATUSES] },
      startAt: { gte: windowStart, lt: windowEnd },
    },
    select: { price: true, paymentMethod: true },
  });

  let cash = 0;
  let cashless = 0;
  for (const a of appointments) {
    if (a.paymentMethod === "cash") {
      cash += a.price;
    } else if (a.paymentMethod === "card" || a.paymentMethod === "corporate") {
      cashless += a.price;
    } else {
      cashless += a.price;
    }
  }

  return {
    cash: Math.round(cash * 100) / 100,
    cashless: Math.round(cashless * 100) / 100,
    total: Math.round((cash + cashless) * 100) / 100,
    appointmentCount: appointments.length,
  };
}
