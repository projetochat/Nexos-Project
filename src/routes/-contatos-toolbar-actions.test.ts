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

  it("usa o olho na ação de visualizar do desktop e do mobile", () => {
    const actionsStart = contactsSource.indexOf("function ContactActions");
    const actionsEnd = contactsSource.indexOf("function ContactGridConfiguration", actionsStart);
    const desktopActions = contactsSource.slice(actionsStart, actionsEnd);

    expect(desktopActions).toContain('<Eye className="h-3.5 w-3.5" />');
    expect(desktopActions).not.toContain('<MoreHorizontal className="h-3.5 w-3.5" />');
    expect(contactsSource.slice(0, actionsStart)).toContain("<ContactActions");
  });

  it("separa as ações por uma linha nos cards mobile e desktop", () => {
    const mobileStart = contactsSource.indexOf('<div className="space-y-3 md:hidden">');
    const listStart = contactsSource.indexOf('{viewMode === "list"', mobileStart);
    const cardsStart = contactsSource.indexOf(
      '<div className="hidden gap-3 md:grid md:grid-cols-3">',
      listStart,
    );
    const cardsEnd = contactsSource.indexOf("data-contacts-list-footer", cardsStart);
    const mobileCards = contactsSource.slice(mobileStart, listStart);
    const desktopCards = contactsSource.slice(cardsStart, cardsEnd);

    for (const cardView of [mobileCards, desktopCards]) {
      expect(cardView).toContain(
        '<div className="mx-3 flex justify-end border-t border-border py-2">',
      );
      expect(cardView).toContain("<ContactActions");
    }

    const desktopTable = contactsSource.slice(listStart, cardsStart);
    expect(desktopTable).toContain('<td className="sticky right-0 bg-card px-3 py-3');
    expect(desktopTable).not.toContain(
      '<div className="mx-3 flex justify-end border-t border-border py-2">',
    );
  });
});
