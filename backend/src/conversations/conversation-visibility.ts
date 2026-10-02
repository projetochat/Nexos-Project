import type { Prisma } from "../generated/prisma";
import type { AuthenticatedUser } from "../auth/auth.types";
import { connectionAccess } from "../auth/connection-access";

/**
 * Escopo único para listas, detalhes, mensagens e notificações de conversas.
 * Sem a concessão ampliada, o atendente continua vendo a fila (sem responsável)
 * e as conversas atribuídas a ele, mas nunca as de outro atendente.
 */
export function conversationVisibilityWhere(
  current: AuthenticatedUser,
): Prisma.ConversationWhereInput {
  const instanceScope = connectionAccess(current);
  if (current.permissions?.includes("chat.conversations.view_all_active")) {
    return instanceScope;
  }
  return {
    AND: [
      instanceScope,
      {
        OR: [{ assignedMembershipId: current.membershipId }, { assignedMembershipId: null }],
      },
    ],
  };
}
