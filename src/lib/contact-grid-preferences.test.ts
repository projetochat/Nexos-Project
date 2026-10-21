import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONTACT_GRID_COLUMNS,
  isEligibleContactGridCustomField,
  sanitizeContactGridColumns,
} from "./contact-grid-preferences";

describe("contact grid preferences", () => {
  it("excludes long text, HTML and multi-list custom fields", () => {
    expect(
      [
        { id: "short", type: "text" as const, mask: null },
        { id: "long", type: "text" as const, mask: '{"text":{"variant":"long"}}' },
        { id: "html", type: "text" as const, mask: '{"text":{"variant":"html"}}' },
        { id: "single", type: "list" as const, mask: null },
        { id: "multi", type: "list" as const, mask: '{"list":{"variant":"multi"}}' },
      ]
        .filter(isEligibleContactGridCustomField)
        .map((field) => field.id),
    ).toEqual(["short", "single"]);
  });

  it("restores defaults for invalid storage and removes unavailable columns", () => {
    expect(sanitizeContactGridColumns(null, [])).toEqual(DEFAULT_CONTACT_GRID_COLUMNS);
    expect(
      sanitizeContactGridColumns(
        ["native:name", "custom:available", "custom:removed", "native:name", 123],
        ["available"],
      ),
    ).toEqual(["native:name", "custom:available"]);
  });

  it("allows an intentionally empty set for Ocultar todas", () => {
    expect(sanitizeContactGridColumns([], ["available"])).toEqual([]);
  });
});
