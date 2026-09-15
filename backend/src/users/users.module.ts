import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PlatformModule } from "../platform/platform.module";
import { UsersController } from "./users.controller";

@Module({
  imports: [AuthModule, PlatformModule],
  controllers: [UsersController],
})
export class UsersModule {}
