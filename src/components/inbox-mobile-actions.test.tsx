// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { InboxMobileActions } from "./inbox-mobile-actions";
import { contactCardFile } from "@/lib/contact-card";

it("opens the five actions in order and executes each selected action", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const callbacks = Array.from({ length: 5 }, () => vi.fn());
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

it("prepares a contact card with escaped name and normalized phone", async () => {
  const file = contactCardFile({ nome: "Ana; Silva\nTeste", telefone: "+55 (62) 99999-1234" });
  const content = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(file);
  });
  expect(file.type).toBe("text/vcard");
  expect(content).toContain("FN:Ana\\; Silva\\nTeste\r\n");
  expect(content).toContain("TEL;TYPE=CELL:+5562999991234\r\n");
  expect(content).toContain("END:VCARD\r\n");
});
