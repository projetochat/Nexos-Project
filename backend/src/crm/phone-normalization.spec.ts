import { describe, expect, it } from "vitest";
import { normalizePhone } from "./phone-normalization";

describe("normalizePhone", () => {
  it("adds the ninth digit for Brazilian mobile numbers with DDD and eight digits", () => {
    expect(normalizePhone("(62) 9272-8679")).toBe("+5562992728679");
    expect(normalizePhone("+55 (62) 9272-8679")).toBe("+5562992728679");
  });

  it("keeps valid Brazilian mobile numbers normalized in E.164", () => {
    expect(normalizePhone("+55 (62) 99272-8679")).toBe("+5562992728679");
  });

  it("normalizes international numbers using libphonenumber-js", () => {
    expect(normalizePhone("+1 415 555 2671")).toBe("+14155552671");
    expect(normalizePhone("+351 912 345 678")).toBe("+351912345678");
  });
});
