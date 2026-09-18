import { Injectable, Logger } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma } from "../generated/prisma";

type DbClient = PrismaService | Prisma.TransactionClient;

/**
 * Resolves the human name that may be prefixed to WhatsApp messages.
 * The administrator's immutable user name is deliberately never used here
 * when a presentation name has been configured for the tenant membership.
 */
@Injectable()
export class SenderDisplayNameService {
  private readonly logger = new Logger(SenderDisplayNameService.name);

  async resolve(db: DbClient, current: AuthenticatedUser) {
    const membership = await db.tenantMembership.findFirst({
      where: {
        id: current.membershipId,
        tenantId: current.tenantId,
        status: "ACTIVE",
      },
      select: {
        presentationName: true,
        user: { select: { name: true } },
      },
    });

    const presentationName = membership?.presentationName?.trim();
    const isAdministrator = current.roleKey === "tenant_admin";
    // Legacy administrators without a configured presentation name receive a neutral label;
    // their immutable system name must never leak into external WhatsApp content.
    const name =
      presentationName || (isAdministrator ? "Administrador" : membership?.user.name?.trim());
    const source = presentationName
      ? "presentation_name"
      : isAdministrator
        ? "administrator_fallback"
        : "user_name";

    this.logger.log({
      event: "messaging.outbound.sender_name_resolved",
      tenantId: current.tenantId,
      membershipId: current.membershipId,
      roleKey: current.roleKey,
      source,
      namePresent: Boolean(name),
    });

    return name || null;
  }
}
