// Server requests: create, list, approve, reject, retry, decommission.

import { Router } from "express";
import { Prisma, Request as ServerRequest } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db";
import { HttpError } from "../errors";
import { asyncHandler } from "../middleware/asyncHandler";
import { AuthUser, requireAuth, requireRole } from "../middleware/auth";
import { assertQuotaAvailable } from "../services/quota.service";
import { writeAudit } from "../services/audit.service";
import { changeStatus } from "../services/requestStatus.service";
import { generateTerraform } from "../terraform/generator";
import { addJob } from "../queue/queue";
import { addDays } from "../jobs";

export const requestsRouter = Router();

requestsRouter.use(requireAuth);

// Related data we send back with every request.
const includeForList = {
  catalogItem: { select: { name: true, osName: true } },
  requester: { select: { name: true, email: true } },
  approver: { select: { name: true } },
  team: { select: { name: true } },
};

// ---------- Permission helpers (RBAC rules) ----------

// Which requests can this user see?
function visibleRequestsFilter(user: AuthUser): Prisma.RequestWhereInput {
  if (user.role === "ADMIN") {
    return {}; // everything
  }
  if (user.role === "APPROVER") {
    return { teamId: user.teamId }; // their whole team
  }
  return { requesterId: user.id }; // only their own
}

function canSee(user: AuthUser, request: ServerRequest): boolean {
  if (user.role === "ADMIN") return true;
  if (user.role === "APPROVER") return request.teamId === user.teamId;
  return request.requesterId === user.id;
}

// Approval rules:
//  - nobody can approve their own request
//  - production requests need an ADMIN
//  - an APPROVER can approve DEV/QA requests of their own team
function checkCanApprove(user: AuthUser, request: ServerRequest) {
  if (request.requesterId === user.id) {
    throw new HttpError(403, "You cannot approve your own request");
  }
  if (user.role === "ADMIN") {
    return;
  }
  if (user.role !== "APPROVER") {
    throw new HttpError(403, "Only approvers can approve requests");
  }
  if (request.teamId !== user.teamId) {
    throw new HttpError(403, "You can only approve requests from your own team");
  }
  if (request.environment === "PROD") {
    throw new HttpError(403, "Production requests must be approved by an admin");
  }
}

async function findRequestOr404(id: number) {
  const request = await prisma.request.findUnique({ where: { id: id } });
  if (!request) {
    throw new HttpError(404, "Request not found");
  }
  return request;
}

// ---------- Routes ----------

// GET /api/requests  ->  requests this user can see, newest first
requestsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const requests = await prisma.request.findMany({
      where: visibleRequestsFilter(req.user!),
      include: includeForList,
      orderBy: { createdAt: "desc" },
    });
    res.json(requests);
  })
);

// GET /api/requests/pending-approvals  ->  requests waiting for THIS user's approval
requestsRouter.get(
  "/pending-approvals",
  requireRole(["APPROVER", "ADMIN"]),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const pending = await prisma.request.findMany({
      where: { ...visibleRequestsFilter(user), status: "PENDING_APPROVAL" },
      include: includeForList,
      orderBy: { createdAt: "asc" },
    });

    // Keep only the ones this user is allowed to approve.
    const result = [];
    for (const request of pending) {
      try {
        checkCanApprove(user, request);
        result.push(request);
      } catch {
        // not allowed for this user, skip it
      }
    }
    res.json(result);
  })
);

// GET /api/requests/:id  ->  one request with its full history
requestsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const request = await prisma.request.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        ...includeForList,
        auditEvents: {
          orderBy: { createdAt: "asc" },
          include: { actor: { select: { name: true } } },
        },
      },
    });
    if (!request || !canSee(req.user!, request)) {
      throw new HttpError(404, "Request not found");
    }
    res.json(request);
  })
);

const createRequestSchema = z.object({
  catalogItemId: z.number().int(),
  hostname: z
    .string()
    .regex(/^[a-z][a-z0-9-]{2,29}$/, "use 3-30 lowercase letters, numbers or '-', starting with a letter"),
  environment: z.enum(["DEV", "QA", "PROD"]),
  justification: z.string().min(5, "please explain why you need this server").max(500),
  // How many days the server may live; leave out (or null) for no expiry.
  leaseDays: z.number().int().min(1).max(365).nullable().optional(),
});

// POST /api/requests  ->  submit a new server request
requestsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const input = createRequestSchema.parse(req.body);

    // 1. The catalog item must exist and be active
    const item = await prisma.catalogItem.findUnique({ where: { id: input.catalogItemId } });
    if (!item || !item.active) {
      throw new HttpError(400, "This catalog item is not available");
    }

    // 2. The hostname must not be used by another live server
    const sameName = await prisma.request.findFirst({
      where: {
        hostname: input.hostname,
        status: { notIn: ["REJECTED", "DECOMMISSIONED"] },
      },
    });
    if (sameName) {
      throw new HttpError(409, "Hostname " + input.hostname + " is already in use");
    }

    // 3. The team must have enough quota left
    await assertQuotaAvailable(user.teamId, {
      cpu: item.cpu,
      memoryMb: item.memoryMb,
      diskGb: item.diskGb,
    });

    // 4. Save it, copying the size from the catalog item
    const request = await prisma.request.create({
      data: {
        hostname: input.hostname,
        environment: input.environment,
        justification: input.justification,
        leaseDays: input.leaseDays || null,
        platform: item.platform,
        cpu: item.cpu,
        memoryMb: item.memoryMb,
        diskGb: item.diskGb,
        catalogItemId: item.id,
        requesterId: user.id,
        teamId: user.teamId,
      },
    });

    let leaseText = "";
    if (request.leaseDays) {
      leaseText = " (lease " + request.leaseDays + " days)";
    }
    await writeAudit({
      action: "REQUEST_CREATED",
      message:
        user.name + " requested " + item.name + " '" + request.hostname + "' for " + request.environment + leaseText,
      requestId: request.id,
      actorId: user.id,
      toStatus: "PENDING_APPROVAL",
    });

    res.status(201).json(request);
  })
);

const decisionSchema = z.object({
  comment: z.string().max(500).optional(),
});

// POST /api/requests/:id/approve  ->  approve, generate Terraform, start provisioning
requestsRouter.post(
  "/:id/approve",
  requireRole(["APPROVER", "ADMIN"]),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const input = decisionSchema.parse(req.body);
    const request = await findRequestOr404(Number(req.params.id));

    checkCanApprove(user, request);

    // Quota may have changed since the request was made, so check again (without counting itself).
    await assertQuotaAvailable(request.teamId, request, request.id);

    // Generate the Terraform code now, so the approver's decision and the code are saved together.
    const fullRequest = await prisma.request.findUniqueOrThrow({
      where: { id: request.id },
      include: { requester: true, team: true, catalogItem: true },
    });
    const terraformCode = generateTerraform(fullRequest);

    const updated = await changeStatus({
      requestId: request.id,
      to: "APPROVED",
      actorId: user.id,
      message: "Approved by " + user.name + (input.comment ? ": " + input.comment : ""),
      extraData: {
        approver: { connect: { id: user.id } },
        approvalComment: input.comment || null,
        terraformCode: terraformCode,
      },
    });

    // Hand the slow work to the worker.
    await addJob("provision", request.id);

    res.json(updated);
  })
);

// POST /api/requests/:id/reject  { comment }  ->  reject the request
requestsRouter.post(
  "/:id/reject",
  requireRole(["APPROVER", "ADMIN"]),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const input = z.object({ comment: z.string().min(3, "please give a reason").max(500) }).parse(req.body);
    const request = await findRequestOr404(Number(req.params.id));

    checkCanApprove(user, request);

    const updated = await changeStatus({
      requestId: request.id,
      to: "REJECTED",
      actorId: user.id,
      message: "Rejected by " + user.name + ": " + input.comment,
      extraData: {
        approver: { connect: { id: user.id } },
        approvalComment: input.comment,
      },
    });
    res.json(updated);
  })
);

// Requester, their team's approver, or an admin can retry / decommission.
function checkCanManage(user: AuthUser, request: ServerRequest) {
  if (!canSee(user, request)) {
    throw new HttpError(404, "Request not found");
  }
}

// POST /api/requests/:id/retry  ->  try provisioning again after a failure
requestsRouter.post(
  "/:id/retry",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const request = await findRequestOr404(Number(req.params.id));
    checkCanManage(user, request);

    if (request.status !== "FAILED") {
      throw new HttpError(409, "Only failed requests can be retried");
    }
    if (!request.approverId) {
      throw new HttpError(409, "This request was never approved");
    }

    // If the decommission step failed, retrying means trying the delete again (not building the server again).
    const lastFailure = await prisma.auditEvent.findFirst({
      where: { requestId: request.id, toStatus: "FAILED" },
      orderBy: { id: "desc" },
    });
    if (lastFailure && lastFailure.fromStatus === "DECOMMISSIONING") {
      const updated = await changeStatus({
        requestId: request.id,
        to: "DECOMMISSIONING",
        actorId: user.id,
        message: "Decommission retry requested by " + user.name,
      });
      await addJob("decommission", request.id);
      return res.json(updated);
    }

    // A failed request does not hold quota, so check it again before retrying.
    await assertQuotaAvailable(request.teamId, request, request.id);

    const updated = await changeStatus({
      requestId: request.id,
      to: "APPROVED",
      actorId: user.id,
      message: "Retry requested by " + user.name,
    });
    await addJob("provision", request.id);
    res.json(updated);
  })
);

// POST /api/requests/:id/decommission  ->  delete the server and release the quota
requestsRouter.post(
  "/:id/decommission",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const request = await findRequestOr404(Number(req.params.id));
    checkCanManage(user, request);

    if (request.status !== "COMPLETED" && request.status !== "FAILED") {
      throw new HttpError(409, "Only completed or failed servers can be decommissioned");
    }

    const updated = await changeStatus({
      requestId: request.id,
      to: "DECOMMISSIONING",
      actorId: user.id,
      message: "Decommission requested by " + user.name,
    });
    await addJob("decommission", request.id);
    res.json(updated);
  })
);

// POST /api/requests/:id/extend  { days }  ->  push the lease expiry date further out
requestsRouter.post(
  "/:id/extend",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const input = z.object({ days: z.number().int().min(1).max(90) }).parse(req.body);
    const request = await findRequestOr404(Number(req.params.id));
    checkCanManage(user, request);

    if (request.status !== "COMPLETED" || !request.expiresAt) {
      throw new HttpError(409, "Only running servers with a lease can be extended");
    }

    // Count from the current expiry date, or from now if it is already in the past.
    let start = request.expiresAt;
    if (start.getTime() < Date.now()) {
      start = new Date();
    }
    const newExpiry = addDays(start, input.days);

    const updated = await prisma.request.update({
      where: { id: request.id },
      data: { expiresAt: newExpiry, leaseDays: (request.leaseDays || 0) + input.days },
    });
    await writeAudit({
      action: "LEASE_EXTENDED",
      message: "Lease extended by " + input.days + " days by " + user.name + ", now expires " + newExpiry.toISOString(),
      requestId: request.id,
      actorId: user.id,
    });
    res.json(updated);
  })
);
