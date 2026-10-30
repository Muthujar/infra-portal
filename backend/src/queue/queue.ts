// The job queue (BullMQ on top of Redis).
// The API adds jobs here and returns immediately; the worker process picks them up.

import { Queue } from "bullmq";
import { config } from "../config";

export const QUEUE_NAME = "provisioning";

export type JobName = "provision" | "decommission" | "expire-leases";

export interface JobData {
  requestId: number; // 0 for jobs that are not about one request (expire-leases)
}

// BullMQ needs host/port options; we read them from REDIS_URL.
export function getRedisConnection() {
  const url = new URL(config.redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password || undefined,
    maxRetriesPerRequest: null, // required by BullMQ workers
  };
}

let queue: Queue<JobData> | null = null;

function getQueue(): Queue<JobData> {
  if (queue === null) {
    queue = new Queue<JobData>(QUEUE_NAME, { connection: getRedisConnection() });
  }
  return queue;
}

export async function addJob(name: JobName, requestId: number) {
  await getQueue().add(name, { requestId: requestId }, {
    removeOnComplete: 100, // keep the last 100 finished jobs for debugging
    removeOnFail: 100,
  });
}

// Adds the repeating "expire-leases" job. Safe to call on every worker start: it replaces the old schedule.
export async function scheduleLeaseCheck() {
  await getQueue().upsertJobScheduler(
    "lease-check",
    { every: config.leaseCheckIntervalMs },
    { name: "expire-leases", data: { requestId: 0 }, opts: { removeOnComplete: 10, removeOnFail: 10 } }
  );
}
