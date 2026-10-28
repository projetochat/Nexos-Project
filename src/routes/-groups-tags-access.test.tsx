// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ picker: vi.fn(), tags: vi.fn() }));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => vi.fn(),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PageContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/session", () => ({
  useSession: (selector: (state: unknown) => unknown) => selector({ user: { permissions: [] } }),
}));
vi.mock("@/lib/perms", () => ({ useChatPerms: () => ({}) }));
vi.mock("@/lib/trixus-api", async (original) => ({
  ...(await original<typeof import("@/lib/trixus-api")>()),
  crmApi: { listContactsForGroupPicker: api.picker, listTagsCatalog: api.tags },
}));
import { GroupDetailModal } from "./grupos";
import { Route as TagsRoute } from "./etiquetas";
const TagsPage = (TagsRoute as unknown as { options: { component: React.ComponentType } }).options
  .component;
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("network disabled");
    }),
  );
  api.picker.mockReset().mockResolvedValue({ items: [], total: 0 });
  api.tags.mockReset().mockResolvedValue([]);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => {
  await React.act(async () => root.unmount());
  client.clear();
  host.remove();
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
async function render(node: React.ReactNode) {
  await (TagsPage as React.ComponentType & { preload?: () => Promise<unknown> }).preload?.();
  await React.act(async () => {
    root.render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  await React.act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}
function group(canManageParticipants: boolean) {
  return {
    id: "group-synthetic",
    name: "Grupo sintético",
    description: "",
    imageUrl: null,
    canManageParticipants,
    participantsCount: 1,
    participantCount: 1,
    status: "active",
    connectionId: "connection-a",
    connection: { id: "connection-a", name: "Instância sintética" },
    participants: [
      {
        id: "participant-a",
        name: "Pessoa sintética",
        phone: "5511999990000",
        externalParticipantId: "5511999990000@s.whatsapp.net",
        active: true,
        isAdmin: false,
        isCurrentInstance: true,
        isSuperAdmin: false,
      },
    ],
  } as never;
}
it.each([
  { instanceAdmin: false, canEdit: true, pickerVisible: false },
  { instanceAdmin: true, canEdit: false, pickerVisible: false },
  { instanceAdmin: true, canEdit: true, pickerVisible: true },
])(
  "always shows available contacts but only enables and loads them when authorized: %j",
  async ({ instanceAdmin, canEdit, pickerVisible }) => {
    await render(
      <GroupDetailModal
        group={group(instanceAdmin)}
        canManage={canEdit}
        onClose={vi.fn()}
        onGroupChange={vi.fn()}
      />,
    );
    expect(document.body.textContent).toContain("Contatos selecionados");
    expect(document.body.textContent).toContain("Pessoa sintética");
    expect(document.body.textContent).toContain("Contatos disponíveis");
    const available = document.querySelector<HTMLElement>('[aria-label="Contatos disponíveis"]')!;
    expect(available.getAttribute("aria-disabled")).toBe(String(!pickerVisible));
    expect(available.querySelector("fieldset")?.disabled).toBe(!pickerVisible);
    expect(available.querySelector<HTMLInputElement>("input")?.matches(":disabled")).toBe(
      !pickerVisible,
    );
    expect(
      available.textContent?.includes("Você não pode adicionar participantes neste grupo."),
    ).toBe(!pickerVisible);
    expect(api.picker).toHaveBeenCalledTimes(pickerVisible ? 1 : 0);
  },
);
it("shows a sound notice only for enabled flags without modifying disabled or legacy tags", async () => {
  api.tags.mockResolvedValue([
    { id: "enabled", nome: "Etiqueta com aviso", cor: "#000000", notifyOnNewConversation: true },
    { id: "disabled", nome: "Etiqueta sem aviso", cor: "#000000", notifyOnNewConversation: false },
    { id: "legacy", nome: "Etiqueta legada", cor: "#000000" },
  ]);
  await render(<TagsPage />);
  expect(host.textContent).toContain("Etiqueta com aviso");
  expect(host.textContent?.match(/Aviso sonoro ativado/g)).toHaveLength(1);
  expect(host.textContent).not.toContain("Aviso sonoro desativado");
  expect(host.textContent).toContain("Etiqueta sem aviso");
  expect(host.textContent).toContain("Etiqueta legada");
  expect(api.tags).toHaveBeenCalledTimes(1);
});

it("blocks the panel and hides retained candidates when group administration is lost", async () => {
  api.picker.mockResolvedValue({
    items: [
      {
        id: "candidate-a",
        nome: "Candidato sintético",
        telefone: "5511888880000",
        normalizedPhone: "5511888880000",
      },
    ],
    total: 1,
  });
  await render(
    <GroupDetailModal group={group(true)} canManage onClose={vi.fn()} onGroupChange={vi.fn()} />,
  );
  expect(document.body.textContent).toContain("Candidato sintético");
  expect(api.picker).toHaveBeenCalledOnce();
  await render(
    <GroupDetailModal group={group(false)} canManage onClose={vi.fn()} onGroupChange={vi.fn()} />,
  );
  const available = document.querySelector<HTMLElement>('[aria-label="Contatos disponíveis"]')!;
  expect(available).not.toBeNull();
  expect(available.querySelector("fieldset")?.disabled).toBe(true);
  expect(available.textContent).not.toContain("Candidato sintético");
  expect(available.textContent).not.toContain("Nenhum contato disponível.");
  expect(available.querySelector('[aria-label="Adicionar Candidato sintético"]')).toBeNull();
  expect(api.picker).toHaveBeenCalledOnce();
  expect(document.body.textContent).toContain("Pessoa sintética");
});
