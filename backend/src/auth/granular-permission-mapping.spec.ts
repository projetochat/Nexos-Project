import { describe, expect, it } from "vitest";
import { CampaignsController } from "../campaigns/campaigns.controller";
import { TicketsController } from "../tickets/tickets.controller";
import { ANY_PERMISSIONS_KEY } from "./permissions.decorator";

function anyPermissions(controller: object, method: string) {
  const handler = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(controller), method)?.value;
  return Reflect.getMetadata(ANY_PERMISSIONS_KEY, handler) as string[] | undefined;
}

describe("mapeamento das permissões granulares", () => {
  it("associa as ações de campanhas às permissões específicas e mantém compatibilidade", () => {
    const controller = new CampaignsController({} as never);

    expect(anyPermissions(controller, "create")).toEqual([
      "campaigns.create",
      "campaigns.update",
      "campaigns.manage",
    ]);
    expect(anyPermissions(controller, "start")).toContain("campaigns.start");
    expect(anyPermissions(controller, "schedule")).toContain("campaigns.schedule");
    expect(anyPermissions(controller, "duplicate")).toContain("campaigns.duplicate");
    expect(anyPermissions(controller, "recipients")).toContain("campaigns.recipients.read");
  });

  it("associa as ações de chamados às permissões específicas e mantém manage", () => {
    const controller = new TicketsController({} as never);

    expect(anyPermissions(controller, "update")).toEqual(["tickets.update", "tickets.manage"]);
    expect(anyPermissions(controller, "updateStatus")).toContain("tickets.status.update");
    expect(anyPermissions(controller, "updateAssignee")).toContain("tickets.assign");
    expect(anyPermissions(controller, "createComment")).toContain("tickets.comment");
    expect(anyPermissions(controller, "uploadAttachment")).toContain("tickets.attachments.upload");
    expect(anyPermissions(controller, "deleteAttachment")).toContain("tickets.attachments.delete");
  });
});
