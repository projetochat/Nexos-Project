import { Body, Controller, Headers, Inject, Post, UseGuards } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ExchangeImpersonationHandoffDto } from "./platform.dto";
import { PlatformService } from "./platform.service";

@Controller("auth/impersonation")
export class ImpersonationHandoffController {
  constructor(
    @Inject(PlatformService) private readonly platform: PlatformService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Post("exchange")
  exchange(@Body() dto: ExchangeImpersonationHandoffDto) {
    return this.platform.exchangeImpersonationHandoff(dto);
  }

  @Post("stop")
  @UseGuards(JwtAuthGuard)
  async stop(
    @CurrentUser() current: AuthenticatedUser,
    @Headers("authorization") authorization?: string,
  ) {
    const result = await this.platform.stopCurrentImpersonation(current);
    await this.auth.logout(authorization);
    return result;
  }
}
