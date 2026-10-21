// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({
  history: vi.fn(),
  timeline: vi.fn(),
  messages: vi.fn(),
  bubble: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({}),
  lazyRouteComponent: () => () => null,
  useNavigate: () => api.navigate,
}));
vi.mock("@/components/app-shell", () => ({
  AppShellFull: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
vi.mock("@/components/dashboard-filters", () => ({ DashboardFiltersBar: () => null }));
vi.mock("@/lib/session", () => ({
  useSession: () => ({
    id: "user",
    permissions: ["chat.phone.read", "messages.send", "groups.read", "conversations.read"],
  }),
}));
vi.mock("@/lib/realtime/client", () => ({ onRealtimeEvent: () => () => {} }));
vi.mock("../routes/inbox.$conversationId", () => ({
  ContactPanel: () => null,
  MessageBubble: (props: { m: { content: string }; readOnly?: boolean }) => {
    api.bubble(props);
    return <div data-testid="shared-message">{props.m.content}</div>;
  },
}));
vi.mock("@/lib/trixus-api", () => ({
  operationsApi: { history: api.history, timeline: api.timeline },
  messageApi: { list: api.messages },
  conversationApi: {},
  crmApi: { contactOptions: vi.fn().mockResolvedValue({ instances: [] }) },
  organizationApi: { listChatDepartments: vi.fn().mockResolvedValue([]) },
}));
import { historyTotalLabel } from "./history-total-label";
import { HistoricoPage } from "../routes/-historico-page";

it("pluralizes the filtered history total", () => {
  expect(historyTotalLabel(0)).toBe("0 registros encontrados.");
  expect(historyTotalLabel(1)).toBe("1 registro encontrado.");
  expect(historyTotalLabel(20)).toBe("20 registros encontrados.");
});

it("selects a different conversation on one click and loads its messages without the removed timeline", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  api.history.mockResolvedValue({
    items: [
      {
        id: "0",
        status: "fechada",
        is_group: true,
        group_name: "GANG DA GERALDA",
        created_at: "2026-09-18",
        closed_at: "2026-09-18T12:00:00.000Z",
        last_message_at: "2026-09-18T12:00:00.000Z",
        protocolo: "000123",
        lastMessagePreview: "Última mensagem do grupo",
        contact: { nome: "Grupo WhatsApp", telefone: "" },
        connection: { name: "WhatsApp Grupos" },
        department: { nome: "Comunidade" },
        closed_by: { nome: "Atendente Grupo" },
      },
      {
        id: "1",
        status: "fechada",
        is_group: false,
        created_at: "2026-09-18",
        closed_at: "2026-09-18T13:30:00.000Z",
        last_message_at: "2026-09-18T12:00:00.000Z",
        protocolo: "000124",
        lastMessagePreview: "Última mensagem do contato",
        contact: { nome: "Natã R", telefone: "5511999990000" },
        connection: { name: "WhatsApp Principal", color: "#8b5cf6" },
        department: { nome: "Suporte" },
        closed_by: { nome: "Ialle - Prima" },
      },
    ],
    total: 2,
    totalPages: 1,
  });
  api.timeline.mockImplementation(async (id) => ({
    items: [{ event: "created", at: "2026-09-18", description: "Timeline " + id }],
  }));
  api.messages.mockImplementation(async (id: string) => ({
    items: [
      {
        id: `message-${id}`,
        conversation_id: id,
        content: `Mensagem da API ${id}`,
        type: "text",
        created_at: "2026-09-18T12:00:00.000Z",
      },
    ],
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
          <HistoricoPage />
        </QueryClientProvider>,
      ),
    );
    await flush();
    await flush();
    const conversationList = host.querySelector('[aria-label="Lista de conversas do histórico"]')!;
    const conversationDetail = host.querySelector('[aria-label="Conversa do histórico"]')!;
    expect(conversationList.textContent).toContain("GANG DA GERALDA");
    expect(conversationList.textContent).toContain("WhatsApp Grupos");
    expect(conversationList.textContent).toContain("Comunidade");
    expect(conversationList.textContent).toContain("Atendente Grupo");
    expect(conversationList.textContent).toContain("#000123");
    expect(conversationList.className).not.toContain("hidden lg:flex");
    expect(conversationList.className).toContain("overflow-hidden");
    expect(conversationList.querySelector("[data-radix-scroll-area-viewport]")).not.toBeNull();
    expect(conversationDetail.className).toContain("hidden lg:flex");
    const newGroupConversation = host.querySelector(
      '[aria-label="Nova conversa"]',
    ) as HTMLButtonElement;
    expect(newGroupConversation.disabled).toBe(false);
    await act(async () => newGroupConversation.click());
    expect(api.navigate).toHaveBeenCalledWith({
      to: "/inbox/$conversationId",
      params: { conversationId: "0" },
    });
    const target = [...host.querySelectorAll("li button")].find((button) =>
      button.textContent?.includes("Natã R"),
    ) as HTMLButtonElement;
    await act(async () => target.click());
    await flush();
    expect(conversationList.className).toContain("hidden lg:flex");
    expect(conversationDetail.className).not.toContain("hidden lg:flex");
    expect(target.getAttribute("aria-pressed")).toBe("true");
    expect(target.textContent).toContain("Natã R");
    expect(target.textContent).toContain("(11) 99999-0000");
    expect(target.textContent).toContain("#000124");
    expect(target.textContent).toContain("WhatsApp Principal");
    expect(target.textContent).toContain("Suporte");
    expect(target.textContent).toContain("Ialle - Prima");
    const closureMetadata = target.querySelector(
      '[aria-label="Instância, departamento e atendente do encerramento"]',
    ) as HTMLElement;
    const protocol = target.querySelector('[aria-label="protocolo 000124"]') as HTMLElement;
    expect(protocol.parentElement?.textContent).toContain("(11) 99999-0000");
    expect(protocol.parentElement?.textContent).toContain("#000124");
    expect(closureMetadata.previousElementSibling).toBe(protocol.parentElement);
    expect(closureMetadata.className).not.toContain("mt-2");
    expect(
      (closureMetadata.querySelector('[aria-label="Cor da instância"]') as HTMLElement).style
        .backgroundColor,
    ).toBe("rgb(139, 92, 246)");
    expect(host.querySelector("aside footer")?.className).toContain("bg-surface-2");
    expect(
      host.querySelector('[aria-label="Abrir informações do contato"]')?.textContent,
    ).toContain("Natã R");
    expect(api.messages).toHaveBeenLastCalledWith("1", { limit: 100 });
    expect(api.bubble).toHaveBeenLastCalledWith(
      expect.objectContaining({
        m: expect.objectContaining({ id: "message-1", content: "Mensagem da API 1" }),
        readOnly: true,
      }),
    );
    expect(host.querySelector('[data-testid="shared-message"]')?.textContent).toBe(
      "Mensagem da API 1",
    );
    expect(host.textContent).not.toContain("Timeline 1");
    expect(api.timeline).not.toHaveBeenCalled();
    expect(host.querySelector("h1")?.textContent).toBe("Histórico de Conversas");
    expect(host.textContent).toContain("2 registros encontrados.");
    expect(host.textContent).not.toContain("Consulta operacional");
    const historyQuery = client
      .getQueryCache()
      .find({ queryKey: ["operations", "history"], exact: false })!;
    const savedHistory = historyQuery.state.data;
    await act(async () => client.setQueryData(historyQuery.queryKey, { items: [] }));
    await flush();
    await act(async () => client.setQueryData(historyQuery.queryKey, savedHistory));
    await flush();
    expect(
      [...host.querySelectorAll("li button")]
        .find((button) => button.textContent?.includes("Natã R"))
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    const backButton = host.querySelector(
      '[aria-label="Voltar para a lista do histórico"]',
    ) as HTMLButtonElement;
    await act(async () => backButton.click());
    expect(conversationList.className).not.toContain("hidden lg:flex");
    expect(conversationDetail.className).toContain("hidden lg:flex");
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
    localStorage.clear();
  }
});
