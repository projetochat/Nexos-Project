import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma";
import { SchedulesController } from "../src/schedules/schedules.module";
import { CampaignsService } from "../src/campaigns/campaigns.service";
const db = new PrismaClient();
const rollback = new Error("rollback verification fixtures");
let results: Record<string, unknown> = {};
async function main() {
 const before = { schedules: await db.schedule.count(), campaigns: await db.campaign.count() };
 try {
  await db.$transaction(async (tx) => {
   const tenantA = await tx.tenant.create({ data: { name: "Verification A", slug: "verify-a-" + randomUUID() } });
   const tenantB = await tx.tenant.create({ data: { name: "Verification B", slug: "verify-b-" + randomUUID() } });
   const realtime = { publish: () => {} };
   const desktop = new SchedulesController(tx as never, realtime as never);
   const mobile = new SchedulesController(tx as never, realtime as never);
   const userA = { tenantId: tenantA.id, roleKey: "tenant_admin" } as never;
   const userB = { tenantId: tenantB.id, roleKey: "tenant_admin" } as never;
   const item = { id: randomUUID(), identifier: "test", type: "task", title: "Test schedule", destination: "Sistema", scheduledAt: "2026-09-20T10:00", recurrence: "once", delivery: false, status: "pending", connectionId: "", departmentId: "", content: "Verification", recipientIds: [], recipients: [], recurrenceDays: [], recurrenceLimit: "", recurrenceUntil: "", assignedMembershipId: "", attachmentName: null } as const;
   await desktop.save(item as never, userA);
   if ((await mobile.list(userA)).length !== 1 || (await mobile.list(userB)).length !== 0) throw Error("Tenant isolation failed");
   await mobile.save({ ...item, title: "Mobile edit" } as never, userA);
   if ((await desktop.list(userA))[0].title !== "Mobile edit") throw Error("Mobile edit not persisted");
   await desktop.save(item as never, userB);
   if (await tx.schedule.count({ where: { id: item.id } }) !== 2) throw Error("Tenant key collision");
   await mobile.remove(item.id, userA);
   if ((await desktop.list(userA)).length !== 0 || (await desktop.list(userB)).length !== 1) throw Error("Delete isolation failed");
   results.schedules = "create/read/edit/delete persisted, shared both directions, tenant isolation verified";
   const connection = await tx.messagingConnection.findFirst({ where: { archivedAt: null, providerType: "EVOLUTION" } });
   const membership = connection && await tx.tenantMembership.findFirst({ where: { tenantId: connection.tenantId, status: "ACTIVE" } });
   if (!connection || !membership) throw Error("No local campaign fixture connection/membership");
   await tx.messagingConnection.update({ where: { id: connection.id }, data: { status: "CONNECTED" } });
   const persistence = new Proxy(tx, { get(target, key) { if (key === "$transaction") return (queries: Promise<unknown>[]) => Promise.all(queries); return Reflect.get(target, key); } });
   const service = new CampaignsService(persistence as never, {} as never, {} as never, {} as never, { assertFeature: async () => {} } as never);
   const current = { tenantId: connection.tenantId, membershipId: membership.id } as never;
   const campaign = await service.create({ name: "Persistence verification", messageText: "Test only - never dispatch", connectionId: connection.id, audience: { type: "ALL" } } as never, current);
   const list = await service.list({ page: 1, pageSize: 50 }, current);
   if (!list.items.some((item) => item.id === campaign.id) || !await tx.campaign.findUnique({ where: { id: campaign.id } })) throw Error("Campaign not persisted/listed");
   results.campaigns = "draft persisted and returned by service list; no dispatch";
   throw rollback;
  }, { timeout: 15000 });
 } catch (error) { if (error !== rollback) throw error; }
 const after = { schedules: await db.schedule.count(), campaigns: await db.campaign.count() };
 if (JSON.stringify(before) !== JSON.stringify(after)) throw Error("Fixture rollback failed");
 console.log(JSON.stringify({ ...results, rollback: "confirmed", existingRecords: before }));
}
main().catch((error) => { console.error(error.message); process.exitCode=1; }).finally(() => db.$disconnect());
