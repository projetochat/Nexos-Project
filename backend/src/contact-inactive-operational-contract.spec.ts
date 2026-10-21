import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const inbound = readFileSync(
  new URL("./messaging/messaging-inbound.service.ts", import.meta.url),
  "utf8",
);
const campaigns = readFileSync(
  new URL("./campaigns/campaigns.service.ts", import.meta.url),
  "utf8",
);
const groups = readFileSync(
  new URL("./conversations/groups.controller.ts", import.meta.url),
  "utf8",
);
const crm = readFileSync(new URL("./crm/crm.controller.ts", import.meta.url), "utf8");
const outbound = readFileSync(
  new URL("./messaging/messaging-outbound.service.ts", import.meta.url),
  "utf8",
);

describe("inactive contact operational contract", () => {
  it("preserves inbound persistence while suppressing automatic replies", () => {
    expect(inbound).toContain("archivedAt: null");
    expect(inbound).toContain("contact.active === false");
    expect(inbound).not.toContain("active: true,\n          normalizedPhone:");
  });

  it("classifies inactive campaign recipients as blocked and revalidates dispatch", () => {
    expect(campaigns.match(/CampaignRecipientSkipReason\.BLOCKED/g)?.length).toBeGreaterThanOrEqual(
      3,
    );
    expect(campaigns).toContain("blockedCount += 1");
    expect(campaigns).toContain("{ skippedCount: 1, blockedCount: 1 }");
  });

  it("keeps inactive contacts out of group selectors and participant updates", () => {
    expect(crm).toContain(
      'active: true,\n      NOT: { normalizedPhone: { startsWith: "group:" } }',
    );
    expect(groups).toContain(
      'active: true,\n          NOT: { normalizedPhone: { startsWith: "group:" } }',
    );
  });

  it("revalidates active state for schedules and reactions through the shared guard", () => {
    expect(outbound.match(/this\.assertCanSend\(conversation\)/g)?.length).toBeGreaterThanOrEqual(
      3,
    );
    expect(outbound).toContain("this.assertContactActive(message.conversation.contact)");
  });
});
