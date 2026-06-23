import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ORG_ID = "org-waketeam";

type StaffDef = {
  id: string;
  name: string;
  kind: string;
  sort: number;
  slotMinutes?: number;
  schedule: { weekday: number; from: string; to: string }[];
};

type ServiceDef = {
  id: string;
  name: string;
  price: number;
  durationMinutes: number;
  allowedDurations: string;
  from: string;
  to: string;
  weekdays: string;
  staffIds: string[];
  sort: number;
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
        sortOrder: s.sort,
        slotMinutes: s.slotMinutes ?? 10,
      },
      update: {
        name: s.name,
        kind: s.kind,
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
        price: s.price,
        durationMinutes: s.durationMinutes,
        allowedDurations: s.allowedDurations,
        bookableFrom: s.from,
        bookableTo: s.to,
        weekdays: s.weekdays,
        sortOrder: s.sort,
      },
    });
    await prisma.serviceStaff.deleteMany({ where: { serviceId: s.id } });
    for (const staffId of s.staffIds) {
      await prisma.serviceStaff.create({
        data: { serviceId: s.id, staffId },
      });
    }
  }
}

function wakeRevers(prefix: string, from: string, to: string, weekdays: number[]): StaffDef[] {
  return [1, 2, 3].map((n) => ({
    id: `${prefix}-rev${n}`,
    name: `Реверс №${n} (${from}–${to})`,
    kind: "revers",
    sort: n,
    schedule: weekdays.map((wd) => ({ weekday: wd, from, to })),
  }));
}

function supBoards(prefix: string, count: number, from: string, to: string): StaffDef[] {
  const allDays = [1, 2, 3, 4, 5, 6, 7];
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-sup${i + 1}`,
    name: `Сапборд №${i + 1}`,
    kind: "sup",
    sort: 10 + i,
    schedule: allDays.map((wd) => ({ weekday: wd, from, to })),
  }));
}

async function upsertAdmin(
  email: string,
  password: string,
  name: string,
  role: "super_admin" | "branch_admin",
  branchId?: string,
) {
  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, passwordHash: hash, name },
    update: { passwordHash: hash, name },
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
    },
    update: {},
  });

  // Главный админ (Раубичи) — видит все филиалы
  await upsertAdmin(
    email,
    password,
    "Администратор WakeTeam (Раубичи)",
    "super_admin",
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
    ...wakeRevers("rau-am", "10:00", "16:00", [1, 2, 3, 4, 5]),
    ...wakeRevers("rau-pm", "16:00", "21:00", [1, 2, 3, 4, 5]),
    ...wakeRevers("rau-we", "09:00", "21:00", [6, 7]),
    ...supBoards("rau", 7, "09:00", "21:00"),
  ];
  await upsertStaff(raubichi.id, raubichiStaff);

  await upsertServices(raubichi.id, [
    {
      id: "rau-wake-wd-am",
      name: "Вейкбординг будний день (10:00–16:00)",
      price: 15,
      durationMinutes: 10,
      allowedDurations: "10,30,60",
      from: "10:00",
      to: "16:00",
      weekdays: "1,2,3,4,5",
      staffIds: ["rau-am-rev1", "rau-am-rev2", "rau-am-rev3"],
      sort: 1,
    },
    {
      id: "rau-wake-wd-pm",
      name: "Вейкбординг будний день (16:00–21:00)",
      price: 30,
      durationMinutes: 10,
      allowedDurations: "10,30,60",
      from: "16:00",
      to: "21:00",
      weekdays: "1,2,3,4,5",
      staffIds: ["rau-pm-rev1", "rau-pm-rev2", "rau-pm-rev3"],
      sort: 2,
    },
    {
      id: "rau-wake-we",
      name: "Вейкбординг выходной день (09:00–21:00)",
      price: 30,
      durationMinutes: 10,
      allowedDurations: "10,30,60",
      from: "09:00",
      to: "21:00",
      weekdays: "6,7",
      staffIds: ["rau-we-rev1", "rau-we-rev2", "rau-we-rev3"],
      sort: 3,
    },
    {
      id: "rau-sup",
      name: "Катание на сапборде (09:00–21:00)",
      price: 20,
      durationMinutes: 30,
      allowedDurations: "30,60",
      from: "09:00",
      to: "21:00",
      weekdays: "1,2,3,4,5,6,7",
      staffIds: Array.from({ length: 7 }, (_, i) => `rau-sup${i + 1}`),
      sort: 4,
    },
  ]);

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
    ...wakeRevers("dru-am", "10:00", "16:00", [1, 2, 3, 4, 5]),
    ...wakeRevers("dru-pm", "16:00", "21:00", [1, 2, 3, 4, 5]),
    ...wakeRevers("dru-we", "10:00", "21:00", [6, 7]),
  ];
  await upsertStaff(druzya.id, druzyaStaff);

  await upsertServices(druzya.id, [
    {
      id: "dru-wake-wd-am",
      name: "Вейкбординг будний день (10:00–16:00)",
      price: 15,
      durationMinutes: 10,
      allowedDurations: "10,30,60",
      from: "10:00",
      to: "16:00",
      weekdays: "1,2,3,4,5",
      staffIds: ["dru-am-rev1", "dru-am-rev2", "dru-am-rev3"],
      sort: 1,
    },
    {
      id: "dru-wake-wd-pm",
      name: "Вейкбординг будний день (16:00–21:00)",
      price: 30,
      durationMinutes: 10,
      allowedDurations: "10,30,60",
      from: "16:00",
      to: "21:00",
      weekdays: "1,2,3,4,5",
      staffIds: ["dru-pm-rev1", "dru-pm-rev2", "dru-pm-rev3"],
      sort: 2,
    },
    {
      id: "dru-wake-we",
      name: "Вейкбординг выходной день (10:00–21:00)",
      price: 30,
      durationMinutes: 10,
      allowedDurations: "10,30,60",
      from: "10:00",
      to: "21:00",
      weekdays: "6,7",
      staffIds: ["dru-we-rev1", "dru-we-rev2", "dru-we-rev3"],
      sort: 3,
    },
  ]);

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
    ...wakeRevers("sta-am", "09:00", "16:00", [1, 2, 3, 4, 5]),
    ...wakeRevers("sta-pm", "16:00", "20:00", [1, 2, 3, 4, 5]),
    ...wakeRevers("sta-we", "09:00", "20:00", [6, 7]),
    ...supBoards("sta", 5, "09:00", "21:00"),
  ];
  await upsertStaff(stayki.id, staykiStaff);

  await upsertServices(stayki.id, [
    {
      id: "sta-wake-wd-am",
      name: "Вейкбординг будний день (09:00–16:00)",
      price: 15,
      durationMinutes: 10,
      allowedDurations: "10,30,60",
      from: "09:00",
      to: "16:00",
      weekdays: "1,2,3,4,5",
      staffIds: ["sta-am-rev1", "sta-am-rev2", "sta-am-rev3"],
      sort: 1,
    },
    {
      id: "sta-wake-wd-pm",
      name: "Вейкбординг будний день (16:00–20:00)",
      price: 30,
      durationMinutes: 10,
      allowedDurations: "10,30,60",
      from: "16:00",
      to: "20:00",
      weekdays: "1,2,3,4,5",
      staffIds: ["sta-pm-rev1", "sta-pm-rev2", "sta-pm-rev3"],
      sort: 2,
    },
    {
      id: "sta-wake-we",
      name: "Вейкбординг выходной день (09:00–20:00)",
      price: 30,
      durationMinutes: 10,
      allowedDurations: "10,30,60",
      from: "09:00",
      to: "20:00",
      weekdays: "6,7",
      staffIds: ["sta-we-rev1", "sta-we-rev2", "sta-we-rev3"],
      sort: 3,
    },
    {
      id: "sta-sup",
      name: "Катание на сапборде (09:00–21:00)",
      price: 20,
      durationMinutes: 30,
      allowedDurations: "30,60",
      from: "09:00",
      to: "21:00",
      weekdays: "1,2,3,4,5,6,7",
      staffIds: Array.from({ length: 5 }, (_, i) => `sta-sup${i + 1}`),
      sort: 4,
    },
  ]);

  // Админы филиалов — только свой филиал
  await upsertAdmin(
    "druzya@waketeam.by",
    branchPassword,
    'Админ "Друзья"',
    "branch_admin",
    druzya.id,
  );
  await upsertAdmin(
    "stayki@waketeam.by",
    branchPassword,
    'Админ "Стайки"',
    "branch_admin",
    stayki.id,
  );

  console.log("Seed OK. Organization: waketeam");
  console.log("Super admin (все филиалы):", email);
  console.log("Друзья:", "druzya@waketeam.by");
  console.log("Стайки:", "stayki@waketeam.by");
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
