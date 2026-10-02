import {
  BadRequestException,
  Controller,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermissions } from "../auth/permissions.decorator";
import { PermissionsGuard } from "../auth/permissions.guard";
import { MessagingConnectionStatus, MessagingProviderType } from "../generated/prisma";
import { EvolutionClient } from "../messaging/evolution/evolution.client";
import { normalizeEvolutionRecipient } from "../messaging/evolution/evolution-recipient.normalizer";
import { PrismaService } from "../prisma/prisma.service";
import { conversationVisibilityWhere } from "./conversation-visibility";

@Controller("conversations")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ContactActionsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EvolutionClient) private readonly evolution: EvolutionClient,
  ) {}

  @Post(":id/contact/block")
  @RequirePermissions("chat.contacts.block")
  async blockContact(@Param("id") id: string, @CurrentUser() current: AuthenticatedUser) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        AND: [
          { id, tenantId: current.tenantId, archivedAt: null },
          conversationVisibilityWhere(current),
        ],
      },
      select: {
        isGroup: true,
        conversationType: true,
        externalChatId: true,
        contact: { select: { normalizedPhone: true } },
        connection: {
          select: {
            providerType: true,
            status: true,
            externalReference: true,
            archivedAt: true,
          },
        },
      },
    });
    if (!conversation) throw new NotFoundException("Conversa não encontrada.");
    if (conversation.isGroup || conversation.conversationType === "GROUP") {
      throw new BadRequestException("Não é possível bloquear um grupo como contato.");
    }

    const connection = conversation.connection;
    if (
      !connection ||
      connection.archivedAt ||
      connection.providerType !== MessagingProviderType.EVOLUTION ||
      connection.status !== MessagingConnectionStatus.CONNECTED ||
      !connection.externalReference
    ) {
      throw new BadRequestException(
        "O bloqueio exige uma instância Evolution conectada nesta conversa.",
      );
    }

    const recipient = normalizeEvolutionRecipient({
      conversationType: conversation.conversationType,
      externalChatId: conversation.externalChatId,
      normalizedPhone: conversation.contact.normalizedPhone,
    });
    await this.evolution.updateBlockStatus({
      instanceName: connection.externalReference,
      number: recipient.number!,
      status: "block",
    });
    return { ok: true };
  }
}
