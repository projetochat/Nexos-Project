import { IsIn } from "class-validator";

export class UpdateConversationStatusDto {
  @IsIn(["aberta", "em_andamento", "aguardando", "fechada"])
  status!: "aberta" | "em_andamento" | "aguardando" | "fechada";
}
