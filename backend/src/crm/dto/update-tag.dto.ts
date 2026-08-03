import { IsOptional, IsString, Length, Matches, MaxLength } from "class-validator";

export class UpdateTagDto {
  @IsOptional()
  @IsString()
  @Length(2, 60)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string;
}
