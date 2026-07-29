import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

const COLS =
  "pode_editar_contato, pode_editar_vinculo_cliente, pode_editar_etiquetas, visualiza_leads, visualiza_contatos, visualiza_numero, excluir_mensagem, editar_mensagem, acessa_mensagens_rapidas, bloquear_contatos, enviar_audio, mostrar_nome_atendente";

export function useChatPerms(): ChatPerms {
  const { data } = useQuery({
    queryKey: ["chat-perms", "current"],
    queryFn: async (): Promise<ChatPerms> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return DEFAULT_PERMS;
      const { data: ag } = await supabase
        .from("agents")
        .select("perfil_id")
        .eq("id", user.id)
        .maybeSingle();
      if (!ag?.perfil_id) return DEFAULT_PERMS;
      const { data: p } = await supabase
        .from("access_profiles")
        .select(COLS)
        .eq("id", ag.perfil_id)
        .maybeSingle();
      if (!p) return DEFAULT_PERMS;
      return { ...DEFAULT_PERMS, ...(p as Partial<ChatPerms>) };
    },
    staleTime: 60_000,
  });
  return data ?? DEFAULT_PERMS;
}
