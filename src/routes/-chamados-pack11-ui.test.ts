import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./chamados.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../lib/trixus-api.ts", import.meta.url), "utf8");

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

  it("aceita vários anexos, permite removê-los e impede criação duplicada", () => {
    expect(source).toContain("const maxAttachmentCount = 10");
    expect(source).toContain("allowedAttachmentMimeTypes");
    expect(source).toContain('accept=".pdf,.png,.jpg,.jpeg,.webp,.txt"');
    expect(source).toContain("multiple");
    expect(source).toContain('aria-label="Arquivos selecionados"');
    expect(source).toContain("max-h-28 grid-cols-1");
    expect(source).toContain("sm:grid-cols-2");
    expect(source).toContain("{attachments.length}/{maxAttachmentCount} arquivos");
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
    expect(source).toContain('roleKey === "customer_portal"');
    expect(source).toContain('title={isCustomerPortal ? "Meus chamados" : "Chamados"}');
    expect(source).toContain('value="Definido pelo seu acesso"');
    expect(source).toContain('value="Definida pelo seu acesso"');
    expect(source).toContain('value="Você"');
    expect(source).toContain('item.status === "CONCLUIDA"');
    expect(source).toContain("ticketApi.validateSolution");
  });
});
