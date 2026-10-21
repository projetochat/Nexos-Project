import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
} from "class-validator";

export class BulkConversationSelectionDto {
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
  @IsUUID()
  departmentId?: string;
}

export class BulkTransferConversationsDto extends BulkConversationSelectionDto {
  @IsIn(["department", "agent", "status"])
  mode!: "department" | "agent" | "status";

  @IsOptional()
  @IsUUID()
  targetId?: string;

  @IsOptional()
  @IsIn(["fila", "standby"])
  status?: "fila" | "standby";
}
