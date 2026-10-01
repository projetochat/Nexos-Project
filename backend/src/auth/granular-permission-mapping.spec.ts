import { describe, expect, it } from "vitest";
import { CampaignsController } from "../campaigns/campaigns.controller";
import { TicketsController } from "../tickets/tickets.controller";
import { ANY_PERMISSIONS_KEY, PERMISSIONS_KEY } from "./permissions.decorator";

function metadata(controller: object, method: string, key: string) {
  const handler = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(controller), method)?.value;
  return Reflect.getMetadata(key, handler) as string[] | undefined;
}

describe("mapeamento CRUD de campanhas e chamados", () => {
  it("reduz todas as ações de campanhas ao CRUD padrão", () => {
    const controller = new CampaignsController({} as never);

    expect(metadata(controller, "create", PERMISSIONS_KEY)).toEqual(["campaigns.create"]);
    expect(metadata(controller, "start", PERMISSIONS_KEY)).toEqual(["campaigns.update"]);
    expect(metadata(controller, "schedule", PERMISSIONS_KEY)).toEqual(["campaigns.update"]);
    expect(metadata(controller, "duplicate", PERMISSIONS_KEY)).toEqual(["campaigns.update"]);
    expect(metadata(controller, "recipients", PERMISSIONS_KEY)).toEqual(["campaigns.read"]);
  });

  it("usa update para as mutações de chamados e separa a geração pelo Chat", () => {
    const controller = new TicketsController({} as never);

    expect(metadata(controller, "create", ANY_PERMISSIONS_KEY)).toEqual([
      "tickets.create",
      "chat.tickets.create",
    ]);
    for (const method of [
      "update",
      "updateStatus",
      "updateAssignee",
      "createComment",
      "uploadAttachment",
      "deleteAttachment",
    ]) {
      expect(metadata(controller, method, PERMISSIONS_KEY)).toEqual(["tickets.update"]);
    }
  });

  it("restringe a permissão do Chat a chamados originados de conversa", () => {
    const service = { create: () => ({ id: "ticket-a" }) };
    const controller = new TicketsController(service as never);
    const chatActor = { permissions: ["chat.tickets.create"] };

    expect(() => controller.create({} as never, chatActor as never)).toThrow(
      "exige que o chamado seja originado de uma conversa",
    );
    expect(
      controller.create({ conversationId: "conversation-a" } as never, chatActor as never),
    ).toEqual({ id: "ticket-a" });
  });
});
