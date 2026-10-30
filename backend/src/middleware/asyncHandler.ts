// Express 4 does not catch errors thrown inside async functions.
// Wrapping a route handler with asyncHandler sends those errors to the error handler.

import { Request, Response, NextFunction } from "express";

type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export function asyncHandler(route: AsyncRoute) {
  return function (req: Request, res: Response, next: NextFunction) {
    route(req, res, next).catch(next);
  };
}
