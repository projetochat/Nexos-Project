import { NexosApiError } from "@/lib/nexos-api";

export function connectionRemoveErrorMessage(error: unknown) {
  if (error instanceof NexosApiError) {
    if (error.status === 409) {
      return "A conexao ainda esta em uso e nao pode ser removida neste estado.";
    }
    if (error.status === 503 || error.code === "EVOLUTION_PROVIDER_UNAVAILABLE") {
      return "Evolution indisponivel. A remocao nao foi concluida; tente novamente em instantes.";
    }
  }
  return (error as Error).message || "Nao foi possivel remover a conexao.";
}
