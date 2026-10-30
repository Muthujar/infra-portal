// Small helpers shared by the API tests.

import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/db";

export const app = createApp();

export const DEMO_PASSWORD = "Password@123";

// Logs in a demo user and returns the JWT.
export async function login(email: string): Promise<string> {
  const response = await request(app).post("/api/auth/login").send({ email: email, password: DEMO_PASSWORD });
  if (response.status !== 200) {
    throw new Error("Login failed for " + email + ": " + response.status);
  }
  return response.body.token;
}

// Each test gets its own hostname, so tests do not clash on "hostname already in use".
let counter = 0;
export function uniqueHostname(prefix: string): string {
  counter = counter + 1;
  return prefix + "-" + Date.now().toString(36) + "-" + counter;
}

export async function catalogItemId(name: string): Promise<number> {
  const item = await prisma.catalogItem.findFirstOrThrow({ where: { name: name } });
  return item.id;
}

// Takes all servers of the demo teams out of the quota, so each test starts with a full quota.
export async function releaseAllQuota() {
  await prisma.request.updateMany({
    where: { status: { notIn: ["REJECTED", "DECOMMISSIONED"] } },
    data: { status: "DECOMMISSIONED" },
  });
}
