// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { CALL_UNAVAILABLE_MESSAGE, ConversationCallButton } from "./conversation-call-button";

it("enables calls only for active conversations", async () => {
  expect(CALL_UNAVAILABLE_MESSAGE).toBe("Ligações disponíveis apenas p/ API Oficial do Whastapp");
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onClick = vi.fn();

  try {
    await act(async () =>
      root.render(<ConversationCallButton enabled={false} onClick={onClick} />),
    );
    const button = host.querySelector("button")!;
    expect(button.disabled).toBe(true);
    await act(async () => button.click());
    expect(onClick).not.toHaveBeenCalled();

    await act(async () => root.render(<ConversationCallButton enabled={true} onClick={onClick} />));
    expect(button.disabled).toBe(false);
    await act(async () => button.click());
    expect(onClick).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
