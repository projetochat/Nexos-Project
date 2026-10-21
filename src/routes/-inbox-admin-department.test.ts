import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const inboxDetail = readFileSync(new URL("./inbox.$conversationId.tsx", import.meta.url), "utf8");

describe("administrator passive conversation department", () => {
  it("does not apply a profile favorite before opening the department options", () => {
    expect(inboxDetail).toContain('user.role === "admin"');
    expect(inboxDetail).toContain(
      ": favoriteDepartmentForConnection(apiDepartments, conv.connection_id)",
    );
    expect(inboxDetail).toContain("startDepartmentModal.show()");
  });
});
