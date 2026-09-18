import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma";
import { ConversationsController } from "../src/conversations/conversations.controller";
import { MessagesService } from "../src/conversations/messages.service";
const db = new PrismaClient();
const rollback = new Error("ROLLBACK_VERIFICATION");
const connectionId = randomUUID();
async function main() {
  const member = await db.tenantMembership.findFirstOrThrow({ where: { status: "ACTIVE" } });
  const contact = await db.contact.findFirstOrThrow({ where: { tenantId: member.tenantId } });
  try {
    await db.$transaction(
      async (tx) => {
        await tx.messagingConnection.create({
          data: {
            id: connectionId,
            tenantId: member.tenantId,
            name: "Temporary bulk test",
            providerType: "EVOLUTION",
          },
        });
        const ids: string[] = [];
        for (const group of [false, true]) {
          for (const queue of ["ativas", "standby", "fila", "leads"]) {
            const row = await tx.conversation.create({
              data: {
                tenantId: member.tenantId,
                contactId: contact.id,
                connectionId,
                status:
                  queue === "standby"
                    ? "AGUARDANDO"
                    : queue === "ativas"
                      ? "EM_ANDAMENTO"
                      : "ABERTA",
                assignedMembershipId: queue === "ativas" ? member.id : null,
                protocol: queue === "fila" ? `verify-${randomUUID()}` : null,
                isGroup: group,
                conversationType: group ? "GROUP" : "DIRECT",
              },
            });
            ids.push(row.id);
          }
        }
        const current = {
          tenantId: member.tenantId,
          membershipId: member.id,
          roleKey: "agent",
          connectionIds: [connectionId],
        } as never;
        const adapter = { $transaction: async (work: (tx: unknown) => unknown) => work(tx) };
        const messages = new MessagesService(adapter as never, {} as never, {} as never);
        const controller = new ConversationsController(
          adapter as never,
          messages,
          { publishConversationUpdated: () => {} } as never,
          {} as never,
        );
        assert.deepEqual(await controller.bulkClose({ queues: ["leads"] }, current), { closed: 2 });
        assert.equal(
          await tx.conversation.count({ where: { id: { in: ids }, status: "FECHADA" } }),
          2,
        );
        assert.deepEqual(
          await controller.bulkClose({ queues: ["ativas", "standby", "fila", "leads"] }, current),
          { closed: 6 },
        );
        assert.deepEqual(
          await controller.bulkClose({ queues: ["ativas", "standby", "fila", "leads"] }, current),
          { closed: 0 },
        );
        const rows = await tx.conversation.findMany({
          where: { id: { in: ids } },
          include: { messages: true },
        });
        assert.equal(rows.length, 8);
        assert.equal(new Set(rows.map((r) => r.protocol)).size, 8);
        for (const row of rows) {
          assert.equal(row.status, "FECHADA");
          assert.ok(row.closedAt);
          assert.ok(row.protocol);
          assert.equal(row.messages.length, 2);
          assert.ok(row.messages.every((m) => m.type === "SYSTEM" && m.direction === "SYSTEM"));
          assert.ok(
            row.messages.some(
              (m) => m.content === `Conversa iniciada - protocolo ${row.protocol}.`,
            ),
          );
          assert.ok(
            row.messages.some(
              (m) => m.content === `Conversa encerrada - protocolo ${row.protocol}.`,
            ),
          );
        }
        throw rollback;
      },
      { timeout: 30000 },
    );
  } catch (error) {
    if (error !== rollback) throw error;
  }
  assert.equal(await db.messagingConnection.count({ where: { id: connectionId } }), 0);
  console.log(
    "Verified: all four queues, direct/group, selected queues only, unique protocols, start/end SYSTEM notes, repeat request no-op, fixtures rolled back.",
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
