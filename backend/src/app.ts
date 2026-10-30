// Builds the Express app: middleware + routes.
// Kept separate from server.ts so tests can use the app without starting a server.

import express from "express";
import cors from "cors";
import { config } from "./config";
import { authRouter } from "./routes/auth.routes";
import { catalogRouter } from "./routes/catalog.routes";
import { requestsRouter } from "./routes/requests.routes";
import { teamsRouter } from "./routes/teams.routes";
import { auditRouter } from "./routes/audit.routes";
import { errorHandler } from "./middleware/errorHandler";

export function createApp() {
  const app = express();

  app.use(cors({ origin: config.webOrigin }));
  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", provisioner: config.provisioner, configurator: config.configurator });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/catalog", catalogRouter);
  app.use("/api/requests", requestsRouter);
  app.use("/api/teams", teamsRouter);
  app.use("/api/audit", auditRouter);

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Must be last.
  app.use(errorHandler);

  return app;
}
