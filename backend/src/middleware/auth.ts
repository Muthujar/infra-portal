// Authentication (who are you?) and authorization / RBAC (what can you do?).

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { config } from "../config";
import { HttpError } from "../errors";

// The data we put inside the JWT token.
export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: Role;
  teamId: number;
}

// Tell TypeScript that req.user exists after requireAuth runs.
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function createToken(user: AuthUser): string {
  return jwt.sign(user, config.jwtSecret, { expiresIn: "8h" });
}

// Step 1: check the "Authorization: Bearer <token>" header.
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return next(new HttpError(401, "Please log in"));
  }

  const token = header.substring("Bearer ".length);

  try {
    const payload = jwt.verify(token, config.jwtSecret) as AuthUser;
    req.user = {
      id: payload.id,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      teamId: payload.teamId,
    };
    next();
  } catch {
    next(new HttpError(401, "Your session has expired, please log in again"));
  }
}

// Step 2: allow only some roles. Use after requireAuth.
// Example: router.post("/x", requireAuth, requireRole(["ADMIN"]), handler)
export function requireRole(allowedRoles: Role[]) {
  return function (req: Request, _res: Response, next: NextFunction) {
    if (!req.user) {
      return next(new HttpError(401, "Please log in"));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(new HttpError(403, "You do not have permission to do this"));
    }
    next();
  };
}
