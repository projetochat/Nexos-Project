// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { NotificationQueueToggles } from "./notification-queue-toggles";

it("renders notification queues as toggles without a duplicated Todas option", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onChange = vi.fn();
  try {
    await React.act(() =>
      root.render(
        <NotificationQueueToggles enabled selected={["leads", "fila"]} onChange={onChange} />,
      ),
    );

    const switches = host.querySelectorAll('[role="switch"]');
    expect(switches).toHaveLength(4);
    expect(host.textContent).not.toContain("Todas");
    expect(switches[0]?.getAttribute("data-state")).toBe("checked");

    await React.act(() => (switches[0] as HTMLButtonElement).click());
    expect(onChange).toHaveBeenCalledWith(["fila"]);
  } finally {
    await React.act(() => root.unmount());
    host.remove();
  }
});
