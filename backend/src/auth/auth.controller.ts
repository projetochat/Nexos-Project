import { Body, Controller, Get, Headers, Inject, Post, UseGuards } from "@nestjs/common";
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { CurrentUser } from "./current-user.decorator";
import { JwtAuthGuard } from "./jwt-auth.guard";
import type { AuthenticatedUser } from "./auth.types";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RefreshDto } from "./dto/refresh.dto";

class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}

class AcceptInvitationDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsOptional()
  @IsString()
  name?: string;
}

class CompleteRequiredPasswordChangeDto {
  @IsString()
  setupToken!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword!: string;

  @IsString()
  confirmPassword!: string;
}

class SelectTenantDto {
  @IsString()
  selectionToken!: string;

  @IsString()
  tenantId!: string;
}

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post("platform/login")
  platformLogin(@Body() dto: LoginDto) {
    return this.auth.loginPlatform(dto);
  }

  @Post("tenant/login")
  tenantLogin(@Body() dto: LoginDto) {
    return this.auth.loginTenant(dto);
  }

  @Post("refresh")
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post("password/forgot")
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.requestPasswordReset(dto.email);
  }

  @Post("password/reset")
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password);
  }

  @Post("invitations/accept")
  acceptInvitation(@Body() dto: AcceptInvitationDto) {
    return this.auth.acceptInvitation(dto);
  }

  @Post("password/required-change")
  completeRequiredPasswordChange(@Body() dto: CompleteRequiredPasswordChangeDto) {
    return this.auth.completeRequiredPasswordChange(dto);
  }

  @Post("tenant/select")
  selectTenant(@Body() dto: SelectTenantDto) {
    return this.auth.selectTenant(dto.selectionToken, dto.tenantId);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() current: AuthenticatedUser) {
    return this.auth.me(current);
  }

  @Post("logout")
  logout(@Headers("authorization") authorization?: string) {
    return this.auth.logout(authorization);
  }
}
