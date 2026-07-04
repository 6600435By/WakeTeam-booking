-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN "operatorMemberId" TEXT;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_operatorMemberId_fkey" FOREIGN KEY ("operatorMemberId") REFERENCES "OrganizationMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
