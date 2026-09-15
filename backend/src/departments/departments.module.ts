import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PlatformModule } from "../platform/platform.module";
import { DepartmentsController } from "./departments.controller";

@Module({
  imports: [AuthModule, PlatformModule],
  controllers: [DepartmentsController],
})
export class DepartmentsModule {}
