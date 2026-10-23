import { Inject, Injectable, Logger } from "@nestjs/common";
import { MessagingConnectionStatus, MessagingProviderType } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimePublisher } from "../realtime/realtime.publisher";
import { EvolutionClient } from "./evolution/evolution.client";
import type { EvolutionContact } from "./evolution/evolution.types";
import { normalizeRemotePhoneCandidates } from "./messaging-identity";

type ContactProfilePictureTarget = {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  normalizedPhone: string;
  avatarUrl: string | null;
  remoteJid?: string | null;
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
  private readonly queuedNameContactIds = new Set<string>();
  private readonly recentNameAttempts = new Map<string, number>();
  private pendingContacts: QueuedContactProfilePictureTarget[] = [];
  private pendingNameContacts: QueuedContactProfilePictureTarget[] = [];
  private draining = false;
  private drainingNames = false;
  private drainTimer: ReturnType<typeof setTimeout> | null = null;
  private nameDrainTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EvolutionClient) private readonly evolution: EvolutionClient,
    @Inject(RealtimePublisher) private readonly realtime: RealtimePublisher,
  ) {}

  async syncMissing(input: {
    tenantId: string;
    contacts: ContactProfilePictureTarget[];
  }): Promise<Map<string, string>> {
    return this.syncContacts(input, false);
  }

  private async syncContacts(
    input: { tenantId: string; contacts: ContactProfilePictureTarget[] },
    refreshExisting: boolean,
  ): Promise<Map<string, string>> {
    const unique = uniqueContacts(input.contacts);
    const targets = refreshExisting
      ? unique.filter((contact) => canRefreshProfilePicture(contact))
      : unique.filter((contact) => needsProfilePicture(contact));
    if (!targets.length) return new Map();

    const synced = new Map<string, string>();
    for (const contact of targets.slice(0, 20)) {
      const instanceName = await this.resolveInstanceName(input.tenantId, contact);
      if (!instanceName) continue;

      const avatarUrl = await this.fetchProfilePictureUrl(instanceName, contact);
      if (!avatarUrl) continue;

      const updated = await this.prisma.contact.updateMany({
        where: refreshExisting
          ? {
              id: contact.id,
              tenantId: input.tenantId,
              OR: [
                { avatarUrl: null },
                { avatarUrl: "" },
                { avatarUrl: { not: avatarUrl } },
              ],
            }
          : {
              id: contact.id,
              tenantId: input.tenantId,
              OR: [{ avatarUrl: null }, { avatarUrl: "" }],
            },
        data: { avatarUrl },
      });
      if (!updated.count) continue;

      synced.set(contact.id, avatarUrl);
      this.realtime.publishContactUpdated({
        tenantId: input.tenantId,
        contactId: contact.id,
      });
    }

    return synced;
  }

  enqueueMissing(input: { tenantId: string; contacts: ContactProfilePictureTarget[] }) {
    const now = Date.now();
    const targets = uniqueContacts(input.contacts)
      .filter((contact) => canRefreshProfilePicture(contact))
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

  enqueuePlaceholderNames(input: {
    tenantId: string;
    contacts: ContactProfilePictureTarget[];
  }) {
    const now = Date.now();
    const targets = uniqueContacts(input.contacts)
      .filter((contact) => isPlaceholderContactName(contact))
      .filter((contact) => !this.wasNameRecentlyAttempted(contact.id, now))
      .filter((contact) => !this.queuedNameContactIds.has(contact.id))
      .slice(0, 50);
    if (!targets.length) return;

    for (const contact of targets) {
      this.queuedNameContactIds.add(contact.id);
      this.pendingNameContacts.push({ tenantId: input.tenantId, contact });
    }
    if (this.pendingNameContacts.length > 200) {
      const overflow = this.pendingNameContacts.splice(0, this.pendingNameContacts.length - 200);
      for (const item of overflow) this.queuedNameContactIds.delete(item.contact.id);
    }
    this.scheduleNameDrain();
  }

  private scheduleDrain() {
    if (this.drainTimer || this.draining) return;
    this.drainTimer = setTimeout(() => {
      this.drainTimer = null;
      void this.drain();
    }, 250);
  }

  private scheduleNameDrain() {
    if (this.nameDrainTimer || this.drainingNames) return;
    this.nameDrainTimer = setTimeout(() => {
      this.nameDrainTimer = null;
      void this.drainNames();
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
        await this.syncContacts(
          { tenantId: item.tenantId, contacts: [item.contact] },
          true,
        );
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

  private async drainNames() {
    if (this.drainingNames) return;
    this.drainingNames = true;
    const now = Date.now();
    try {
      const batch = this.pendingNameContacts.splice(0, 100);
      const grouped = new Map<string, QueuedContactProfilePictureTarget[]>();
      for (const item of batch) {
        this.queuedNameContactIds.delete(item.contact.id);
        this.recentNameAttempts.set(item.contact.id, now);
        const instanceKey = [item.contact.instance, ...item.contact.instanceIds].find(Boolean);
        if (!instanceKey) continue;
        const key = `${item.tenantId}:${instanceKey}`;
        const entries = grouped.get(key) ?? [];
        entries.push(item);
        grouped.set(key, entries);
      }

      for (const entries of grouped.values()) {
        const first = entries[0];
        if (!first) continue;
        const instanceName = await this.resolveInstanceName(first.tenantId, first.contact);
        if (!instanceName) continue;
        const providerContacts = await this.evolution.findContacts({ instanceName });
        const providerNames = providerContactNamesByIdentity(providerContacts);

        for (const entry of entries) {
          const name = contactIdentityKeys(entry.contact).map((key) => providerNames.get(key)).find(Boolean);
          if (!name) continue;
          const updated = await this.prisma.contact.updateMany({
            where: {
              id: entry.contact.id,
              tenantId: entry.tenantId,
              name: entry.contact.name,
            },
            data: { name },
          });
          if (!updated.count) continue;
          this.realtime.publishContactUpdated({
            tenantId: entry.tenantId,
            contactId: entry.contact.id,
          });
        }
      }
    } catch (error) {
      this.logger.warn(
        `Nao foi possivel sincronizar nomes em segundo plano: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.drainingNames = false;
      this.trimRecentNameAttempts(Date.now());
      if (this.pendingNameContacts.length) this.scheduleNameDrain();
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

  private wasNameRecentlyAttempted(contactId: string, now: number) {
    const lastAttempt = this.recentNameAttempts.get(contactId);
    return !!lastAttempt && now - lastAttempt < PROFILE_NAME_RETRY_INTERVAL_MS;
  }

  private trimRecentAttempts(now: number) {
    for (const [contactId, attemptedAt] of this.recentAttempts) {
      if (now - attemptedAt > PROFILE_PICTURE_RETRY_INTERVAL_MS) {
        this.recentAttempts.delete(contactId);
      }
    }
  }

  private trimRecentNameAttempts(now: number) {
    for (const [contactId, attemptedAt] of this.recentNameAttempts) {
      if (now - attemptedAt > PROFILE_NAME_RETRY_INTERVAL_MS) {
        this.recentNameAttempts.delete(contactId);
      }
    }
  }
}

const PROFILE_PICTURE_RETRY_INTERVAL_MS = 3 * 60 * 60 * 1000;
const PROFILE_NAME_RETRY_INTERVAL_MS = 3 * 60 * 60 * 1000;

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
  return true;
}

function canRefreshProfilePicture(contact: ContactProfilePictureTarget) {
  return !contact.avatarUrl?.trim().toLowerCase().startsWith("data:");
}

function isPlaceholderContactName(contact: ContactProfilePictureTarget) {
  if (contact.normalizedPhone.startsWith("group:") || contact.phone.includes("@g.us")) return false;
  const nameKeys = identityKeysFromValues([contact.name]);
  if (!nameKeys.size) return false;
  return [...identityKeysFromValues([contact.normalizedPhone, contact.phone])].some((key) =>
    nameKeys.has(key),
  );
}

function providerContactNamesByIdentity(contacts: EvolutionContact[]) {
  const names = new Map<string, string>();
  for (const contact of contacts) {
    if (contact.isGroup || contact.type === "group") continue;
    const identities = [contact.remoteJid, contact.id, contact.number];
    const identityKeys = identityKeysFromValues(identities);
    const name = [
      contact.name,
      contact.pushName,
      contact.verifiedName,
      contact.notify,
      contact.contactName,
      contact.shortName,
      contact.displayName,
      contact.profileName,
    ]
      .map((value) => value?.trim())
      .find((value): value is string => {
        if (!value) return false;
        const nameKeys = identityKeysFromValues([value]);
        return ![...nameKeys].some((key) => identityKeys.has(key));
      });
    if (!name) continue;
    for (const key of identityKeys) names.set(key, name);
  }
  return names;
}

function contactIdentityKeys(contact: ContactProfilePictureTarget) {
  return [...identityKeysFromValues([contact.remoteJid, contact.normalizedPhone, contact.phone])];
}

function identityKeysFromValues(values: Array<string | null | undefined>) {
  const keys = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    try {
      for (const candidate of normalizeRemotePhoneCandidates(value)) {
        const digits = candidate.replace(/\D/g, "");
        if (digits.length >= 10) keys.add(digits);
      }
    } catch {
      const local = value.split("@")[0]?.split(":")[0] ?? value;
      const digits = local.replace(/\D/g, "");
      if (digits.length >= 10) keys.add(digits);
    }
  }
  return keys;
}

function profilePictureLookupCandidates(contact: ContactProfilePictureTarget) {
  const remoteJid = contact.remoteJid?.trim() || null;
  const rawValues = [remoteJid, contact.normalizedPhone, contact.phone].filter(Boolean) as string[];
  const groupJid = rawValues
    .map((value) => value.replace(/^group:/, ""))
    .find((value) => value.includes("@g.us"));
  if (groupJid) return [groupJid];
  const candidates = rawValues.flatMap((value) => {
    const beforeDomain = value.split("@")[0] ?? value;
    const digits = beforeDomain.replace(/\D/g, "");
    let normalized: string[] = [];
    try {
      normalized = normalizeRemotePhoneCandidates(value);
    } catch {
      // Preserve the provider's original identifier for legacy or non-mobile values.
    }
    const prioritizedValues = value === remoteJid ? [value, ...normalized] : [...normalized, value];
    return prioritizedValues.flatMap((candidate) => {
      const candidateDigits = candidate.split("@")[0]?.replace(/\D/g, "") ?? "";
      return [
        candidate,
        candidateDigits ? `${candidateDigits}@s.whatsapp.net` : null,
        candidateDigits,
      ].filter(Boolean) as string[];
    });
  });
  return [...new Set(candidates)];
}

function maskProfilePictureLookup(value: string) {
  if (value.includes("@")) return value.replace(/^(\d{4})\d+(@.+)$/, "$1***$2");
  return value.replace(/^(\d{4})\d+(\d{2})$/, "$1***$2");
}
