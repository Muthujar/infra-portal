// Teams and quotas.

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth, requireRole } from "../middleware/auth";
import { getTeamUsage, QuotaUsage } from "../services/quota.service";
import { writeAudit } from "../services/audit.service";

export const teamsRouter = Router();

teamsRouter.use(requireAuth);

// GET /api/teams/quota  ->  quota usage (your own team, or every team for admins)
teamsRouter.get(
  "/quota",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const result: QuotaUsage[] = [];

    if (user.role === "ADMIN") {
      const teams = await prisma.team.findMany({ orderBy: { name: "asc" } });
      for (const team of teams) {
        result.push(await getTeamUsage(team.id));
      }
    } else {
      result.push(await getTeamUsage(user.teamId));
    }

    res.json(result);
  })
);

const quotaSchema = z.object({
  cpuQuota: z.number().int().min(0).max(1024),
  memoryQuotaMb: z.number().int().min(0).max(4194304),
  diskQuotaGb: z.number().int().min(0).max(100000),
});

// PUT /api/teams/:id/quota  (admin only)  ->  change a team's quota
teamsRouter.put(
  "/:id/quota",
  requireRole(["ADMIN"]),
  asyncHandler(async (req, res) => {
    const input = quotaSchema.parse(req.body);
    const team = await prisma.team.update({
      where: { id: Number(req.params.id) },
      data: input,
    });

    await writeAudit({
      action: "QUOTA_CHANGED",
      message:
        "Quota for " + team.name + " set to " + input.cpuQuota + " CPU, " +
        input.memoryQuotaMb + " MB RAM, " + input.diskQuotaGb + " GB disk",
      actorId: req.user!.id,
    });

    res.json(await getTeamUsage(team.id));
  })
);
