import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";
import { AiAgentBehavior, AiProvider } from "../generated/prisma";

const AI_AGENT_INSTRUCTIONS_MAX_LENGTH = 15_000;

export class CreateAiConnectionDto {
  @IsOptional() @IsBoolean() active?: boolean;
  @IsEnum(AiProvider) provider!: AiProvider;
  @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @IsString() @MinLength(1) @MaxLength(10_000) apiKey!: string;
  @IsOptional() @IsString() @MaxLength(200) organization?: string | null;
}

export class UpdateAiConnectionDto {
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsEnum(AiProvider) provider?: AiProvider;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(10_000) apiKey?: string;
  @IsOptional() @IsString() @MaxLength(200) organization?: string | null;
}

export class CreateAiAgentDto {
  @IsOptional() @IsBoolean() active?: boolean;
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsString() @MinLength(2) @MaxLength(80) module!: string;
  @IsUUID() connectionId!: string;
  @IsString() @MinLength(1) @MaxLength(120) model!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsString() @MinLength(1) @MaxLength(AI_AGENT_INSTRUCTIONS_MAX_LENGTH) instructions!: string;
  @IsEnum(AiAgentBehavior) behavior!: AiAgentBehavior;
}

export class UpdateAiAgentDto {
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) module?: string;
  @IsOptional() @IsUUID() connectionId?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) model?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(AI_AGENT_INSTRUCTIONS_MAX_LENGTH)
  instructions?: string;
  @IsOptional() @IsEnum(AiAgentBehavior) behavior?: AiAgentBehavior;
}

export class CreateTicketDraftDto {
  @IsUUID() conversationId!: string;
  @IsOptional() @IsUUID() agentId?: string;
}
