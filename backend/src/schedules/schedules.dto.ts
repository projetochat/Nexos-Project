import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";
class ScheduleRecipientDto {
  @IsUUID() id!: string;
  @IsString() @MaxLength(200) name!: string;
}
export class SaveScheduleDto {
  @IsUUID() id!: string;
  @IsString() @MinLength(1) @MaxLength(200) identifier!: string;
  @IsIn(["message", "task"]) type!: "message" | "task";
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsString() @MaxLength(500) destination!: string;
  @IsString() @MinLength(1) @MaxLength(40) scheduledAt!: string;
  @IsIn(["once", "weekly", "monthly"]) recurrence!: string;
  @IsBoolean() delivery!: boolean;
  @IsIn(["pending", "completed"]) status!: string;
  @IsString() @MaxLength(100) connectionId!: string;
  @IsString() @MaxLength(100) departmentId!: string;
  @IsString() @MinLength(1) @MaxLength(10000) content!: string;
  @IsArray() @ArrayMaxSize(500) @IsUUID("all", { each: true }) recipientIds!: string[];
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ScheduleRecipientDto)
  recipients!: ScheduleRecipientDto[];
  @IsArray() @ArrayMaxSize(7) @IsString({ each: true }) recurrenceDays!: string[];
  @IsString() @MaxLength(20) recurrenceLimit!: string;
  @IsString() @MaxLength(40) recurrenceUntil!: string;
  @IsString() @MaxLength(100) assignedMembershipId!: string;
  @IsOptional() @IsString() @MaxLength(255) attachmentName!: string | null;
}
