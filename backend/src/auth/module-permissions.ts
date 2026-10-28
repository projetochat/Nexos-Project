import { PERMISSIONS, type PermissionKey } from "./permissions.constants";
const CHAT_ONLY_PREFIXES = [
  "conversations.",
  "messages.",
  "leads.",
  "history.",
  "groups.",
  "chat.",
  "schedules.",
  "bot_flows.",
  "automations.",
];
export const CHAT_MODULE_PERMISSION_IDS: PermissionKey[] = PERMISSIONS.filter((permission) =>
  CHAT_ONLY_PREFIXES.some((prefix) => permission.startsWith(prefix)),
);
/** Module availability masks grants; it never deletes the role's saved configuration. */
export function chatModulePermissionAllowed(
  permission: string,
  features: { chat: boolean; campaigns: boolean },
) {
  if (features.chat) return true;
  if (CHAT_ONLY_PREFIXES.some((prefix) => permission.startsWith(prefix))) return false;
  return features.campaigns || !permission.startsWith("connections.");
}
