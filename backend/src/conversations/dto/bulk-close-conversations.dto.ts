import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsIn } from "class-validator";
import type { ConversationQueueTab } from "../conversation-queue-scope";

export class BulkCloseConversationsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(4)
  @ArrayUnique()
  @IsIn(["ativas", "standby", "fila", "leads"], { each: true })
  queues!: ConversationQueueTab[];
}
