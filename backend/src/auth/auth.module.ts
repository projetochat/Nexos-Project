import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthSessionCleanupService } from "./auth-session-cleanup.service";
import { PermissionsGuard } from "./permissions.guard";

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, AuthSessionCleanupService, PermissionsGuard],
  exports: [AuthService, PermissionsGuard],
})
export class AuthModule {}
