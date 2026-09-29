import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SEED_PASSWORDS = {
  admin: "Admin@Bharat2026!",
  investigator: "Invest@Bharat2026!",
  senior: "Senior@Bharat2026!",
  auditor: "Audit@Bharat2026!",
};

async function main() {
  const adminHash = await bcrypt.hash(SEED_PASSWORDS.admin, 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@bharatraksha.gov.in" },
    update: { passwordHash: adminHash, passwordChangedAt: new Date() },
    create: {
      email: "admin@bharatraksha.gov.in",
      passwordHash: adminHash,
      name: "System Administrator",
      role: UserRole.ADMIN,
      policeStation: "HQ",
      badgeNumber: "ADM-001",
      passwordChangedAt: new Date(),
    },
  });

  const investigatorHash = await bcrypt.hash(SEED_PASSWORDS.investigator, 12);
  const investigator = await prisma.user.upsert({
    where: { email: "investigator@bharatraksha.gov.in" },
    update: { passwordHash: investigatorHash, passwordChangedAt: new Date() },
    create: {
      email: "investigator@bharatraksha.gov.in",
      passwordHash: investigatorHash,
      name: "Rajesh Kumar",
      role: UserRole.INVESTIGATOR,
      policeStation: "Cyber Crime Cell, Bengaluru",
      badgeNumber: "INV-042",
      passwordChangedAt: new Date(),
    },
  });

  const seniorHash = await bcrypt.hash(SEED_PASSWORDS.senior, 12);
  await prisma.user.upsert({
    where: { email: "senior@bharatraksha.gov.in" },
    update: { passwordHash: seniorHash, passwordChangedAt: new Date() },
    create: {
      email: "senior@bharatraksha.gov.in",
      passwordHash: seniorHash,
      name: "Priya Sharma",
      role: UserRole.SENIOR_OFFICER,
      policeStation: "Cyber Crime Cell, Bengaluru",
      badgeNumber: "SO-007",
      passwordChangedAt: new Date(),
    },
  });

  const auditorHash = await bcrypt.hash(SEED_PASSWORDS.auditor, 12);
  await prisma.user.upsert({
    where: { email: "auditor@bharatraksha.gov.in" },
    update: { passwordHash: auditorHash, passwordChangedAt: new Date() },
    create: {
      email: "auditor@bharatraksha.gov.in",
      passwordHash: auditorHash,
      name: "Audit Officer",
      role: UserRole.AUDITOR,
      policeStation: "Internal Audit",
      badgeNumber: "AUD-001",
      passwordChangedAt: new Date(),
    },
  });

  console.log("Seed complete (12+ char passwords):");
  console.log(`  Admin: ${admin.email}`);
  console.log(`  Investigator: ${investigator.email}`);
  console.log("  Passwords printed once — change after first login.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
