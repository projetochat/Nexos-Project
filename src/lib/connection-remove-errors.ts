import { NexosApiError } from "@/lib/nexos-api";

export function connectionRemoveErrorMessage(error: unknown) {
  if (error instanceof NexosApiError) {
    if (error.status === 409) {
      return "A conexão ainda está em uso e não pode ser removida neste estado.";
    }
    if (error.status === 503 || error.code === "EVOLUTION_PROVIDER_UNAVAILABLE") {
      return "Evolution indisponível. A remoção não foi concluída; tente novamente em instantes.";
    }
  }
  return (error as Error).message || "Não foi possível remover a conexão.";
}
