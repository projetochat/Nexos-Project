import { IsInt, Min } from "class-validator";

export class CompleteOnboardingDto {
  @IsInt()
  @Min(1)
  version!: number;
}
