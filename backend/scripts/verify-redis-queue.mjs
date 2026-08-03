import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const queueName = `nexos-smoke-${Date.now()}`;
const jobName = "smoke";
const connection = new IORedis(redisUrl, {
  connectionName: "nexos-queue-smoke",
  maxRetriesPerRequest: null,
  connectTimeout: 1_000,
});
const queue = new Queue(queueName, { connection });
const workerConnection = new IORedis(redisUrl, {
  connectionName: "nexos-queue-smoke-worker",
  maxRetriesPerRequest: null,
  connectTimeout: 1_000,
});

let worker;
try {
  await connection.ping();
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Redis queue smoke timed out.")), 5_000);
    worker = new Worker(
      queueName,
      async (job) => {
        if (job.name !== jobName || job.data?.ok !== true) {
          throw new Error("Unexpected smoke job payload.");
        }
        return "ok";
      },
      { connection: workerConnection },
    );
    worker.on("completed", async (job, value) => {
      clearTimeout(timer);
      resolve({ id: job.id, value });
    });
    worker.on("failed", (_job, error) => {
      clearTimeout(timer);
      reject(error);
    });
    worker.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    queue.add(jobName, { ok: true }, { jobId: "nexos-smoke-job", removeOnComplete: true });
  });
  console.log(JSON.stringify({ ok: true, queue: queueName, result }));
} finally {
  await worker?.close();
  await queue.obliterate({ force: true }).catch(() => undefined);
  await queue.close();
  await workerConnection.quit().catch(() => undefined);
  await connection.quit().catch(() => undefined);
}
