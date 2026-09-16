import { describe, expect, it } from "vitest";
import { normalizeRemotePhoneCandidates, phoneFromRemoteIdentity } from "./messaging-identity";

describe("messaging identity normalization", () => {
  it("extracts phones from WhatsApp JID shapes", () => {
    expect(phoneFromRemoteIdentity("5511987654321@s.whatsapp.net")).toBe("5511987654321");
    expect(phoneFromRemoteIdentity("5511987654321@c.us")).toBe("5511987654321");
    expect(phoneFromRemoteIdentity("5511987654321:12@s.whatsapp.net")).toBe("5511987654321");
  });

  it("provides Brazilian mobile alternatives with and without the ninth digit", () => {
    expect(normalizeRemotePhoneCandidates("5511987654321@s.whatsapp.net")).toEqual([
      "+5511987654321",
      "+551187654321",
    ]);
    expect(normalizeRemotePhoneCandidates("551187654321@s.whatsapp.net")).toEqual([
      "+5511987654321",
      "+551187654321",
    ]);
  });
});
