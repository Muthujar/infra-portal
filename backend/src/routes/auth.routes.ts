// Login and "who am I" endpoints.

import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db";
import { HttpError } from "../errors";
import { asyncHandler } from "../middleware/asyncHandler";
import { createToken, requireAuth } from "../middleware/auth";
import { authenticateWithLdap, ldapEnabled, roleFromGroups, teamFromGroups } from "../services/ldap.service";

export const authRouter = Router();

// Stored instead of a password hash for people who log in through LDAP.
// Their password lives only in the directory, so the portal's own password check always refuses them.
const LDAP_PASSWORD_MARKER = "ldap-user";

// Logs a person in through LDAP. Returns the portal user, or null when the email is not in the directory.
async function loginWithLdap(email: string, password: string) {
  let directoryUser;
  try {
    directoryUser = await authenticateWithLdap(email, password);
  } catch (error) {
    if (error instanceof HttpError) {
      throw error; // wrong password
    }
    // The directory is down or misconfigured. Fall back to the portal's own users.
    console.warn("LDAP login failed, trying local users instead: " + String(error));
    return null;
  }
  if (!directoryUser) {
    return null;
  }

  const role = roleFromGroups(directoryUser.groups);
  if (!role) {
    throw new HttpError(403, "Your account is not in any Infra Portal group. Ask your admin for access.");
  }
  const teamName = teamFromGroups(directoryUser.groups);
  const team = teamName
    ? await prisma.team.findFirst({ where: { name: { equals: teamName, mode: "insensitive" } } })
    : null;
  if (!team) {
    throw new HttpError(403, "Your account is not in a team group known to Infra Portal. Ask your admin for access.");
  }

  // Create the portal user on first login, and refresh name, role and team from the directory every time.
  return prisma.user.upsert({
    where: { email: email },
    update: { name: directoryUser.name, role: role, teamId: team.id, passwordHash: LDAP_PASSWORD_MARKER },
    create: { email: email, name: directoryUser.name, role: role, teamId: team.id, passwordHash: LDAP_PASSWORD_MARKER },
    include: { team: true },
  });
}

// GET /api/auth/options  ->  which login methods are switched on (the login page shows a hint for LDAP)
authRouter.get("/options", (_req, res) => {
  res.json({ ldap: ldapEnabled() });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/auth/login  { email, password }  ->  { token, user }
authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const email = input.email.toLowerCase();

    // 1. Company directory first, when LDAP is switched on.
    let user = null;
    if (ldapEnabled()) {
      user = await loginWithLdap(email, input.password);
    }

    // 2. Otherwise the portal's own users (the demo users).
    if (!user) {
      user = await prisma.user.findUnique({ where: { email: email }, include: { team: true } });

      // Same message for "no such user" and "wrong password", so we do not reveal which emails exist.
      if (!user || user.passwordHash === LDAP_PASSWORD_MARKER) {
        throw new HttpError(401, "Invalid email or password");
      }
      const passwordOk = await bcrypt.compare(input.password, user.passwordHash);
      if (!passwordOk) {
        throw new HttpError(401, "Invalid email or password");
      }
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
