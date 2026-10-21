import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./admin.empresas.tsx", import.meta.url), "utf8");

describe("cadastro administrativo de clientes", () => {
  it("torna o CNPJ opcional somente durante a prospecção", () => {
    expect(source).toContain('const requiresDocument = form.status !== "PROSPECTING";');
    expect(source).toContain("(requiresDocument && document.length !== 14)");
    expect(source).toContain('form.status === "PROSPECTING" ? "" : " *"');
  });

  it("exclui definitivamente apenas clientes nunca usados e cancela os que têm histórico", () => {
    expect(source).toContain("client._count?.subscriptions ?? 0");
    expect(source).toContain('kind: "delete"');
    expect(source).toContain('kind: "cancel"');
    expect(source).toContain("platformApi.deleteClient(clientAction.client.id)");
    expect(source).toContain("platformApi.cancelClient(clientAction.client.id)");
    expect(source).toContain("Esta exclusão é definitiva");
    expect(source).toContain("Tenants e assinaturas existentes não serão apagados");
  });

  it("aplica o padrão destrutivo às ações de excluir e cancelar", () => {
    expect(source).toContain('label.includes("Excluir") || label.includes("Cancelar")');
    expect(source).toContain("action-hover-destructive");
  });

  it("mantém cards obrigatórios no mobile e permite alternar no desktop", () => {
    expect(source).toContain(
      'const [viewMode, setViewMode] = React.useState<"cards" | "list">("list")',
    );
    expect(source).toContain('if (isMobile) {\n      setViewMode("cards");\n      return;');
    expect(source).toContain('className="mb-3 hidden justify-end gap-1 md:flex"');
    expect(source).toContain('aria-label="Visualização dos clientes"');
    expect(source).toContain('aria-label="Visualizar clientes em cards"');
    expect(source).toContain('aria-label="Visualizar clientes em lista"');
    expect(source).toContain("sm:grid-cols-2 md:p-4 xl:grid-cols-3");
    expect(source).toContain('className={viewMode === "list" ? "overflow-hidden p-0" : "hidden"}');
  });

  it("organiza busca e situação, cidade e UF em pares no mobile", () => {
    expect(source).toContain('"xl:grid-cols-[repeat(4,minmax(0,1fr))_auto]"');
    expect(source).toContain('"xl:grid-cols-4"');
    expect(source).toContain("data-platform-filter-grid");
    expect(source).toContain('className="col-span-2 flex justify-end xl:col-span-1 xl:items-end"');
    expect(source).toContain('className="col-start-1 row-start-2 min-w-0 md:col-auto md:row-auto"');
    expect(source).toContain('className="col-start-2 row-start-2 min-w-0 md:col-auto md:row-auto"');
    expect(source).toContain('className="col-start-2 row-start-1 min-w-0 md:col-auto md:row-auto"');
  });

  it("aplica o mesmo shell e rodapé integrado à grade e aos cards", () => {
    expect(source).toContain(
      '<thead className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-widest text-muted-foreground">',
    );
    expect(source).toContain("data-platform-card-shell");
    expect(source).toContain(
      '? "md:overflow-hidden md:rounded-xl md:border md:border-border md:bg-card md:shadow-card"',
    );
    expect(source).toContain(
      'className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:p-4 xl:grid-cols-3"',
    );
    expect(source.match(/\{paginationFooter\}/g)).toHaveLength(2);
  });

  it("usa o padrão compacto dos botões de novo cadastro da Platform", () => {
    expect(source).toContain(
      '<Button variant="primary" size="sm" onClick={() => setCreating(true)}>',
    );
    expect(source).toContain('<Plus className="h-3.5 w-3.5" /> Novo cliente');
  });

  it("mostra no cadastro a bolinha com a cor definida para cada situação", () => {
    expect(source).toContain("options={CLIENT_STATUS_OPTIONS}");
    expect(source).toContain("showAllOption={false}");
    expect(source).toContain('color: "var(--color-success)"');
    expect(source).toContain('color: "var(--color-info)"');
    expect(source).toContain('color: "var(--color-warning)"');
    expect(source).toContain('color: "var(--color-destructive)"');
  });

  it("mantém o rodapé e o seletor de paginação compactos", () => {
    expect(source).toContain("<GridPaginationFooter");
    expect(source).toContain("visible={data.items.length}");
    expect(source).toContain("total={data.total}");
    expect(source).toContain('ariaLabelPrefix="clientes"');
  });

  it("alinha as ações dos cards à direita sem alterar a tabela", () => {
    expect(source).toContain('placement="card"');
    expect(source).toContain('? "mt-3 flex justify-end gap-2"');
    expect(source).toContain(': "mt-3 flex justify-end gap-2 md:mt-0 md:justify-center"');
  });

  it("oferece visualização real e somente leitura em cards e grade", () => {
    expect(source).toContain("const [viewing, setViewing] = React.useState<PlatformClient | null>");
    expect(source.match(/onView=\{\(\) => setViewing\(client\)\}/g)).toHaveLength(2);
    expect(source).toContain('<IconAction label="Visualizar" onClick={onView}>');
    expect(source).toContain('title="Visualizar Cliente"');
    expect(source).toContain("<ClientView client={viewing} onClose={() => setViewing(null)} />");
  });

  it("padroniza a data de cadastro com data e hora em todos os modos", () => {
    expect(source.match(/formatPlatformDateTime\(client\.registeredAt\)/g)).toHaveLength(3);
    expect(source).not.toContain("fmtDate(new Date(client.registeredAt).getTime())");
  });
});
