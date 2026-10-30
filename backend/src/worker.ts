// The worker process. Start it with: npm run worker
// It takes jobs from the queue and does the slow work:
//   provision:    APPROVED -> PROVISIONING -> CONFIGURING -> COMPLETED (or FAILED)
//   decommission: DECOMMISSIONING -> DECOMMISSIONED (or FAILED)

import { Job, Worker } from "bullmq";
import { prisma } from "./db";
import { config } from "./config";
import { getConfigurator, getProvisioner } from "./connectors";
import { StepError } from "./connectors/types";
import { changeStatus } from "./services/requestStatus.service";
import { getRedisConnection, JobData, QUEUE_NAME } from "./queue/queue";

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

async function provision(requestId: number) {
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

async function decommission(requestId: number) {
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

async function handleJob(job: Job<JobData>) {
  console.log("Job " + job.name + " for request #" + job.data.requestId);
  if (job.name === "provision") {
    await provision(job.data.requestId);
  } else if (job.name === "decommission") {
    await decommission(job.data.requestId);
  } else {
    console.warn("Unknown job: " + job.name);
  }
}

const worker = new Worker<JobData>(QUEUE_NAME, handleJob, {
  connection: getRedisConnection(),
  concurrency: 2, // at most 2 servers are built at the same time
});

worker.on("failed", (job, error) => {
  console.error("Job " + (job ? job.id : "?") + " crashed:", error);
});

console.log(
  "Worker started. Provisioner: " + config.provisioner + ", configurator: " + config.configurator
);

async function shutdown() {
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
