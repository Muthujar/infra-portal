// Login and "who am I" endpoints.

import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db";
import { HttpError } from "../errors";
import { asyncHandler } from "../middleware/asyncHandler";
import { createToken, requireAuth } from "../middleware/auth";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/auth/login  { email, password }  ->  { token, user }
authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      include: { team: true },
    });

    // Same message for "no such user" and "wrong password", so we do not reveal which emails exist.
    if (!user) {
      throw new HttpError(401, "Invalid email or password");
    }
    const passwordOk = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordOk) {
      throw new HttpError(401, "Invalid email or password");
    }

    const authUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      teamId: user.teamId,
    };
    const token = createToken(authUser);

    res.json({ token: token, user: { ...authUser, teamName: user.team.name } });
  })
);

// GET /api/auth/me  ->  the logged-in user
authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { team: true },
    });
    if (!user) {
      throw new HttpError(401, "User no longer exists");
    }
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      teamId: user.teamId,
      teamName: user.team.name,
    });
  })
);
