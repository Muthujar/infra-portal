// The worker process. Start it with: npm run worker
// It takes jobs from the queue and does the slow work:
//   provision:    APPROVED -> PROVISIONING -> CONFIGURING -> COMPLETED (or FAILED)
//   decommission: DECOMMISSIONING -> DECOMMISSIONED (or FAILED)

import { Job, Worker } from "bullmq";
import { prisma } from "./db";
import { config } from "./config";
import { decommission, provision } from "./jobs";
import { getRedisConnection, JobData, QUEUE_NAME } from "./queue/queue";

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
