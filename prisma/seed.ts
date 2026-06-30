import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_WIDGET_SETTINGS } from "../src/lib/widget-settings";
import { parseTimeOnDate } from "../src/lib/time";
import {
  resolveRatesForDate,
  serializeRatesSnapshot,
} from "../src/lib/payroll/resolve-rates";

const prisma = new PrismaClient();

const ORG_ID = "org-waketeam";

type StaffDef = {
  id: string;
  name: string;
  kind: string;
  sort: number;
  slotMinutes?: number;
  description?: string;
  schedule: { weekday: number; from: string; to: string }[];
};

type PriceRuleDef = {
  id: string;
  weekdays: string;
  timeFrom: string;
  timeTo: string;
  price: number;
  sortOrder: number;
};

type ServiceDef = {
  id: string;
  name: string;
  kind: string;
  price: number;
  durationMinutes: number;
  allowedDurations: string;
  from: string;
  to: string;
  weekdays: string;
  staffIds: string[];
  sort: number;
  priceRules?: PriceRuleDef[];
};

async function upsertStaff(branchId: string, defs: StaffDef[]) {
  for (const s of defs) {
    await prisma.staff.upsert({
      where: { id: s.id },
      create: {
        id: s.id,
        organizationId: ORG_ID,
        branchId,
        name: s.name,
        kind: s.kind,
        description: s.description ?? null,
        sortOrder: s.sort,
        slotMinutes: s.slotMinutes ?? 10,
      },
      update: {
        name: s.name,
        kind: s.kind,
        ...(s.description !== undefined ? { description: s.description } : {}),
        sortOrder: s.sort,
        slotMinutes: s.slotMinutes ?? 10,
      },
    });
    for (let wd = 1; wd <= 7; wd++) {
      const rule = s.schedule.find((r) => r.weekday === wd);
      await prisma.staffSchedule.upsert({
        where: { staffId_weekday: { staffId: s.id, weekday: wd } },
        create: {
          staffId: s.id,
          weekday: wd,
          isWorking: !!rule,
          timeFrom: rule?.from ?? "10:00",
          timeTo: rule?.to ?? "18:00",
        },
        update: {
          isWorking: !!rule,
          timeFrom: rule?.from ?? "10:00",
          timeTo: rule?.to ?? "18:00",
        },
      });
    }
  }
}

async function upsertServices(branchId: string, defs: ServiceDef[]) {
  for (const s of defs) {
    await prisma.service.upsert({
      where: { id: s.id },
      create: {
        id: s.id,
        branchId,
        name: s.name,
        kind: s.kind,
        price: s.price,
        durationMinutes: s.durationMinutes,
        allowedDurations: s.allowedDurations,
        bookableFrom: s.from,
        bookableTo: s.to,
        weekdays: s.weekdays,
        sortOrder: s.sort,
      },
      update: {
        name: s.name,
        kind: s.kind,
        price: s.price,
        durationMinutes: s.durationMinutes,
        allowedDurations: s.allowedDurations,
        bookableFrom: s.from,
        bookableTo: s.to,
        weekdays: s.weekdays,
        sortOrder: s.sort,
        isActive: true,
        isOnlineBookable: true,
      },
    });
    await prisma.serviceStaff.deleteMany({ where: { serviceId: s.id } });
    for (const staffId of s.staffIds) {
      await prisma.serviceStaff.create({
        data: { serviceId: s.id, staffId },
      });
    }
    if (s.priceRules) {
      await prisma.servicePriceRule.deleteMany({ where: { serviceId: s.id } });
      for (const rule of s.priceRules) {
        await prisma.servicePriceRule.upsert({
          where: { id: rule.id },
          create: {
            id: rule.id,
            serviceId: s.id,
            weekdays: rule.weekdays,
            timeFrom: rule.timeFrom,
            timeTo: rule.timeTo,
            price: rule.price,
            sortOrder: rule.sortOrder,
          },
          update: {
            weekdays: rule.weekdays,
            timeFrom: rule.timeFrom,
            timeTo: rule.timeTo,
            price: rule.price,
            sortOrder: rule.sortOrder,
          },
        });
      }
    }
  }
}

function wakeReversIds(branchPrefix: string, count = 3): string[] {
  return Array.from({ length: count }, (_, i) => `${branchPrefix}-rev${i + 1}`);
}

type DayWindow = { from: string; to: string; days: number[] };

function branchWakeRevers(
  branchPrefix: string,
  weekday: DayWindow,
  weekend?: DayWindow,
  descriptions?: string[],
  count = 3,
): StaffDef[] {
  return Array.from({ length: count }, (_, idx) => {
    const n = idx + 1;
    const schedule: { weekday: number; from: string; to: string }[] = [];
    for (const wd of weekday.days) {
      schedule.push({ weekday: wd, from: weekday.from, to: weekday.to });
    }
    if (weekend) {
      for (const wd of weekend.days) {
        schedule.push({ weekday: wd, from: weekend.from, to: weekend.to });
      }
    }
    return {
      id: `${branchPrefix}-rev${n}`,
      name: `Реверс №${n}`,
      kind: "revers",
      sort: n,
      description: descriptions?.[idx],
      schedule,
    };
  });
}

async function hideStaff(ids: string[]) {
  if (ids.length === 0) return;
  await prisma.staff.updateMany({
    where: { id: { in: ids } },
    data: { isActive: false, isVisible: false },
  });
}

async function migrateLegacyRevers(branchPrefix: string) {
  for (let n = 1; n <= 3; n++) {
    const newId = `${branchPrefix}-rev${n}`;
    for (const band of ["am", "pm", "we"]) {
      const oldId = `${branchPrefix}-${band}-rev${n}`;
      await prisma.appointment.updateMany({
        where: { staffId: oldId },
        data: { staffId: newId },
      });
      await prisma.serviceStaff.deleteMany({ where: { staffId: oldId } });
      await prisma.staff.updateMany({
        where: { id: oldId },
        data: { isActive: false, isVisible: false },
      });
    }
  }
}

function wakePriceRules(prefix: string): PriceRuleDef[] {
  return [
    {
      id: `${prefix}-rule-am`,
      weekdays: "1,2,3,4,5",
      timeFrom: "10:00",
      timeTo: "16:00",
      price: 15,
      sortOrder: 1,
    },
    {
      id: `${prefix}-rule-pm`,
      weekdays: "1,2,3,4,5",
      timeFrom: "16:00",
      timeTo: "21:00",
      price: 30,
      sortOrder: 2,
    },
    {
      id: `${prefix}-rule-we`,
      weekdays: "6,7",
      timeFrom: "09:00",
      timeTo: "21:00",
      price: 30,
      sortOrder: 3,
    },
  ];
}

async function deactivateLegacyWakeServices(ids: string[], targetId: string) {
  await prisma.appointment.updateMany({
    where: { serviceId: { in: ids } },
    data: { serviceId: targetId },
  });
  for (const id of ids) {
    await prisma.service.updateMany({
      where: { id },
      data: { isActive: false, isOnlineBookable: false },
    });
  }
}

function supBoards(prefix: string, count: number, from: string, to: string): StaffDef[] {
  const allDays = [1, 2, 3, 4, 5, 6, 7];
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-sup${i + 1}`,
    name: `Сапборд №${i + 1}`,
    kind: "sup",
    sort: 10 + i,
    slotMinutes: 60,
    schedule: allDays.map((wd) => ({ weekday: wd, from, to })),
  }));
}

async function upsertAdmin(
  login: string,
  password: string,
  name: string,
  lastName: string,
  role: "super_admin" | "branch_admin" | "branch_operator",
  branchId?: string,
  email?: string,
) {
  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { login },
    create: {
      login,
      email: email ?? null,
      passwordHash: hash,
      name,
      lastName,
    },
    update: { passwordHash: hash, name, lastName, ...(email ? { email } : {}) },
  });
  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: { organizationId: ORG_ID, userId: user.id },
    },
    create: {
      organizationId: ORG_ID,
      userId: user.id,
      role,
      branchId: branchId ?? null,
    },
    update: { role, branchId: branchId ?? null },
  });
  return user.id;
}

async function seedPayRates(
  login: string,
  rates: { kind: string; amount: number }[],
) {
  const member = await prisma.organizationMember.findFirst({
    where: {
      organizationId: ORG_ID,
      user: { login },
    },
  });
  if (!member) return;
  const from = "2020-01-01";
  for (const r of rates) {
    const existing = await prisma.memberPayRate.findFirst({
      where: { memberId: member.id, kind: r.kind, effectiveFrom: from },
    });
    if (!existing) {
      await prisma.memberPayRate.create({
        data: {
          memberId: member.id,
          kind: r.kind,
          amount: r.amount,
          effectiveFrom: from,
        },
      });
    }
  }
}

async function memberByLogin(login: string) {
  return prisma.organizationMember.findFirst({
    where: { organizationId: ORG_ID, user: { login } },
  });
}

async function ratesSnapshotFor(memberId: string, date: string) {
  const rates = await prisma.memberPayRate.findMany({ where: { memberId } });
  return serializeRatesSnapshot(resolveRatesForDate(rates, date));
}

/** Демо-смены 15–29.06.2026 для календаря и расчёта ЗП. */
async function seedDemoWorkShifts(raubichiId: string, druzyaId: string) {
  const operator = await memberByLogin("operator");
  const druzyaAdmin = await memberByLogin("druzya");
  const admin = await memberByLogin("admin");
  if (!operator) return;

  const reversId = "rau-rev1";
  const assignerId = admin?.id ?? operator.id;

  for (let d = 15; d <= 29; d++) {
    const date = `2026-06-${String(d).padStart(2, "0")}`;
    if (date === "2026-06-18" || date === "2026-06-25") continue;

    let status: "scheduled" | "closed" | "approved" = "scheduled";
    if (d <= 22) status = "closed";
    else if (d <= 26) status = "approved";

    const existing = await prisma.workShift.findUnique({
      where: { memberId_date: { memberId: operator.id, date } },
    });

    if (status === "scheduled") {
      if (existing) {
        await prisma.workShift.update({
          where: { id: existing.id },
          data: {
            status: "scheduled",
            plannedStart: "10:00",
            plannedEnd: "22:00",
            plannedStaffId: reversId,
            workAsAdmin: false,
            actualStart: null,
            actualEnd: null,
            ratesSnapshot: null,
            panelMinutesOverride: null,
            idleMinutesOverride: null,
          },
        });
      } else {
        await prisma.workShift.create({
          data: {
            organizationId: ORG_ID,
            branchId: raubichiId,
            memberId: operator.id,
            date,
            plannedStart: "10:00",
            plannedEnd: "22:00",
            plannedStaffId: reversId,
            status: "scheduled",
          },
        });
      }
      continue;
    }

    const start = parseTimeOnDate(date, "10:00");
    const end = parseTimeOnDate(date, "22:00");
    const spotStart = parseTimeOnDate(date, "14:00");
    const spotEnd = parseTimeOnDate(date, "15:15");
    const panelMinutes = 270 + (d % 3) * 30;
    const spotMinutes = 75;
    const idleMinutes = 720 - panelMinutes - spotMinutes;
    const snapshot = await ratesSnapshotFor(operator.id, date);

    const shift = existing
      ? await prisma.workShift.update({
          where: { id: existing.id },
          data: {
            status,
            branchId: raubichiId,
            plannedStart: "10:00",
            plannedEnd: "22:00",
            plannedStaffId: reversId,
            workAsAdmin: false,
            actualStart: start,
            actualEnd: end,
            ratesSnapshot: snapshot,
            panelMinutesOverride: panelMinutes,
            idleMinutesOverride: idleMinutes,
          },
        })
      : await prisma.workShift.create({
          data: {
            organizationId: ORG_ID,
            branchId: raubichiId,
            memberId: operator.id,
            date,
            plannedStart: "10:00",
            plannedEnd: "22:00",
            plannedStaffId: reversId,
            status,
            actualStart: start,
            actualEnd: end,
            ratesSnapshot: snapshot,
            panelMinutesOverride: panelMinutes,
            idleMinutesOverride: idleMinutes,
          },
        });

    await prisma.reverseAssignment.deleteMany({ where: { shiftId: shift.id } });
    await prisma.reverseAssignment.create({
      data: { shiftId: shift.id, staffId: reversId, startedAt: start, endedAt: end },
    });

    await prisma.spotWorkEntry.deleteMany({ where: { shiftId: shift.id } });
    await prisma.spotWorkEntry.create({
      data: {
        shiftId: shift.id,
        category: "spot",
        comment: "Демо: уборка спота",
        startedAt: spotStart,
        endedAt: spotEnd,
        isActive: false,
        createdByMemberId: assignerId,
      },
    });
  }

  if (druzyaAdmin) {
    for (const date of [
      "2026-06-16",
      "2026-06-17",
      "2026-06-18",
      "2026-06-19",
      "2026-06-20",
    ]) {
      const start = parseTimeOnDate(date, "09:00");
      const end = parseTimeOnDate(date, "18:00");
      const snapshot = await ratesSnapshotFor(druzyaAdmin.id, date);
      const existing = await prisma.workShift.findUnique({
        where: { memberId_date: { memberId: druzyaAdmin.id, date } },
      });
      if (existing) {
        await prisma.workShift.update({
          where: { id: existing.id },
          data: {
            status: "closed",
            branchId: druzyaId,
            actualStart: start,
            actualEnd: end,
            ratesSnapshot: snapshot,
            workAsAdmin: false,
            plannedStart: "09:00",
            plannedEnd: "18:00",
          },
        });
      } else {
        await prisma.workShift.create({
          data: {
            organizationId: ORG_ID,
            branchId: druzyaId,
            memberId: druzyaAdmin.id,
            date,
            plannedStart: "09:00",
            plannedEnd: "18:00",
            status: "closed",
            actualStart: start,
            actualEnd: end,
            ratesSnapshot: snapshot,
          },
        });
      }
    }
  }
}

async function main() {
  const email = process.env.ADMIN_EMAIL ?? "admin@waketeam.by";
  const password = process.env.ADMIN_PASSWORD ?? "changeme";
  const branchPassword = process.env.BRANCH_ADMIN_PASSWORD ?? password;

  await prisma.organization.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      name: "WakeTeam",
      slug: "waketeam",
      timezone: "Europe/Minsk",
      currency: "BYN",
      widgetSettings: JSON.stringify(DEFAULT_WIDGET_SETTINGS),
    },
    update: {
      widgetSettings: JSON.stringify(DEFAULT_WIDGET_SETTINGS),
    },
  });

  // Главный админ (Раубичи) — видит все филиалы
  await upsertAdmin(
    "admin",
    password,
    "WakeTeam",
    "Администратор",
    "super_admin",
    undefined,
    email,
  );

  // --- Раубичи ---
  const raubichi = await prisma.branch.upsert({
    where: { id: "branch-raubichi" },
    create: {
      id: "branch-raubichi",
      organizationId: ORG_ID,
      name: 'Вейкпарк "Раубичи"',
      address: "Раубическое вдхр., 54.063023, 27.741217",
      phone: "+375 (44) 599-65-65",
      description: "Спот открыт, записывайтесь!",
      sortOrder: 1,
    },
    update: {},
  });

  const raubichiStaff: StaffDef[] = [
    ...branchWakeRevers(
      "rau",
      { from: "10:00", to: "21:00", days: [1, 2, 3, 4, 5] },
      { from: "09:00", to: "21:00", days: [6, 7] },
      [
        "Фигуры: два кикера M, стол 16 м с двумя заездами",
        "Без фигур",
        "Фигуры: два кикера M, труба 16 м, руфтоп 18 м с двумя заездами",
      ],
    ),
    ...supBoards("rau", 7, "09:00", "21:00"),
  ];
  await upsertStaff(raubichi.id, raubichiStaff);
  await migrateLegacyRevers("rau");

  await upsertServices(raubichi.id, [
    {
      id: "rau-wake",
      name: "Вейкбординг",
      kind: "wake",
      price: 15,
      durationMinutes: 10,
      allowedDurations: "10,30,60",
      from: "09:00",
      to: "21:00",
      weekdays: "1,2,3,4,5,6,7",
      staffIds: wakeReversIds("rau"),
      sort: 1,
      priceRules: wakePriceRules("rau"),
    },
    {
      id: "rau-sup",
      name: "Сапборд",
      kind: "sup",
      price: 20,
      durationMinutes: 60,
      allowedDurations: "60",
      from: "09:00",
      to: "21:00",
      weekdays: "1,2,3,4,5,6,7",
      staffIds: Array.from({ length: 7 }, (_, i) => `rau-sup${i + 1}`),
      sort: 2,
    },
  ]);
  await deactivateLegacyWakeServices(
    ["rau-wake-wd-am", "rau-wake-wd-pm", "rau-wake-we"],
    "rau-wake",
  );

  // --- Друзья ---
  const druzya = await prisma.branch.upsert({
    where: { id: "branch-druzya" },
    create: {
      id: "branch-druzya",
      organizationId: ORG_ID,
      name: 'Вейкпарк "Друзья"',
      address: "г. Минск",
      phone: "+375 (44) 599-65-65",
      description: "Спот открыт, записывайтесь!",
      sortOrder: 2,
    },
    update: {},
  });

  const druzyaStaff: StaffDef[] = [
    ...branchWakeRevers(
      "dru",
      { from: "10:00", to: "21:00", days: [1, 2, 3, 4, 5, 6, 7] },
      undefined,
      ["Фигуры: двойной кикер L, труба L 16 м, олли кикер L, пирамидка"],
      1,
    ),
  ];
  await upsertStaff(druzya.id, druzyaStaff);
  await migrateLegacyRevers("dru");
  await hideStaff([
    "dru-rev2",
    "dru-rev3",
    ...Array.from({ length: 7 }, (_, i) => `dru-sup${i + 1}`),
  ]);

  await upsertServices(druzya.id, [
    {
      id: "dru-wake",
      name: "Вейкбординг",
      kind: "wake",
      price: 15,
      durationMinutes: 10,
      allowedDurations: "10,30,60",
      from: "10:00",
      to: "21:00",
      weekdays: "1,2,3,4,5,6,7",
      staffIds: wakeReversIds("dru", 1),
      sort: 1,
      priceRules: [
        {
          id: "dru-rule-am",
          weekdays: "1,2,3,4,5",
          timeFrom: "10:00",
          timeTo: "16:00",
          price: 15,
          sortOrder: 1,
        },
        {
          id: "dru-rule-pm",
          weekdays: "1,2,3,4,5",
          timeFrom: "16:00",
          timeTo: "21:00",
          price: 30,
          sortOrder: 2,
        },
        {
          id: "dru-rule-we",
          weekdays: "6,7",
          timeFrom: "10:00",
          timeTo: "21:00",
          price: 30,
          sortOrder: 3,
        },
      ],
    },
  ]);
  await deactivateLegacyWakeServices(
    ["dru-wake-wd-am", "dru-wake-wd-pm", "dru-wake-we"],
    "dru-wake",
  );

  // --- Стайки ---
  const stayki = await prisma.branch.upsert({
    where: { id: "branch-stayki" },
    create: {
      id: "branch-stayki",
      organizationId: ORG_ID,
      name: 'Вейкпарк "Стайки"',
      address: "г. Минск",
      phone: "+375 (44) 599-65-65",
      description: "Скидка на катание -50%",
      sortOrder: 3,
    },
    update: {},
  });

  const staykiStaff: StaffDef[] = [
    ...branchWakeRevers(
      "sta",
      { from: "09:00", to: "20:00", days: [1, 2, 3, 4, 5, 6, 7] },
      undefined,
      ["Фигуры: два кикера M"],
      1,
    ),
    ...supBoards("sta", 2, "09:00", "21:00"),
  ];
  await upsertStaff(stayki.id, staykiStaff);
  await migrateLegacyRevers("sta");
  await hideStaff([
    "sta-rev2",
    "sta-rev3",
    "sta-sup3",
    "sta-sup4",
    "sta-sup5",
  ]);

  await upsertServices(stayki.id, [
    {
      id: "sta-wake",
      name: "Вейкбординг",
      kind: "wake",
      price: 15,
      durationMinutes: 10,
      allowedDurations: "10,30,60",
      from: "09:00",
      to: "20:00",
      weekdays: "1,2,3,4,5,6,7",
      staffIds: wakeReversIds("sta", 1),
      sort: 1,
      priceRules: [
        {
          id: "sta-rule-am",
          weekdays: "1,2,3,4,5",
          timeFrom: "09:00",
          timeTo: "16:00",
          price: 15,
          sortOrder: 1,
        },
        {
          id: "sta-rule-pm",
          weekdays: "1,2,3,4,5",
          timeFrom: "16:00",
          timeTo: "20:00",
          price: 30,
          sortOrder: 2,
        },
        {
          id: "sta-rule-we",
          weekdays: "6,7",
          timeFrom: "09:00",
          timeTo: "20:00",
          price: 30,
          sortOrder: 3,
        },
      ],
    },
    {
      id: "sta-sup",
      name: "Сапборд",
      kind: "sup",
      price: 20,
      durationMinutes: 60,
      allowedDurations: "60",
      from: "09:00",
      to: "21:00",
      weekdays: "1,2,3,4,5,6,7",
      staffIds: ["sta-sup1", "sta-sup2"],
      sort: 2,
    },
  ]);
  await deactivateLegacyWakeServices(
    ["sta-wake-wd-am", "sta-wake-wd-pm", "sta-wake-we"],
    "sta-wake",
  );

  // Админы филиалов — только свой филиал
  await upsertAdmin(
    "druzya",
    branchPassword,
    "Админ",
    "Друзья",
    "branch_admin",
    druzya.id,
    "druzya@waketeam.by",
  );
  await upsertAdmin(
    "stayki",
    branchPassword,
    "Админ",
    "Стайки",
    "branch_admin",
    stayki.id,
    "stayki@waketeam.by",
  );
  await upsertAdmin(
    "operator",
    branchPassword,
    "Оператор",
    "Раубичи",
    "branch_operator",
    raubichi.id,
    "operator@waketeam.by",
  );

  await seedPayRates("operator", [
    { kind: "panel", amount: 12 },
    { kind: "spot", amount: 10 },
    { kind: "idle", amount: 8 },
  ]);
  await seedPayRates("druzya", [{ kind: "shift", amount: 15 }]);
  await seedPayRates("stayki", [{ kind: "shift", amount: 15 }]);

  await seedDemoWorkShifts(raubichi.id, druzya.id);

  console.log("Seed OK. Organization: waketeam");
  console.log("Super admin (все филиалы):", email);
  console.log("Друзья:", "druzya@waketeam.by");
  console.log("Стайки:", "stayki@waketeam.by");
  console.log("Оператор Раубичи:", "operator@waketeam.by");
  console.log("Пароль филиальных админов:", branchPassword);
  console.log("Branches: Раубичи, Друзья, Стайки");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
