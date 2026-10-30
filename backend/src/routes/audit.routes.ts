// Audit log (admin only): who did what, and when.

import { Router } from "express";
import { prisma } from "../db";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth, requireRole } from "../middleware/auth";

export const auditRouter = Router();

// GET /api/audit  ->  the latest 200 events
auditRouter.get(
  "/",
  requireAuth,
  requireRole(["ADMIN"]),
  asyncHandler(async (_req, res) => {
    const events = await prisma.auditEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        actor: { select: { name: true, email: true } },
        request: { select: { hostname: true } },
      },
    });
    res.json(events);
  })
);
