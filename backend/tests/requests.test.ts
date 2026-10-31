// API tests for the main workflow: request -> approve -> provision -> decommission.
// The worker's job functions are called directly, so no Redis or worker process is needed.

import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db";
import { addJob } from "../src/queue/queue";
import { decommission, provision } from "../src/jobs";
import { app, catalogItemId, login, releaseAllQuota, uniqueHostname } from "./helpers";

vi.mock("../src/queue/queue", () => {
  return { addJob: vi.fn(async () => {}) };
});

let devToken = "";
let leadToken = "";
let adminToken = "";
let smallServerId = 0;

beforeAll(async () => {
  devToken = await login("dev@demo.local");
  leadToken = await login("lead@demo.local");
  adminToken = await login("admin@demo.local");
  smallServerId = await catalogItemId("Small Linux Server");
});

beforeEach(async () => {
  await releaseAllQuota();
  vi.mocked(addJob).mockClear();
});

function auth(token: string) {
  return "Bearer " + token;
}

async function createRequest(token: string, hostname: string, environment = "DEV") {
  return request(app)
    .post("/api/requests")
    .set("Authorization", auth(token))
    .send({
      catalogItemId: smallServerId,
      hostname: hostname,
      environment: environment,
      justification: "needed for testing",
    });
}

async function getStatus(requestId: number): Promise<string> {
  const saved = await prisma.request.findUniqueOrThrow({ where: { id: requestId } });
  return saved.status;
}

describe("server request workflow", () => {
  it("goes from request to completed server and back to decommissioned", async () => {
    const created = await createRequest(devToken, uniqueHostname("web"));
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("PENDING_APPROVAL");
    const id = created.body.id;

    const approved = await request(app)
      .post("/api/requests/" + id + "/approve")
      .set("Authorization", auth(leadToken))
      .send({ comment: "looks good" });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe("APPROVED");
    expect(approved.body.terraformCode).toContain(created.body.hostname);
    expect(addJob).toHaveBeenCalledWith("provision", id);

    // What the worker does when it picks up the job:
    await provision(id);
    const completed = await prisma.request.findUniqueOrThrow({ where: { id: id } });
    expect(completed.status).toBe("COMPLETED");
    expect(completed.externalId).toBe(String(1000 + id));

    const decom = await request(app)
      .post("/api/requests/" + id + "/decommission")
      .set("Authorization", auth(devToken));
    expect(decom.status).toBe(200);
    expect(addJob).toHaveBeenCalledWith("decommission", id);

    await decommission(id);
    expect(await getStatus(id)).toBe("DECOMMISSIONED");

    // Every step is in the audit trail.
    const detail = await request(app).get("/api/requests/" + id).set("Authorization", auth(devToken));
    const statuses = detail.body.auditEvents.map((event: { toStatus: string }) => event.toStatus);
    expect(statuses).toEqual([
      "PENDING_APPROVAL",
      "APPROVED",
      "PROVISIONING",
      "CONFIGURING",
      "COMPLETED",
      "DECOMMISSIONING",
      "DECOMMISSIONED",
    ]);
  });

  it("marks a request FAILED and lets the owner retry it", async () => {
    // The mock provisioner fails for hostnames containing "fail".
    const created = await createRequest(devToken, uniqueHostname("fail"));
    const id = created.body.id;
    await request(app).post("/api/requests/" + id + "/approve").set("Authorization", auth(leadToken)).send({});

    await provision(id);
    const failed = await prisma.request.findUniqueOrThrow({ where: { id: id } });
    expect(failed.status).toBe("FAILED");
    expect(failed.errorMessage).toContain("Simulated Terraform failure");

    const retry = await request(app).post("/api/requests/" + id + "/retry").set("Authorization", auth(devToken));
    expect(retry.status).toBe(200);
    expect(retry.body.status).toBe("APPROVED");
    expect(addJob).toHaveBeenLastCalledWith("provision", id);
  });

  it("retries the delete, not the build, when decommission failed", async () => {
    const created = await createRequest(devToken, uniqueHostname("db"));
    const id = created.body.id;
    await request(app).post("/api/requests/" + id + "/approve").set("Authorization", auth(leadToken)).send({});
    await provision(id);
    await request(app).post("/api/requests/" + id + "/decommission").set("Authorization", auth(devToken));

    // Simulate the worker failing during decommission.
    await prisma.request.update({ where: { id: id }, data: { status: "FAILED" } });
    await prisma.auditEvent.create({
      data: { action: "STATUS_CHANGED", message: "Decommission failed", requestId: id, fromStatus: "DECOMMISSIONING", toStatus: "FAILED" },
    });

    const retry = await request(app).post("/api/requests/" + id + "/retry").set("Authorization", auth(devToken));
    expect(retry.status).toBe(200);
    expect(retry.body.status).toBe("DECOMMISSIONING");
    expect(addJob).toHaveBeenLastCalledWith("decommission", id);
  });

  it("lets an approver reject with a reason", async () => {
    const created = await createRequest(devToken, uniqueHostname("rej"));
    const rejected = await request(app)
      .post("/api/requests/" + created.body.id + "/reject")
      .set("Authorization", auth(leadToken))
      .send({ comment: "no budget this month" });
    expect(rejected.status).toBe(200);
    expect(rejected.body.status).toBe("REJECTED");
    expect(addJob).not.toHaveBeenCalled();
  });
});

describe("approval rules (RBAC)", () => {
  it("does not let a requester approve", async () => {
    const created = await createRequest(devToken, uniqueHostname("rbac"));
    const response = await request(app)
      .post("/api/requests/" + created.body.id + "/approve")
      .set("Authorization", auth(devToken))
      .send({});
    expect(response.status).toBe(403);
  });

  it("needs an admin for production requests", async () => {
    const created = await createRequest(devToken, uniqueHostname("prod"), "PROD");
    const id = created.body.id;

    const byLead = await request(app).post("/api/requests/" + id + "/approve").set("Authorization", auth(leadToken)).send({});
    expect(byLead.status).toBe(403);

    const pending = await request(app).get("/api/requests/pending-approvals").set("Authorization", auth(leadToken));
    const pendingIds = pending.body.map((item: { id: number }) => item.id);
    expect(pendingIds).not.toContain(id);

    const byAdmin = await request(app).post("/api/requests/" + id + "/approve").set("Authorization", auth(adminToken)).send({});
    expect(byAdmin.status).toBe(200);
  });

  it("does not let anyone approve their own request", async () => {
    const created = await createRequest(adminToken, uniqueHostname("own"));
    const response = await request(app)
      .post("/api/requests/" + created.body.id + "/approve")
      .set("Authorization", auth(adminToken))
      .send({});
    expect(response.status).toBe(403);
  });

  it("hides other people's requests from a requester", async () => {
    const created = await createRequest(adminToken, uniqueHostname("hidden"));
    const response = await request(app).get("/api/requests/" + created.body.id).set("Authorization", auth(devToken));
    expect(response.status).toBe(404);
  });

  it("keeps the audit log for admins only", async () => {
    const byDev = await request(app).get("/api/audit").set("Authorization", auth(devToken));
    expect(byDev.status).toBe(403);
    const byAdmin = await request(app).get("/api/audit").set("Authorization", auth(adminToken));
    expect(byAdmin.status).toBe(200);
  });
});

describe("validation and quotas", () => {
  it("rejects an invalid hostname", async () => {
    const response = await createRequest(devToken, "Bad_Name");
    expect(response.status).toBe(400);
    expect(response.body.details[0]).toContain("hostname");
  });

  it("rejects a hostname that is already in use", async () => {
    const hostname = uniqueHostname("dup");
    await createRequest(devToken, hostname);
    const second = await createRequest(devToken, hostname);
    expect(second.status).toBe(409);
  });

  it("stops requests when the team quota is used up", async () => {
    // Payments has 8 CPU and 8 GB; a small server is 1 CPU / 1 GB, so the 9th one is over quota.
    for (let i = 0; i < 8; i++) {
      const ok = await createRequest(devToken, uniqueHostname("q"));
      expect(ok.status).toBe(201);
    }
    const tooMany = await createRequest(devToken, uniqueHostname("q"));
    expect(tooMany.status).toBe(422);
    expect(tooMany.body.error).toContain("Quota exceeded");
  });

  it("lets an admin change a team's quota", async () => {
    const team = await prisma.team.findUniqueOrThrow({ where: { name: "Payments" } });
    const response = await request(app)
      .put("/api/teams/" + team.id + "/quota")
      .set("Authorization", auth(adminToken))
      .send({ cpuQuota: 16, memoryQuotaMb: 16384, diskQuotaGb: 200 });
    expect(response.status).toBe(200);

    const byDev = await request(app)
      .put("/api/teams/" + team.id + "/quota")
      .set("Authorization", auth(devToken))
      .send({ cpuQuota: 999, memoryQuotaMb: 16384, diskQuotaGb: 200 });
    expect(byDev.status).toBe(403);

    // Put the seed values back for the other tests.
    await prisma.team.update({
      where: { id: team.id },
      data: { cpuQuota: team.cpuQuota, memoryQuotaMb: team.memoryQuotaMb, diskQuotaGb: team.diskQuotaGb },
    });
  });

  it("does not accept requests for a disabled catalog item", async () => {
    await request(app)
      .patch("/api/catalog/" + smallServerId)
      .set("Authorization", auth(adminToken))
      .send({ active: false });

    const response = await createRequest(devToken, uniqueHostname("off"));
    expect(response.status).toBe(400);

    await request(app)
      .patch("/api/catalog/" + smallServerId)
      .set("Authorization", auth(adminToken))
      .send({ active: true });
  });
});

describe("failure recovery", () => {
  it("marks the request FAILED when the job queue is down, so Retry works later", async () => {
    const created = await createRequest(devToken, uniqueHostname("queue"));
    const id = created.body.id;

    // Redis is down: adding the job fails once.
    vi.mocked(addJob).mockRejectedValueOnce(new Error("connect ECONNREFUSED 127.0.0.1:6379"));
    const approved = await request(app).post("/api/requests/" + id + "/approve").set("Authorization", auth(leadToken)).send({});
    expect(approved.status).toBe(503);
    expect(await getStatus(id)).toBe("FAILED");

    // The queue is back: Retry puts the job on the queue and the worker builds the server.
    const retry = await request(app).post("/api/requests/" + id + "/retry").set("Authorization", auth(devToken));
    expect(retry.status).toBe(200);
    expect(addJob).toHaveBeenLastCalledWith("provision", id);
    await provision(id);
    expect(await getStatus(id)).toBe("COMPLETED");
  });

  it("marks the request FAILED when the worker stopped in the middle of a job", async () => {
    const created = await createRequest(devToken, uniqueHostname("crash"));
    const id = created.body.id;
    await request(app).post("/api/requests/" + id + "/approve").set("Authorization", auth(leadToken)).send({});

    // The worker set PROVISIONING and then crashed; BullMQ hands the same job out again.
    await prisma.request.update({ where: { id: id }, data: { status: "PROVISIONING" } });
    await provision(id);

    const failed = await prisma.request.findUniqueOrThrow({ where: { id: id } });
    expect(failed.status).toBe("FAILED");
    expect(failed.errorMessage).toContain("worker stopped");

    const retry = await request(app).post("/api/requests/" + id + "/retry").set("Authorization", auth(devToken));
    expect(retry.status).toBe(200);
    await provision(id);
    expect(await getStatus(id)).toBe("COMPLETED");
  });
});
