import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsUUID,
} from "class-validator";

export class BulkConversationSelectionDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID("4", { each: true })
  conversationIds!: string[];
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
