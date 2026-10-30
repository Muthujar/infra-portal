// Writes entries to the audit log.

import { RequestStatus } from "@prisma/client";
import { prisma } from "../db";

interface AuditInput {
  action: string;
  message: string;
  requestId?: number;
  actorId?: number | null; // leave empty when the system (worker) does the action
  fromStatus?: RequestStatus;
  toStatus?: RequestStatus;
}

export async function writeAudit(input: AuditInput) {
  await prisma.auditEvent.create({
    data: {
      action: input.action,
      message: input.message,
      requestId: input.requestId,
      actorId: input.actorId ?? null,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
    },
  });
}
