export function groupConversationLockKey(input: {
  tenantId: string;
  connectionId: string;
  externalChatId: string;
}) {
  return `group-conversation:${input.tenantId}:${input.connectionId}:${input.externalChatId.trim().toLowerCase()}`;
}
