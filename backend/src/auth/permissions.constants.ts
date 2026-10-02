export const PERMISSIONS = [
  "dashboard.read",
  "dashboard.create",
  "dashboard.update",
  "dashboard.delete",
  "users.read",
  "users.create",
  "users.update",
  "users.delete",
  "departments.read",
  "departments.create",
  "departments.update",
  "departments.delete",
  "roles.read",
  "roles.create",
  "roles.update",
  "roles.delete",
  "contacts.read",
  "contacts.create",
  "contacts.update",
  "contacts.delete",
  "contacts.additional_fields.read",
  "conversations.read",
  "conversations.assign",
  "messages.send",
  "connections.read",
  "connections.create",
  "connections.update",
  "connections.delete",
  "groups.read",
  "groups.create",
  "groups.update",
  "groups.leave",
  "history.read",
  "chat.tags.read",
  "chat.tags.create",
  "chat.tags.update",
  "chat.tags.delete",
  "chat.phone.read",
  "chat.messages.delete",
  "chat.messages.edit",
  "chat.quick_replies.read",
  "chat.quick_replies.create",
  "chat.quick_replies.update",
  "chat.quick_replies.delete",
  "chat.agent_name.show",
  "chat.conversations.view_all_active",
  "automations.read",
  "automations.create",
  "automations.update",
  "automations.delete",
  "tickets.read",
  "tickets.create",
  "tickets.update",
  "tickets.delete",
  "campaigns.read",
  "campaigns.create",
  "campaigns.update",
  "campaigns.delete",
  "schedules.read",
  "schedules.create",
  "schedules.update",
  "schedules.delete",
  "bot_flows.read",
  "bot_flows.create",
  "bot_flows.update",
  "bot_flows.delete",
  "ai_agents.read",
  "ai_agents.create",
  "ai_agents.update",
  "ai_agents.delete",
  "settings.manage",
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];

export const TENANT_ADMIN_PERMISSIONS: PermissionKey[] = [...PERMISSIONS];

export const SUPERVISOR_PERMISSIONS: PermissionKey[] = [...PERMISSIONS].filter(
  (permission) => !["roles.delete", "settings.manage"].includes(permission),
);

/**
 * Perfil inicial solicitado para novas tenants: leitura do Dashboard e acesso
 * completo apenas às ações que pertencem ao agrupador Chat.
 */
export const AGENT_PERMISSIONS: PermissionKey[] = [
  "dashboard.read",
  "contacts.read",
  "contacts.update",
  "conversations.read",
  "messages.send",
  "chat.messages.edit",
  "chat.messages.delete",
  "chat.agent_name.show",
  "conversations.assign",
  "chat.phone.read",
  "chat.conversations.view_all_active",
  "history.read",
];

export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSIONS as readonly string[]).includes(value);
}
