import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { CrmController } from "./crm.controller";
import { TagsController } from "./tags.controller";

@Module({
  imports: [AuthModule, RealtimeModule],
  controllers: [CrmController, TagsController],
})
export class CrmModule {}
