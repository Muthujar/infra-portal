// The slow work done by the worker for each job.
// Kept separate from worker.ts so tests can run a job without starting a BullMQ worker.
//   provision:    APPROVED -> PROVISIONING -> CONFIGURING -> COMPLETED (or FAILED)
//   decommission: DECOMMISSIONING -> DECOMMISSIONED (or FAILED)

import { prisma } from "./db";
import { getConfigurator, getProvisioner } from "./connectors";
import { StepError } from "./connectors/types";
import { changeStatus } from "./services/requestStatus.service";

function errorLog(error: unknown): string {
  if (error instanceof StepError) {
    return error.log;
  }
  return "";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export async function provision(requestId: number) {
  const provisioner = getProvisioner();
  const configurator = getConfigurator();
  let log = "";

  // Step 1: create the server
  let request = await changeStatus({
    requestId: requestId,
    to: "PROVISIONING",
    message: "Creating the server with " + provisioner.name + " provisioner",
    extraData: { errorMessage: null, provisionLog: "" },
  });

  try {
    const created = await provisioner.provision(request);
    log = log + "===== PROVISION (" + provisioner.name + ") =====\n" + created.log + "\n";

    // Step 2: set up software inside the server
    request = await changeStatus({
      requestId: requestId,
      to: "CONFIGURING",
      message: "Server created (id " + (created.externalId || "-") + "), configuring with " + configurator.name,
      extraData: { externalId: created.externalId, provisionLog: log },
    });

    const configured = await configurator.configure(request);
    log = log + "===== CONFIGURE (" + configurator.name + ") =====\n" + configured.log + "\n";

    // Step 3: done
    await changeStatus({
      requestId: requestId,
      to: "COMPLETED",
      message: "Server is ready",
      extraData: { configJobId: configured.externalId, provisionLog: log },
    });
  } catch (error) {
    log = log + errorLog(error);
    await changeStatus({
      requestId: requestId,
      to: "FAILED",
      message: "Failed: " + errorMessage(error),
      extraData: { errorMessage: errorMessage(error), provisionLog: log },
    });
  }
}

export async function decommission(requestId: number) {
  const provisioner = getProvisioner();
  const request = await prisma.request.findUniqueOrThrow({ where: { id: requestId } });
  let log = request.provisionLog || "";

  try {
    const destroyed = await provisioner.destroy(request);
    log = log + "===== DECOMMISSION (" + provisioner.name + ") =====\n" + destroyed.log + "\n";
    await changeStatus({
      requestId: requestId,
      to: "DECOMMISSIONED",
      message: "Server deleted, quota released",
      extraData: { provisionLog: log },
    });
  } catch (error) {
    log = log + errorLog(error);
    await changeStatus({
      requestId: requestId,
      to: "FAILED",
      message: "Decommission failed: " + errorMessage(error),
      extraData: { errorMessage: errorMessage(error), provisionLog: log },
    });
  }
}
