// Lease / expiry: servers with a lease are decommissioned automatically when it ends.

import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db";
import { expireLeases, provision } from "../src/jobs";
import { app, catalogItemId, login, releaseAllQuota, uniqueHostname } from "./helpers";

vi.mock("../src/queue/queue", () => {
  return { addJob: vi.fn(async () => {}) };
});

let devToken = "";
let leadToken = "";
let smallServerId = 0;

beforeAll(async () => {
  devToken = await login("dev@demo.local");
  leadToken = await login("lead@demo.local");
  smallServerId = await catalogItemId("Small Linux Server");
});

beforeEach(async () => {
  await releaseAllQuota();
});

// Creates, approves and provisions a server, and returns its request id.
async function runningServer(leaseDays: number | null): Promise<number> {
  const created = await request(app)
    .post("/api/requests")
    .set("Authorization", "Bearer " + devToken)
    .send({
      catalogItemId: smallServerId,
      hostname: uniqueHostname("lease"),
      environment: "DEV",
      justification: "lease test",
      leaseDays: leaseDays,
    });
  expect(created.status).toBe(201);
  const id = created.body.id;
  await request(app).post("/api/requests/" + id + "/approve").set("Authorization", "Bearer " + leadToken).send({});
  await provision(id);
  return id;
}

describe("server leases", () => {
  it("sets the expiry date when the server is ready", async () => {
    const id = await runningServer(7);
    const saved = await prisma.request.findUniqueOrThrow({ where: { id: id } });
    expect(saved.leaseDays).toBe(7);
    expect(saved.expiresAt).not.toBeNull();

    const days = (saved.expiresAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);
  });

  it("never expires a server without a lease", async () => {
    const id = await runningServer(null);
    const saved = await prisma.request.findUniqueOrThrow({ where: { id: id } });
    expect(saved.expiresAt).toBeNull();
  });

  it("decommissions servers whose lease has ended, and only those", async () => {
    const endedId = await runningServer(1);
    const activeId = await runningServer(30);
    await prisma.request.update({ where: { id: endedId }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const handled = await expireLeases();
    expect(handled).toEqual([endedId]);

    const ended = await prisma.request.findUniqueOrThrow({ where: { id: endedId } });
    expect(ended.status).toBe("DECOMMISSIONED");
    const active = await prisma.request.findUniqueOrThrow({ where: { id: activeId } });
    expect(active.status).toBe("COMPLETED");
  });

  it("lets the owner extend a lease", async () => {
    const id = await runningServer(7);
    const before = await prisma.request.findUniqueOrThrow({ where: { id: id } });

    const response = await request(app)
      .post("/api/requests/" + id + "/extend")
      .set("Authorization", "Bearer " + devToken)
      .send({ days: 30 });
    expect(response.status).toBe(200);
    expect(response.body.leaseDays).toBe(37);

    const after = await prisma.request.findUniqueOrThrow({ where: { id: id } });
    const addedDays = (after.expiresAt!.getTime() - before.expiresAt!.getTime()) / (24 * 60 * 60 * 1000);
    expect(addedDays).toBeCloseTo(30);
  });

  it("cannot extend a server without a lease", async () => {
    const id = await runningServer(null);
    const response = await request(app)
      .post("/api/requests/" + id + "/extend")
      .set("Authorization", "Bearer " + devToken)
      .send({ days: 30 });
    expect(response.status).toBe(409);
  });
});
