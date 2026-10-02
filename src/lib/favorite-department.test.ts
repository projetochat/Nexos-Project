import { describe, expect, it } from "vitest";
import { departmentsForConnection, favoriteDepartmentForConnection } from "./favorite-department";

const departments = [
  { id: "a", connectionIds: ["one"], favoriteConnectionIds: ["one"] },
  { id: "b", connectionIds: ["two"], favoriteConnectionIds: ["one", "two"] },
  { id: "c", connectionIds: ["one"], favoriteConnectionIds: [] },
];

describe("favorite department selection", () => {
  it("returns only a favorite that is linked to the selected instance", () => {
    expect(favoriteDepartmentForConnection(departments, "one")?.id).toBe("a");
    expect(favoriteDepartmentForConnection(departments, "two")?.id).toBe("b");
  });

  it("returns no favorite when the instance has none", () => {
    expect(favoriteDepartmentForConnection(departments, "three")).toBeNull();
    expect(departmentsForConnection(departments, "one").map(({ id }) => id)).toEqual(["a", "c"]);
  });
});
