import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TenantRecordsController } from "./tenant-records.controller";

@Module({
  imports: [AuthModule],
  controllers: [TenantRecordsController],
})
export class TenantRecordsModule {}
