import { describe, expect, it } from "vitest";
import { resolveConnectedContactInstances } from "./contact-instance-selection";

const instances = [
  { id: "a", value: "a", name: "A", color: null, status: "CONNECTED" },
  { id: "b", value: "legacy-b", name: "B", color: null, status: "CONNECTED" },
  { id: "c", value: "c", name: "C", color: null, status: "DISCONNECTED" },
];

describe("resolveConnectedContactInstances", () => {
  it("uses only the explicitly linked and connected instances", () => {
    expect(
      resolveConnectedContactInstances(
        { instanceIds: ["b", "c", "other"], instancia: null },
        instances,
      ).map((instance) => instance.id),
    ).toEqual(["b"]);
  });

  it("falls back to every connected instance in the already scoped tenant/profile catalog", () => {
    expect(
      resolveConnectedContactInstances({ instanceIds: [], instancia: null }, instances).map(
        (instance) => instance.id,
      ),
    ).toEqual(["a", "b"]);
  });

  it("supports the legacy single-instance field without widening explicit links", () => {
    expect(
      resolveConnectedContactInstances({ instanceIds: [], instancia: "legacy-b" }, instances).map(
        (instance) => instance.id,
      ),
    ).toEqual(["b"]);
  });
});
