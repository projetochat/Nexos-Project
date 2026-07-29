export type ID = string;

export type Empresa = {
  id: ID;
  nome: string;
  segmento: string;
  plano: "Free" | "Trial" | "Pro" | "Enterprise";
  cnpj: string;
  contatos: number;
  createdAt: number;
};

export type Departamento = {
  id: ID;
  nome: string;
  cor: string;
  descricao: string;
};

export type Etiqueta = {
  id: ID;
  nome: string;
  cor: string;
};

export type Atendente = {
  id: ID;
  nome: string;
  email: string;
  cargo: string;
  departamentoId: ID;
  perfilId?: string;
  status: "online" | "ausente" | "offline";
  csat: number;
  emAtendimento: number;
  resolvidas: number;
  admissao: number;
  ativo?: boolean;
  senha?: string;
  avatarUrl?: string;
};

export type Nota = {
  id: ID;
  autorId: ID;
  texto: string;
  createdAt: number;
};

export type Cliente = {
  id: ID;
  nome: string;
  email: string;
  telefone: string;
  empresaId: ID;
  status: "Ativo" | "VIP" | "Trial" | "Inadimplente" | "Perdido";
  tags: ID[];
  ticketMedio: number;
  ultimaCompra: number;
  createdAt: number;
  observacoes: string;
  notas: Nota[];
};

export type Mensagem = {
  id: ID;
  conversaId: ID;
  tipo: "cliente" | "atendente" | "nota" | "sistema";
  autorId?: ID;
  texto: string;
  createdAt: number;
};

export type ConversaStatus =
  | "aguardando"
  | "atendendo"
  | "resolvida"
  | "perdida"
  | "arquivada";

export type Conversa = {
  id: ID;
  clienteId: ID;
  atendenteId?: ID;
  departamentoId: ID;
  status: ConversaStatus;
  canal: "WhatsApp" | "WhatsApp Business";
  favorito: boolean;
  naoLidas: number;
  tags: ID[];
  createdAt: number;
  updatedAt: number;
  primeiraRespostaS?: number;
  duracaoS?: number;
};

export type Campanha = {
  id: ID;
  nome: string;
  status: "rascunho" | "agendada" | "enviando" | "concluida" | "pausada";
  publico: number;
  enviadas: number;
  entregues: number;
  lidas: number;
  respondidas: number;
  criadaEm: number;
  agendadaPara?: number;
  etiquetasClientes?: ID[];
  etiquetasContatos?: ID[];
  etiquetasInstancias?: ID[];
  intervaloSegundos?: number;
  aceitouIntervalo?: boolean;
};
