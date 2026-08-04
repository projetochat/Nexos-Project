import { IsString } from "class-validator";

export class CompleteTicketAttachmentDto {
  @IsString()
  contentBase64!: string;
}
