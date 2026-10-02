import type { Prisma } from "../generated/prisma";
import type { AuthenticatedUser } from "../auth/auth.types";
import { connectionAccess, departmentAccess } from "../auth/connection-access";

/**
 * Escopo único para listas, detalhes, mensagens e notificações de conversas.
 * Sem a concessão ampliada, o atendente continua vendo a fila (sem responsável)
 * e as conversas atribuídas a ele, mas nunca as de outro atendente.
 */
export function conversationVisibilityWhere(
  current: Pick<
    AuthenticatedUser,
    "roleKey" | "connectionIds" | "chatDepartmentIds" | "permissions" | "membershipId"
  >,
): Prisma.ConversationWhereInput {
  const instanceScope = connectionAccess(current);
  const departmentScope = departmentAccess(current);
  const chatScope = { ...instanceScope, ...departmentScope };
  if (current.permissions?.includes("chat.conversations.view_all_active")) {
    return chatScope;
  }
  return {
    AND: [
      instanceScope,
      ...(Object.keys(departmentScope).length ? [departmentScope] : []),
      {
        OR: [{ assignedMembershipId: current.membershipId }, { assignedMembershipId: null }],
      },
    ],
  };
}
