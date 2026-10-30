// Runs once before all tests: brings the test database up to date and fills it with fresh demo data.

import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";

export default async function setup() {
  const databaseUrl =
    process.env.TEST_DATABASE_URL || "postgresql://portal:portal@localhost:5432/infra_portal_test";

  // Safety check: never empty the normal development database by accident.
  if (!databaseUrl.includes("test")) {
    throw new Error("TEST_DATABASE_URL must point to a database with 'test' in its name");
  }
  const env = { ...process.env, DATABASE_URL: databaseUrl };

  // 1. Create or update the tables.
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: env });

  // 2. Empty every table, so each test run starts from the same data.
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "AuditEvent", "Request", "CatalogItem", "User", "Team" RESTART IDENTITY CASCADE'
  );
  await prisma.$disconnect();

  // 3. Add the demo teams, users and catalog.
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit", env: env });
}
