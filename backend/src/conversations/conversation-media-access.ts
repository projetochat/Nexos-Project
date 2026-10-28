import { ForbiddenException } from "@nestjs/common";

export function assertConversationStartedForMedia(protocol: string | null | undefined) {
  if (typeof protocol !== "string" || !protocol.trim()) {
    throw new ForbiddenException({
      code: "CONVERSATION_NOT_STARTED",
      message: "Inicie o atendimento para acessar os arquivos.",
    });
  }
}
