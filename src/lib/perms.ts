import { useSession } from "@/lib/session";

export type ChatPerms = {
  pode_editar_contato: boolean;
  pode_editar_vinculo_cliente: boolean;
  pode_usar_etiquetas: boolean;
  pode_editar_etiquetas: boolean;
  pode_gerenciar_respostas_rapidas: boolean;
  visualiza_leads: boolean;
  visualiza_contatos: boolean;
  visualiza_numero: boolean;
  excluir_mensagem: boolean;
  editar_mensagem: boolean;
  acessa_mensagens_rapidas: boolean;
  bloquear_contatos: boolean;
  enviar_audio: boolean;
  mostrar_nome_atendente: boolean;
  visualiza_todas_conversas_ativas: boolean;
};

export const DEFAULT_PERMS: ChatPerms = {
  pode_editar_contato: true,
  pode_editar_vinculo_cliente: true,
  pode_usar_etiquetas: true,
  pode_editar_etiquetas: true,
  pode_gerenciar_respostas_rapidas: true,
  visualiza_leads: true,
  visualiza_contatos: true,
  visualiza_numero: true,
  excluir_mensagem: true,
  editar_mensagem: true,
  acessa_mensagens_rapidas: true,
  bloquear_contatos: true,
  enviar_audio: true,
  mostrar_nome_atendente: true,
  visualiza_todas_conversas_ativas: true,
};

export function useChatPerms(): ChatPerms {
  const role = useSession((state) => state.user?.role);
  const permissions = useSession((state) => state.user?.permissions);
  if (role === "admin") return DEFAULT_PERMS;
  const has = (...required: string[]) =>
    required.some((permission) => permissions?.includes(permission)) ?? false;
  return {
    pode_editar_contato: has("chat.contacts.edit", "contacts.manage"),
    pode_editar_vinculo_cliente: has("chat.customer_link.edit"),
    pode_usar_etiquetas: has("chat.tags.use"),
    pode_editar_etiquetas: has("chat.tags.manage"),
    pode_gerenciar_respostas_rapidas: has("chat.quick_replies.manage"),
    visualiza_leads: has("chat.leads.read"),
    visualiza_contatos: has("chat.contacts.read", "contacts.read"),
    visualiza_numero: has("chat.phone.read"),
    excluir_mensagem: has("chat.messages.delete"),
    editar_mensagem: has("chat.messages.edit"),
    acessa_mensagens_rapidas: has("chat.quick_replies.read"),
    bloquear_contatos: has("chat.contacts.block"),
    enviar_audio: has("chat.audio.send"),
    mostrar_nome_atendente: has("chat.agent_name.show"),
    visualiza_todas_conversas_ativas: has("chat.conversations.view_all_active"),
  };
}
