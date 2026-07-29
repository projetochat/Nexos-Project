/* ============================================================
   Nexo · API Service Layer
   ------------------------------------------------------------
   Camada de serviços tipada. Hoje aponta para o mock store
   (Zustand). Quando o backend for construído, cada função aqui
   passa a chamar Supabase / Evolution API / Meta Cloud API sem
   que qualquer tela precise mudar.

   Mapa de integração futura (por método):
     • auth.*            → Supabase Auth
     • clientes.*        → Supabase (PostgREST) + RLS
     • empresas.*        → Supabase
     • atendentes.*      → Supabase + roles
     • conversas.list    → Supabase + Redis cache
     • conversas.send    → Evolution API / Meta Cloud API
     • conversas.stream  → Socket.IO (canal por conversa)
     • uploads.*         → Cloudflare R2 (signed URLs)
     • ai.suggest        → Lovable AI Gateway
     • campanhas.dispatch→ BullMQ + Evolution API
     • webhooks.*        → /api/public/* (Meta / Evolution)
     • automacoes.*      → N8N
   ============================================================ */

import { env } from "../env";
import { useStore } from "../mock/store";
import type {
  Atendente, Campanha, Cliente, Conversa, Departamento,
  Empresa, Etiqueta, ID, Mensagem,
} from "../mock/types";

/* --------- helpers --------- */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function simulate<T>(fn: () => T, latency: number = env.MOCK_LATENCY_MS): Promise<T> {
  await sleep(latency);
  if (env.MOCK_FAILURE_RATE > 0 && Math.random() < env.MOCK_FAILURE_RATE) {
    throw new Error("Falha simulada de rede");
  }
  return fn();
}

const s = useStore.getState;

/* --------- Clientes --------- */
export const clientesApi = {
  list: () => simulate(() => s().clientes),
  get: (id: ID) => simulate(() => s().clientes.find((c) => c.id === id) ?? null),
  create: (data: Partial<Cliente>) => simulate(() => s().createCliente(data)),
  update: (id: ID, patch: Partial<Cliente>) => simulate(() => s().updateCliente(id, patch)),
  remove: (id: ID) => simulate(() => s().deleteCliente(id)),
  addNota: (id: ID, texto: string) => simulate(() => s().addNotaCliente(id, texto)),
};

/* --------- Empresas --------- */
export const empresasApi = {
  list: () => simulate(() => s().empresas),
  create: (d: Partial<Empresa>) => simulate(() => s().createEmpresa(d)),
  update: (id: ID, p: Partial<Empresa>) => simulate(() => s().updateEmpresa(id, p)),
  remove: (id: ID) => simulate(() => s().deleteEmpresa(id)),
};

/* --------- Atendentes --------- */
export const atendentesApi = {
  list: () => simulate(() => s().atendentes),
  create: (d: Partial<Atendente>) => simulate(() => s().createAtendente(d)),
  update: (id: ID, p: Partial<Atendente>) => simulate(() => s().updateAtendente(id, p)),
  remove: (id: ID) => simulate(() => s().deleteAtendente(id)),
};

/* --------- Departamentos --------- */
export const departamentosApi = {
  list: () => simulate(() => s().departamentos),
  create: (d: Partial<Departamento>) => simulate(() => s().createDepartamento(d)),
  update: (id: ID, p: Partial<Departamento>) => simulate(() => s().updateDepartamento(id, p)),
  remove: (id: ID) => simulate(() => s().deleteDepartamento(id)),
};

/* --------- Etiquetas --------- */
export const etiquetasApi = {
  list: () => simulate(() => s().etiquetas),
  create: (d: Partial<Etiqueta>) => simulate(() => s().createEtiqueta(d)),
  update: (id: ID, p: Partial<Etiqueta>) => simulate(() => s().updateEtiqueta(id, p)),
  remove: (id: ID) => simulate(() => s().deleteEtiqueta(id)),
};

/* --------- Campanhas --------- */
export const campanhasApi = {
  list: () => simulate(() => s().campanhas),
  create: (d: Partial<Campanha>) => simulate(() => s().createCampanha(d)),
  update: (id: ID, p: Partial<Campanha>) => simulate(() => s().updateCampanha(id, p)),
  remove: (id: ID) => simulate(() => s().deleteCampanha(id)),
  /** Futuro: BullMQ enqueue → Evolution API */
  dispatch: (_id: ID) => simulate(() => ({ ok: true })),
};

/* --------- Conversas / Inbox --------- */
export const conversasApi = {
  list: () => simulate(() => s().conversas),
  messages: (conversaId: ID) =>
    simulate(() => s().mensagens.filter((m) => m.conversaId === conversaId)),
  /** Envia mensagem — hoje mock, futuro: Evolution/Meta Cloud API */
  send: (conversaId: ID, texto: string) => simulate(() => s().sendMessage(conversaId, texto)),
  addNota: (conversaId: ID, texto: string) => simulate(() => s().addNotaConversa(conversaId, texto)),
  transfer: (conversaId: ID, atendenteId: ID) => simulate(() => s().transferConversa(conversaId, atendenteId)),
  moveDepto: (conversaId: ID, depId: ID) => simulate(() => s().moveConversaDepartamento(conversaId, depId)),
  toggleFav: (conversaId: ID) => simulate(() => s().toggleFavoritoConversa(conversaId)),
  setStatus: (conversaId: ID, status: Conversa["status"]) => simulate(() => s().setConversaStatus(conversaId, status)),
  addTag: (conversaId: ID, tagId: ID) => simulate(() => s().addTagConversa(conversaId, tagId)),
  removeTag: (conversaId: ID, tagId: ID) => simulate(() => s().removeTagConversa(conversaId, tagId)),
  markRead: (conversaId: ID) => simulate(() => s().markRead(conversaId), 40),
};

/* --------- Uploads (futuro: R2 signed URLs) --------- */
export const uploadsApi = {
  presign: (_filename: string, _contentType: string) =>
    simulate(() => ({ uploadUrl: "", publicUrl: "" })),
};

/* --------- AI (futuro: Lovable AI Gateway) --------- */
export const aiApi = {
  suggestReply: (_conversationContext: Mensagem[]) =>
    simulate(() => ({ text: "" }), 400),
  summarize: (_conversationContext: Mensagem[]) =>
    simulate(() => ({ summary: "" }), 400),
};

export const api = {
  clientes: clientesApi,
  empresas: empresasApi,
  atendentes: atendentesApi,
  departamentos: departamentosApi,
  etiquetas: etiquetasApi,
  campanhas: campanhasApi,
  conversas: conversasApi,
  uploads: uploadsApi,
  ai: aiApi,
};

export type NexoApi = typeof api;
