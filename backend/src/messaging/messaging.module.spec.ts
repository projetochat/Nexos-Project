import "reflect-metadata";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { MessagingProviderType } from "../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { MessagingModule } from "./messaging.module";
import { MessagingProviderRegistry } from "./messaging-provider.registry";

describe("MessagingModule DI", () => {
  it("bootstraps registry providers through the Nest container", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), MessagingModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
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
