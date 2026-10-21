import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./admin.financeiro.tsx", import.meta.url), "utf8");

describe("larguras da grade do Financeiro Platform", () => {
  it("uniformiza plano e valores e amplia o espaço de status", () => {
    const tableStart = source.indexOf("data-platform-desktop-table");
    const colgroupStart = source.indexOf("<colgroup>", tableStart);
    const colgroupEnd = source.indexOf("</colgroup>", colgroupStart);
    const colgroup = source.slice(colgroupStart, colgroupEnd);
    const widths = [...colgroup.matchAll(/w-\[(\d+)%\]/g)].map((match) => Number(match[1]));

    expect(widths).toEqual([14, 13, 10, 10, 10, 10, 10, 12, 11]);
    expect(widths.reduce((total, width) => total + width, 0)).toBe(100);
    expect(widths[1]).toBe(13);
    expect(new Set(widths.slice(2, 7))).toEqual(new Set([10]));
    expect(widths[7]).toBe(12);
    expect(widths.at(-1)).toBe(11);
    expect(source.match(/className="whitespace-nowrap px-2 py-3 text-center"/g)).toHaveLength(2);
    expect(source).toContain(
      '<td className="whitespace-nowrap px-2 py-3 text-center">\n                      <InvoiceStatus',
    );
    expect(source).toContain(
      '<td className="whitespace-nowrap px-2 py-3">\n                      {formatInvoiceDueDate',
    );
  });
});
