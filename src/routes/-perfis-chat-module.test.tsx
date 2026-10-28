// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => () => ({}),
  useNavigate: () => vi.fn(),
}));
vi.mock("@/components/app-shell", () => ({ AppShell: () => null, PageContainer: () => null }));
vi.mock("@/lib/session", () => ({ useSession: () => ({}) }));
vi.mock("@/lib/trixus-api", () => ({ organizationApi: {} }));
import { PerfilForm } from "./perfis";
import { modulePermissionGroups } from "@/hooks/use-tenant-entitlements";
const catalog = [
  {
    title: "Mixed shared group",
    tab: "chat" as const,
    items: [
      { id: "conversations.read", label: "Chat conversation", description: "" },
      { id: "contacts.read", label: "Shared contacts", description: "" },
      { id: "connections.read", label: "Shared connections", description: "" },
    ],
  },
  {
    title: "Tickets",
    tab: "chamados" as const,
    items: [{ id: "tickets.read", label: "Read tickets", description: "" }],
  },
];
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  api.submit.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Network blocked in isolated module profile test");
    }),
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await React.act(async () => root.unmount());
  host.remove();
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
it("filters Chat per permission without hiding shared items in the same group", () => {
  const filtered = modulePermissionGroups(catalog, { chat: false, campaigns: true, tickets: true });
  expect(filtered.flatMap((group) => group.items.map((item) => item.id))).toEqual([
    "contacts.read",
    "connections.read",
    "tickets.read",
  ]);
  expect(
    modulePermissionGroups(catalog, { chat: false, campaigns: false, tickets: false }).flatMap(
      (group) => group.items.map((item) => item.id),
    ),
  ).toEqual(["contacts.read"]);
});
it.each([
  "conversations.read",
  "messages.send",
  "leads.read",
  "groups.read",
  "history.read",
  "chat.tags.read",
  "schedules.read",
  "bot_flows.read",
  "automations.read",
])("hides disabled Chat permission %s", (id) => {
  expect(
    modulePermissionGroups(
      [{ title: "Chat", tab: "chat", items: [{ id, label: id, description: "" }] }],
      { chat: false, campaigns: true, tickets: true },
    ),
  ).toEqual([]);
});
it("preserves hidden stored Chat grants when editing only profile identity", async () => {
  const permissionGroups = modulePermissionGroups(catalog, {
    chat: false,
    campaigns: false,
    tickets: true,
  });
  const initial = {
    id: "synthetic-role",
    name: "Perfil sintético",
    active: true,
    permissionIds: ["conversations.read", "messages.send", "tickets.read"],
    metadata: { color: "#123456" },
  } as never;
  await React.act(async () =>
    root.render(
      <PerfilForm
        open
        onClose={() => {}}
        onSubmit={api.submit}
        initial={initial}
        roles={[]}
        connections={[]}
        grantablePermissionIds={["tickets.read"]}
        permissionGroups={permissionGroups}
      />,
    ),
  );
  const name =
    host.querySelector<HTMLInputElement>('input[placeholder="Ex: Atendente Senior"]') ??
    document.querySelector<HTMLInputElement>('input[placeholder="Ex: Atendente Senior"]')!;
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      name,
      "Perfil renomeado",
    );
    name.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const save = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.trim() === "Salvar",
  )!;
  await React.act(async () => save.click());
  expect(api.submit).toHaveBeenCalledOnce();
  expect(api.submit.mock.calls[0][0]).toMatchObject({ name: "Perfil renomeado", color: "#123456" });
  expect(new Set(api.submit.mock.calls[0][0].permissionIds)).toEqual(
    new Set(["conversations.read", "messages.send", "tickets.read"]),
  );
});
