import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../generated/prisma";
import type { PrismaService } from "../prisma/prisma.service";

export class MessagingServicePausedError extends BadRequestException {
  constructor() {
    super("O atendimento desta instância está desativado. Reative-o para enviar mensagens.");
  }
}

// A pause UPDATE waits for admitted work to finish. Once it commits, a new
// shared lock observes serviceEnabled=false and cannot admit a send/ingestion.
export async function lockMessagingServiceState(
  tx: Prisma.TransactionClient,
  tenantId: string,
  connectionId: string,
) {
  const rows = await tx.$queryRaw<Array<{ serviceEnabled: boolean }>>`
    SELECT "serviceEnabled" FROM "messaging_connections"
    WHERE id = ${connectionId} AND "tenantId" = ${tenantId} FOR SHARE`;
  if (!rows[0]) throw new NotFoundException("Instância não encontrada.");
  if (!rows[0].serviceEnabled) throw new MessagingServicePausedError();
}

export async function withMessagingServiceEnabled<T>(
  prisma: PrismaService,
  tenantId: string,
  connectionId: string,
  action: () => Promise<T>,
) {
  const completed: { value?: T; fulfilled: boolean } = { fulfilled: false };
  try {
    return await prisma.$transaction(
      async (tx) => {
        await lockMessagingServiceState(tx, tenantId, connectionId);
        const result = await action();
        completed.value = result;
        completed.fulfilled = true;
        return result;
      },
      { timeout: 120000 },
    );
  } catch (error) {
    // This transaction only holds the admission lock. A cleanup/commit failure
    // cannot undo an already acknowledged external action or justify sending it again.
    if (completed.fulfilled) return completed.value as T;
    throw error;
  }
}

export function assertMessagingServiceEnabled(
  connection: { serviceEnabled?: boolean } | null | undefined,
) {
  if (connection?.serviceEnabled === false) {
    throw new BadRequestException(
      "O atendimento desta instância está desativado. Reative-o para enviar mensagens.",
    );
  }
}
