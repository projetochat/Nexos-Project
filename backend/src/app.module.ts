import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { CampaignsModule } from "./campaigns/campaigns.module";
import { ConversationsModule } from "./conversations/conversations.module";
import { CrmModule } from "./crm/crm.module";
import { DepartmentsModule } from "./departments/departments.module";
import { HealthModule } from "./health/health.module";
import { MessagingModule } from "./messaging/messaging.module";
import { PlatformModule } from "./platform/platform.module";
import { PrismaModule } from "./prisma/prisma.module";
import { QuickRepliesModule } from "./quick-replies/quick-replies.module";
import { QueueModule } from "./queue/queue.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { RolesModule } from "./roles/roles.module";
import { TicketsModule } from "./tickets/tickets.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: [".env", "../.env"], isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    DepartmentsModule,
    RolesModule,
    CrmModule,
    QuickRepliesModule,
    QueueModule,
    RealtimeModule,
    MessagingModule,
    PlatformModule,
    ConversationsModule,
    TicketsModule,
    CampaignsModule,
    HealthModule,
  ],
})
export class AppModule {}
