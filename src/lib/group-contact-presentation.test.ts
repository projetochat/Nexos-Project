import { describe, expect, it } from "vitest";
import { formatGroupContactPhone, matchesGroupContactSearch } from "./group-contact-presentation";

describe("group contact presentation", () => {
  it.each(["nata r", "NATA R", "natã r"])("matches accented names with query %s", (query) => {
    expect(
      matchesGroupContactSearch(
        { name: "Natã Rabelo", phone: "5562981147652", normalizedPhone: "5562981147652" },
        query,
      ),
    ).toBe(true);
  });

  it("formats Brazilian contacts without changing the original value", () => {
    const phone = "5562981147652";
    expect(formatGroupContactPhone(phone)).toBe("+55 62 98114-7652");
    expect(phone).toBe("5562981147652");
  });
});
