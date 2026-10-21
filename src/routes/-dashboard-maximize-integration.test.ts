import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./index.tsx", import.meta.url), "utf8");

describe("maximização dos componentes do dashboard principal", () => {
  it("reutiliza o frame de maximização em cada componente configurável", () => {
    expect(source).toContain(
      'import { DashboardMaximizeFrame } from "@/components/dashboard-maximize-frame";',
    );

    const mapStart = source.indexOf("{visibleComponents.map((component) => (");
    const emptyStateStart = source.indexOf("{visibleComponents.length === 0", mapStart);
    const componentMap = source.slice(mapStart, emptyStateStart);

    expect(componentMap).toContain("<DashboardMaximizeFrame title={component.title}>");
    expect(componentMap).toContain("</DashboardMaximizeFrame>");
    expect(componentMap).toContain("<MessageTrafficWidget");
    expect(componentMap).toContain("<DashboardComponentRenderer");
    expect(componentMap).toContain('<Card className="h-full">');
  });
});
