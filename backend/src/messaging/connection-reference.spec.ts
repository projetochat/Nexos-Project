import { expect, it } from "vitest";
import { connectionReference } from "./connection-reference";
it("uses the WhatsApp number independently of display-name edits and provider keys", () => {
  const connection = {
    id: "abcdefgh-1234",
    tenantId: "tenant01-5678",
    ownerPhoneNormalized: "556281147652",
    name: "Antigo",
  };
  expect(connectionReference(connection)).toBe("tenant01-556281147652-abcdefgh");
  const renamed = { ...connection, name: "Novo" };
  expect(connectionReference(renamed)).toBe(connectionReference(connection));
  expect(connectionReference({ ...connection, ownerPhoneNormalized: null })).toBe(
    "tenant01-abcdefgh",
  );
});
