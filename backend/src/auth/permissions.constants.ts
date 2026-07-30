export const PERMISSIONS = [
  "users.read",
  "users.manage",
  "departments.read",
  "departments.manage",
  "roles.read",
  "roles.manage",
  "crm.read",
  "crm.manage",
  "conversations.read",
  "conversations.assign",
  "conversations.manage",
  "messages.send",
  "connections.read",
  "connections.manage",
  "chat.contacts.edit",
  "chat.customer_link.edit",
  "chat.tags.manage",
  "chat.leads.read",
  "chat.contacts.read",
  "chat.phone.read",
  "chat.messages.delete",
  "chat.messages.edit",
  "chat.quick_replies.read",
  "chat.contacts.block",
  "chat.audio.send",
  "chat.agent_name.show",
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];

export const TENANT_ADMIN_PERMISSIONS: PermissionKey[] = [...PERMISSIONS];

export const SUPERVISOR_PERMISSIONS: PermissionKey[] = [
  "users.read",
  "departments.read",
  "departments.manage",
  "roles.read",
  "crm.read",
  "crm.manage",
  "conversations.read",
  "conversations.assign",
  "conversations.manage",
  "messages.send",
  "connections.read",
  "connections.manage",
  "chat.contacts.edit",
  "chat.customer_link.edit",
  "chat.tags.manage",
  "chat.leads.read",
  "chat.contacts.read",
  "chat.phone.read",
  "chat.quick_replies.read",
  "chat.audio.send",
  "chat.agent_name.show",
];

export const AGENT_PERMISSIONS: PermissionKey[] = [
  "departments.read",
  "crm.read",
  "conversations.read",
  "conversations.assign",
  "conversations.manage",
  "messages.send",
  "connections.read",
  "chat.contacts.read",
  "chat.leads.read",
  "chat.quick_replies.read",
  "chat.audio.send",
  "chat.agent_name.show",
];

export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSIONS as readonly string[]).includes(value);
}
