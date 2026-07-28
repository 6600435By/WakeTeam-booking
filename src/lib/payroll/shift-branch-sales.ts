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
    select: {
      price: true,
      paymentMethod: true,
      cashAmount: true,
      cardAmount: true,
    },
  });

  let cash = 0;
  let cashless = 0;
  for (const a of appointments) {
    const hasAmounts = a.cashAmount > 0 || a.cardAmount > 0;
    if (hasAmounts) {
      cash += a.cashAmount;
      cashless += a.cardAmount;
      continue;
    }
    // Legacy rows before migration / zero amounts
    if (a.paymentMethod === "cash") {
      cash += a.price;
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
