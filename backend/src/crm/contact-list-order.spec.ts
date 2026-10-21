import { describe, expect, it } from "vitest";
import { contactListOrderBy, orderContactIdsByInstance } from "./crm.controller";

describe("contact list ordering", () => {
  it("sorts by name by default", () => {
    expect(contactListOrderBy(undefined)).toEqual([{ name: "asc" }, { createdAt: "desc" }]);
  });

  it("sorts by the actual contact company without duplicating customer concepts", () => {
    expect(contactListOrderBy("customer")).toEqual([
      { customer: { name: "asc" } },
      { name: "asc" },
      { createdAt: "desc" },
    ]);
  });

  it("sorts by the visible instance name across current ids and keeps unlinked contacts last", () => {
    expect(
      orderContactIdsByInstance(
        [
          { id: "none", name: "Ana", instance: null, instanceIds: [], createdAt: new Date(0) },
          {
            id: "zeta",
            name: "Bruno",
            instance: "connection-z",
            instanceIds: ["connection-z"],
            createdAt: new Date(0),
          },
          {
            id: "alpha",
            name: "Carlos",
            instance: "legacy-alpha",
            instanceIds: [],
            createdAt: new Date(0),
          },
        ],
        [
          { id: "connection-z", name: "Zeta", externalReference: null },
          { id: "connection-a", name: "Alpha", externalReference: "legacy-alpha" },
        ],
      ),
    ).toEqual(["alpha", "zeta", "none"]);
  });
});
