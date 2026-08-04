import { Inject, Injectable } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/auth.types";
import { Prisma } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";

const sensitiveKeys = new Set([
  "password",
  "token",
  "secret",
  "jwt",
  "refreshToken",
  "accessToken",
  "apiKey",
  "phone",
  "message",
  "content",
]);

@Injectable()
export class PlatformAuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(input: {
    actor?: AuthenticatedUser | null;
    action: string;
    targetType: string;
    targetId?: string | null;
    tenantId?: string | null;
    impersonationSessionId?: string | null;
    requestId?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    return this.prisma.platformAuditLog.create({
      data: {
        actorUserId: input.actor?.userId,
        actorPlatformRole: input.actor?.platformRole,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        tenantId: input.tenantId,
        impersonationSessionId: input.impersonationSessionId,
        requestId: input.requestId,
        metadataJson: sanitizeMetadata(input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }
}

export function sanitizeMetadata(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      sensitiveKeys.has(key.toLowerCase()) ? "[redacted]" : sanitizeValue(item),
    ]),
  );
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeValue).slice(0, 20);
  if (value && typeof value === "object") return sanitizeMetadata(value as Record<string, unknown>);
  if (typeof value === "string") return value.slice(0, 200);
  return value;
}
