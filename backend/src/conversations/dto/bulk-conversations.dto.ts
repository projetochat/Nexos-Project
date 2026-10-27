import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsNotEmpty,
  MaxLength,
  IsString,
  IsUUID,
  isUUID,
  maxLength,
  ValidateBy,
} from "class-validator";

export class BulkConversationSelectionDto {
  @IsOptional()
  @IsIn(["start", "transfer", "close"])
  action?: "start" | "transfer" | "close";

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID("4", { each: true })
  conversationIds?: string[];

  @IsOptional()
  @IsIn(["ativas", "standby", "fila", "leads"])
  tab?: "ativas" | "standby" | "fila" | "leads";

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(4)
  @ArrayUnique()
  @IsIn(["ativas", "standby", "fila", "leads"], { each: true })
  tabs?: Array<"ativas" | "standby" | "fila" | "leads">;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(["todos", "privado", "grupos", "humano", "bots"])
  source?: "todos" | "privado" | "grupos" | "humano" | "bots";

  @IsOptional()
  @IsBoolean()
  onlyUnread?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID("4", { each: true })
  customerIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  instances?: string[];
}

export class BulkStartConversationsDto extends BulkConversationSelectionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  departmentId?: string;
}

export class BulkTransferConversationsDto extends BulkConversationSelectionDto {
  @IsIn(["department", "agent", "status"])
  mode!: "department" | "agent" | "status";

  @IsOptional()
  @ValidateBy({
    name: "isBulkTransferTargetId",
    validator: {
      validate: (value, args) =>
        (args?.object as BulkTransferConversationsDto).mode === "department"
          ? typeof value === "string" && value.length > 0 && maxLength(value, 191)
          : isUUID(value),
      defaultMessage: (args) =>
        (args?.object as BulkTransferConversationsDto).mode === "department"
          ? "targetId must be a non-empty string of at most 191 characters"
          : "targetId must be a UUID",
    },
  })
  targetId?: string;

  @IsOptional()
  @IsIn(["fila", "standby"])
  status?: "fila" | "standby";
}
