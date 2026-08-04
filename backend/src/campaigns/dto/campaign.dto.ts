import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsTimeZone,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { CampaignAudienceType, CampaignTagMatchMode, CampaignStatus } from "../../generated/prisma";

export class CampaignAudienceDto {
  @IsEnum(CampaignAudienceType)
  type!: CampaignAudienceType;

  @IsOptional()
  @IsEnum(CampaignTagMatchMode)
  tagMatchMode?: CampaignTagMatchMode;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID("4", { each: true })
  tagIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(250)
  @IsUUID("4", { each: true })
  customerIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID("4", { each: true })
  contactIds?: string[];
}

export class CreateCampaignDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  messageText!: string;

  @IsUUID("4")
  connectionId!: string;

  @ValidateNested()
  @Type(() => CampaignAudienceDto)
  audience!: CampaignAudienceDto;

  @IsOptional()
  @IsTimeZone()
  timezone?: string;
}

export class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  messageText?: string;

  @IsOptional()
  @IsUUID("4")
  connectionId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CampaignAudienceDto)
  audience?: CampaignAudienceDto;

  @IsOptional()
  @IsTimeZone()
  timezone?: string;
}

export class ListCampaignsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus;

  @IsOptional()
  @IsUUID("4")
  connectionId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}

export class ListCampaignRecipientsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}

export class AudiencePreviewDto {
  @ValidateNested()
  @Type(() => CampaignAudienceDto)
  audience!: CampaignAudienceDto;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  messageText!: string;
}

export class ScheduleCampaignDto {
  @IsDateString()
  scheduledAt!: string;

  @IsOptional()
  @IsTimeZone()
  timezone?: string;

  @IsBoolean()
  confirm!: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  expectedEligibleCount?: number;
}

export class StartCampaignDto {
  @IsBoolean()
  confirm!: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  expectedEligibleCount?: number;
}

export class UpdateMarketingPreferenceDto {
  @IsBoolean()
  marketingAllowed!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  source?: string;
}
