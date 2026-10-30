// Service catalog: the "menu" of servers users can request.

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth, requireRole } from "../middleware/auth";

export const catalogRouter = Router();

catalogRouter.use(requireAuth);

// GET /api/catalog  ->  active items (admins can add ?all=true to also see disabled ones)
catalogRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const showAll = req.query.all === "true" && req.user!.role === "ADMIN";
    const items = await prisma.catalogItem.findMany({
      where: showAll ? {} : { active: true },
      orderBy: [{ platform: "asc" }, { cpu: "asc" }],
    });
    res.json(items);
  })
);

const catalogItemSchema = z.object({
  name: z.string().min(3).max(60),
  description: z.string().min(3).max(300),
  platform: z.enum(["PROXMOX", "AWS"]),
  osName: z.string().min(2).max(40),
  cpu: z.number().int().min(1).max(32),
  memoryMb: z.number().int().min(256).max(131072),
  diskGb: z.number().int().min(4).max(2000),
  awsInstanceType: z.string().max(30).optional(),
});

// POST /api/catalog  (admin only)  ->  add a new catalog item
catalogRouter.post(
  "/",
  requireRole(["ADMIN"]),
  asyncHandler(async (req, res) => {
    const input = catalogItemSchema.parse(req.body);
    const item = await prisma.catalogItem.create({ data: input });
    res.status(201).json(item);
  })
);

// PATCH /api/catalog/:id  (admin only)  { active: true/false }  ->  enable or disable an item
catalogRouter.patch(
  "/:id",
  requireRole(["ADMIN"]),
  asyncHandler(async (req, res) => {
    const input = z.object({ active: z.boolean() }).parse(req.body);
    const item = await prisma.catalogItem.update({
      where: { id: Number(req.params.id) },
      data: { active: input.active },
    });
    res.json(item);
  })
);
