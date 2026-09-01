import { Inject, Injectable, Logger } from "@nestjs/common";
import { MessagingConnectionStatus, MessagingProviderType } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimePublisher } from "../realtime/realtime.publisher";
import { EvolutionClient } from "./evolution/evolution.client";

type ContactProfilePictureTarget = {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  normalizedPhone: string;
  avatarUrl: string | null;
  instance: string | null;
  instanceIds: string[];
};

@Injectable()
export class ContactProfilePictureSyncService {
  private readonly logger = new Logger(ContactProfilePictureSyncService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EvolutionClient) private readonly evolution: EvolutionClient,
    @Inject(RealtimePublisher) private readonly realtime: RealtimePublisher,
  ) {}

  async syncMissing(input: {
    tenantId: string;
    contacts: ContactProfilePictureTarget[];
  }): Promise<Map<string, string>> {
    const targets = uniqueContacts(input.contacts).filter((contact) =>
      needsProfilePicture(contact),
    );
    if (!targets.length) return new Map();

    const synced = new Map<string, string>();
    for (const contact of targets.slice(0, 20)) {
      const instanceName = await this.resolveInstanceName(input.tenantId, contact);
      if (!instanceName) continue;

      const avatarUrl = await this.fetchProfilePictureUrl(instanceName, contact);
      if (!avatarUrl) continue;

      await this.prisma.contact.updateMany({
        where: {
          id: contact.id,
          tenantId: input.tenantId,
          OR: [{ avatarUrl: null }, { avatarUrl: "" }],
        },
        data: { avatarUrl },
      });

      synced.set(contact.id, avatarUrl);
      this.realtime.publishContactUpdated({
        tenantId: input.tenantId,
        contactId: contact.id,
        contact: { id: contact.id, avatar_url: avatarUrl },
      });
    }

    return synced;
  }

  private async resolveInstanceName(tenantId: string, contact: ContactProfilePictureTarget) {
    const keys = [
      ...new Set([contact.instance, ...contact.instanceIds].filter(Boolean)),
    ] as string[];
    if (!keys.length) return null;

    const connection = await this.prisma.messagingConnection.findFirst({
      where: {
        tenantId,
        archivedAt: null,
        providerType: MessagingProviderType.EVOLUTION,
        status: {
          in: [MessagingConnectionStatus.CONNECTED, MessagingConnectionStatus.DISCONNECTED],
        },
        OR: [{ id: { in: keys } }, { externalReference: { in: keys } }],
      },
      select: { externalReference: true },
    });

    return connection?.externalReference ?? keys[0] ?? null;
  }

  private async fetchProfilePictureUrl(instanceName: string, contact: ContactProfilePictureTarget) {
    for (const number of profilePictureLookupCandidates(contact)) {
      try {
        const avatarUrl = await this.evolution.fetchProfilePictureUrl({ instanceName, number });
        if (avatarUrl) return avatarUrl;
      } catch (error) {
        this.logger.debug(
          `Nao foi possivel buscar foto do contato ${contact.id} usando ${maskProfilePictureLookup(
            number,
          )}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return null;
  }
}

function uniqueContacts(contacts: ContactProfilePictureTarget[]) {
  const seen = new Set<string>();
  return contacts.filter((contact) => {
    if (seen.has(contact.id)) return false;
    seen.add(contact.id);
    return true;
  });
}

function needsProfilePicture(contact: ContactProfilePictureTarget) {
  if (contact.avatarUrl?.trim()) return false;
  if (contact.normalizedPhone.startsWith("group:")) return false;
  if (contact.phone.includes("@g.us") || contact.normalizedPhone.includes("@g.us")) return false;
  return true;
}

function profilePictureLookupCandidates(contact: ContactProfilePictureTarget) {
  const rawValues = [contact.normalizedPhone, contact.phone];
  const candidates = rawValues.flatMap((value) => {
    const beforeDomain = value.split("@")[0] ?? value;
    const digits = beforeDomain.replace(/\D/g, "");
    return [value, digits ? `${digits}@s.whatsapp.net` : null, digits].filter(Boolean) as string[];
  });
  return [...new Set(candidates.filter((item) => !item.includes("@g.us")))];
}

function maskProfilePictureLookup(value: string) {
  if (value.includes("@")) return value.replace(/^(\d{4})\d+(@.+)$/, "$1***$2");
  return value.replace(/^(\d{4})\d+(\d{2})$/, "$1***$2");
}
