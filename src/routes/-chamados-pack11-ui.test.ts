import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./chamados.tsx", import.meta.url), "utf8");
const inboxSource = readFileSync(new URL("./inbox.$conversationId.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../lib/trixus-api.ts", import.meta.url), "utf8");
const ticketsService = readFileSync(
  new URL("../../backend/src/tickets/tickets.service.ts", import.meta.url),
  "utf8",
);

describe("PACK 11 · interface de chamados", () => {
  it("apresenta os filtros e indicadores definidos para a listagem", () => {
    expect(source).toContain('placeholder="Buscar por ID, título ou solicitante"');
    expect(source).toContain('label="Cliente"');
    expect(source).toContain('label="Departamento"');
    expect(source).toContain('label="Status"');
    for (const label of [
      "Novos",
      "Aguardando aprovação",
      "Na fila",
      "Em execução",
      "Concluída",
      "Validados",
      "Reprovados",
    ]) {
      expect(source).toContain(`label="${label}"`);
    }
    expect(source).toContain(
      'className="w-full text-xs uppercase tracking-widest text-muted-foreground"',
    );
    expect(source).toContain(
      'className="font-mono text-3xl font-semibold tabular-nums text-foreground"',
    );
  });

  it("atualiza a listagem e os indicadores após mudanças em chamados", () => {
    expect(source).toContain('const summaryKey = ["tickets", "summary"] as const');
    expect(source).toContain("qc.invalidateQueries({ queryKey: listKey })");
    expect(source).toContain("qc.invalidateQueries({ queryKey: summaryKey })");
    expect(source).toContain("conversationId: params.conversationId");
  });

  it("redistribui os filtros quando o botão de limpar não está visível", () => {
    expect(source).toContain('"lg:grid-cols-[1fr_220px_auto]"');
    expect(source).toContain('"lg:grid-cols-[1fr_220px]"');
    expect(source).toContain(
      '"lg:grid-cols-[minmax(280px,1.6fr)_minmax(150px,.7fr)_minmax(150px,.7fr)_minmax(150px,.7fr)_auto]"',
    );
    expect(source).toContain(
      '"lg:grid-cols-[minmax(280px,1.6fr)_minmax(150px,.7fr)_minmax(150px,.7fr)_minmax(150px,.7fr)]"',
    );
    expect(source).not.toContain("_40px]");
  });

  it("mantém a alternância entre tabela e cards com as datas previstas", () => {
    expect(source).toContain('viewMode === "cards"');
    expect(source).toContain('viewMode === "list" ? "overflow-hidden p-0" : "hidden"');
    expect(source).toContain('label="Dt. aprovação"');
    expect(source).toContain('label="Dt. conclusão"');
  });

  it("organiza o novo chamado nas linhas previstas", () => {
    expect(source).toContain('label="Filial de origem *"');
    expect(source).toContain('label="Prioridade *"');
    expect(source).toContain('label="Tipo do Chamado *"');
    expect(source).toContain("Salvar Chamado");
    expect(source).toContain('className="max-w-5xl"');
    expect(source).toContain('ariaLabel="Prioridade"');
    expect(source).toContain('ariaLabel="Tipo do Chamado"');
    expect(source).toContain('<RichSelectContent className="z-[250]">');
    expect(source).toContain(
      'data-ticket-select-value className="flex min-w-0 items-center gap-2"',
    );
    expect(source).toContain("priorityDot(item)");
    expect(source).toContain("Headphones : Code2");
    expect(source).toContain('"Desenvolvimento (DEV)"');
  });

  it("oferece as quatro prioridades com os rótulos e cores definidos", () => {
    expect(source).toContain(
      'const priorities: ApiTicketPriority[] = ["BAIXA", "NORMAL", "ALTA", "ALTISSIMA"]',
    );
    expect(source).not.toContain('.filter((item) => item !== "BAIXA")');
    expect(source).toContain('BAIXA: "#86efac"');
    expect(source).toContain('NORMAL: "#9ca3af"');
    expect(source).toContain('ALTA: "#ef4444"');
    expect(source).toContain('ALTISSIMA: "#111827"');
    expect(source).toContain('NORMAL: "Média"');
    expect(source).toContain('URGENTE: "Alta"');
    expect(source).toContain('value={item.priority === "URGENTE" ? "ALTA" : item.priority}');
    expect(inboxSource).toContain('suggestion.priority === "NORMAL"');
    expect(inboxSource).toContain('? "Média"');
  });

  it("aceita até vinte anexos, permite removê-los e impede duplicação", () => {
    expect(source).toContain("const maxAttachmentCount = 20;");
    expect(source).toContain("allowedAttachmentMimeTypes");
    expect(source).toContain('accept=".pdf,.png,.jpg,.jpeg,.webp,.txt"');
    expect(source).toContain("multiple");
    expect(source).toContain('aria-label="Arquivos selecionados"');
    expect(source).toContain("max-h-40 grid-cols-1");
    expect(source).toContain("sm:grid-cols-2");
    expect(source).toContain("lg:grid-cols-3");
    expect(source).toContain("attachments.length}/{maxAttachmentCount} arquivos");
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('className="sr-only"');
    expect(source).toContain("Remover arquivo ${file.name}");
    expect(source).toContain("if (submittingRef.current) return");
    expect(source).toContain("failedAttachments.length");
  });

  it("oferece resumo, datas, diálogos e todas as ações do detalhamento", () => {
    for (const label of [
      "Responder",
      "Transferir Chamado",
      "Solicitar aprovação",
      "Solucionar chamado",
      "Cancelar Chamado",
      "Data de abertura",
      "Data de aprovação",
      "Data de início",
      "Data da solução",
      "Data de validação",
      "Última atualização",
      "Adicionar etiqueta",
    ]) {
      expect(source).toContain(label);
    }
  });

  it("centraliza todos os arquivos em uma aba de anexos funcional", () => {
    const attachmentTabSource = source.slice(
      source.indexOf("function Attachments"),
      source.indexOf("function DialogAttachments"),
    );
    expect(source).toContain(
      'const [detailTab, setDetailTab] = React.useState<"summary" | "attachments">',
    );
    expect(source).toContain('role="tablist"');
    expect(source).toContain('aria-selected={detailTab === "attachments"}');
    expect(source).toContain('onClick={() => setDetailTab("attachments")}');
    expect(source).toContain('role="tabpanel" aria-label="Anexos do chamado"');
    expect(source).toContain("Índice de todos os arquivos vinculados aos diálogos deste chamado.");
    expect(source).toContain("ticketApi.uploadAttachment");
    expect(source).toContain("ticketApi.preview");
    expect(source).toContain("ticketApi.download");
    expect(source).not.toContain("Atrixus privados");
    expect(attachmentTabSource).not.toContain('type="file"');
    expect(attachmentTabSource).not.toContain("uploadAttachment");
    expect(attachmentTabSource).not.toContain("deleteAttachment");
    expect(attachmentTabSource).toContain("Baixar todos");
    expect(source).toContain("createStoredZip(entries)");
    expect(source).toContain("Anexado");
    expect(source).toContain("item.uploadedBy.name");
    expect(api).toContain("uploadedBy: { id: string; name: string }");
    expect(ticketsService).toContain("uploadedByMembership");
    expect(source).toContain("Anexos deste diálogo");
    expect(source).toContain("const maxAttachmentCount = 20;");
    expect(source).toContain("lg:grid-cols-3");
    expect(source).toContain("xl:grid-cols-3");
    expect(source).toContain("ticketApi.uploadAttachment(ticketId, file, savedComment.id)");
    expect(source).toContain("attachment.commentId === entry.id");
    expect(source).toContain("!attachment.commentId");
    expect(source).toContain("max-w-[50%]");
    expect(source).toContain('className="max-h-[280px] overflow-hidden px-4 py-3"');
    expect(source).toContain('aria-label="Abrir diálogo completo"');
    expect(source).toContain('title="Diálogo completo"');
    expect(source).toContain("preview.scrollHeight > preview.clientHeight + 1");
    expect(source).toContain(
      'side={entry.authorMembership.user.id === currentUserId ? "right" : "left"}',
    );
    expect(source).toContain('className="mt-3 border-t border-border/70 pt-3"');
    expect(source).toContain('className="grid grid-cols-2 gap-2"');
    expect(source).toContain('href="#"');
    expect(source).toContain("void previewTicketAttachment(ticketId, attachment)");
    expect(api).toContain('"X-Comment-Id": commentId');
    expect(ticketsService).toContain('req.headers["x-comment-id"]');
    expect(ticketsService).toContain("ticketId: ticket.id");
  });

  it("usa os contratos persistentes do workflow", () => {
    for (const endpoint of [
      "/tickets/summary",
      "/actions/respond",
      "/actions/transfer",
      "/actions/request-approval",
      "/actions/solve",
      "/actions/cancel",
      "/actions/validate-solution",
      "/approvals",
      "/decision",
    ]) {
      expect(api).toContain(endpoint);
    }
    expect(source).toContain("ticketApi.requestApproval");
    expect(source).toContain("ticketApi.validateSolution");
    expect(source).toContain("dialogTone(entry.dialogType)");
    expect(source).toContain("item.validatedAt");
  });

  it("restringe o portal do cliente ao próprio contexto e à validação", () => {
    expect(source).toContain('mode === "customer_portal"');
    expect(source).toContain('title={isCustomerPortal ? "Meus chamados" : "Chamados"}');
    expect(source).toContain("ticketApi.portalCreateContext");
    expect(source).toContain("portalCreateContext.data?.customer.name");
    expect(source).toContain("portalCreateContext.data?.department.name");
    expect(source).toContain("portalCreateContext.data?.contact.name");
    expect(source).toContain("portalCreateContext.data?.branch.name");
    expect(source).toContain('aria-readonly="true"');
    expect(source).not.toContain('value="Definido pelo seu acesso"');
    expect(source).not.toContain('value="Definida pelo seu acesso"');
    expect(source).toContain('item.status === "CONCLUIDA"');
    expect(source).toContain("ticketApi.validateSolution");
    expect(source).toContain(
      'queryKey: [...summaryKey, mode, portalAccessId ?? "internal", params]',
    );
    expect(source).not.toContain("enabled: !isCustomerPortal");
  });
});
