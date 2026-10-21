import { describe, expect, it } from "vitest";
import { ANY_PERMISSIONS_KEY, PERMISSIONS_KEY } from "../auth/permissions.decorator";
import { CrmController } from "./crm.controller";

describe("group contact picker permissions", () => {
  it("allows the contact catalog needed by group creation and management actions", () => {
    const handler = Object.getOwnPropertyDescriptor(
      CrmController.prototype,
      "listContactsForGroupPicker",
    )?.value;

    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toBeUndefined();
    expect(Reflect.getMetadata(ANY_PERMISSIONS_KEY, handler)).toEqual([
      "contacts.read",
      "groups.create",
      "groups.update",
    ]);
  });
});
