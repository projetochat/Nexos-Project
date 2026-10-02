import type { Prisma } from "../generated/prisma";
import type { AuthenticatedUser } from "../auth/auth.types";
import { conversationChatScopeAccess } from "../auth/connection-access";

/**
 * Escopo único para listas, detalhes, mensagens e notificações de conversas.
 * Sem a concessão ampliada, o atendente continua vendo a fila (sem responsável)
 * e as conversas atribuídas a ele, mas nunca as de outro atendente.
 */
export function conversationVisibilityWhere(
  current: Pick<
    AuthenticatedUser,
    | "roleKey"
    | "chatScopes"
    | "connectionIds"
    | "chatDepartmentIds"
    | "permissions"
    | "membershipId"
  >,
): Prisma.ConversationWhereInput {
  const chatScope = conversationChatScopeAccess(current);
  if (current.permissions?.includes("chat.conversations.view_all_active")) {
    return chatScope;
  }
  if (current.roleKey !== "tenant_admin" && current.chatScopes === undefined) {
    return {
      AND: [
        { connectionId: { in: current.connectionIds ?? [] } },
        ...(current.chatDepartmentIds === undefined
          ? []
          : [{ departmentId: { in: current.chatDepartmentIds ?? [] } }]),
        {
          OR: [{ assignedMembershipId: current.membershipId }, { assignedMembershipId: null }],
        },
      ],
    };
  }
  return {
    AND: [
      chatScope,
      {
        OR: [{ assignedMembershipId: current.membershipId }, { assignedMembershipId: null }],
      },
    ],
  };
}
