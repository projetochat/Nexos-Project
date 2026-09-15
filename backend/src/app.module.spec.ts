import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { AppModule } from "./app.module";
import { GroupsController } from "./conversations/groups.controller";
import { GroupsSyncService } from "./conversations/groups-sync.service";
import { ConversationsController } from "./conversations/conversations.controller";
import { MessagesService } from "./conversations/messages.service";
import { ContactProfilePictureSyncService } from "./messaging/contact-profile-picture-sync.service";
import { EvolutionClient } from "./messaging/evolution/evolution.client";
import { PrismaService } from "./prisma/prisma.service";
import { RealtimePublisher } from "./realtime/realtime.publisher";

describe("AppModule bootstrap graph", () => {
  it("resolves the complete dependency graph without undefined constructor tokens", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef.get(ConversationsController)).toBeDefined();

    await moduleRef.close();
  });
});

describe("ConversationsController DI metadata", () => {
  it("keeps all constructor dependencies available at runtime", () => {
    const paramTypes = Reflect.getMetadata("design:paramtypes", ConversationsController) ?? [];
    const paramNames = paramTypes.map((param: { name?: string } | undefined) => param?.name);

    expect(paramNames).toEqual([
      "PrismaService",
      "MessagesService",
      "RealtimePublisher",
      "ContactProfilePictureSyncService",
    ]);
    expect(paramTypes[0]).toBe(PrismaService);
    expect(paramTypes[1]).toBe(MessagesService);
    expect(paramTypes[2]).toBe(RealtimePublisher);
    expect(paramTypes[3]).toBe(ContactProfilePictureSyncService);
  });
});

describe("GroupsController DI metadata", () => {
  it("keeps all constructor dependencies available at runtime", () => {
    const paramTypes = Reflect.getMetadata("design:paramtypes", GroupsController) ?? [];
    const paramNames = paramTypes.map((param: { name?: string } | undefined) => param?.name);

    expect(paramNames).toEqual(["PrismaService", "EvolutionClient", "GroupsSyncService"]);
    expect(paramTypes[0]).toBe(PrismaService);
    expect(paramTypes[1]).toBe(EvolutionClient);
    expect(paramTypes[2]).toBe(GroupsSyncService);
  });
});
