// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/session";

type FakeSocket = {
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
  io: vi.fn(() => {
    lastSocket = {
      connected: true,
      on: vi.fn(),
      emit: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      io: { on: vi.fn() },
    };
    return lastSocket;
  }),
}));

describe("useRealtimeInbox render stability", () => {
  afterEach(async () => {
    const { useSession } = await import("@/lib/session");
    useSession.setState({ user: null, impersonating: null, hydrated: true, error: null });
    localStorage.clear();
    lastSocket = null;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("stabilizes renders instead of looping on unchanged realtime snapshots", async () => {
    vi.stubEnv("VITE_TRIXUS_REALTIME_ENABLED", "false");
    const { useSession } = await import("@/lib/session");
    const { useRealtimeInbox } = await import("./hooks");
    useSession.setState({ user: user(), impersonating: null, hydrated: true, error: null });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let renders = 0;
    let root: Root | null = null;
    const host = document.createElement("div");
    document.body.appendChild(host);

    function Probe() {
      renders += 1;
      const realtime = useRealtimeInbox("conversation-a");
      return <span>{realtime.status}</span>;
    }

    await act(async () => {
      root = createRoot(host);
      root.render(
        <QueryClientProvider client={queryClient}>
          <Probe />
        </QueryClientProvider>,
      );
    });

    expect(host.textContent).toBe("disabled");
    expect(renders).toBeLessThanOrEqual(2);

    await act(async () => {
      root?.unmount();
    });
    host.remove();
  });

  it.each([
    ["conversation.created", "created"],
    ["conversation.updated", "status.updated"],
    ["conversation.updated", "department.updated"],
    ["conversation.assignment.updated", "assignment.updated"],
    ["conversation.updated", "message.created"],
    ["message.created", "message.created"],
  ])("refreshes the visible history immediately on %s (%s)", async (event, reason) => {
    vi.stubEnv("VITE_TRIXUS_REALTIME_ENABLED", "true");
    localStorage.setItem("trixus.api.accessToken", "access");
    const { useSession } = await import("@/lib/session");
    const { useRealtimeInbox } = await import("./hooks");
    useSession.setState({ user: user(), hydrated: true });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    let stored = "Histórico anterior";
    const loadMessages = vi.fn(async () => stored);
    const otherConversation = vi.fn(async () => "Outra conversa");
    function Probe() {
      useRealtimeInbox("conversation-a");
      const history = useQuery({
        queryKey: ["trixus", "messages", "conversation-a"],
        queryFn: loadMessages,
      });
      useQuery({ queryKey: ["trixus", "messages", "conversation-b"], queryFn: otherConversation });
      return <span>{history.data}</span>;
    }
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const flush = () =>
      act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
    try {
      await act(async () =>
        root.render(
          <QueryClientProvider client={client}>
            <Probe />
          </QueryClientProvider>,
        ),
      );
      await act(async () =>
        lastSocket?.on.mock.calls.find(([name]) => name === "realtime.ready")?.[1](),
      );
      await flush();
      expect(host.textContent).toBe("Histórico anterior");
      const previousLoads = loadMessages.mock.calls.length;
      stored = "Conversa encerrada.";
      await act(async () =>
        lastSocket?.on.mock.calls.find(([name]) => name === event)?.[1]({
          eventId: "event-1",
          event,
          version: 1,
          occurredAt: new Date().toISOString(),
          data: { conversationId: "conversation-a", reason },
        }),
      );
      await flush();
      expect(host.textContent).toBe("Conversa encerrada.");
      expect(loadMessages.mock.calls.length).toBeGreaterThan(previousLoads);
      expect(otherConversation).toHaveBeenCalledTimes(1);

      stored = "Aviso recebido durante desconexão";
      await act(async () =>
        lastSocket?.on.mock.calls.find(([name]) => name === "disconnect")?.[1](),
      );
      await act(async () =>
        lastSocket?.on.mock.calls.find(([name]) => name === "realtime.ready")?.[1](),
      );
      await flush();
      expect(host.textContent).toBe("Aviso recebido durante desconexão");
    } finally {
      await act(async () => root.unmount());
      client.clear();
      host.remove();
    }
  });

  it("refreshes persisted system messages after a local action even with realtime disabled", async () => {
    const { invalidateConversationQueries } = await import("./invalidate-conversation");
    const client = new QueryClient();
    client.setQueryData(["trixus", "messages", "conversation-a"], ["antes"]);
    client.setQueryData(["trixus", "messages", "conversation-b"], ["outra"]);
    client.setQueryData(["trixus", "conversations", "conversation-a"], { status: "aberta" });
    await invalidateConversationQueries(client, "conversation-a");
    expect(client.getQueryState(["trixus", "messages", "conversation-a"])?.isInvalidated).toBe(
      true,
    );
    expect(client.getQueryState(["trixus", "conversations", "conversation-a"])?.isInvalidated).toBe(
      true,
    );
    expect(client.getQueryState(["trixus", "messages", "conversation-b"])?.isInvalidated).toBe(
      false,
    );
    client.clear();
  });
});

function user(): SessionUser {
  return {
    id: "user-a",
    nome: "Admin",
    email: "admin@trixus.app",
    role: "admin",
    empresaId: "tenant-a",
    empresaNome: "Homologação",
    permissions: ["conversations.read"],
  };
}
