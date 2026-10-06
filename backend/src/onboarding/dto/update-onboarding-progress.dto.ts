import { IsInt, Max, Min } from "class-validator";

export class UpdateOnboardingProgressDto {
  @IsInt()
  @Min(1)
  @Max(8)
  currentStep!: number;

  @IsInt()
  @Min(0)
  @Max(8)
  maxCompletedStep!: number;

  @IsInt()
  @Min(1)
  version!: number;
}
