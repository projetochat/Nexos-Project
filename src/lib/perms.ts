import { useSession } from "@/lib/session";

export type ChatPerms = {
  pode_editar_contato: boolean;
  pode_editar_vinculo_cliente: boolean;
  pode_editar_etiquetas: boolean;
  visualiza_leads: boolean;
  visualiza_contatos: boolean;
  visualiza_numero: boolean;
  excluir_mensagem: boolean;
  editar_mensagem: boolean;
  acessa_mensagens_rapidas: boolean;
  bloquear_contatos: boolean;
  enviar_audio: boolean;
  mostrar_nome_atendente: boolean;
};

export const DEFAULT_PERMS: ChatPerms = {
  pode_editar_contato: true,
  pode_editar_vinculo_cliente: true,
  pode_editar_etiquetas: true,
  visualiza_leads: true,
  visualiza_contatos: true,
  visualiza_numero: true,
  excluir_mensagem: true,
  editar_mensagem: true,
  acessa_mensagens_rapidas: true,
  bloquear_contatos: true,
  enviar_audio: true,
  mostrar_nome_atendente: true,
};

const CHAT_PERMISSION_MAP: Record<keyof ChatPerms, string> = {
  pode_editar_contato: "chat.contacts.edit",
  pode_editar_vinculo_cliente: "chat.customer_link.edit",
  pode_editar_etiquetas: "chat.tags.manage",
  visualiza_leads: "chat.leads.read",
  visualiza_contatos: "chat.contacts.read",
  visualiza_numero: "chat.phone.read",
  excluir_mensagem: "chat.messages.delete",
  editar_mensagem: "chat.messages.edit",
  acessa_mensagens_rapidas: "chat.quick_replies.read",
  bloquear_contatos: "chat.contacts.block",
  enviar_audio: "chat.audio.send",
  mostrar_nome_atendente: "chat.agent_name.show",
};

export function useChatPerms(): ChatPerms {
  const permissions = useSession((state) => state.user?.permissions);
  if (!permissions?.length) return DEFAULT_PERMS;
  const granted = new Set(permissions);
  return Object.fromEntries(
    Object.entries(CHAT_PERMISSION_MAP).map(([key, permission]) => [key, granted.has(permission)]),
  ) as ChatPerms;
}
