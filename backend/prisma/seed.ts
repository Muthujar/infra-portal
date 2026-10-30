// Fills the database with demo teams, users and catalog items.
// Run with: npm run db:seed

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "Password@123";

async function main() {
  console.log("Seeding database...");

  // 1. Teams with their quotas
  const payments = await prisma.team.upsert({
    where: { name: "Payments" },
    update: {},
    create: { name: "Payments", cpuQuota: 8, memoryQuotaMb: 8192, diskQuotaGb: 100 },
  });

  const platform = await prisma.team.upsert({
    where: { name: "Platform" },
    update: {},
    create: { name: "Platform", cpuQuota: 32, memoryQuotaMb: 32768, diskQuotaGb: 500 },
  });

  // 2. Users, one for each role
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const users = [
    { email: "dev@demo.local", name: "Priya (Developer)", role: "REQUESTER" as const, teamId: payments.id },
    { email: "lead@demo.local", name: "Arun (Team Lead)", role: "APPROVER" as const, teamId: payments.id },
    { email: "admin@demo.local", name: "Kavya (DevOps Admin)", role: "ADMIN" as const, teamId: platform.id },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: { ...user, passwordHash },
    });
  }

  // 3. Service catalog. Only create it once.
  const existingItems = await prisma.catalogItem.count();
  if (existingItems === 0) {
    await prisma.catalogItem.createMany({
      data: [
        {
          name: "Small Linux Server",
          description: "Ubuntu container for small apps, scripts and testing.",
          platform: "PROXMOX",
          osName: "Ubuntu 22.04",
          cpu: 1,
          memoryMb: 1024,
          diskGb: 8,
        },
        {
          name: "Medium Linux Server",
          description: "Ubuntu container for APIs and web applications.",
          platform: "PROXMOX",
          osName: "Ubuntu 22.04",
          cpu: 2,
          memoryMb: 2048,
          diskGb: 16,
        },
        {
          name: "Database Server",
          description: "Ubuntu container sized for PostgreSQL or MySQL.",
          platform: "PROXMOX",
          osName: "Ubuntu 22.04",
          cpu: 4,
          memoryMb: 4096,
          diskGb: 40,
        },
        {
          name: "AWS Small (t3.micro)",
          description: "EC2 instance in AWS for internet-facing workloads.",
          platform: "AWS",
          osName: "Ubuntu 22.04",
          cpu: 2,
          memoryMb: 1024,
          diskGb: 8,
          awsInstanceType: "t3.micro",
        },
        {
          name: "AWS Medium (t3.medium)",
          description: "EC2 instance in AWS for heavier workloads.",
          platform: "AWS",
          osName: "Ubuntu 22.04",
          cpu: 2,
          memoryMb: 4096,
          diskGb: 20,
          awsInstanceType: "t3.medium",
        },
      ],
    });
  }

  console.log("Done. Demo users (password: " + DEMO_PASSWORD + "):");
  for (const user of users) {
    console.log("  " + user.email + "  ->  " + user.role);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
