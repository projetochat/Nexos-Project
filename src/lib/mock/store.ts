import { create } from "zustand";
import {
  atendentes as seedAtendentes,
  campanhas as seedCampanhas,
  clientes as seedClientes,
  conversas as seedConversas,
  departamentos as seedDeptos,
  empresas as seedEmpresas,
  etiquetas as seedEtiquetas,
  mensagens as seedMensagens,
} from "./seed";
import type {
  Atendente,
  Campanha,
  Cliente,
  Conversa,
  ConversaStatus,
  Departamento,
  Empresa,
  Etiqueta,
  ID,
  Mensagem,
  Nota,
} from "./types";

let counter = 1;
const genId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${(counter++).toString(36)}`;

type State = {
  empresas: Empresa[];
  clientes: Cliente[];
  atendentes: Atendente[];
  departamentos: Departamento[];
  etiquetas: Etiqueta[];
  conversas: Conversa[];
  mensagens: Mensagem[];
  campanhas: Campanha[];
  currentUserId: ID;

  /* Clientes */
  createCliente: (data: Partial<Cliente>) => Cliente;
  updateCliente: (id: ID, patch: Partial<Cliente>) => void;
  deleteCliente: (id: ID) => void;

  /* Empresas */
  createEmpresa: (data: Partial<Empresa>) => Empresa;
  updateEmpresa: (id: ID, patch: Partial<Empresa>) => void;
  deleteEmpresa: (id: ID) => void;

  /* Atendentes */
  createAtendente: (data: Partial<Atendente>) => Atendente;
  updateAtendente: (id: ID, patch: Partial<Atendente>) => void;
  deleteAtendente: (id: ID) => void;

  /* Departamentos */
  createDepartamento: (data: Partial<Departamento>) => Departamento;
  updateDepartamento: (id: ID, patch: Partial<Departamento>) => void;
  deleteDepartamento: (id: ID) => void;

  /* Etiquetas */
  createEtiqueta: (data: Partial<Etiqueta>) => Etiqueta;
  updateEtiqueta: (id: ID, patch: Partial<Etiqueta>) => void;
  deleteEtiqueta: (id: ID) => void;

  /* Campanhas */
  createCampanha: (data: Partial<Campanha>) => Campanha;
  updateCampanha: (id: ID, patch: Partial<Campanha>) => void;
  deleteCampanha: (id: ID) => void;

  /* Conversas */
  sendMessage: (conversaId: ID, texto: string) => void;
  addNotaConversa: (conversaId: ID, texto: string) => void;
  transferConversa: (conversaId: ID, atendenteId: ID) => void;
  moveConversaDepartamento: (conversaId: ID, departamentoId: ID) => void;
  toggleFavoritoConversa: (conversaId: ID) => void;
  setConversaStatus: (conversaId: ID, status: ConversaStatus) => void;
  addTagConversa: (conversaId: ID, tagId: ID) => void;
  removeTagConversa: (conversaId: ID, tagId: ID) => void;
  markRead: (conversaId: ID) => void;

  /* Notas cliente */
  addNotaCliente: (clienteId: ID, texto: string) => void;
};

export const useStore = create<State>((set, get) => ({
  empresas: seedEmpresas,
  clientes: seedClientes,
  atendentes: seedAtendentes,
  departamentos: seedDeptos,
  etiquetas: seedEtiquetas,
  conversas: seedConversas,
  mensagens: seedMensagens,
  campanhas: seedCampanhas,
  currentUserId: seedAtendentes[0].id,

  createCliente: (d) => {
    const c: Cliente = {
      id: genId("cli"),
      nome: d.nome ?? "Sem nome",
      email: d.email ?? "",
      telefone: d.telefone ?? "",
      empresaId: d.empresaId ?? get().empresas[0].id,
      status: d.status ?? "Ativo",
      tags: d.tags ?? [],
      ticketMedio: d.ticketMedio ?? 0,
      ultimaCompra: d.ultimaCompra ?? Date.now(),
      createdAt: Date.now(),
      observacoes: d.observacoes ?? "",
      notas: [],
    };
    set((s) => ({ clientes: [c, ...s.clientes] }));
    return c;
  },
  updateCliente: (id, patch) =>
    set((s) => ({ clientes: s.clientes.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
  deleteCliente: (id) =>
    set((s) => ({ clientes: s.clientes.filter((c) => c.id !== id) })),

  createEmpresa: (d) => {
    const e: Empresa = {
      id: genId("emp"),
      nome: d.nome ?? "Sem nome",
      segmento: d.segmento ?? "Serviços",
      plano: d.plano ?? "Trial",
      cnpj: d.cnpj ?? "",
      contatos: 0,
      createdAt: Date.now(),
    };
    set((s) => ({ empresas: [e, ...s.empresas] }));
    return e;
  },
  updateEmpresa: (id, patch) =>
    set((s) => ({ empresas: s.empresas.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),
  deleteEmpresa: (id) => set((s) => ({ empresas: s.empresas.filter((e) => e.id !== id) })),

  createAtendente: (d) => {
    const a: Atendente = {
      id: genId("at"),
      nome: d.nome ?? "Novo atendente",
      email: d.email ?? "",
      cargo: d.cargo ?? "Atendente",
      departamentoId: d.departamentoId ?? get().departamentos[0].id,
      status: "online",
      csat: 0,
      emAtendimento: 0,
      resolvidas: 0,
      admissao: Date.now(),
    };
    set((s) => ({ atendentes: [a, ...s.atendentes] }));
    return a;
  },
  updateAtendente: (id, patch) =>
    set((s) => ({ atendentes: s.atendentes.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
  deleteAtendente: (id) =>
    set((s) => ({ atendentes: s.atendentes.filter((a) => a.id !== id) })),

  createDepartamento: (d) => {
    const dep: Departamento = {
      id: genId("dep"),
      nome: d.nome ?? "Novo departamento",
      cor: d.cor ?? "#6366f1",
      descricao: d.descricao ?? "",
    };
    set((s) => ({ departamentos: [dep, ...s.departamentos] }));
    return dep;
  },
  updateDepartamento: (id, patch) =>
    set((s) => ({ departamentos: s.departamentos.map((d) => (d.id === id ? { ...d, ...patch } : d)) })),
  deleteDepartamento: (id) =>
    set((s) => ({ departamentos: s.departamentos.filter((d) => d.id !== id) })),

  createEtiqueta: (d) => {
    const e: Etiqueta = {
      id: genId("tag"),
      nome: d.nome ?? "Nova etiqueta",
      cor: d.cor ?? "#6366f1",
    };
    set((s) => ({ etiquetas: [e, ...s.etiquetas] }));
    return e;
  },
  updateEtiqueta: (id, patch) =>
    set((s) => ({ etiquetas: s.etiquetas.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),
  deleteEtiqueta: (id) =>
    set((s) => ({ etiquetas: s.etiquetas.filter((e) => e.id !== id) })),

  createCampanha: (d) => {
    const c: Campanha = {
      id: genId("camp"),
      nome: d.nome ?? "Nova campanha",
      status: "rascunho",
      publico: d.publico ?? 0,
      enviadas: 0,
      entregues: 0,
      lidas: 0,
      respondidas: 0,
      criadaEm: Date.now(),
    };
    set((s) => ({ campanhas: [c, ...s.campanhas] }));
    return c;
  },
  updateCampanha: (id, patch) =>
    set((s) => ({ campanhas: s.campanhas.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
  deleteCampanha: (id) =>
    set((s) => ({ campanhas: s.campanhas.filter((c) => c.id !== id) })),

  sendMessage: (conversaId, texto) => {
    const m: Mensagem = {
      id: genId("msg"),
      conversaId,
      tipo: "atendente",
      autorId: get().currentUserId,
      texto,
      createdAt: Date.now(),
    };
    set((s) => ({
      mensagens: [...s.mensagens, m],
      conversas: s.conversas.map((c) =>
        c.id === conversaId
          ? { ...c, updatedAt: m.createdAt, status: c.status === "aguardando" ? "atendendo" : c.status, atendenteId: c.atendenteId ?? s.currentUserId, naoLidas: 0 }
          : c,
      ),
    }));
  },
  addNotaConversa: (conversaId, texto) => {
    const m: Mensagem = {
      id: genId("msg"),
      conversaId,
      tipo: "nota",
      autorId: get().currentUserId,
      texto,
      createdAt: Date.now(),
    };
    set((s) => ({ mensagens: [...s.mensagens, m] }));
  },
  transferConversa: (conversaId, atendenteId) =>
    set((s) => ({
      conversas: s.conversas.map((c) => (c.id === conversaId ? { ...c, atendenteId, status: "atendendo" } : c)),
      mensagens: [
        ...s.mensagens,
        {
          id: genId("msg"),
          conversaId,
          tipo: "sistema",
          texto: `Conversa transferida para ${s.atendentes.find((a) => a.id === atendenteId)?.nome ?? "atendente"}.`,
          createdAt: Date.now(),
        },
      ],
    })),
  moveConversaDepartamento: (conversaId, departamentoId) =>
    set((s) => ({
      conversas: s.conversas.map((c) => (c.id === conversaId ? { ...c, departamentoId } : c)),
      mensagens: [
        ...s.mensagens,
        {
          id: genId("msg"),
          conversaId,
          tipo: "sistema",
          texto: `Movida para o departamento ${s.departamentos.find((d) => d.id === departamentoId)?.nome ?? ""}.`,
          createdAt: Date.now(),
        },
      ],
    })),
  toggleFavoritoConversa: (conversaId) =>
    set((s) => ({
      conversas: s.conversas.map((c) => (c.id === conversaId ? { ...c, favorito: !c.favorito } : c)),
    })),
  setConversaStatus: (conversaId, status) =>
    set((s) => ({
      conversas: s.conversas.map((c) => (c.id === conversaId ? { ...c, status, updatedAt: Date.now() } : c)),
    })),
  addTagConversa: (conversaId, tagId) =>
    set((s) => ({
      conversas: s.conversas.map((c) =>
        c.id === conversaId && !c.tags.includes(tagId) ? { ...c, tags: [...c.tags, tagId] } : c,
      ),
    })),
  removeTagConversa: (conversaId, tagId) =>
    set((s) => ({
      conversas: s.conversas.map((c) =>
        c.id === conversaId ? { ...c, tags: c.tags.filter((t) => t !== tagId) } : c,
      ),
    })),
  markRead: (conversaId) =>
    set((s) => ({
      conversas: s.conversas.map((c) => (c.id === conversaId ? { ...c, naoLidas: 0 } : c)),
    })),

  addNotaCliente: (clienteId, texto) => {
    const nota: Nota = {
      id: genId("nota"),
      autorId: get().currentUserId,
      texto,
      createdAt: Date.now(),
    };
    set((s) => ({
      clientes: s.clientes.map((c) => (c.id === clienteId ? { ...c, notas: [nota, ...c.notas] } : c)),
    }));
  },
}));

/* Helpers */
export const useCliente = (id?: ID) =>
  useStore((s) => (id ? s.clientes.find((c) => c.id === id) : undefined));
export const useAtendente = (id?: ID) =>
  useStore((s) => (id ? s.atendentes.find((a) => a.id === id) : undefined));
export const useEmpresa = (id?: ID) =>
  useStore((s) => (id ? s.empresas.find((e) => e.id === id) : undefined));
export const useDepartamento = (id?: ID) =>
  useStore((s) => (id ? s.departamentos.find((d) => d.id === id) : undefined));
