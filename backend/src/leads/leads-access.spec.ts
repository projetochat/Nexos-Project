import { describe, expect, it, vi } from "vitest";
import { LeadsController } from "./leads.controller";

const current = { tenantId: "t", membershipId: "m", roleKey: "agent", connectionIds: ["c1"] };
type LeadFilter = {
  tenantId: string;
  id?: string;
  conversation?: { connectionId?: { in: string[] } };
};
function fixture() {
  const rows = ["c1", "c2"].map((connectionId, i) => ({
    id: `lead-${i}`,
    tenantId: "t",
    status: "NEW",
    source: "WHATSAPP",
    conversationId: `conv-${i}`,
    contact: { id: "contact", name: "Fictício", phone: "123", customer: null },
    conversation: { id: `conv-${i}`, connectionId, protocol: "000001", status: "NOVO" },
    department: null,
    assignedMembership: null,
  }));
  const matches = (row: (typeof rows)[number], where: LeadFilter) =>
    row.tenantId === where.tenantId &&
    (!where.id || row.id === where.id) &&
    (!where.conversation?.connectionId?.in ||
      where.conversation.connectionId.in.includes(row.conversation.connectionId));
  const findMany = vi.fn(async ({ where }: { where: LeadFilter }) =>
    rows.filter((row) => matches(row, where)),
  );
  const count = vi.fn(
    async ({ where }: { where: LeadFilter }) => rows.filter((row) => matches(row, where)).length,
  );
  const findFirst = vi.fn(
    async ({ where }: { where: LeadFilter }) => rows.find((row) => matches(row, where)) ?? null,
  );
  const update = vi.fn(
    async ({
      where,
      data,
    }: {
      where: { tenantId_id: { id: string } };
      data: { status: string; assignedMembershipId: string };
    }) => ({ ...rows.find((row) => row.id === where.tenantId_id.id), ...data }),
  );
  const conversationUpdate = vi.fn().mockResolvedValue({});
  const models = {
    lead: { findMany, count, findFirst, update },
    tenantMembership: { findFirst: vi.fn().mockResolvedValue({ id: "m" }) },
    conversation: { update: conversationUpdate },
  };
  const prisma = {
    ...models,
    $transaction: (arg: ((tx: typeof models) => Promise<unknown>) | Promise<unknown>[]) =>
      typeof arg === "function" ? arg(models) : Promise.all(arg),
  };
  const realtime = { publishLeadUpdated: vi.fn(), publishAssignmentUpdated: vi.fn() };
  return {
    controller: new LeadsController(prisma as never, realtime as never),
    update,
    conversationUpdate,
    realtime,
  };
}
describe("lead instance access", () => {
  it("filters both items and count by current allowed instances", async () => {
    const { controller } = fixture();
    const result = await controller.list({}, current as never);
    expect(result.items.map((item) => item.id)).toEqual(["lead-0"]);
    expect(result.total).toBe(1);
  });
  it("returns no leads when no instances are allowed", async () => {
    const { controller } = fixture();
    const result = await controller.list({}, { ...current, connectionIds: [] } as never);
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
  it("preserves administrator visibility within tenant", async () => {
    const { controller } = fixture();
    const result = await controller.list({}, { ...current, roleKey: "tenant_admin" } as never);
    expect(result.total).toBe(2);
  });
  it("rejects assignment outside instance scope without writes or notifications", async () => {
    const { controller, update, conversationUpdate, realtime } = fixture();
    await expect(controller.assign("lead-1", { self: true }, current as never)).rejects.toThrow(
      "Lead inexistente",
    );
    expect(update).not.toHaveBeenCalled();
    expect(conversationUpdate).not.toHaveBeenCalled();
    expect(realtime.publishLeadUpdated).not.toHaveBeenCalled();
  });
  it("preserves assignment in allowed instance", async () => {
    const { controller, update, conversationUpdate } = fixture();
    const result = await controller.assign("lead-0", { self: true }, current as never);
    expect(result.status).toBe("assigned");
    expect(update).toHaveBeenCalledOnce();
    expect(conversationUpdate).toHaveBeenCalledOnce();
  });
});
