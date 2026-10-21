import { describe, expect, it, vi } from "vitest";
import { MessagingConnectionsController } from "./messaging-connections.controller";

describe("MessagingConnectionsController removal contract", () => {
  it("requires the exact removal confirmation", () => {
    const controller = new MessagingConnectionsController({ remove: vi.fn() } as never);
    const current = { tenantId: "tenant-a" };

    expect(() => controller.remove("connection-a", undefined, current as never)).toThrow(
      'Digite "REMOVER" para confirmar.',
    );
    expect(() =>
      controller.remove("connection-a", { confirmation: "remover" }, current as never),
    ).toThrow('Digite "REMOVER" para confirmar.');
  });

  it("forwards only the connection and tenant-scoped actor after confirmation", async () => {
    const remove = vi.fn().mockResolvedValue({ removed: true });
    const controller = new MessagingConnectionsController({ remove } as never);
    const current = { tenantId: "tenant-a" };

    await expect(
      controller.remove("connection-a", { confirmation: "REMOVER" }, current as never),
    ).resolves.toEqual({ removed: true });
    expect(remove).toHaveBeenCalledWith("connection-a", current);
  });
});
