import "reflect-metadata";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessagingProviderType } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { MessagingModule } from "./messaging.module";
import { MessagingProviderRegistry } from "./messaging-provider.registry";

describe("MessagingModule DI", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("bootstraps registry providers through the Nest container", async () => {
    vi.stubEnv("TRIXUS_QUEUE_ENABLED", "false");
    vi.stubEnv("TRIXUS_QUEUE_WORKER_ENABLED", "false");
    vi.stubEnv("TRIXUS_OUTBOX_POLLER_ENABLED", "false");
    vi.stubEnv("TRIXUS_HISTORY_IMPORT_WORKER_ENABLED", "false");
    vi.stubEnv("TRIXUS_DEFERRED_REPLAY_WORKER_ENABLED", "false");
    vi.stubEnv("TRIXUS_REALTIME_REDIS_ADAPTER_ENABLED", "false");

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), MessagingModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        messagingHistoryImport: { findMany: vi.fn().mockResolvedValue([]) },
        messagingConnection: { findMany: vi.fn().mockResolvedValue([]) },
      })
      .compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    const registry = app.get(MessagingProviderRegistry);

    expect(registry.resolve(MessagingProviderType.DEVELOPMENT).type).toBe(
      MessagingProviderType.DEVELOPMENT,
    );
    expect(registry.resolve(MessagingProviderType.EVOLUTION).type).toBe(
      MessagingProviderType.EVOLUTION,
    );

    await app.close();
  });
});
