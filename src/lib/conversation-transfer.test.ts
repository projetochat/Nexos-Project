import { describe, expect, it } from "vitest";
import { availableTransferQueues, currentTransferQueue } from "./conversation-transfer";

describe("currentTransferQueue", () => {
  it("identifies queue and standby as the current transfer origin", () => {
    expect(currentTransferQueue({ status: "aberta", is_lead: false })).toBe("fila");
    expect(currentTransferQueue({ status: "aguardando", is_lead: false })).toBe("standby");
  });

  it("does not confuse leads or active conversations with the queue", () => {
    expect(currentTransferQueue({ status: "aberta", is_lead: true })).toBeNull();
    expect(currentTransferQueue({ status: "em_andamento", is_lead: false })).toBeNull();
  });

  it("uses the visible queue as origin when a queued conversation retains lead history", () => {
    expect(currentTransferQueue({ status: "aberta", is_lead: true }, "fila")).toBe("fila");
    expect(currentTransferQueue({ status: "aberta", is_lead: true }, "leads")).toBeNull();
  });
});

it("removes the conversation origin from the available destinations", () => {
  const options = [{ id: "fila" as const }, { id: "standby" as const }];
  expect(availableTransferQueues(options, "fila")).toEqual([{ id: "standby" }]);
  expect(availableTransferQueues(options, "standby")).toEqual([{ id: "fila" }]);
});
