import { Prisma, ProtocolFormat, ProtocolModule, ProtocolReset } from "../generated/prisma";

export type ProtocolNumberingConfig = {
  module: ProtocolModule;
  format: ProtocolFormat;
  digits: number;
  reset: ProtocolReset;
  customPattern: string | null;
};

export function defaultProtocolConfig(module: ProtocolModule): ProtocolNumberingConfig {
  return module === ProtocolModule.TICKET
    ? {
        module,
        format: ProtocolFormat.CUSTOM,
        digits: 6,
        reset: ProtocolReset.NEVER,
        customPattern: "TKT-{SEQ}",
      }
    : {
        module,
        format: ProtocolFormat.SEQUENCE,
        digits: 6,
        reset: ProtocolReset.NEVER,
        customPattern: null,
      };
}

export function protocolPeriodKey(reset: ProtocolReset, at: Date) {
  const year = String(at.getUTCFullYear());
  if (reset === ProtocolReset.YEARLY) return year;
  if (reset === ProtocolReset.MONTHLY)
    return `${year}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
  return "GLOBAL";
}

export function effectiveProtocolReset(format: ProtocolFormat, reset: ProtocolReset) {
  if (format === ProtocolFormat.YEAR_SEQUENCE) return ProtocolReset.YEARLY;
  if (format === ProtocolFormat.YEAR_MONTH_SEQUENCE) return ProtocolReset.MONTHLY;
  if (format === ProtocolFormat.CUSTOM) return reset;
  return ProtocolReset.NEVER;
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
  const counter = await delegate.upsert({
    where: { tenantId_module_periodKey: { tenantId, module, periodKey } },
    create: { tenantId, module, periodKey, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  const protocol = formatProtocol(config, counter.lastNumber, at);
  const conflict =
    module === ProtocolModule.CHAT
      ? await tx.conversation.findFirst({ where: { tenantId, protocol }, select: { id: true } })
      : await tx.ticket.findFirst({ where: { tenantId, protocol }, select: { id: true } });
  return conflict
    ? nextProtocol(tx, tenantId, module, at)
    : { protocol, sequence: counter.lastNumber };
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
  return formatProtocol(config, (counter?.lastNumber ?? 0) + 1, at);
}
