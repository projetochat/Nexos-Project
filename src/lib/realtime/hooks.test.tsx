// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
    vi.stubEnv("VITE_NEXOS_REALTIME_ENABLED", "false");
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
});

function user(): SessionUser {
  return {
    id: "user-a",
    nome: "Admin",
    email: "admin@nexo.app",
    role: "admin",
    empresaId: "tenant-a",
    empresaNome: "Homologacao",
    permissions: ["conversations.read"],
  };
}
