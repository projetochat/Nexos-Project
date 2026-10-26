import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const aiPage = readFileSync(new URL("./agente-ia.tsx", import.meta.url), "utf8");
const inboxDetail = readFileSync(new URL("./inbox.$conversationId.tsx", import.meta.url), "utf8");
const ticketsPage = readFileSync(new URL("./chamados.tsx", import.meta.url), "utf8");
const apiClient = readFileSync(new URL("../lib/trixus-api.ts", import.meta.url), "utf8");

describe("PACK 12 — integração de IA com Chat e Chamados", () => {
  it("mantém a página global responsiva de conexões e agentes", () => {
    expect(aiPage).toContain("Gerencie suas conexões com provedores de IA");
    expect(aiPage).toContain("grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4");
    expect(aiPage).toContain("grid gap-3 md:grid-cols-2 xl:grid-cols-3");
    expect(aiPage).toContain('className="max-w-[1040px]"');
    expect(aiPage).toContain("Apresentar todos agentes");
    expect(aiPage).toContain("Modo atendente");
    expect(aiPage).toContain("Modo copiloto");
    expect(aiPage).toContain("Modo consulta");
    expect(aiPage.indexOf('label: "ChatGPT (OpenAI)"')).toBeLessThan(
      aiPage.indexOf('label: "Gemini (Google)"'),
    );
    expect(aiPage.indexOf('label: "Gemini (Google)"')).toBeLessThan(
      aiPage.indexOf('label: "Claude (Anthropic)"'),
    );
    expect(aiPage.indexOf('label: "Claude (Anthropic)"')).toBeLessThan(
      aiPage.indexOf('label: "DeepSeek"'),
    );
    expect(aiPage.indexOf('label: "DeepSeek"')).toBeLessThan(aiPage.indexOf('label: "Groq"'));
    expect(aiPage.indexOf('label: "Groq"')).toBeLessThan(aiPage.indexOf('label: "OpenRouter"'));
    expect(aiPage).toContain("SiGooglegemini");
    expect(aiPage).toContain("SiAnthropic");
    expect(aiPage).toContain("SiDeepseek");
  });

  it("abre diretamente o cadastro do chamado sobre o Chat", () => {
    const start = inboxDetail.indexOf("const handleGerarChamado");
    const end = inboxDetail.indexOf("\n  return (", start);
    const flow = inboxDetail.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(flow).toContain("setTicketEditorAiExecutionId(undefined)");
    expect(flow).toContain("setTicketEditorOpen(true)");
    expect(flow).not.toContain('to: "/chamados"');
    expect(inboxDetail).toContain("<TicketEditor");
    expect(inboxDetail).toContain("initialConversationId={conv.id}");
  });

  it("mantém os dados do contato pré-preenchidos e valida os obrigatórios ao salvar", () => {
    expect(ticketsPage).toContain(
      'setCustomerDepartmentId(conversation.contact?.customerDepartmentId ?? "")',
    );
    expect(ticketsPage).toContain(
      'setOriginBranchId(conversation.contact?.customerBranchId ?? "")',
    );
    expect(ticketsPage).toContain('pendingFields.push("Departamento do cliente")');
    expect(ticketsPage).toContain('pendingFields.push("Filial de origem")');
  });

  it("oferece resumo completo ou por IA dentro do descritivo", () => {
    expect(ticketsPage).toContain("Gerar resumo");
    expect(ticketsPage).toContain("Gerar resumo IA");
    expect(ticketsPage).toContain("buildConversationTicketDescription(conversation, messages)");
    expect(ticketsPage).toContain("aiApi.createTicketDraft(initialConversationId)");
    expect(ticketsPage).toContain("setDescription(draft.descriptionHtml)");
    expect(ticketsPage).toContain('style="font-size: 1.5em; font-weight: bold"');
    expect(ticketsPage).toContain('const summarySeparator = "============================="');
    expect(ticketsPage).toContain("`Histórico importado da conversa: #${conversationReference}`");
    expect(ticketsPage).toContain("Segue abaixo o histórico da conversa:");
    expect(ticketsPage).toContain("formatPhoneVariable(conversation.contact.telefone)");
    expect(ticketsPage).toContain("whatsAppTextToHtml");
    expect(ticketsPage).toContain("messageImageReference(conversation.id, message.id)");
    expect(ticketsPage).not.toMatch(/FileReader|readAsDataURL/);
    const imageResolver = readFileSync(
      new URL("../lib/ticket-image-dom.ts", import.meta.url),
      "utf8",
    );
    expect(imageResolver).toContain("messageApi.downloadMedia");
    expect(imageResolver).toContain("ticketApi.preview");
    expect(ticketsPage).toContain('alt="${alt}"');
    expect(ticketsPage).toContain("disponível na seção Anexos");
    expect(ticketsPage).not.toContain("Conversa adicionada ao descritivo.");
  });

  it("oferece Groq, descrição opcional e catálogo de modelos", () => {
    expect(aiPage).toContain('value: "GROQ"');
    expect(aiPage).toContain("Modelos de IA");
    expect(aiPage).toContain('id: "openai/gpt-oss-20b"');
    expect(aiPage).not.toContain('["description", "Descrição"]');
    expect(aiPage).toContain("rows={6}");
  });

  it("informa gratuidade, cobrança e regras oficiais no catálogo de modelos", () => {
    expect(aiPage).toContain("Gratuito não significa ilimitado.");
    expect(aiPage).toContain('label: "Grátis com limites"');
    expect(aiPage).toContain('label: "Pago por uso"');
    expect(aiPage).toContain('label: "Pago nos modelos listados"');
    expect(aiPage).toContain("30 requisições/minuto");
    expect(aiPage).toContain("1.000 requisições/dia");
    expect(aiPage).toContain("openrouter/free");
    expect(aiPage).toContain("50 requisições/dia");
    expect(aiPage).toContain("Ver regras oficiais");
    expect(aiPage).toContain("group.billingRule");
    expect(aiPage).toContain("group.access.label");
  });

  it("oferece OpenRouter, logos oficiais e três provedores por linha", () => {
    expect(aiPage).toContain('value: "OPENROUTER"');
    expect(aiPage).toContain('id: "openai/gpt-4.1-mini"');
    expect(aiPage).toContain("/brands/openrouter-glyph-grape.svg");
    expect(aiPage).toContain("/brands/groq-wordmark.svg");
    expect(aiPage).toContain('className="grid grid-cols-2 gap-2 sm:grid-cols-3"');
  });

  it("fecha o cadastro sem desmontar ou recarregar a conversa", () => {
    const start = inboxDetail.indexOf("<TicketEditor");
    const end = inboxDetail.indexOf("/>", start);
    const editor = inboxDetail.slice(start, end);
    expect(editor).toContain("setTicketEditorOpen(false)");
    expect(editor).toContain("setTicketEditorAiExecutionId(undefined)");
    expect(editor).not.toContain("navigate(");
  });

  it("mantém o título manual vazio e o substitui quando a IA gera o resumo", () => {
    expect(ticketsPage).not.toContain("Chamado aberto pelo Chat -");
    expect(ticketsPage).toContain("setTitle(draft.title)");
    expect(ticketsPage).toContain('pendingFields.push("Título")');
  });

  it("permite selecionar até vinte anexos por chamado", () => {
    expect(ticketsPage).toContain("const maxAttachmentCount = 20;");
    expect(ticketsPage).toContain("attachments.length}/{maxAttachmentCount} arquivos");
  });

  it("abre o editor oficial e preserva a rastreabilidade da execução", () => {
    expect(ticketsPage).toContain("initialAiExecutionId");
    expect(ticketsPage).toContain("aiApi.getExecution(initialAiExecutionId!)");
    expect(ticketsPage).toContain(
      "aiExecutionId: generatedAiExecutionId || initialAiExecutionId || null",
    );
  });

  it("expõe os contratos de conexões, agentes, prévia e execução", () => {
    expect(apiClient).toContain('"/ai/connections"');
    expect(apiClient).toContain('"/ai/agents"');
    expect(apiClient).toContain('"/ai/ticket-drafts"');
    expect(apiClient).toContain("/ai/executions/${executionId}");
  });
});
