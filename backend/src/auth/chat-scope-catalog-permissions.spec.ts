import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { ANY_PERMISSIONS_KEY } from "./permissions.decorator";
import { DepartmentsController } from "../departments/departments.controller";
import { MessagingConnectionsController } from "../messaging/messaging-connections.controller";

const operationalReaders = [
  "conversations.read",
  "dashboard.read",
  "history.read",
  "contacts.read",
  "campaigns.read",
  "tickets.read",
];

describe("Chat scope catalog permissions", () => {
  it.each([
    DepartmentsController.prototype.listChatScope,
    MessagingConnectionsController.prototype.listChatScope,
  ])("allows operational consumers to read only their own scope options", (handler) => {
    expect(Reflect.getMetadata(ANY_PERMISSIONS_KEY, handler)).toEqual(operationalReaders);
  });
});
