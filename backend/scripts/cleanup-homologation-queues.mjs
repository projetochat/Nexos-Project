import { Queue } from "bullmq";
import IORedis from "ioredis";

const allowedQueues = new Set(["messaging-outbound"]);
const states = ["completed", "failed", "delayed", "wait", "paused"];
const execute = process.argv.includes("--execute");
const requestedQueues = readListArg("--queues") ?? ["messaging-outbound"];
const graceMs = Number(readValueArg("--grace-ms") ?? 0);

if (execute && process.env.NEXOS_CONFIRM_HOMOLOGATION_QUEUE_CLEANUP !== "messaging-outbound") {
  throw new Error(
    "Refusing queue cleanup. Set NEXOS_CONFIRM_HOMOLOGATION_QUEUE_CLEANUP=messaging-outbound.",
  );
}

for (const queueName of requestedQueues) {
  if (!allowedQueues.has(queueName)) {
    throw new Error(`Queue cleanup is not allowed for ${queueName}.`);
  }
}

const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

try {
  const result = [];
  for (const queueName of requestedQueues) {
    const queue = new Queue(queueName, { connection });
    const countsBefore = await queue.getJobCounts(
      "waiting",
      "active",
      "delayed",
      "completed",
      "failed",
      "paused",
    );
    const cleaned = {};
    if (execute) {
      for (const state of states) {
        cleaned[state] = await queue.clean(graceMs, 10_000, state);
      }
      await queue.drain(false);
    }
    const countsAfter = await queue.getJobCounts(
      "waiting",
      "active",
      "delayed",
      "completed",
      "failed",
      "paused",
    );
    result.push({ queue: queueName, execute, graceMs, countsBefore, cleaned, countsAfter });
    await queue.close();
  }
  console.log(JSON.stringify({ event: "homologation.queue_cleanup", result }, null, 2));
} finally {
  await connection.quit();
}

function readValueArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readListArg(name) {
  const value = readValueArg(name);
  return value
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : undefined;
}
