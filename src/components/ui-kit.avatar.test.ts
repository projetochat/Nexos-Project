import { describe, expect, it } from "vitest";
import { avatarInitials } from "@/lib/avatar-initials";

describe("avatarInitials", () => {
  it("ignores words made only of special characters", () => {
    expect(avatarInitials("AAA - Grupo teste 23.10 - v2")).toBe("AG");
  });

  it("uses the first available letter of each word when they start with symbols", () => {
    expect(avatarInitials("❤️Amor ⭐Grupo")).toBe("AG");
  });

  it("keeps accented letters and uses two characters for one-word names", () => {
    expect(avatarInitials("Álvaro Gomes")).toBe("ÁG");
    expect(avatarInitials("Douglas")).toBe("DO");
    expect(avatarInitials("❤️Amor")).toBe("AM");
  });

  it("keeps a visible fallback when no letter or number is available", () => {
    expect(avatarInitials("---")).toBe("?");
    expect(avatarInitials("?")).toBe("?");
  });
});
