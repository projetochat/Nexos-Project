// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { InboxMobileActions } from "./inbox-mobile-actions";
import { contactCardFile } from "@/lib/contact-card";

it("opens the six actions in order and executes each selected action", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const callbacks = Array.from({ length: 6 }, () => vi.fn());
  try {
    await act(async () =>
      root.render(
        <InboxMobileActions
          disabled={false}
          allowQuickReplies
          ticketDisabled={false}
          onQuickReplies={callbacks[0]}
          onAttach={callbacks[1]}
          onCamera={callbacks[2]}
          onContact={callbacks[3]}
          onTicket={callbacks[4]}
          onSchedule={callbacks[5]}
        />,
      ),
    );
    for (let index = 0; index < callbacks.length; index++) {
      await act(async () =>
        host
          .querySelector("button")!
          .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })),
      );
      const items = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
      expect(items.map((item) => item.textContent)).toEqual([
        "Mensagens rápidas",
        "Anexos",
        "Câmera",
        "Contato",
        "Gerar Chamado",
        "Agendar mensagem",
      ]);
      await act(async () => items[index].click());
      expect(callbacks[index]).toHaveBeenCalledTimes(1);
      expect(document.querySelector('[role="menu"]')).toBeNull();
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });
    }
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("prepares a contact card with escaped name and WhatsApp-style phone", async () => {
  const file = contactCardFile({ nome: "Ana; Silva\nTeste", telefone: "+55 (62) 99999-1234" });
  const content = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(file);
  });
  expect(file.type).toBe("text/vcard");
  expect(content).toContain("FN:Ana\\; Silva\\nTeste\r\n");
  expect(content).toContain("TEL;TYPE=CELL:+55 62 99999-1234\r\n");
  expect(content).toContain("END:VCARD\r\n");
});

it("hides the ticket action when the tenant module is unavailable", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <InboxMobileActions
          disabled={false}
          allowQuickReplies
          ticketDisabled={false}
          onQuickReplies={() => undefined}
          onAttach={() => undefined}
          onCamera={() => undefined}
          onContact={() => undefined}
          onSchedule={() => undefined}
        />,
      ),
    );
    await act(async () =>
      host
        .querySelector("button")!
        .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })),
    );
    expect(document.body.textContent).not.toContain("Gerar Chamado");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
