import { describe, expect, it } from "vitest";
import { normalizeRemotePhoneCandidates, phoneFromRemoteIdentity } from "./messaging-identity";

describe("messaging identity normalization", () => {
  it("extracts phones from WhatsApp JID shapes", () => {
    expect(phoneFromRemoteIdentity("5511999999999@s.whatsapp.net")).toBe("5511999999999");
    expect(phoneFromRemoteIdentity("5511999999999@c.us")).toBe("5511999999999");
    expect(phoneFromRemoteIdentity("5511999999999:12@s.whatsapp.net")).toBe("5511999999999");
  });

  it("provides Brazilian mobile alternatives with and without the ninth digit", () => {
    expect(normalizeRemotePhoneCandidates("5511999999999@s.whatsapp.net")).toEqual([
      "+5511999999999",
      "+551199999999",
    ]);
    expect(normalizeRemotePhoneCandidates("551199999999@s.whatsapp.net")).toEqual([
      "+551199999999",
      "+5511999999999",
    ]);
  });
});
