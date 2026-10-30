// The request state machine.
// Every status change goes through changeStatus(), so the rules and the audit log live in one place.

import { Prisma, RequestStatus } from "@prisma/client";
import { prisma } from "../db";
import { HttpError } from "../errors";
import { writeAudit } from "./audit.service";

// For each status, the statuses it is allowed to move to.
const ALLOWED_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  PENDING_APPROVAL: ["APPROVED", "REJECTED"],
  APPROVED: ["PROVISIONING"],
  REJECTED: [],
  PROVISIONING: ["CONFIGURING", "FAILED"],
  CONFIGURING: ["COMPLETED", "FAILED"],
  COMPLETED: ["DECOMMISSIONING"],
  FAILED: ["APPROVED", "DECOMMISSIONING"], // retry, or clean up what was half created
  DECOMMISSIONING: ["DECOMMISSIONED", "FAILED"],
  DECOMMISSIONED: [],
};

export function canMove(from: RequestStatus, to: RequestStatus): boolean {
  const nextStatuses = ALLOWED_TRANSITIONS[from];
  return nextStatuses.includes(to);
}

interface ChangeStatusInput {
  requestId: number;
  to: RequestStatus;
  actorId?: number | null; // empty when the worker does it
  message: string;
  extraData?: Prisma.RequestUpdateInput; // other fields to save at the same time
}

export async function changeStatus(input: ChangeStatusInput) {
  const request = await prisma.request.findUnique({ where: { id: input.requestId } });
  if (!request) {
    throw new HttpError(404, "Request not found");
  }

  const from = request.status;
  if (!canMove(from, input.to)) {
    throw new HttpError(409, "Cannot move request from " + from + " to " + input.to);
  }

  // Update only if the status is still what we read above.
  // This protects against two people (or two workers) changing it at the same time.
  const data: Prisma.RequestUpdateManyMutationInput = { status: input.to };
  const result = await prisma.request.updateMany({
    where: { id: request.id, status: from },
    data: data,
  });
  if (result.count === 0) {
    throw new HttpError(409, "The request was changed by someone else, please refresh");
  }

  // Save any extra fields (logs, approver, error message...).
  let updated = request;
  if (input.extraData) {
    updated = await prisma.request.update({ where: { id: request.id }, data: input.extraData });
  } else {
    updated = await prisma.request.findUniqueOrThrow({ where: { id: request.id } });
  }

  await writeAudit({
    action: "STATUS_CHANGED",
    message: input.message,
    requestId: request.id,
    actorId: input.actorId,
    fromStatus: from,
    toStatus: input.to,
  });

  return updated;
}
