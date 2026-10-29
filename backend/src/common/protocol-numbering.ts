import { ConflictException } from "@nestjs/common";
import { Prisma, ProtocolFormat, ProtocolModule, ProtocolReset } from "../generated/prisma";

// DAILY is derived for DATE_SEQUENCE; the existing database enum stays unchanged.
export type EffectiveProtocolReset = ProtocolReset | "DAILY";

export type ProtocolNumberingConfig = {
  module: ProtocolModule;
  format: ProtocolFormat;
  digits: number;
  reset: EffectiveProtocolReset;
  customPattern: string | null;
};

export function defaultProtocolConfig(module: ProtocolModule): ProtocolNumberingConfig {
  return {
    module,
    format: ProtocolFormat.SEQUENCE,
    digits: 6,
    reset: ProtocolReset.NEVER,
    customPattern: null,
  };
}

export function protocolPeriodKey(reset: EffectiveProtocolReset, at: Date) {
  const year = String(at.getUTCFullYear());
  if (reset === "DAILY")
    return `${year}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-${String(at.getUTCDate()).padStart(2, "0")}`;
  if (reset === ProtocolReset.YEARLY) return year;
  if (reset === ProtocolReset.MONTHLY)
    return `${year}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
  return "GLOBAL";
}

export function effectiveProtocolReset(
  format: ProtocolFormat,
  reset: EffectiveProtocolReset,
): EffectiveProtocolReset {
  if (format === ProtocolFormat.DATE_SEQUENCE) return "DAILY";
  if (format === ProtocolFormat.YEAR_SEQUENCE) return ProtocolReset.YEARLY;
  if (format === ProtocolFormat.YEAR_MONTH_SEQUENCE) return ProtocolReset.MONTHLY;
  if (format === ProtocolFormat.CUSTOM) return reset;
  return ProtocolReset.NEVER;
}

export function storedProtocolReset(
  format: ProtocolFormat,
  reset: EffectiveProtocolReset,
): ProtocolReset {
  const effective = effectiveProtocolReset(format, reset);
  return effective === "DAILY" ? ProtocolReset.NEVER : effective;
}

export function formatProtocol(config: ProtocolNumberingConfig, sequence: number, at: Date) {
  const year = String(at.getUTCFullYear());
  const month = String(at.getUTCMonth() + 1).padStart(2, "0");
  const day = String(at.getUTCDate()).padStart(2, "0");
  const seq = String(sequence).padStart(config.digits, "0");
  switch (config.format) {
    case ProtocolFormat.YEAR_SEQUENCE:
      return `${year}.${seq}`;
    case ProtocolFormat.YEAR_MONTH_SEQUENCE:
      return `${year}.${month}.${seq}`;
    case ProtocolFormat.DATE_SEQUENCE:
      return `${year}${month}${day}.${seq}`;
    case ProtocolFormat.CUSTOM:
      return (config.customPattern || "{SEQ}")
        .replaceAll("{YEAR}", year)
        .replaceAll("{MONTH}", month)
        .replaceAll("{DATE}", `${year}${month}${day}`)
        .replaceAll("{SEQ}", seq);
    default:
      return seq;
  }
}

export async function readProtocolConfig(
  tx: Prisma.TransactionClient,
  tenantId: string,
  module: ProtocolModule,
) {
  const delegate = (
    tx as Prisma.TransactionClient & {
      tenantProtocolConfiguration?: Prisma.TransactionClient["tenantProtocolConfiguration"];
    }
  ).tenantProtocolConfiguration;
  const saved = delegate
    ? await delegate.findUnique({
        where: { tenantId_module: { tenantId, module } },
      })
    : null;
  return saved
    ? {
        module,
        format: saved.format,
        digits: saved.digits,
        reset: effectiveProtocolReset(saved.format, saved.reset),
        customPattern: saved.customPattern,
      }
    : defaultProtocolConfig(module);
}

function dailyPrefix(at: Date) {
  // Keep the UTC date already used by DATE_SEQUENCE; prefix and reset must share a day.
  return `${at.getUTCFullYear()}${String(at.getUTCMonth() + 1).padStart(2, "0")}${String(at.getUTCDate()).padStart(2, "0")}`;
}

function dailyStoredMaximum(tenantId: string, module: ProtocolModule, at: Date) {
  const table =
    module === ProtocolModule.CHAT ? Prisma.raw('"conversations"') : Prisma.raw('"tickets"');
  const prefix = dailyPrefix(at);
  const pattern = `^${prefix}\\.([0-9]+)$`;
  return Prisma.sql`SELECT COALESCE(MAX(substring("protocol" FROM ${pattern})::numeric), 0) AS "lastNumber"
    FROM ${table} WHERE "tenantId" = ${tenantId} AND "protocol" LIKE ${`${prefix}.%`}`;
}

const MAX_PROTOCOL_COUNTER = 2147483647; // Existing PostgreSQL Int storage limit, not a digit-width limit.
function assertDailyCapacity(current: number) {
  if (!Number.isSafeInteger(current) || current < 0 || current >= MAX_PROTOCOL_COUNTER) {
    throw new ConflictException("O limite sequencial de protocolos foi atingido.");
  }
}

async function dailyMaximum(
  tx: Prisma.TransactionClient,
  tenantId: string,
  module: ProtocolModule,
  at: Date,
) {
  const rows = await tx.$queryRaw<Array<{ lastNumber: Prisma.Decimal | number }>>(
    dailyStoredMaximum(tenantId, module, at),
  );
  const maximum = Number(rows[0]?.lastNumber ?? 0);
  assertDailyCapacity(maximum);
  return maximum;
}

async function allocateDaily(
  tx: Prisma.TransactionClient,
  tenantId: string,
  module: ProtocolModule,
  at: Date,
) {
  const periodKey = protocolPeriodKey("DAILY", at);
  const rows = await tx.$queryRaw<Array<{ lastNumber: number }>>(Prisma.sql`
    WITH persisted AS (${dailyStoredMaximum(tenantId, module, at)})
    INSERT INTO "protocol_sequence_counters" ("tenantId", "module", "periodKey", "lastNumber", "updatedAt")
    SELECT ${tenantId}, ${module}::"ProtocolModule", ${periodKey}, "lastNumber" + 1, CURRENT_TIMESTAMP FROM persisted WHERE "lastNumber" < ${MAX_PROTOCOL_COUNTER}
    ON CONFLICT ("tenantId", "module", "periodKey") DO UPDATE
    SET "lastNumber" = GREATEST("protocol_sequence_counters"."lastNumber"::bigint + 1, EXCLUDED."lastNumber"), "updatedAt" = CURRENT_TIMESTAMP
    WHERE "protocol_sequence_counters"."lastNumber" < ${MAX_PROTOCOL_COUNTER}
    RETURNING "lastNumber"
  `);
  if (rows.length !== 1)
    throw new ConflictException("O limite sequencial de protocolos foi atingido.");
  return rows[0].lastNumber;
}

export async function nextProtocol(
  tx: Prisma.TransactionClient,
  tenantId: string,
  module: ProtocolModule,
  at = new Date(),
  fallbackSequence?: number,
): Promise<{ protocol: string; sequence: number }> {
  const config = await readProtocolConfig(tx, tenantId, module);
  const periodKey = protocolPeriodKey(config.reset, at);
  const delegate = (
    tx as Prisma.TransactionClient & {
      protocolSequenceCounter?: Prisma.TransactionClient["protocolSequenceCounter"];
    }
  ).protocolSequenceCounter;
  if (!delegate) {
    if (config.reset === "DAILY") throw new Error("Daily protocol counter unavailable.");
    if (fallbackSequence !== undefined) {
      return { protocol: formatProtocol(config, fallbackSequence, at), sequence: fallbackSequence };
    }
    const legacy = await tx.conversationProtocolCounter.upsert({
      where: { tenantId },
      create: { tenantId, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });
    return { protocol: formatProtocol(config, legacy.lastNumber, at), sequence: legacy.lastNumber };
  }
  const sequence =
    config.reset === "DAILY"
      ? await allocateDaily(tx, tenantId, module, at)
      : (
          await delegate.upsert({
            where: { tenantId_module_periodKey: { tenantId, module, periodKey } },
            create: { tenantId, module, periodKey, lastNumber: 1 },
            update: { lastNumber: { increment: 1 } },
          })
        ).lastNumber;
  const protocol = formatProtocol(config, sequence, at);
  const conflict =
    module === ProtocolModule.CHAT
      ? await tx.conversation.findFirst({ where: { tenantId, protocol }, select: { id: true } })
      : await tx.ticket.findFirst({ where: { tenantId, protocol }, select: { id: true } });
  return conflict ? nextProtocol(tx, tenantId, module, at) : { protocol, sequence };
}

export async function previewNextProtocol(
  tx: Prisma.TransactionClient,
  tenantId: string,
  config: ProtocolNumberingConfig,
  at = new Date(),
) {
  const periodKey = protocolPeriodKey(effectiveProtocolReset(config.format, config.reset), at);
  const counter = await tx.protocolSequenceCounter.findUnique({
    where: { tenantId_module_periodKey: { tenantId, module: config.module, periodKey } },
    select: { lastNumber: true },
  });
  const persisted =
    config.format === ProtocolFormat.DATE_SEQUENCE
      ? await dailyMaximum(tx, tenantId, config.module, at)
      : 0;
  const current = Math.max(counter?.lastNumber ?? 0, persisted);
  if (config.format === ProtocolFormat.DATE_SEQUENCE) assertDailyCapacity(current);
  return formatProtocol(config, current + 1, at);
}
