import { describe, expect, it } from "vitest";
import { ConversationsController } from "../conversations/conversations.controller";
import { CrmController } from "../crm/crm.controller";
import { MessagingConnectionsController } from "../messaging/messaging-connections.controller";
import { SchedulesController } from "../schedules/schedules.module";
import { ANY_PERMISSIONS_KEY, PERMISSIONS_KEY } from "./permissions.decorator";

function metadata(controller: object, method: string, key: string) {
  const handler = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(controller), method)?.value;
  return Reflect.getMetadata(key, handler) as string[] | undefined;
}

describe("chat permission alignment", () => {
  it("uses delete for disconnecting an instance", () => {
    const controller = new MessagingConnectionsController({} as never);
    expect(metadata(controller, "logout", PERMISSIONS_KEY)).toEqual(["connections.delete"]);
  });

  it("separates message lifecycle actions from conversation transfers", () => {
    const controller = new ConversationsController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    expect(metadata(controller, "create", PERMISSIONS_KEY)).toEqual(["messages.send"]);
    expect(metadata(controller, "bulkClose", PERMISSIONS_KEY)).toEqual(["messages.send"]);
    expect(metadata(controller, "transferDepartment", PERMISSIONS_KEY)).toEqual([
      "conversations.assign",
    ]);
    expect(metadata(controller, "assign", ANY_PERMISSIONS_KEY)).toEqual([
      "messages.send",
      "conversations.assign",
    ]);
  });

  it("keeps customer linking dedicated and requires send permission for schedules", () => {
    const crm = new CrmController({} as never, {} as never, {} as never, {} as never);
    const schedules = new SchedulesController({} as never);
    expect(metadata(crm, "updateContactCustomer", PERMISSIONS_KEY)).toEqual([
      "chat.customer_link.edit",
    ]);
    expect(metadata(schedules, "save", PERMISSIONS_KEY)).toEqual(["messages.send"]);
  });
});
