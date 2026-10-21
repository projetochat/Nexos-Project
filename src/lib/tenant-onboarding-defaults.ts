export const STEPS = [
  { label: "Boas-vindas", title: "Boas-vindas", subtitle: null },
  {
    label: "Instância",
    title: "Configuração da Instância",
    subtitle: "Conecte sua conta do WhatsApp para começar a receber e atender conversas.",
  },
  {
    label: "Departamentos",
    title: "Cadastro de Departamentos",
    subtitle:
      "Organize seu atendimento por departamentos, definindo um nome, cor, ícone e a instância que será utilizada nas conversas.",
  },
  {
    label: "Perfis e Acessos",
    title: "Perfis e Acessos",
    subtitle:
      "Crie perfis de usuários e defina quais departamentos e instâncias cada perfil terá acesso.",
  },
  {
    label: "Atendentes",
    title: "Cadastro de Atendentes",
    subtitle: "Cadastre os atendentes que irão operar o chat e vincule seus perfis de acesso.",
  },
  {
    label: "Etiquetas",
    title: "Cadastro de Etiquetas",
    subtitle: "Crie etiquetas para organizar e categorizar suas conversas.",
  },
  {
    label: "Mensagens Rápidas",
    title: "Mensagens Rápidas",
    subtitle: "Crie mensagens que podem ser usadas pelo seu time para agilizar o atendimento.",
  },
  { label: "Conclusão", title: "Conclusão", subtitle: null },
] as const;

export const SUPERVISOR_DEFAULT_PERMISSIONS = [
  "dashboard.read",
  "dashboard.create",
  "dashboard.update",
  "dashboard.delete",
  "conversations.read",
  "leads.read",
  "messages.send",
  "chat.messages.edit",
  "chat.messages.delete",
  "chat.agent_name.show",
  "history.read",
  "conversations.assign",
  "chat.phone.read",
  "chat.conversations.view_all_active",
  "contacts.read",
  "contacts.create",
  "contacts.update",
  "contacts.delete",
  "contacts.additional_fields.read",
  "groups.read",
  "groups.create",
  "groups.update",
  "groups.leave",
  "users.read",
  "users.create",
  "users.update",
  "users.delete",
  "departments.read",
  "departments.create",
  "departments.update",
  "departments.delete",
  "chat.tags.read",
  "chat.tags.create",
  "chat.tags.update",
  "chat.tags.delete",
  "chat.quick_replies.read",
  "chat.quick_replies.create",
  "chat.quick_replies.update",
  "chat.quick_replies.delete",
] as const;

export const ATTENDANT_DEFAULT_PERMISSIONS = [
  "dashboard.read",
  "conversations.read",
  "leads.read",
  "messages.send",
  "chat.messages.edit",
  "chat.messages.delete",
  "chat.agent_name.show",
  "history.read",
  "conversations.assign",
  "chat.phone.read",
  "contacts.read",
  "contacts.create",
  "contacts.update",
  "groups.read",
  "chat.tags.read",
  "chat.quick_replies.read",
] as const;

export const DEFAULT_DEPARTMENTS = [
  {
    name: "Atendimento",
    description: "Central de atendimento",
    color: "#10B981",
    icon: "headset" as const,
    favorite: true,
  },
  {
    name: "Comercial",
    description: "Equipe de vendas",
    color: "#2563EB",
    icon: "shopping-cart" as const,
    favorite: false,
  },
  {
    name: "Financeiro",
    description: "Equipe financeira",
    color: "#EF4444",
    icon: "dollar-sign" as const,
    favorite: false,
  },
] as const;

export const DEFAULT_QUICK_REPLIES = [
  {
    title: "Saudação Inicial",
    shortcut: "oi",
    content:
      "{{saudacao}}! 👋\nSeja bem-vindo ao atendimento da {{instancia}}.\nComo posso te ajudar?",
  },
  {
    title: "Horário de Atendimento",
    shortcut: "horario",
    content:
      "⏰ Nosso horário de atendimento é de segunda a sexta-feira, das 8h às 18h.\nDeixe sua mensagem e retornaremos assim que possível.",
  },
  {
    title: "Agradecimento",
    shortcut: "obrigado",
    content: "*{{nome}}*,\nObrigado pelo seu contato! 🙏\nFoi um prazer te atender.",
  },
  {
    title: "Encerramento",
    shortcut: "tchau",
    content: "Se precisar de mais alguma coisa, é só chamar. 😊",
  },
] as const;

export const DEFAULT_TAGS = [
  { name: "Novo Cliente", description: "Novo cliente", color: "#1687F8" },
  { name: "Em Atendimento", description: "Em atendimento", color: "#12B76A" },
  { name: "Aguardando Retorno", description: "Aguardando retorno", color: "#F4B400" },
  { name: "Problema Técnico", description: "Problema técnico", color: "#F04438" },
  { name: "Fechado", description: "Fechado", color: "#7A2CF3" },
] as const;

export function onboardingTagDescription(description?: string | null) {
  return description?.trim() || undefined;
}
