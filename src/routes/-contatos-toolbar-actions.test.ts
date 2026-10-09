import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("contacts toolbar and duplicate action styles", () => {
  const contactsSource = readFileSync(new URL("./contatos.tsx", import.meta.url), "utf8");
  const stylesSource = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

  it("places the grid configuration immediately after the list view button", () => {
    const listButtonStart = contactsSource.indexOf('aria-label="Visualizar contatos em lista"');
    const gridConfiguration = contactsSource.indexOf("<ContactGridConfiguration", listButtonStart);
    const toolbarEnd = contactsSource.indexOf("</div>", gridConfiguration);

    expect(listButtonStart).toBeGreaterThan(-1);
    expect(gridConfiguration).toBeGreaterThan(listButtonStart);
    expect(gridConfiguration).toBeLessThan(toolbarEnd);
    expect(contactsSource.match(/<ContactGridConfiguration/g)).toHaveLength(1);
  });

  it("keeps duplicate actions gray by default and blue only on hover", () => {
    expect(stylesSource).toMatch(
      /\.duplicate-action-button \{[\s\S]*?border-color: var\(--border\);[\s\S]*?background-color: var\(--surface-2\);[\s\S]*?color: var\(--foreground\);[\s\S]*?\}/,
    );
    expect(stylesSource).toMatch(
      /\.duplicate-action-button:hover \{[\s\S]*?border-color: color-mix\(in oklab, var\(--color-primary\) 55%, var\(--border\)\);[\s\S]*?background-color: color-mix\(in oklab, var\(--color-primary\) 12%, transparent\);[\s\S]*?color: var\(--color-primary\);[\s\S]*?\}/,
    );
  });
});
