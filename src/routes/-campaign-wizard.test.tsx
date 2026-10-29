// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  preview: vi.fn(),
  start: vi.fn(),
  schedule: vi.fn(),
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (options: unknown) => options,
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: React.PropsWithChildren) => <>{children}</>,
  PageContainer: ({ children }: React.PropsWithChildren) => <main>{children}</main>,
}));
vi.mock("@/lib/session", () => ({
  useSession: (select: (state: unknown) => unknown) =>
    select({ user: { permissions: ["campaigns.create"] } }),
}));
vi.mock("@/lib/trixus-api", async (original) => ({
  ...(await original<typeof import("@/lib/trixus-api")>()),
  campaignApi: {
    list: async () => ({ items: [] }),
    create: mocks.create,
    preview: mocks.preview,
    start: mocks.start,
    capabilities: async () => ({ attachmentsEnabled: true }),
    schedule: mocks.schedule,
  },
  connectionsApi: {
    list: async () => [
      {
        id: "instance",
        name: "Instância teste",
        providerType: "evolution",
        status: "connected",
        serviceEnabled: true,
      },
    ],
  },
  crmApi: {
    listTags: async () => [],
    listContacts: async () => ({ items: [] }),
    listCustomers: async () => ({ items: [] }),
  },
}));
import { Route } from "./campanhas";
it.each([
  { scheduled: false, mime: "" },
  { scheduled: true, mime: "" },
  { scheduled: false, mime: "image/png" },
  { scheduled: false, mime: "audio/mpeg" },
  { scheduled: false, mime: "application/pdf" },
])(
  "guides creation through review without sending (scheduled: %s)",
  async ({ scheduled, mime }) => {
    vi.clearAllMocks();
    mocks.schedule.mockResolvedValue({ id: "new", status: "SCHEDULED" });
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    mocks.preview.mockResolvedValue({
      eligibleCount: 1,
      invalidPhoneCount: 0,
      optedOutCount: 0,
      duplicateCount: 0,
      blockedCount: 0,
      sample: [],
    });
    mocks.create.mockResolvedValue({ id: "new", status: "DRAFT" });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const Page = (
      Route as unknown as {
        component: React.ComponentType & { preload?: () => Promise<unknown> };
      }
    ).component;
    await Page.preload?.();
    const button = (text: string) =>
      [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text)!;
    const tick = async () =>
      React.act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    try {
      await React.act(async () =>
        root.render(
          <QueryClientProvider client={qc}>
            <Page />
          </QueryClientProvider>,
        ),
      );
      await tick();
      await React.act(async () => button("Nova campanha").click());
      await tick();
      expect(document.body.textContent).toContain("Etapa 1 de 4");
      const input = document.querySelector('[role="dialog"] input') as HTMLInputElement;
      await React.act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
          input,
          "Campanha teste",
        );
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      if (mime) {
        const upload = document.querySelector(
          'input[aria-label="Anexar arquivo à campanha"]',
        ) as HTMLInputElement;
        expect(upload.disabled).toBe(false);
        await React.act(async () => {
          Object.defineProperty(upload, "files", {
            configurable: true,
            value: [new File(["synthetic fixture"], "sample", { type: mime })],
          });
          upload.dispatchEvent(new Event("change", { bubbles: true }));
        });
        await tick();
        const text = document.querySelector(
          'textarea[aria-label="Texto WhatsApp"]',
        ) as HTMLTextAreaElement;
        await React.act(async () => {
          Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
            text,
            "",
          );
          text.dispatchEvent(new Event("input", { bubbles: true }));
        });
      }
      for (let i = 0; i < 2; i++) await React.act(async () => button("Continuar").click());
      expect(document.body.textContent).toContain("Etapa 3 de 4");
      expect(document.body.textContent).toContain("Selecione uma instância");
      if (scheduled) {
        await React.act(async () => button("Escolher data e hora").click());
        const date = document.querySelector('input[type="date"]') as HTMLInputElement;
        const time = document.querySelector(
          'input[aria-label="Hora do agendamento"]',
        ) as HTMLInputElement;
        await React.act(async () => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
            date,
            "2027-01-20",
          );
          date.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await React.act(async () => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
            time,
            "08:00",
          );
          time.dispatchEvent(new Event("input", { bubbles: true }));
        });
      }
      await React.act(async () => button("Revisar campanha").click());
      await tick();
      expect(document.body.textContent).toContain("Etapa 4 de 4");
      if (!scheduled)
        expect(document.body.textContent).toContain("Rascunho — envio manual após salvar");
      await React.act(async () => button("Voltar").click());
      expect(document.body.textContent).toContain("Etapa 3 de 4");
      await React.act(async () => button("Revisar campanha").click());
      await tick();
      expect(mocks.preview).toHaveBeenCalledTimes(2);
      expect(mocks.create).not.toHaveBeenCalled();
      expect(mocks.start).not.toHaveBeenCalled();
      await React.act(async () =>
        button(scheduled ? "Agendar campanha" : "Criar rascunho").click(),
      );
      await tick();
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Campanha teste",
          connectionId: "instance",
          audience: expect.objectContaining({ type: "ALL" }),
        }),
      );
      expect(mocks.start).not.toHaveBeenCalled();
      if (mime) {
        expect(mocks.create).toHaveBeenCalledWith(
          expect.objectContaining({
            messageText: "",
            attachment: expect.objectContaining({
              fileName: "sample",
              mimeType: mime,
              dataUrl: expect.stringContaining("base64,"),
            }),
          }),
        );
        expect(mocks.preview).toHaveBeenCalledWith(
          expect.objectContaining({
            messageText: "",
            attachment: expect.objectContaining({ mimeType: mime }),
          }),
        );
      }
      if (scheduled)
        expect(mocks.schedule).toHaveBeenCalledWith(
          "new",
          expect.objectContaining({ confirm: true, expectedEligibleCount: 1 }),
        );
      else expect(mocks.schedule).not.toHaveBeenCalled();
    } finally {
      await React.act(async () => root.unmount());
      qc.clear();
      host.remove();
    }
  },
);
