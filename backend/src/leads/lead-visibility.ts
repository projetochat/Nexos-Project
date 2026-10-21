import type { AuthenticatedUser } from "../auth/auth.types";
import { LeadStatus, Prisma } from "../generated/prisma";

/**
 * Keeps pending leads outside conversation APIs unless the profile explicitly
 * owns the independent Leads permission. Converted/assigned leads are regular
 * conversations and remain governed by the ordinary conversation scope.
 */
export function pendingLeadVisibilityWhere(
  current: Pick<AuthenticatedUser, "permissions">,
): Prisma.ConversationWhereInput {
  if (current.permissions?.includes("leads.read")) return {};
  return {
    OR: [
      { lead: { is: null } },
      {
        lead: {
          is: { status: { notIn: [LeadStatus.NEW, LeadStatus.QUEUED] } },
        },
      },
    ],
  };
}
