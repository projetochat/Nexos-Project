// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

type FakeSocket = {
  auth: unknown;
  connected: boolean;
  on: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  io: {
    on: ReturnType<typeof vi.fn>;
  };
};

let lastSocket: FakeSocket | null = null;

vi.mock("socket.io-client", () => ({
  io: vi.fn((_url: string, options: { auth?: unknown }) => {
    lastSocket = {
      auth: options.auth,
      connected: true,
      on: vi.fn(),
      emit: vi.fn(),
      connect: vi.fn(() => {
        if (lastSocket) lastSocket.connected = true;
      }),
      disconnect: vi.fn(() => {
        if (lastSocket) lastSocket.connected = false;
      }),
      io: { on: vi.fn() },
    };
    return lastSocket;
  }),
}));

describe("realtime client runtime state", () => {
  afterEach(() => {
    localStorage.clear();
    lastSocket = null;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.resetModules();
  });

  it("returns a cached external-store snapshot while realtime state is unchanged", async () => {
    vi.stubEnv("VITE_TRIXUS_REALTIME_ENABLED", "true");
    const client = await import("./client");

    const first = client.realtimeSnapshot();
    const second = client.realtimeSnapshot();

    expect(Object.is(first, second)).toBe(true);
    expect(first).toEqual({ status: "offline", lastEventId: null });
  });

  it("does not create sockets or subscriptions when the frontend realtime flag is disabled", async () => {
    vi.stubEnv("VITE_TRIXUS_REALTIME_ENABLED", "false");
    localStorage.setItem("trixus.api.accessToken", "access");
    const { io } = await import("socket.io-client");
    const client = await import("./client");

    await expect(client.connectRealtime()).resolves.toBeNull();
    client.subscribeConversation("conversation-a");

    expect(io).not.toHaveBeenCalled();
    expect(client.realtimeSnapshot().status).toBe("disabled");
    expect(client.realtimeDiagnostics()).toMatchObject({
      enabled: false,
      socketInstances: 0,
      conversationSubscriptions: 0,
    });
  });

  it("keeps one socket and one subscription per conversation", async () => {
    vi.stubEnv("VITE_TRIXUS_REALTIME_ENABLED", "true");
    localStorage.setItem("trixus.api.accessToken", "access");
    const { io } = await import("socket.io-client");
    const client = await import("./client");

    await client.connectRealtime();
    await client.connectRealtime();
    lastSocket?.on.mock.calls.find(([name]) => name === "realtime.ready")?.[1]();
    client.subscribeConversation("conversation-a");
    client.subscribeConversation("conversation-a");
    client.unsubscribeConversation("conversation-a");
    client.unsubscribeConversation("conversation-a");

    expect(io).toHaveBeenCalledTimes(1);
    expect(lastSocket?.emit.mock.calls).toEqual([
      ["conversation.subscribe", { conversationId: "conversation-a" }],
      ["conversation.unsubscribe", { conversationId: "conversation-a" }],
    ]);
    expect(client.realtimeDiagnostics().conversationSubscriptions).toBe(0);
  });

  it("waits for gateway authentication before subscribing and restores rooms after reconnect", async () => {
    vi.stubEnv("VITE_TRIXUS_REALTIME_ENABLED", "true");
    localStorage.setItem("trixus.api.accessToken", "access");
    const client = await import("./client");
    await client.connectRealtime();
    const emitServer = (event: string) =>
      lastSocket?.on.mock.calls.find(([name]) => name === event)?.[1]();
    emitServer("connect");
    client.subscribeConversation("conversation-a");
    expect(client.realtimeSnapshot().status).toBe("connecting");
    expect(lastSocket?.emit).not.toHaveBeenCalled();

    emitServer("realtime.ready");
    client.subscribeConversation("conversation-a");
    expect(client.realtimeSnapshot().status).toBe("connected");
    expect(lastSocket?.emit).toHaveBeenCalledTimes(1);

    emitServer("disconnect");
    emitServer("connect");
    expect(client.realtimeSnapshot().status).toBe("connecting");
    emitServer("realtime.ready");
    expect(lastSocket?.emit.mock.calls).toEqual([
      ["conversation.subscribe", { conversationId: "conversation-a" }],
      ["conversation.subscribe", { conversationId: "conversation-a" }],
    ]);
    client.unsubscribeConversation("conversation-a");
    lastSocket?.emit.mockClear();
    emitServer("disconnect");
    emitServer("connect");
    emitServer("realtime.ready");
    expect(lastSocket?.emit).not.toHaveBeenCalled();
  });

  it("does not renew or reconnect a socket repeatedly rejected by pending onboarding", async () => {
    vi.stubEnv("VITE_TRIXUS_REALTIME_ENABLED", "true");
    const api = await import("@/lib/trixus-api");
    vi.spyOn(api, "ensureTrixusAccessToken").mockResolvedValue("synthetic-access");
    const refresh = vi
      .spyOn(api, "refreshTrixusAccessToken")
      .mockResolvedValue("synthetic-renewed");
    const client = await import("./client");
    await client.connectRealtime();
    const refused = lastSocket?.on.mock.calls.find(
      ([name]) => name === "realtime.auth_failed",
    )?.[1];
    const target = lastSocket!;
    for (let i = 0; i < 50; i += 1) {
      target.connected = false;
      await refused({ code: "REALTIME_ONBOARDING_PENDING" });
      await client.connectRealtime();
    }
    expect(refresh).not.toHaveBeenCalled();
    expect(target.connect).not.toHaveBeenCalled();
    expect(client.realtimeSnapshot().status).toBe("degraded");
  });

  it("coalesces concurrent connection calls before resolving the access token", async () => {
    vi.stubEnv("VITE_TRIXUS_REALTIME_ENABLED", "true");
    const api = await import("@/lib/trixus-api");
    let resolveToken!: (token: string) => void;
    const ensure = vi.spyOn(api, "ensureTrixusAccessToken").mockReturnValue(
      new Promise<string>((resolve) => {
        resolveToken = resolve;
      }),
    );
    const { io } = await import("socket.io-client");
    const client = await import("./client");
    const requests = Array.from({ length: 50 }, () => client.connectRealtime());
    expect(ensure).toHaveBeenCalledTimes(1);
    resolveToken("synthetic-access");
    await Promise.all(requests);
    expect(io).toHaveBeenCalledTimes(1);
  });

  it("allows one delayed token renewal and stops after the gateway rejects it again", async () => {
    vi.useFakeTimers();
    vi.stubEnv("VITE_TRIXUS_REALTIME_ENABLED", "true");
    const api = await import("@/lib/trixus-api");
    vi.spyOn(api, "ensureTrixusAccessToken").mockResolvedValue("synthetic-access");
    const refresh = vi
      .spyOn(api, "refreshTrixusAccessToken")
      .mockResolvedValue("synthetic-renewed");
    const client = await import("./client");
    await client.connectRealtime();
    const target = lastSocket!;
    const refused = target.on.mock.calls.find(([name]) => name === "realtime.auth_failed")![1];
    await refused({ code: "REALTIME_TOKEN_EXPIRED" });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(target.connect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(999);
    expect(target.connect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(target.connect).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 50; i += 1) {
      await refused({ code: "REALTIME_TOKEN_INVALID" });
      await client.connectRealtime();
    }
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(target.connect).toHaveBeenCalledTimes(1);
    expect(client.realtimeDiagnostics()).toMatchObject({
      authenticationSuspended: true,
      authenticationFailureCode: "REALTIME_TOKEN_INVALID",
    });
    await expect(client.resumeRealtimeAfterOnboarding()).resolves.toBeNull();
  });

  it("coalesces simultaneous auth failures and resets its renewal budget only after ready", async () => {
    vi.useFakeTimers();
    vi.stubEnv("VITE_TRIXUS_REALTIME_ENABLED", "true");
    const api = await import("@/lib/trixus-api");
    vi.spyOn(api, "ensureTrixusAccessToken").mockResolvedValue("synthetic-access");
    let resolveRefresh!: (token: string) => void;
    const refresh = vi
      .spyOn(api, "refreshTrixusAccessToken")
      .mockReturnValueOnce(
        new Promise<string>((resolve) => {
          resolveRefresh = resolve;
        }),
      )
      .mockResolvedValue("synthetic-next");
    const client = await import("./client");
    await client.connectRealtime();
    const target = lastSocket!;
    const refused = target.on.mock.calls.find(([name]) => name === "realtime.auth_failed")![1];
    const pending = Array.from({ length: 50 }, () => refused({ code: "REALTIME_TOKEN_EXPIRED" }));
    expect(refresh).toHaveBeenCalledTimes(1);
    resolveRefresh("synthetic-renewed");
    await Promise.all(pending);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(target.connect).toHaveBeenCalledTimes(1);
    target.on.mock.calls.find(([name]) => name === "realtime.ready")![1]();
    await refused({ code: "REALTIME_TOKEN_EXPIRED" });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(target.connect).toHaveBeenCalledTimes(2);
    client.disconnectRealtime();
  });

  it("does not let a delayed renewal resurrect a socket after logout", async () => {
    vi.useFakeTimers();
    vi.stubEnv("VITE_TRIXUS_REALTIME_ENABLED", "true");
    const api = await import("@/lib/trixus-api");
    vi.spyOn(api, "ensureTrixusAccessToken").mockResolvedValue("synthetic-access");
    let resolveRefresh!: (token: string) => void;
    vi.spyOn(api, "refreshTrixusAccessToken").mockReturnValue(
      new Promise<string>((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    const client = await import("./client");
    await client.connectRealtime();
    const target = lastSocket!;
    const pending = target.on.mock.calls.find(([name]) => name === "realtime.auth_failed")![1]({
      code: "REALTIME_TOKEN_EXPIRED",
    });
    client.disconnectRealtime();
    resolveRefresh("synthetic-renewed");
    await pending;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(target.connect).not.toHaveBeenCalled();
    expect(client.realtimeDiagnostics().socketInstances).toBe(0);
  });

  it("does not let a delayed initial token create a socket after logout", async () => {
    vi.stubEnv("VITE_TRIXUS_REALTIME_ENABLED", "true");
    const api = await import("@/lib/trixus-api");
    let resolveToken!: (token: string) => void;
    vi.spyOn(api, "ensureTrixusAccessToken").mockReturnValue(
      new Promise<string>((resolve) => {
        resolveToken = resolve;
      }),
    );
    const { io } = await import("socket.io-client");
    const client = await import("./client");
    const pending = client.connectRealtime();
    client.disconnectRealtime();
    resolveToken("synthetic-stale");
    await pending;
    expect(io).not.toHaveBeenCalled();
  });

  it("resumes only an onboarding refusal after an explicit server-confirmed completion", async () => {
    vi.stubEnv("VITE_TRIXUS_REALTIME_ENABLED", "true");
    const api = await import("@/lib/trixus-api");
    vi.spyOn(api, "ensureTrixusAccessToken").mockResolvedValue("synthetic-access");
    const refresh = vi
      .spyOn(api, "refreshTrixusAccessToken")
      .mockResolvedValue("synthetic-renewed");
    const { io } = await import("socket.io-client");
    const client = await import("./client");
    await client.connectRealtime();
    await lastSocket!.on.mock.calls.find(([name]) => name === "realtime.auth_failed")![1]({
      code: "REALTIME_ONBOARDING_PENDING",
    });
    await client.resumeRealtimeAfterOnboarding();
    expect(io).toHaveBeenCalledTimes(2);
    expect(refresh).not.toHaveBeenCalled();
    await lastSocket!.on.mock.calls.find(([name]) => name === "realtime.auth_failed")![1]({
      code: "REALTIME_MEMBERSHIP_INACTIVE",
    });
    await client.resumeRealtimeAfterOnboarding();
    await client.connectRealtime();
    expect(io).toHaveBeenCalledTimes(2);
    expect(refresh).not.toHaveBeenCalled();
    client.disconnectRealtime();
  });

  it("does not renew credentials for transport failures or bypass bounded transport retries", async () => {
    vi.stubEnv("VITE_TRIXUS_REALTIME_ENABLED", "true");
    const api = await import("@/lib/trixus-api");
    vi.spyOn(api, "ensureTrixusAccessToken").mockResolvedValue("synthetic-access");
    const refresh = vi
      .spyOn(api, "refreshTrixusAccessToken")
      .mockResolvedValue("synthetic-renewed");
    const { io } = await import("socket.io-client");
    const client = await import("./client");
    await client.connectRealtime();
    const target = lastSocket!;
    target.connected = false;
    const error = target.on.mock.calls.find(([name]) => name === "connect_error")![1];
    for (let i = 0; i < 50; i += 1) {
      error(new Error("synthetic network failure"));
      await client.connectRealtime();
    }
    expect(refresh).not.toHaveBeenCalled();
    expect(target.connect).not.toHaveBeenCalled();
    expect(io).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        reconnectionAttempts: 5,
        reconnectionDelay: 1_000,
        reconnectionDelayMax: 10_000,
      }),
    );
    target.io.on.mock.calls.find(([name]) => name === "reconnect_failed")![1]();
    await client.connectRealtime();
    expect(client.realtimeDiagnostics()).toMatchObject({
      authenticationFailureCode: "REALTIME_TRANSPORT_UNAVAILABLE",
      authenticationSuspended: true,
    });
    client.disconnectRealtime();
  });
});
