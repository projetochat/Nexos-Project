import { spawn } from "node:child_process";

const port = process.env.PORT ?? "3019";
const timeoutMs = Number(process.env.NEXOS_STARTUP_SMOKE_TIMEOUT_MS ?? 30_000);
const started = Date.now();

const server = spawn("bun", ["run", "--cwd", "backend", "start"], {
  cwd: new URL("../..", import.meta.url),
  env: {
    ...process.env,
    PORT: port,
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let logs = "";
server.stdout.on("data", (chunk) => {
  logs += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  logs += chunk.toString();
});

try {
  const health = await waitForHealth();
  console.log(
    JSON.stringify({
      ok: true,
      port,
      health: {
        ok: health.ok,
        database: health.database,
        redis: health.redis,
        queue: health.queue,
        realtime: health.realtime,
        realtimeAdapter: health.realtimeAdapter,
      },
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      port,
      error: error instanceof Error ? error.message : String(error),
      logs: logs.slice(-2_000),
    }),
  );
  process.exitCode = 1;
} finally {
  server.kill();
}

async function waitForHealth() {
  while (Date.now() - started < timeoutMs) {
    await sleep(1_000);
    try {
      const response = await fetch(`http://localhost:${port}/api/health`);
      if (response.ok) return response.json();
    } catch {
      // Keep polling until the process is ready or the timeout expires.
    }
    if (server.exitCode !== null) {
      throw new Error(`backend exited before health was ready with code ${server.exitCode}`);
    }
  }
  throw new Error("backend startup smoke timed out");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
