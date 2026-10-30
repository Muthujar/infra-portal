// Quota rules: a team cannot hold more CPU, memory or disk than its quota allows.

import { RequestStatus } from "@prisma/client";
import { prisma } from "../db";
import { HttpError } from "../errors";

// Requests in these states "hold" resources and count against the quota.
// Rejected, failed and decommissioned requests do not.
const STATUSES_THAT_USE_QUOTA: RequestStatus[] = [
  "PENDING_APPROVAL",
  "APPROVED",
  "PROVISIONING",
  "CONFIGURING",
  "COMPLETED",
  "DECOMMISSIONING",
];

export interface QuotaUsage {
  teamId: number;
  teamName: string;
  cpu: { used: number; limit: number };
  memoryMb: { used: number; limit: number };
  diskGb: { used: number; limit: number };
}

// Adds up the resources used by one team.
// excludeRequestId lets us leave out a request that is already counted (used during approval).
export async function getTeamUsage(teamId: number, excludeRequestId?: number): Promise<QuotaUsage> {
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) {
    throw new HttpError(404, "Team not found");
  }

  const activeRequests = await prisma.request.findMany({
    where: { teamId: teamId, status: { in: STATUSES_THAT_USE_QUOTA } },
  });

  let usedCpu = 0;
  let usedMemory = 0;
  let usedDisk = 0;

  for (const request of activeRequests) {
    if (excludeRequestId !== undefined && request.id === excludeRequestId) {
      continue;
    }
    usedCpu = usedCpu + request.cpu;
    usedMemory = usedMemory + request.memoryMb;
    usedDisk = usedDisk + request.diskGb;
  }

  return {
    teamId: team.id,
    teamName: team.name,
    cpu: { used: usedCpu, limit: team.cpuQuota },
    memoryMb: { used: usedMemory, limit: team.memoryQuotaMb },
    diskGb: { used: usedDisk, limit: team.diskQuotaGb },
  };
}

// Throws a clear error if adding this size would go over the team's quota.
export async function assertQuotaAvailable(
  teamId: number,
  size: { cpu: number; memoryMb: number; diskGb: number },
  excludeRequestId?: number
) {
  const usage = await getTeamUsage(teamId, excludeRequestId);
  const problems: string[] = [];

  const cpuLeft = usage.cpu.limit - usage.cpu.used;
  if (size.cpu > cpuLeft) {
    problems.push(size.cpu + " CPU requested, only " + cpuLeft + " CPU left");
  }

  const memoryLeft = usage.memoryMb.limit - usage.memoryMb.used;
  if (size.memoryMb > memoryLeft) {
    problems.push(size.memoryMb + " MB RAM requested, only " + memoryLeft + " MB left");
  }

  const diskLeft = usage.diskGb.limit - usage.diskGb.used;
  if (size.diskGb > diskLeft) {
    problems.push(size.diskGb + " GB disk requested, only " + diskLeft + " GB left");
  }

  if (problems.length > 0) {
    throw new HttpError(422, "Quota exceeded for team " + usage.teamName + ": " + problems.join("; "));
  }
}
