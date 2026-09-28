// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { DisconnectedInstanceAlerts } from "./disconnected-instance-alerts";

it("shows only disconnected instances with the approved red warning", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await React.act(() =>
      root.render(
        <DisconnectedInstanceAlerts
          connections={[
            { id: "connected", name: "Equipe", status: "connected" },
            { id: "disconnected", name: "Flow iD", status: "disconnected" },
          ]}
        />,
      ),
    );

    expect(host.textContent).toBe("Instância Flow iD desconectada!");
    expect(host.textContent).not.toContain("Confira se o computador");
    expect(host.textContent).not.toContain("Reconectar");
    expect(host.querySelector('[role="alert"]')?.className).toContain("bg-destructive/10");
    expect(host.querySelector("svg")?.getAttribute("class")).toContain("text-destructive");
    expect(host.querySelector("p")?.className).toContain("text-black");
  } finally {
    await React.act(() => root.unmount());
    host.remove();
  }
});
