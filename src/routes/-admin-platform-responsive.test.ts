import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSources = [
  "admin.empresas.tsx",
  "admin.assinaturas.tsx",
  "admin.financeiro.tsx",
  "admin.tenants.tsx",
].map((file) => ({ file, source: readFileSync(new URL(`./${file}`, import.meta.url), "utf8") }));

describe("Platform responsive card and table views", () => {
  it.each(routeSources)(
    "forces cards on mobile and keeps both desktop views in $file",
    ({ source }) => {
      expect(source).toContain("data-platform-mobile-list");
      expect(source).toContain("data-platform-desktop-table");
      expect(source).toContain(
        'const [viewMode, setViewMode] = React.useState<"cards" | "list">("list")',
      );
      expect(source).toContain('if (isMobile) {\n      setViewMode("cards");\n      return;');
      expect(source).toMatch(/className="(?:mb|mt)-3 hidden justify-end gap-1 md:flex"/);
      expect(source).toContain('viewMode === "cards"');
      expect(source).toContain('viewMode === "list"');
    },
  );

  it.each([
    { source: routeSources[0].source, label: "clientes" },
    { source: routeSources[1].source, label: "assinaturas" },
    { source: routeSources[2].source, label: "faturas" },
    { source: routeSources[3].source, label: "tenants" },
  ])("provides accessible desktop card and list controls for $label", ({ source, label }) => {
    expect(source).toContain(`aria-label="Visualizar ${label} em cards"`);
    expect(source).toContain(`aria-label="Visualizar ${label} em lista"`);
  });

  it.each(routeSources)("keeps the independent card footer visible in $file", ({ source }) => {
    const cardStart = source.indexOf("data-platform-mobile-list");
    const tableStart = source.indexOf("data-platform-desktop-table", cardStart);
    const cardView = source.slice(cardStart, tableStart);

    expect(cardView).toContain("data-platform-card-pagination");
    expect(cardView).toContain('className="overflow-hidden rounded-xl border border-border"');
    expect(cardView).not.toContain('className="hidden md:block" data-platform-card-pagination');
    expect(cardView).toContain("{paginationFooter}");
    expect(source.match(/\{paginationFooter\}/g)).toHaveLength(2);
  });

  it.each(routeSources)(
    "removes the outer card shell in every breakpoint in $file",
    ({ source }) => {
      const shellStart = source.indexOf("data-platform-card-shell");
      const mobileListStart = source.indexOf("data-platform-mobile-list", shellStart);
      const shellOpening = source.slice(shellStart, mobileListStart);
      const mobileListOpening = source.slice(
        mobileListStart,
        source.indexOf(">", mobileListStart) + 1,
      );

      expect(shellStart).toBeGreaterThan(-1);
      expect(shellOpening).toContain("space-y-3");
      expect(shellOpening).not.toContain("md:bg-card md:shadow-card");
      expect(shellOpening).not.toContain("md:border");
      expect(shellOpening).not.toContain("<Card");
      expect(mobileListOpening).not.toContain("md:p-4");
      expect(mobileListOpening).not.toMatch(/\sp-3(?:\s|")/);
      expect(mobileListOpening).not.toMatch(/\ssm:p-4(?:\s|")/);
    },
  );

  it("preserves actions in cards and lists with each screen's intended presentation", () => {
    const clients = routeSources[0].source;
    const subscriptions = routeSources[1].source;
    const invoices = routeSources[2].source;
    const tenants = routeSources[3].source;

    expect(clients.match(/<ClientActions/g)).toHaveLength(2);
    expect(subscriptions.match(/<SubscriptionCardActions/g)).toHaveLength(1);
    expect(subscriptions.match(/<Actions/g)).toHaveLength(1);
    expect(invoices.match(/<InvoiceActions/g)).toHaveLength(2);
    expect(tenants.match(/<TenantCardActions/g)).toHaveLength(1);
    expect(tenants.match(/<TenantActions/g)).toHaveLength(1);
  });

  it("keeps invoice cards and grid free from selection checkboxes", () => {
    const invoices = routeSources[2].source;
    expect(invoices).not.toContain("Selecionar todas as faturas visíveis");
    expect(invoices).not.toContain("toggleAllVisible");
    expect(invoices).not.toContain("selectedIds");

    const financeViewStart = invoices.indexOf("data-platform-mobile-list");
    const financeViewEnd = invoices.indexOf("<InvoiceForm", financeViewStart);
    expect(invoices.slice(financeViewStart, financeViewEnd)).not.toContain('type="checkbox"');
  });
});
