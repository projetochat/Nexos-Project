import { faker } from "@faker-js/faker/locale/pt_BR";
import type {
  Atendente,
  Campanha,
  Cliente,
  Conversa,
  Departamento,
  Empresa,
  Etiqueta,
  Mensagem,
  Nota,
} from "./types";

/* Deterministic seed → mesmo dataset a cada boot. */
faker.seed(20240712);

const now = Date.parse("2026-07-16T18:00:00Z");
const day = 86_400_000;

const pick = <T>(arr: readonly T[]) => arr[Math.floor(faker.number.float() * arr.length)];

/* ---------------- Empresas (15) ---------------- */
const SEGMENTOS = ["E-commerce", "SaaS", "Educação", "Saúde", "Fintech", "Logística", "Varejo", "Serviços", "Indústria"];
const PLANOS = ["Free", "Trial", "Pro", "Enterprise"] as const;

export const empresas: Empresa[] = Array.from({ length: 15 }, (_, i) => ({
  id: `emp-${(i + 1).toString().padStart(3, "0")}`,
  nome: faker.company.name(),
  segmento: pick(SEGMENTOS),
  plano: pick(PLANOS),
  cnpj: faker.string.numeric(14),
  contatos: faker.number.int({ min: 3, max: 80 }),
  createdAt: now - faker.number.int({ min: 30, max: 720 }) * day,
}));

/* ---------------- Departamentos (12) ---------------- */
const DEPTOS = [
  ["Comercial", "#6366f1"],
  ["Suporte Nível 1", "#06b6d4"],
  ["Suporte Nível 2", "#0ea5e9"],
  ["Financeiro", "#f59e0b"],
  ["Cobrança", "#ef4444"],
  ["Sucesso do Cliente", "#10b981"],
  ["Onboarding", "#8b5cf6"],
  ["Retenção", "#ec4899"],
  ["Produto", "#3b82f6"],
  ["Marketing", "#a855f7"],
  ["Parcerias", "#14b8a6"],
  ["Jurídico", "#64748b"],
];

export const departamentos: Departamento[] = DEPTOS.map(([nome, cor], i) => ({
  id: `dep-${(i + 1).toString().padStart(3, "0")}`,
  nome,
  cor,
  descricao: `Equipe responsável pela área de ${nome.toLowerCase()}.`,
}));

/* ---------------- Etiquetas ---------------- */
const ETIQ = [
  ["VIP", "#a855f7"],
  ["Cobrança", "#f59e0b"],
  ["Suporte", "#06b6d4"],
  ["Vendas", "#10b981"],
  ["Reclamação", "#ef4444"],
  ["Elogio", "#22c55e"],
  ["Prospect", "#3b82f6"],
  ["Trial", "#eab308"],
  ["Enterprise", "#8b5cf6"],
  ["Urgente", "#dc2626"],
];

export const etiquetas: Etiqueta[] = ETIQ.map(([nome, cor], i) => ({
  id: `tag-${(i + 1).toString().padStart(3, "0")}`,
  nome,
  cor,
}));

/* ---------------- Atendentes (30) ---------------- */
const CARGOS = ["Atendente", "Atendente sênior", "Supervisor(a)", "Coordenador(a)", "Especialista"];
const STATUS_ATEND = ["online", "online", "online", "ausente", "offline"] as const;

export const atendentes: Atendente[] = Array.from({ length: 30 }, (_, i) => {
  const nome = faker.person.fullName();
  return {
    id: `at-${(i + 1).toString().padStart(3, "0")}`,
    nome,
    email: faker.internet.email({ firstName: nome.split(" ")[0] }).toLowerCase(),
    cargo: i < 3 ? "Supervisor(a)" : pick(CARGOS),
    departamentoId: pick(departamentos).id,
    status: pick(STATUS_ATEND),
    csat: Number((4 + faker.number.float() * 1).toFixed(1)),
    emAtendimento: faker.number.int({ min: 0, max: 14 }),
    resolvidas: faker.number.int({ min: 40, max: 620 }),
    admissao: now - faker.number.int({ min: 60, max: 900 }) * day,
  };
});

/* ---------------- Clientes (120) ---------------- */
const STATUS_CLIENTE = ["Ativo", "Ativo", "Ativo", "VIP", "Trial", "Inadimplente", "Perdido"] as const;

export const clientes: Cliente[] = Array.from({ length: 120 }, (_, i) => {
  const nome = faker.person.fullName();
  const tagsCount = faker.number.int({ min: 0, max: 3 });
  const tagsSet = new Set<string>();
  for (let t = 0; t < tagsCount; t++) tagsSet.add(pick(etiquetas).id);
  const notasCount = faker.number.int({ min: 0, max: 3 });
  const notas: Nota[] = Array.from({ length: notasCount }, () => ({
    id: faker.string.uuid(),
    autorId: pick(atendentes).id,
    texto: faker.lorem.sentence({ min: 6, max: 18 }),
    createdAt: now - faker.number.int({ min: 1, max: 90 }) * day,
  }));
  return {
    id: `cli-${(i + 1).toString().padStart(3, "0")}`,
    nome,
    email: faker.internet.email({ firstName: nome.split(" ")[0] }).toLowerCase(),
    telefone: `+55 ${faker.string.numeric(2)} 9${faker.string.numeric(4)}-${faker.string.numeric(4)}`,
    empresaId: pick(empresas).id,
    status: pick(STATUS_CLIENTE),
    tags: Array.from(tagsSet),
    ticketMedio: faker.number.int({ min: 90, max: 4500 }),
    ultimaCompra: now - faker.number.int({ min: 0, max: 180 }) * day,
    createdAt: now - faker.number.int({ min: 30, max: 720 }) * day,
    observacoes: faker.lorem.sentence(),
    notas,
  };
});

/* ---------------- Conversas (300) + Mensagens (~2000) ---------------- */
const STATUS_CONV = ["aguardando", "atendendo", "atendendo", "resolvida", "resolvida", "resolvida", "perdida", "arquivada"] as const;
const CANAIS = ["WhatsApp", "WhatsApp Business"] as const;

const FRASES_CLIENTE = [
  "Boa tarde! Preciso de ajuda com o meu pedido.",
  "Comprei ontem e ainda não recebi nenhuma atualização.",
  "Qual o valor do plano Pro?",
  "Vocês têm desconto para pagamento anual?",
  "Não consegui acessar minha conta.",
  "O boleto que recebi está com o valor incorreto.",
  "Quero cancelar minha assinatura, o que preciso fazer?",
  "Vocês fazem integração com meu ERP?",
  "Adorei o produto, muito obrigado!",
  "Poderia me enviar a nota fiscal novamente?",
  "Estou com problema no login do painel.",
  "Como faço para adicionar mais usuários?",
  "Preciso alterar meu endereço de cobrança.",
  "O suporte de vocês é excelente.",
  "Vocês têm plano para times maiores?",
];

const FRASES_AGENTE = [
  "Olá! Tudo bem? Vou verificar isso agora mesmo pra você.",
  "Perfeito, já localizei seu cadastro aqui.",
  "Me passa o número do pedido, por favor?",
  "Vou transferir você para o time responsável.",
  "Consegue me enviar um print da tela?",
  "Já estou processando a correção, um instante.",
  "Confirmando: você deseja alterar para o plano Enterprise?",
  "Fique tranquilo(a), vou resolver isso agora.",
  "Enviei o novo boleto no seu e-mail cadastrado.",
  "Muito obrigado(a) pelo contato e pelo elogio!",
  "Consegui identificar o problema, foi resolvido.",
  "Vou registrar isso como sugestão pro time de produto.",
];

export const conversas: Conversa[] = [];
export const mensagens: Mensagem[] = [];

for (let i = 0; i < 300; i++) {
  const cliente = pick(clientes);
  const status = pick(STATUS_CONV);
  const atendente = status === "aguardando" ? undefined : pick(atendentes);
  const dep = pick(departamentos);
  const createdAt = now - faker.number.int({ min: 0, max: 60 }) * day - faker.number.int({ min: 0, max: 20 }) * 3_600_000;
  const msgCount = faker.number.int({ min: 3, max: 12 });
  const tagsCount = faker.number.int({ min: 0, max: 2 });
  const tagsSet = new Set<string>();
  for (let t = 0; t < tagsCount; t++) tagsSet.add(pick(etiquetas).id);
  const conv: Conversa = {
    id: `conv-${(i + 1).toString().padStart(4, "0")}`,
    clienteId: cliente.id,
    atendenteId: atendente?.id,
    departamentoId: dep.id,
    status,
    canal: pick(CANAIS),
    favorito: faker.number.float() < 0.15,
    naoLidas: status === "aguardando" ? faker.number.int({ min: 1, max: 4 }) : 0,
    tags: Array.from(tagsSet),
    createdAt,
    updatedAt: createdAt,
    primeiraRespostaS: atendente ? faker.number.int({ min: 30, max: 900 }) : undefined,
    duracaoS: status === "resolvida" ? faker.number.int({ min: 300, max: 7200 }) : undefined,
  };

  let lastAt = createdAt;
  for (let m = 0; m < msgCount; m++) {
    lastAt += faker.number.int({ min: 20, max: 600 }) * 1000;
    const fromClient = m === 0 || (m % 2 === 0 && faker.number.float() < 0.6);
    if (fromClient) {
      mensagens.push({
        id: faker.string.uuid(),
        conversaId: conv.id,
        tipo: "cliente",
        texto: pick(FRASES_CLIENTE),
        createdAt: lastAt,
      });
    } else if (atendente) {
      mensagens.push({
        id: faker.string.uuid(),
        conversaId: conv.id,
        tipo: "atendente",
        autorId: atendente.id,
        texto: pick(FRASES_AGENTE),
        createdAt: lastAt,
      });
    }
  }
  conv.updatedAt = lastAt;
  conversas.push(conv);
}

// Garante ~2000 mensagens: adiciona conversas extras se necessário
while (mensagens.length < 2000) {
  const conv = pick(conversas);
  const atendente = conv.atendenteId ? atendentes.find((a) => a.id === conv.atendenteId) : undefined;
  const fromClient = faker.number.float() < 0.55 || !atendente;
  conv.updatedAt += faker.number.int({ min: 30, max: 300 }) * 1000;
  mensagens.push({
    id: faker.string.uuid(),
    conversaId: conv.id,
    tipo: fromClient ? "cliente" : "atendente",
    autorId: fromClient ? undefined : atendente!.id,
    texto: fromClient ? pick(FRASES_CLIENTE) : pick(FRASES_AGENTE),
    createdAt: conv.updatedAt,
  });
}

conversas.sort((a, b) => b.updatedAt - a.updatedAt);
mensagens.sort((a, b) => a.createdAt - b.createdAt);

/* ---------------- Campanhas ---------------- */
const NOMES_CAMP = [
  "Black Friday · Reativação",
  "Boas-vindas Onboarding",
  "Upgrade Pro → Enterprise",
  "Aviso de vencimento",
  "NPS Trimestral",
  "Lançamento módulo IA",
  "Reengajamento inativos 90d",
  "Convite Webinar Julho",
];

const STATUS_CAMP = ["rascunho", "agendada", "enviando", "concluida", "pausada"] as const;

export const campanhas: Campanha[] = NOMES_CAMP.map((nome, i) => {
  const publico = faker.number.int({ min: 200, max: 4200 });
  const status = i < 3 ? "concluida" : pick(STATUS_CAMP);
  const enviadas = status === "rascunho" ? 0 : Math.floor(publico * (0.6 + faker.number.float() * 0.4));
  const entregues = Math.floor(enviadas * (0.9 + faker.number.float() * 0.09));
  const lidas = Math.floor(entregues * (0.55 + faker.number.float() * 0.35));
  const respondidas = Math.floor(lidas * (0.1 + faker.number.float() * 0.25));
  return {
    id: `camp-${(i + 1).toString().padStart(3, "0")}`,
    nome,
    status,
    publico,
    enviadas,
    entregues,
    lidas,
    respondidas,
    criadaEm: now - faker.number.int({ min: 1, max: 90 }) * day,
    agendadaPara: status === "agendada" ? now + faker.number.int({ min: 1, max: 14 }) * day : undefined,
  };
});
