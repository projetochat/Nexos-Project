export const realtimeRooms = {
  tenant: (tenantId: string) => `tenant:${tenantId}`,
  membership: (membershipId: string) => `membership:${membershipId}`,
  department: (departmentId: string) => `department:${departmentId}`,
  conversation: (conversationId: string) => `conversation:${conversationId}`,
  ticket: (ticketId: string) => `ticket:${ticketId}`,
};

export function conversationRoomId(room: string) {
  return room.startsWith("conversation:") ? room.slice("conversation:".length) : null;
}
