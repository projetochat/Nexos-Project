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

  it("restores the ninth digit for an old-format Brazilian WhatsApp mobile number", () => {
    expect(formatGroupContactPhone("556296171414")).toBe("+55 62 99617-1414");
  });

  it("does not add a ninth digit to Brazilian landlines", () => {
    expect(formatGroupContactPhone("556232341414")).toBe("+55 62 3234-1414");
  });
});
