import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "../generated/prisma";
import { databaseNameFromUrl, isAllowedHomologationDatabase } from "../homologation/reset-safety";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    this.assertHomologationDatabase();
    await this.$connect();
    this.logger.log({
      event: "database.connected",
      nodeEnv: process.env.NODE_ENV ?? "development",
      database: this.sanitizedDatabaseTarget(),
      queueEnabled: process.env.NEXOS_QUEUE_ENABLED === "true",
      workerEnabled: process.env.NEXOS_QUEUE_WORKER_ENABLED === "true",
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private assertHomologationDatabase() {
    if (process.env.SEED_MODE !== "homologation") return;
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("SEED_MODE=homologation requires DATABASE_URL.");
    }
    const databaseName = databaseNameFromUrl(databaseUrl);
    if (!databaseName || !isAllowedHomologationDatabase(databaseName)) {
      throw new Error(
        `SEED_MODE=homologation requires an allowed homologation database, got ${databaseName ?? "unknown"}.`,
      );
    }
  }

  private sanitizedDatabaseTarget() {
    const value = process.env.DATABASE_URL;
    if (!value) return "unknown";
    try {
      const parsed = new URL(value);
      return `${parsed.hostname}:${parsed.port || "5432"}${parsed.pathname}`;
    } catch {
      return "invalid-url";
    }
  }
}
