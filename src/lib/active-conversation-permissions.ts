export function canStartActiveConversation(permissions: readonly string[] | undefined) {
  return permissions?.includes("messages.send") ?? false;
}
