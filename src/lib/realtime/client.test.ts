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
    vi.resetModules();
  });

  it("returns a cached external-store snapshot while realtime state is unchanged", async () => {
    vi.stubEnv("VITE_NEXOS_REALTIME_ENABLED", "true");
    const client = await import("./client");

    const first = client.realtimeSnapshot();
    const second = client.realtimeSnapshot();

    expect(Object.is(first, second)).toBe(true);
    expect(first).toEqual({ status: "offline", lastEventId: null });
  });

  it("does not create sockets or subscriptions when the frontend realtime flag is disabled", async () => {
    vi.stubEnv("VITE_NEXOS_REALTIME_ENABLED", "false");
    localStorage.setItem("nexo.api.accessToken", "access");
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
    vi.stubEnv("VITE_NEXOS_REALTIME_ENABLED", "true");
    localStorage.setItem("nexo.api.accessToken", "access");
    const { io } = await import("socket.io-client");
    const client = await import("./client");

    await client.connectRealtime();
    await client.connectRealtime();
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
});
