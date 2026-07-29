export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      access_profile_departments: {
        Row: {
          department_id: string
          profile_id: string
        }
        Insert: {
          department_id: string
          profile_id: string
        }
        Update: {
          department_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_profile_departments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_profile_departments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "access_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      access_profile_instancias: {
        Row: {
          instancia_id: string
          profile_id: string
        }
        Insert: {
          instancia_id: string
          profile_id: string
        }
        Update: {
          instancia_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_profile_instancias_instancia_id_fkey"
            columns: ["instancia_id"]
            isOneToOne: false
            referencedRelation: "instancias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_profile_instancias_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "access_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      access_profiles: {
        Row: {
          acessa_mensagens_rapidas: boolean
          bloquear_contatos: boolean
          created_at: string
          descricao: string | null
          editar_mensagem: boolean
          enviar_audio: boolean
          excluir_mensagem: boolean
          id: string
          jornada: Json
          mostrar_nome_atendente: boolean
          nome: string
          pode_editar_contato: boolean
          pode_editar_etiquetas: boolean
          pode_editar_vinculo_cliente: boolean
          updated_at: string
          visualiza_contatos: boolean
          visualiza_leads: boolean
          visualiza_numero: boolean
        }
        Insert: {
          acessa_mensagens_rapidas?: boolean
          bloquear_contatos?: boolean
          created_at?: string
          descricao?: string | null
          editar_mensagem?: boolean
          enviar_audio?: boolean
          excluir_mensagem?: boolean
          id?: string
          jornada?: Json
          mostrar_nome_atendente?: boolean
          nome: string
          pode_editar_contato?: boolean
          pode_editar_etiquetas?: boolean
          pode_editar_vinculo_cliente?: boolean
          updated_at?: string
          visualiza_contatos?: boolean
          visualiza_leads?: boolean
          visualiza_numero?: boolean
        }
        Update: {
          acessa_mensagens_rapidas?: boolean
          bloquear_contatos?: boolean
          created_at?: string
          descricao?: string | null
          editar_mensagem?: boolean
          enviar_audio?: boolean
          excluir_mensagem?: boolean
          id?: string
          jornada?: Json
          mostrar_nome_atendente?: boolean
          nome?: string
          pode_editar_contato?: boolean
          pode_editar_etiquetas?: boolean
          pode_editar_vinculo_cliente?: boolean
          updated_at?: string
          visualiza_contatos?: boolean
          visualiza_leads?: boolean
          visualiza_numero?: boolean
        }
        Relationships: []
      }
      agents: {
        Row: {
          avatar_url: string | null
          created_at: string
          department_id: string | null
          email: string
          id: string
          last_seen: string | null
          nome: string
          perfil_id: string | null
          status: Database["public"]["Enums"]["agent_status"]
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          department_id?: string | null
          email: string
          id: string
          last_seen?: string | null
          nome: string
          perfil_id?: string | null
          status?: Database["public"]["Enums"]["agent_status"]
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          department_id?: string | null
          email?: string
          id?: string
          last_seen?: string | null
          nome?: string
          perfil_id?: string | null
          status?: Database["public"]["Enums"]["agent_status"]
        }
        Relationships: [
          {
            foreignKeyName: "agents_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "access_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chamados: {
        Row: {
          aberto_em: string
          cliente_id: string | null
          cliente_nome: string
          created_at: string
          departamento_id: string | null
          departamento_nome: string
          descricao_html: string
          id: string
          numero: number
          solicitante_id: string | null
          solicitante_nome: string
          status: string
          tipo: string
          titulo: string
          updated_at: string
          usuario_abertura_id: string | null
          usuario_abertura_nome: string
        }
        Insert: {
          aberto_em?: string
          cliente_id?: string | null
          cliente_nome: string
          created_at?: string
          departamento_id?: string | null
          departamento_nome: string
          descricao_html: string
          id?: string
          numero?: number
          solicitante_id?: string | null
          solicitante_nome: string
          status?: string
          tipo: string
          titulo: string
          updated_at?: string
          usuario_abertura_id?: string | null
          usuario_abertura_nome: string
        }
        Update: {
          aberto_em?: string
          cliente_id?: string | null
          cliente_nome?: string
          created_at?: string
          departamento_id?: string | null
          departamento_nome?: string
          descricao_html?: string
          id?: string
          numero?: number
          solicitante_id?: string | null
          solicitante_nome?: string
          status?: string
          tipo?: string
          titulo?: string
          updated_at?: string
          usuario_abertura_id?: string | null
          usuario_abertura_nome?: string
        }
        Relationships: []
      }
      contact_tags: {
        Row: {
          contact_id: string
          tag_id: string
        }
        Insert: {
          contact_id: string
          tag_id: string
        }
        Update: {
          contact_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tags_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          avatar_url: string | null
          created_at: string
          customer_id: string | null
          departamento: string | null
          email: string | null
          id: string
          instancia: string | null
          nivel_gerencia: string | null
          nome: string
          telefone: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          customer_id?: string | null
          departamento?: string | null
          email?: string | null
          id?: string
          instancia?: string | null
          nivel_gerencia?: string | null
          nome: string
          telefone: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          customer_id?: string | null
          departamento?: string | null
          email?: string | null
          id?: string
          instancia?: string | null
          nivel_gerencia?: string | null
          nome?: string
          telefone?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_protocol_counters: {
        Row: {
          ano: number
          seq: number
        }
        Insert: {
          ano: number
          seq?: number
        }
        Update: {
          ano?: number
          seq?: number
        }
        Relationships: []
      }
      conversations: {
        Row: {
          agent_id: string | null
          contact_id: string
          created_at: string
          department_id: string | null
          id: string
          is_group: boolean
          last_message_at: string
          protocolo: string | null
          status: Database["public"]["Enums"]["conv_status"]
        }
        Insert: {
          agent_id?: string | null
          contact_id: string
          created_at?: string
          department_id?: string | null
          id?: string
          is_group?: boolean
          last_message_at?: string
          protocolo?: string | null
          status?: Database["public"]["Enums"]["conv_status"]
        }
        Update: {
          agent_id?: string | null
          contact_id?: string
          created_at?: string
          department_id?: string | null
          id?: string
          is_group?: boolean
          last_message_at?: string
          protocolo?: string | null
          status?: Database["public"]["Enums"]["conv_status"]
        }
        Relationships: [
          {
            foreignKeyName: "conversations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_self"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          contato_responsavel: string | null
          cor: string | null
          created_at: string
          email: string | null
          id: string
          nome: string
          notas: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          contato_responsavel?: string | null
          cor?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome: string
          notas?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          contato_responsavel?: string | null
          cor?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome?: string
          notas?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      departments: {
        Row: {
          cor: string
          created_at: string
          descricao: string | null
          id: string
          nome: string
        }
        Insert: {
          cor?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
        }
        Update: {
          cor?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      instancias: {
        Row: {
          cor: string
          created_at: string
          id: string
          mensagem_contato_existente: string | null
          mensagem_novo_contato: string | null
          nome: string
          notas: string | null
          provedor: string
          status: string
          telefone: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          cor?: string
          created_at?: string
          id?: string
          mensagem_contato_existente?: string | null
          mensagem_novo_contato?: string | null
          nome: string
          notas?: string | null
          provedor?: string
          status?: string
          telefone?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          cor?: string
          created_at?: string
          id?: string
          mensagem_contato_existente?: string | null
          mensagem_novo_contato?: string | null
          nome?: string
          notas?: string | null
          provedor?: string
          status?: string
          telefone?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          author_id: string | null
          content: string
          conversation_id: string
          created_at: string
          duration_ms: number | null
          id: string
          media_data: string | null
          read_at: string | null
          sender: Database["public"]["Enums"]["msg_sender"]
          type: Database["public"]["Enums"]["msg_type"]
        }
        Insert: {
          author_id?: string | null
          content: string
          conversation_id: string
          created_at?: string
          duration_ms?: number | null
          id?: string
          media_data?: string | null
          read_at?: string | null
          sender: Database["public"]["Enums"]["msg_sender"]
          type?: Database["public"]["Enums"]["msg_type"]
        }
        Update: {
          author_id?: string | null
          content?: string
          conversation_id?: string
          created_at?: string
          duration_ms?: number | null
          id?: string
          media_data?: string | null
          read_at?: string | null
          sender?: Database["public"]["Enums"]["msg_sender"]
          type?: Database["public"]["Enums"]["msg_type"]
        }
        Relationships: [
          {
            foreignKeyName: "messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "agents_self"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "report_first_response"
            referencedColumns: ["conversation_id"]
          },
        ]
      }
      quick_replies: {
        Row: {
          agent_id: string | null
          atalho: string
          close_on_send: boolean
          created_at: string
          department_id: string | null
          id: string
          texto: string
        }
        Insert: {
          agent_id?: string | null
          atalho: string
          close_on_send?: boolean
          created_at?: string
          department_id?: string | null
          id?: string
          texto: string
        }
        Update: {
          agent_id?: string | null
          atalho?: string
          close_on_send?: boolean
          created_at?: string
          department_id?: string | null
          id?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_replies_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          cor: string
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          cor?: string
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          cor?: string
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      agents_self: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          department_id: string | null
          email: string | null
          id: string | null
          last_seen: string | null
          nome: string | null
          status: Database["public"]["Enums"]["agent_status"] | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          department_id?: string | null
          email?: string | null
          id?: string | null
          last_seen?: string | null
          nome?: string | null
          status?: Database["public"]["Enums"]["agent_status"] | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          department_id?: string | null
          email?: string | null
          id?: string | null
          last_seen?: string | null
          nome?: string | null
          status?: Database["public"]["Enums"]["agent_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "agents_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      report_first_response: {
        Row: {
          agent_id: string | null
          conversation_id: string | null
          department_id: string | null
          first_agent_at: string | null
          first_contact_at: string | null
          first_response_seconds: number | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_self"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      assign_conversation_protocolo: {
        Args: { _conversation_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      agent_status: "online" | "ausente" | "offline"
      app_role: "admin" | "agent"
      conv_status: "aberta" | "em_andamento" | "aguardando" | "fechada"
      msg_sender: "contact" | "agent"
      msg_type: "text" | "audio" | "image" | "system"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      agent_status: ["online", "ausente", "offline"],
      app_role: ["admin", "agent"],
      conv_status: ["aberta", "em_andamento", "aguardando", "fechada"],
      msg_sender: ["contact", "agent"],
      msg_type: ["text", "audio", "image", "system"],
    },
  },
} as const
