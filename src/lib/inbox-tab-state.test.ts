import { expect, it, vi } from "vitest";
import { getInboxTab, setInboxTab, subscribeInboxTab } from "./inbox-tab-state";

it("moves the inbox to the destination tab and notifies the mounted layout", () => {
  const listener = vi.fn();
  const unsubscribe = subscribeInboxTab(listener);
  setInboxTab("fila");
  expect(getInboxTab()).toBe("fila");
  expect(listener).toHaveBeenCalledOnce();

  setInboxTab("standby");
  expect(getInboxTab()).toBe("standby");
  expect(listener).toHaveBeenCalledTimes(2);

  setInboxTab("ativas");
  unsubscribe();
});
