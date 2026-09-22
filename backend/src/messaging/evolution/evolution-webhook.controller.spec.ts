import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JwtService } from "@nestjs/jwt";
import { EvolutionWebhookController } from "./evolution-webhook.controller";
import { MessageStatus } from "../../generated/prisma";
import type { EvolutionWebhookTranslation } from "./evolution-webhook.translator";

beforeEach(() => {
  vi.stubEnv("EVOLUTION_WEBHOOK_SECRET", "isolated-webhook-secret");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network disabled")));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const variants = ["status", "edit", "delete", "reaction"] as const;
function fixture(kind: (typeof variants)[number], enabled = true) {
  const event = {
    tenantId: "tenant-a",
    connectionId: "connection-a",
    providerMessageId: "message-a",
    occurredAt: new Date("2026-09-22T12:00:00Z"),
    content: "Edited",
    status: MessageStatus.READ,
    emoji: "👍",
    actorExternalId: "test-actor",
    providerReactionId: "reaction-a",
  };
  const translated = { kind, event } as EvolutionWebhookTranslation;
  const process = vi.fn();
  const processEdit = vi.fn();
  const processDeletion = vi.fn();
  const reaction = vi.fn();
  const connection = { id: "connection-a", tenantId: "tenant-a" };
  const deferIfPaused = vi.fn().mockResolvedValue(false);
  const tx = { $queryRaw: vi.fn().mockResolvedValue([{ serviceEnabled: enabled }]) };
  const prisma = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  const controller = new EvolutionWebhookController(
    new JwtService(),
    { findByEvolutionInstance: vi.fn().mockResolvedValue(connection) } as never,
    { translate: vi.fn().mockReturnValue(translated) } as never,
    { processEdit, processDeletion } as never,
    { process: reaction } as never,
    { process } as never,
    prisma as never,
    { deferIfPaused } as never,
  );
  const selected =
    kind === "status"
      ? process
      : kind === "edit"
        ? processEdit
        : kind === "delete"
          ? processDeletion
          : reaction;
  return { controller, selected, tx, prisma, deferIfPaused, connection, translated };
}
const request = (controller: EvolutionWebhookController) =>
  controller.receive(
    { instance: "test-instance", event: "test-event" },
    undefined,
    "isolated-webhook-secret",
  );

describe("live update webhook admission while service pauses", () => {
  it("accepts a fresh signed provider JWT", async () => {
    const test = fixture("edit");
    const token = new JwtService().sign(
      { app: "evolution", action: "webhook" },
      { secret: "isolated-webhook-secret", expiresIn: 600 },
    );
    await expect(
      test.controller.receive(
        { instance: "test-instance", event: "test-event" },
        `Bearer ${token}`,
      ),
    ).resolves.toMatchObject({ ok: true });
    expect(test.selected).toHaveBeenCalledOnce();
  });
  it.each(["expired", "wrong-signature"])(
    "rejects %s provider JWT without processing",
    async (reason) => {
      const test = fixture("edit");
      const token = new JwtService().sign(
        { app: "evolution", action: "webhook" },
        {
          secret: reason === "expired" ? "isolated-webhook-secret" : "other-isolated-secret",
          expiresIn: reason === "expired" ? -1 : 600,
        },
      );
      await expect(
        test.controller.receive(
          { instance: "test-instance", event: "test-event" },
          `Bearer ${token}`,
        ),
      ).rejects.toThrow("Webhook token inválido.");
      expect(test.selected).not.toHaveBeenCalled();
      expect(test.deferIfPaused).not.toHaveBeenCalled();
    },
  );
  it.each(variants)("retains %s if pause commits after the initial snapshot", async (kind) => {
    const test = fixture(kind, false);
    await expect(request(test.controller)).resolves.toEqual({ ok: true, kind, deferred: true });
    expect(test.selected).not.toHaveBeenCalled();
    expect(test.deferIfPaused).toHaveBeenNthCalledWith(2, test.connection, test.translated, true);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it.each(variants)("admits %s only after acquiring the shared scoped lock", async (kind) => {
    const test = fixture(kind);
    await expect(request(test.controller)).resolves.toEqual({ ok: true, kind });
    expect(test.selected).toHaveBeenCalledWith(
      test.translated.kind !== "connection" && test.translated.kind !== "ignored"
        ? test.translated.event
        : null,
    );
    expect(test.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      test.selected.mock.invocationCallOrder[0],
    );
    expect(test.deferIfPaused).toHaveBeenCalledOnce();
  });
  it("propagates processing failures rather than acknowledging or converting them to pause", async () => {
    const test = fixture("edit");
    test.selected.mockRejectedValue(new Error("isolated persistence failure"));
    await expect(request(test.controller)).rejects.toThrow("isolated persistence failure");
    expect(test.deferIfPaused).toHaveBeenCalledOnce();
  });
  it("does not acknowledge a racing pause if forced retention fails", async () => {
    const test = fixture("delete", false);
    test.deferIfPaused
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error("retention unavailable"));
    await expect(request(test.controller)).rejects.toThrow("retention unavailable");
    expect(test.selected).not.toHaveBeenCalled();
  });
});
