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

type QueuedContactProfilePictureTarget = {
  tenantId: string;
  contact: ContactProfilePictureTarget;
};

@Injectable()
export class ContactProfilePictureSyncService {
  private readonly logger = new Logger(ContactProfilePictureSyncService.name);
  private readonly queuedContactIds = new Set<string>();
  private readonly recentAttempts = new Map<string, number>();
  private pendingContacts: QueuedContactProfilePictureTarget[] = [];
  private draining = false;
  private drainTimer: ReturnType<typeof setTimeout> | null = null;

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

  enqueueMissing(input: { tenantId: string; contacts: ContactProfilePictureTarget[] }) {
    const now = Date.now();
    const targets = uniqueContacts(input.contacts)
      .filter((contact) => needsProfilePicture(contact))
      .filter((contact) => !this.wasRecentlyAttempted(contact.id, now))
      .filter((contact) => !this.queuedContactIds.has(contact.id))
      .slice(0, 10);
    if (!targets.length) return;

    for (const contact of targets) {
      this.queuedContactIds.add(contact.id);
      this.pendingContacts.push({ tenantId: input.tenantId, contact });
    }
    if (this.pendingContacts.length > 100) {
      const overflow = this.pendingContacts.splice(0, this.pendingContacts.length - 100);
      for (const item of overflow) this.queuedContactIds.delete(item.contact.id);
    }
    this.scheduleDrain();
  }

  private scheduleDrain() {
    if (this.drainTimer || this.draining) return;
    this.drainTimer = setTimeout(() => {
      this.drainTimer = null;
      void this.drain();
    }, 250);
  }

  private async drain() {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.pendingContacts.length) {
        const item = this.pendingContacts.shift();
        if (!item) break;
        this.queuedContactIds.delete(item.contact.id);
        this.recentAttempts.set(item.contact.id, Date.now());
        await this.syncMissing({ tenantId: item.tenantId, contacts: [item.contact] });
      }
    } catch (error) {
      this.logger.warn(
        `Nao foi possivel sincronizar fotos em segundo plano: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.draining = false;
      this.trimRecentAttempts(Date.now());
      if (this.pendingContacts.length) this.scheduleDrain();
    }
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

  private wasRecentlyAttempted(contactId: string, now: number) {
    const lastAttempt = this.recentAttempts.get(contactId);
    return !!lastAttempt && now - lastAttempt < PROFILE_PICTURE_RETRY_INTERVAL_MS;
  }

  private trimRecentAttempts(now: number) {
    for (const [contactId, attemptedAt] of this.recentAttempts) {
      if (now - attemptedAt > PROFILE_PICTURE_RETRY_INTERVAL_MS) {
        this.recentAttempts.delete(contactId);
      }
    }
  }
}

const PROFILE_PICTURE_RETRY_INTERVAL_MS = 3 * 60 * 60 * 1000;

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
