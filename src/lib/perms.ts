
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
  return DEFAULT_PERMS;
}
