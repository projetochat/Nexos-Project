import { displayDateTime } from "@/lib/format";

export const taskTypeLabels: Record<string, string> = {
  task: "Tarefa interna",
  reminder: "Lembrete",
  whatsapp: "WhatsApp",
  email: "E-mail",
};
export const taskStatusLabels: Record<string, string> = {
  active: "Ativo",
  paused: "Pausado",
  completed: "Concluído",
  pending: "Pendente",
  processing: "Em processamento",
  failed: "Falhou",
  cancelled: "Cancelado",
  sent: "Enviado",
  ambiguous: "Resultado não confirmado",
};
export const taskPriorityLabels: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};
export const taskFrequencyLabels: Record<string, string> = {
  once: "Única",
  daily: "Diária",
  weekly: "Semanal",
  monthly: "Mensal",
  yearly: "Anual",
  custom: "Personalizada",
};
export function taskDate(value: string | null | undefined, timezone?: string) {
  return displayDateTime(value, timezone ? { timeZone: timezone } : undefined);
}

export const taskChannelLabels: Record<string, string> = {
  popup: "Popup interno",
  bell: "Sino do TRIXUS",
  whatsapp: "WhatsApp",
  email: "E-mail",
};

export function taskDeliveryFailureMessage(code: string) {
  const messages: Record<string, string> = {
    TASK_AUTHORIZATION_OR_SCOPE_REVOKED:
      "A permissão ou o acesso necessário ao envio foi revogado.",
    TASK_CHANNEL_DISABLED: "Canal desativado nas preferências gerais.",
    TASK_DELIVERY_FAILED: "Não foi possível concluir o envio.",
    TASK_DELIVERY_OUTCOME_UNKNOWN:
      "O resultado do envio não foi confirmado. Revise o histórico antes de tentar novamente.",
    TASK_SMTP_COMMIT_UNKNOWN:
      "O resultado do envio de e-mail não foi confirmado. Revise o histórico antes de tentar novamente.",
    TASK_WHATSAPP_DELIVERY_FAILED: "Não foi possível concluir o envio pelo WhatsApp.",
    TASK_PREPARATION_FAILED: "Não foi possível preparar esta execução.",
    TASK_WORKER_FAILED: "Não foi possível processar esta execução.",
    TASK_RECURRENCE_INVALID: "A configuração de recorrência é inválida.",
    TASK_RECURRENCE_SEARCH_LIMIT: "Não foi possível calcular novas datas para esta recorrência.",
  };
  return messages[code] ?? "Não foi possível concluir o envio.";
}
