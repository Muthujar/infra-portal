// Turns any thrown error into a clean JSON response.

import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { HttpError } from "../errors";

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  // Validation errors from zod: show which fields are wrong.
  if (error instanceof ZodError) {
    const messages: string[] = [];
    for (const issue of error.issues) {
      messages.push(issue.path.join(".") + ": " + issue.message);
    }
    return res.status(400).json({ error: "Invalid input", details: messages });
  }

  // Errors we threw on purpose.
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message });
  }

  // Anything else is a bug: log it and hide details from the user.
  console.error(error);
  return res.status(500).json({ error: "Something went wrong" });
}
