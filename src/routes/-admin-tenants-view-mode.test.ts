import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./admin.tenants.tsx", import.meta.url), "utf8");

describe("alternância de visualização das tenants", () => {
  it("força cards no mobile e usa lista no desktop até o usuário escolher outro modo", () => {
    expect(source).toContain(
      'const [viewMode, setViewMode] = React.useState<"cards" | "list">("list")',
    );
    expect(source).toContain('if (isMobile) {\n      setViewMode("cards");\n      return;');
    expect(source).toContain("if (!viewModeTouched.current)");
    expect(source).toContain('className="mb-3 hidden justify-end gap-1 md:flex"');
  });

  it("oferece botões acessíveis e mantém os dois formatos disponíveis", () => {
    expect(source).toContain('aria-label="Visualização das tenants"');
    expect(source).toContain('aria-label="Visualizar tenants em cards"');
    expect(source).toContain('aria-label="Visualizar tenants em lista"');
    expect(source).toContain("data-platform-mobile-list");
    expect(source).toContain("data-platform-desktop-table");
    expect(source).toContain('viewMode === "cards"');
    expect(source).toContain('viewMode === "list"');
    expect(source).toContain("sm:grid-cols-2 md:p-4 xl:grid-cols-3");
    expect(source).toContain('className={viewMode === "list" ? "overflow-hidden p-0" : "hidden"}');
  });

  it("preserva as ações nos cards e na lista", () => {
    expect(source.match(/<TenantActions/g)).toHaveLength(1);
    expect(source.match(/<TenantCardActions/g)).toHaveLength(1);
    expect(source).toContain("onView={() => setSelectedTenant(tenant)}");
    expect(source).toContain("onCredentials={() => setCredentialTenant(tenant)}");
    expect(source).toContain("onConfiguration={() => setConfigurationTenant(tenant)}");
  });

  it("exibe ações separadas por ícone nos cards e mantém o menu na lista", () => {
    expect(source).toContain('aria-label="Ações da tenant"');
    expect(source).toContain('label="Visualizar"');
    expect(source).toContain('label="Gerenciar credenciais"');
    expect(source).toContain('label="Configuração da Tenant"');
    expect(source).toContain("title={label}");
    expect(source).toContain("aria-label={label}");
    expect(source).toContain('<MoreVertical className="h-4 w-4" />');
  });

  it("aplica o mesmo shell e rodapé integrado à grade e aos cards", () => {
    expect(source).toContain(
      '<thead className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-widest text-muted-foreground',
    );
    expect(source).toContain("data-platform-card-shell");
    expect(source).toContain(
      '? "md:overflow-hidden md:rounded-xl md:border md:border-border md:bg-card md:shadow-card"',
    );
    expect(source).toContain(
      'className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:p-4 xl:grid-cols-3"',
    );
    expect(source.match(/\{paginationFooter\}/g)).toHaveLength(2);
    expect(source).toContain('ariaLabelPrefix="tenants"');
  });

  it("mantém o rodapé e o seletor de paginação compactos", () => {
    expect(source).toContain("<GridPaginationFooter");
    expect(source).toContain("visible={data.items.length}");
    expect(source).toContain("total={data.total}");
  });

  it("mantém Busca em uma linha e alinha Plano e Status no mobile", () => {
    const filterStart = source.indexOf('<Card className="mb-4">');
    const filterEnd = source.indexOf('aria-label="Visualização das tenants"', filterStart);
    const filters = source.slice(filterStart, filterEnd);

    expect(filters).toContain('"xl:grid-cols-[repeat(6,minmax(0,1fr))_auto]"');
    expect(filters).toContain('"xl:grid-cols-6"');
    expect(filters).toContain("data-platform-filter-grid");
    expect(filters).toContain('className="col-span-2 flex justify-end md:col-span-1 md:items-end"');
    expect(filters).toContain('className="col-span-2 min-w-0 md:col-span-1 xl:col-span-4"');
    expect(filters.match(/<div className="min-w-0">/g)).toHaveLength(2);
  });
});
