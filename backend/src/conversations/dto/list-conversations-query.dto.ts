import {
  IsBooleanString,
  IsIn,
  IsInt,
  IsOptional,
  IsNotEmpty,
  MaxLength,
  IsString,
  IsUUID,
  Max,
  Min,
} from "class-validator";
import { Type } from "class-transformer";

export class ListConversationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(["ativas", "standby", "fila", "leads"])
  tab?: "ativas" | "standby" | "fila" | "leads";

  @IsOptional()
  @IsIn(["todos", "privado", "grupos", "humano", "bots"])
  source?: "todos" | "privado" | "grupos" | "humano" | "bots";

  @IsOptional()
  @IsBooleanString()
  onlyUnread?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  instance?: string;

  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsOptional()
  @IsIn(["aberta", "em_andamento", "aguardando", "fechada"])
  status?: "aberta" | "em_andamento" | "aguardando" | "fechada";

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  departmentId?: string;

  @IsOptional()
  @IsIn(["lastMessageAt", "createdAt", "status"])
  sort?: "lastMessageAt" | "createdAt" | "status";

  @IsOptional()
  @IsIn(["asc", "desc"])
  direction?: "asc" | "desc";
}
