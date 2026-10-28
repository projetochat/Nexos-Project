import { createServer } from "node:http";
import { createRequire } from "node:module";
import { afterEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  baseUrl: "",
  ensure: vi.fn(async () => "synthetic-access-only"),
  refresh: vi.fn(async () => "synthetic-refreshed-only"),
}));
vi.mock("@/lib/trixus-api", () => ({
  ensureTrixusAccessToken: api.ensure,
  getTrixusAccessToken: () => "synthetic-access-only",
  refreshTrixusAccessToken: api.refresh,
  trixusRealtimeBaseUrl: () => api.baseUrl,
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
});

it("stops after a real Socket.IO onboarding rejection without refreshing or reconnecting", async () => {
  const { Server } = createRequire(new URL("../../../backend/package.json", import.meta.url))(
    "socket.io",
  );
  const http = createServer();
  const server = new Server(http);
  let connections = 0;
  server
    .of("/realtime")
    .on(
      "connection",
      (socket: {
        emit: (event: string, payload: { code: string }) => void;
        disconnect: (close: boolean) => void;
      }) => {
        connections += 1;
        socket.emit("realtime.auth_failed", { code: "REALTIME_ONBOARDING_PENDING" });
        socket.disconnect(true);
      },
    );
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const address = http.address();
  if (!address || typeof address === "string") throw new Error("Disposable listener unavailable");
  api.baseUrl = `http://127.0.0.1:${address.port}`;
  vi.stubEnv("VITE_TRIXUS_REALTIME_ENABLED", "true");
  const client = await import("./client");
  try {
    await client.connectRealtime();
    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline && !client.realtimeDiagnostics().authenticationSuspended) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(client.realtimeDiagnostics()).toMatchObject({
      authenticationSuspended: true,
      authenticationFailureCode: "REALTIME_ONBOARDING_PENDING",
    });
    // React consumers may request a connection again after status notifications.
    await Promise.all(Array.from({ length: 50 }, () => client.connectRealtime()));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(connections).toBe(1);
    expect(api.refresh).not.toHaveBeenCalled();
  } finally {
    client.disconnectRealtime();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
