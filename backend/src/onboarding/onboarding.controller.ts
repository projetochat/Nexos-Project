import { Body, Controller, Get, Inject, Patch, Post, UseGuards } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CompleteOnboardingDto } from "./dto/complete-onboarding.dto";
import { UpdateOnboardingProgressDto } from "./dto/update-onboarding-progress.dto";
import { OnboardingService } from "./onboarding.service";

@Controller("onboarding")
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  constructor(@Inject(OnboardingService) private readonly onboarding: OnboardingService) {}

  @Get("status")
  status(@CurrentUser() current: AuthenticatedUser) {
    return this.onboarding.status(current);
  }

  @Patch("progress")
  updateProgress(
    @Body() dto: UpdateOnboardingProgressDto,
    @CurrentUser() current: AuthenticatedUser,
  ) {
    return this.onboarding.updateProgress(dto, current);
  }

  @Post("complete")
  complete(@Body() dto: CompleteOnboardingDto, @CurrentUser() current: AuthenticatedUser) {
    return this.onboarding.complete(dto, current);
  }
}
