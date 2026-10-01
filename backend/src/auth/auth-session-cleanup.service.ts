import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AuthSessionCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthSessionCleanupService.name);
  private timer?: NodeJS.Timeout;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.prune().catch((error) => this.logFailure(error));
    this.timer = setInterval(
      () => void this.prune().catch((error) => this.logFailure(error)),
      60 * 60_000,
    );
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async prune() {
    const deleted = await this.prisma.$executeRaw(
      Prisma.sql`
        DELETE FROM "auth_sessions"
        WHERE id IN (
          SELECT id
          FROM "auth_sessions"
          WHERE "expiresAt" < NOW()
             OR "revokedAt" < NOW() - INTERVAL '7 days'
          ORDER BY COALESCE("revokedAt", "expiresAt") ASC, id ASC
          LIMIT 1000
        )
      `,
    );
    if (deleted > 0) {
      this.logger.log({ event: "auth.sessions.pruned", deleted });
    }
    return deleted;
  }

  private logFailure(error: unknown) {
    this.logger.error({
      event: "auth.sessions.prune_failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
