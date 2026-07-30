import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CrmController } from "./crm.controller";

@Module({
  imports: [AuthModule],
  controllers: [CrmController],
})
export class CrmModule {}
