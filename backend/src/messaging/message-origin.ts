import { MessageDirection } from "../generated/prisma";

export type OutboundMessageOrigin = "trixus" | "external" | "unknown" | null;

export function outboundMessageOrigin(message: {
  direction: MessageDirection;
  authorMembershipId?: string | null;
  clientMessageId?: string | null;
  campaignId?: string | null;
  externalMessageId?: string | null;
}): OutboundMessageOrigin {
  if (message.direction !== MessageDirection.OUTBOUND) return null;
  if (message.authorMembershipId || message.clientMessageId || message.campaignId) return "trixus";
  if (message.externalMessageId) return "external";
  return "unknown";
}
