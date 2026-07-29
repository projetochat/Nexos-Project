/* ============================================================
   Nexo · SaaS Mock Data
   Dados fictícios para o Painel Super Admin (proprietário do
   SaaS). Preparado para ser trocado por Supabase / PostgreSQL
   sem alteração das telas.
   ============================================================ */

export type PlanoSaaS = {
  id: string;
  nome: string;
  preco: number;
  ciclo: "mensal" | "anual";
  limites: { operadores: number; numeros: number; mensagens: number };
  recursos: string[];
  ativo: boolean;
  assinantes: number;
};

export type TenantStatus = "ativa" | "trial" | "bloqueada" | "cancelada" | "inadimplente";

export type Tenant = {
  id: string;
  nome: string;
  cnpj: string;
  planoId: string;
  status: TenantStatus;
  operadores: number;
  numeros: number;
  mensagensMes: number;
  mrr: number;
  criadaEm: number;
  ultimoAcesso: number;
  responsavel: string;
  email: string;
  cidade: string;
};

export type Assinatura = {
  id: string;
  tenantId: string;
  planoId: string;
  status: "ativa" | "pausada" | "cancelada" | "trial";
  inicio: number;
  proximaCobranca: number;
  valor: number;
};

export type Fatura = {
  id: string;
  tenantId: string;
  numero: string;
  valor: number;
  status: "paga" | "aberta" | "vencida" | "estornada";
  emissao: number;
  vencimento: number;
};

export type TicketSuporte = {
  id: string;
  tenantId: string;
  titulo: string;
  categoria: "Financeiro" | "Técnico" | "Onboarding" | "Bug" | "Melhoria";
  prioridade: "baixa" | "media" | "alta" | "critica";
  status: "aberto" | "em_andamento" | "resolvido" | "aguardando_cliente";
  criadoEm: number;
  atualizadoEm: number;
  autor: string;
};

export type AuditLog = {
  id: string;
  actorId: string;
  actorNome: string;
  acao: string;
  entidade: string;
  entidadeId?: string;
  ip: string;
  createdAt: number;
};

export type SystemLog = {
  id: string;
  nivel: "info" | "warn" | "error" | "debug";
  servico: string;
  mensagem: string;
  createdAt: number;
};

/* ---------- Planos ---------- */
export const planos: PlanoSaaS[] = [
  {
    id: "plan-starter",
    nome: "Starter",
    preco: 149,
    ciclo: "mensal",
    limites: { operadores: 3, numeros: 1, mensagens: 5000 },
    recursos: ["Inbox unificada", "Etiquetas", "Relatórios básicos"],
    ativo: true,
    assinantes: 42,
  },
  {
    id: "plan-pro",
    nome: "Pro",
    preco: 349,
    ciclo: "mensal",
    limites: { operadores: 10, numeros: 3, mensagens: 25000 },
    recursos: [
      "Tudo do Starter",
      "Chatbot",
      "Automações",
      "Campanhas",
      "API pública",
    ],
    ativo: true,
    assinantes: 87,
  },
  {
    id: "plan-business",
    nome: "Business",
    preco: 799,
    ciclo: "mensal",
    limites: { operadores: 30, numeros: 10, mensagens: 100000 },
    recursos: [
      "Tudo do Pro",
      "SLA prioritário",
      "IA generativa",
      "Integrações premium",
      "SSO",
    ],
    ativo: true,
    assinantes: 34,
  },
  {
    id: "plan-enterprise",
    nome: "Enterprise",
    preco: 2400,
    ciclo: "mensal",
    limites: { operadores: 999, numeros: 999, mensagens: 1000000 },
    recursos: [
      "Tudo do Business",
      "Suporte dedicado 24/7",
      "Ambiente isolado",
      "Auditoria estendida",
      "Contrato personalizado",
    ],
    ativo: true,
    assinantes: 9,
  },
];

/* ---------- Tenants (empresas contratantes) ---------- */
const tenantSeeds: Array<Partial<Tenant> & { nome: string; cidade: string; responsavel: string }> = [
  { nome: "Acme Corp", cidade: "São Paulo, SP", responsavel: "Ana Ribeiro", status: "ativa", planoId: "plan-business" },
  { nome: "Vitalis Saúde", cidade: "Rio de Janeiro, RJ", responsavel: "Marcos Lima", status: "ativa", planoId: "plan-pro" },
  { nome: "Northwind Logística", cidade: "Curitiba, PR", responsavel: "Patrícia Souza", status: "ativa", planoId: "plan-pro" },
  { nome: "Loja Pantone", cidade: "Belo Horizonte, MG", responsavel: "Rafael Duarte", status: "trial", planoId: "plan-starter" },
  { nome: "Studio Aurora", cidade: "Porto Alegre, RS", responsavel: "Camila Prado", status: "ativa", planoId: "plan-starter" },
  { nome: "Fintra Payments", cidade: "São Paulo, SP", responsavel: "Diego Ferraz", status: "ativa", planoId: "plan-enterprise" },
  { nome: "Nimbus Educação", cidade: "Florianópolis, SC", responsavel: "Renata Chagas", status: "inadimplente", planoId: "plan-pro" },
  { nome: "Casa Bertoli", cidade: "Salvador, BA", responsavel: "Otávio Bertoli", status: "ativa", planoId: "plan-starter" },
  { nome: "Verdant Alimentos", cidade: "Recife, PE", responsavel: "Lívia Moura", status: "bloqueada", planoId: "plan-starter" },
  { nome: "TechForge Studios", cidade: "São Paulo, SP", responsavel: "Guilherme Nakata", status: "ativa", planoId: "plan-business" },
  { nome: "Boreal Turismo", cidade: "Balneário Camboriú, SC", responsavel: "Isabela Rocha", status: "cancelada", planoId: "plan-pro" },
  { nome: "Farma Prime", cidade: "Brasília, DF", responsavel: "Ricardo Peixoto", status: "ativa", planoId: "plan-pro" },
  { nome: "Zenit Consultoria", cidade: "Campinas, SP", responsavel: "Aline Toledo", status: "ativa", planoId: "plan-business" },
  { nome: "Orion Imobiliária", cidade: "Goiânia, GO", responsavel: "Fernando Cotta", status: "trial", planoId: "plan-pro" },
  { nome: "Lumen Design", cidade: "São Paulo, SP", responsavel: "Beatriz Andrade", status: "ativa", planoId: "plan-starter" },
  { nome: "Helix Automotive", cidade: "São Bernardo, SP", responsavel: "Thiago Menezes", status: "ativa", planoId: "plan-business" },
  { nome: "Solaris Energia", cidade: "Fortaleza, CE", responsavel: "Nathália Reis", status: "ativa", planoId: "plan-enterprise" },
  { nome: "Prisma Advogados", cidade: "Belo Horizonte, MG", responsavel: "Eduardo Vilhena", status: "ativa", planoId: "plan-pro" },
  { nome: "Delta Móveis", cidade: "Bento Gonçalves, RS", responsavel: "Sabrina Costa", status: "inadimplente", planoId: "plan-starter" },
  { nome: "Kairós Marketing", cidade: "São Paulo, SP", responsavel: "Vinicius Barros", status: "ativa", planoId: "plan-pro" },
];

const rnd = (seed: number) => {
  let x = seed;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
};
const r = rnd(42);

export const tenants: Tenant[] = tenantSeeds.map((seed, i) => {
  const plano = planos.find((p) => p.id === seed.planoId)!;
  const operadores = Math.max(2, Math.floor(r() * plano.limites.operadores * 0.7));
  const numeros = Math.max(1, Math.floor(r() * plano.limites.numeros));
  return {
    id: seed.nome === "Acme Corp" ? "emp-acme" : `ten-${(i + 1).toString().padStart(3, "0")}`,
    nome: seed.nome,
    cnpj: `${10 + i}.${100 + i}.${200 + i}/0001-${(i * 7 + 10).toString().padStart(2, "0")}`,
    planoId: seed.planoId!,
    status: seed.status as TenantStatus,
    operadores,
    numeros,
    mensagensMes: Math.floor(r() * plano.limites.mensagens * 0.8),
    mrr: seed.status === "ativa" || seed.status === "inadimplente" ? plano.preco : 0,
    criadaEm: Date.now() - Math.floor(r() * 1000 * 60 * 60 * 24 * 400),
    ultimoAcesso: Date.now() - Math.floor(r() * 1000 * 60 * 60 * 72),
    responsavel: seed.responsavel,
    email: `${seed.responsavel.split(" ")[0].toLowerCase()}@${seed.nome.toLowerCase().replace(/[^a-z]/g, "")}.com.br`,
    cidade: seed.cidade,
  };
});

/* ---------- Assinaturas + Faturas ---------- */
export const assinaturas: Assinatura[] = tenants
  .filter((t) => t.status !== "cancelada")
  .map((t, i) => {
    const plano = planos.find((p) => p.id === t.planoId)!;
    const status: Assinatura["status"] =
      t.status === "trial" ? "trial" : t.status === "bloqueada" ? "pausada" : "ativa";
    return {
      id: `sub-${(i + 1).toString().padStart(3, "0")}`,
      tenantId: t.id,
      planoId: t.planoId,
      status,
      inicio: t.criadaEm,
      proximaCobranca: Date.now() + Math.floor(r() * 1000 * 60 * 60 * 24 * 30),
      valor: plano.preco,
    };
  });

export const faturas: Fatura[] = [];
tenants.forEach((t, ti) => {
  if (t.status === "cancelada" || t.status === "trial") return;
  const plano = planos.find((p) => p.id === t.planoId)!;
  for (let i = 0; i < 6; i++) {
    const emissao = Date.now() - i * 30 * 24 * 60 * 60 * 1000;
    let status: Fatura["status"] = "paga";
    if (i === 0 && t.status === "inadimplente") status = "vencida";
    else if (i === 0) status = "aberta";
    faturas.push({
      id: `fat-${ti}-${i}`,
      tenantId: t.id,
      numero: `INV-${(2025000 + ti * 6 + i).toString()}`,
      valor: plano.preco,
      status,
      emissao,
      vencimento: emissao + 10 * 24 * 60 * 60 * 1000,
    });
  }
});

/* ---------- Tickets de suporte ---------- */
const ticketTitulos = [
  "Números não sincronizando",
  "Erro ao importar contatos",
  "Solicitação de upgrade de plano",
  "Chatbot não responde variáveis",
  "Preciso ajuda com onboarding",
  "Fatura em duplicidade",
  "Não recebo notificações",
  "Como configurar horários",
  "Integração com CRM parada",
  "Relatório com dados divergentes",
  "Solicitar cancelamento",
  "Ajustar limite de operadores",
];
export const tickets: TicketSuporte[] = ticketTitulos.map((t, i) => ({
  id: `tk-${(i + 1).toString().padStart(4, "0")}`,
  tenantId: tenants[i % tenants.length].id,
  titulo: t,
  categoria: (["Financeiro", "Técnico", "Onboarding", "Bug", "Melhoria"] as const)[i % 5],
  prioridade: (["baixa", "media", "alta", "critica"] as const)[i % 4],
  status: (["aberto", "em_andamento", "resolvido", "aguardando_cliente"] as const)[i % 4],
  criadoEm: Date.now() - i * 1000 * 60 * 60 * 5,
  atualizadoEm: Date.now() - i * 1000 * 60 * 60 * 2,
  autor: tenants[i % tenants.length].responsavel,
}));

/* ---------- Auditoria + Logs ---------- */
const auditActions = [
  { acao: "Impersonou empresa", entidade: "tenant" },
  { acao: "Alterou plano", entidade: "subscription" },
  { acao: "Bloqueou empresa", entidade: "tenant" },
  { acao: "Reativou empresa", entidade: "tenant" },
  { acao: "Estornou fatura", entidade: "invoice" },
  { acao: "Criou usuário admin", entidade: "user" },
  { acao: "Aprovou solicitação de upgrade", entidade: "subscription" },
  { acao: "Exportou base de clientes", entidade: "tenant" },
  { acao: "Encerrou sessão administrativa", entidade: "session" },
];
export const auditLogs: AuditLog[] = Array.from({ length: 40 }, (_, i) => {
  const a = auditActions[i % auditActions.length];
  return {
    id: `aud-${i}`,
    actorId: "u-owner",
    actorNome: i % 3 === 0 ? "Alex Nascimento" : "Sistema Nexo",
    acao: a.acao,
    entidade: a.entidade,
    entidadeId: tenants[i % tenants.length].id,
    ip: `189.${20 + (i % 200)}.${10 + (i % 240)}.${1 + (i % 250)}`,
    createdAt: Date.now() - i * 1000 * 60 * 37,
  };
});

const systemMessages = [
  { nivel: "info" as const, servico: "gateway", mensagem: "Sessão de webhook estabelecida" },
  { nivel: "warn" as const, servico: "queue", mensagem: "Fila BullMQ acima de 80% de utilização" },
  { nivel: "error" as const, servico: "evolution", mensagem: "Reconexão do número após timeout" },
  { nivel: "info" as const, servico: "auth", mensagem: "Novo login efetuado" },
  { nivel: "debug" as const, servico: "socket.io", mensagem: "Cliente reconectado ao room" },
  { nivel: "info" as const, servico: "billing", mensagem: "Fatura gerada com sucesso" },
  { nivel: "warn" as const, servico: "storage", mensagem: "Bucket R2 próximo do limite" },
];
export const systemLogs: SystemLog[] = Array.from({ length: 60 }, (_, i) => {
  const m = systemMessages[i % systemMessages.length];
  return {
    id: `log-${i}`,
    nivel: m.nivel,
    servico: m.servico,
    mensagem: m.mensagem,
    createdAt: Date.now() - i * 1000 * 60 * 4,
  };
});

/* ---------- Métricas financeiras derivadas ---------- */
export function computeSaasMetrics() {
  const ativas = tenants.filter((t) => t.status === "ativa" || t.status === "inadimplente");
  const trial = tenants.filter((t) => t.status === "trial");
  const bloqueadas = tenants.filter((t) => t.status === "bloqueada");
  const canceladas = tenants.filter((t) => t.status === "cancelada");
  const inadimplentes = tenants.filter((t) => t.status === "inadimplente");
  const mrr = ativas.reduce((s, t) => s + t.mrr, 0);
  const arr = mrr * 12;
  const totalOperadores = tenants.reduce((s, t) => s + t.operadores, 0);
  const totalNumeros = tenants.reduce((s, t) => s + t.numeros, 0);
  const churn = canceladas.length / tenants.length;
  const conversaoTrial = 0.34;
  return {
    empresasTotal: tenants.length,
    empresasAtivas: ativas.length,
    empresasTrial: trial.length,
    empresasBloqueadas: bloqueadas.length,
    empresasCanceladas: canceladas.length,
    empresasInadimplentes: inadimplentes.length,
    totalOperadores,
    totalNumeros,
    mrr,
    arr,
    churn,
    conversaoTrial,
    crescimentoMensal: 0.128,
    ticketMedio: mrr / Math.max(ativas.length, 1),
  };
}

/* ---------- Série histórica MRR (últimos 12 meses) ---------- */
export function mrrHistory() {
  const base = computeSaasMetrics().mrr;
  const meses = ["Ago", "Set", "Out", "Nov", "Dez", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul"];
  return meses.map((m, i) => {
    const growth = 0.88 + i * 0.011;
    return { mes: m, mrr: Math.round(base * growth), novos: 3 + (i % 5), churn: 1 + (i % 3) };
  });
}
