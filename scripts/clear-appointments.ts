import { prisma } from "../src/lib/db";

async function main() {
  const apptLogs = await prisma.adminActivityLog.deleteMany({
    where: { action: { startsWith: "appt." } },
  });
  const membershipTx = await prisma.membershipTransaction.deleteMany({
    where: { appointmentId: { not: null } },
  });
  const appts = await prisma.appointment.deleteMany({});
  console.log(
    `Deleted: ${appts.count} appointments, ${apptLogs.count} activity logs, ${membershipTx.count} membership transactions`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
