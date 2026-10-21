import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const settingsSource = readFileSync(
  new URL("./configuracoes.campos-contato.tsx", import.meta.url),
  "utf8",
);
const contactsSource = readFileSync(new URL("./contatos.tsx", import.meta.url), "utf8");
const formatsSource = readFileSync(
  new URL("../lib/custom-field-formats.ts", import.meta.url),
  "utf8",
);
const locationFieldsSource = readFileSync(
  new URL("../components/international-location-fields.tsx", import.meta.url),
  "utf8",
);

describe("city custom contact field", () => {
  it("offers Cidade through the existing custom format selector", () => {
    expect(formatsSource).toContain('{ value: "city", label: "Cidade" }');
    expect(settingsSource).toContain("CUSTOM_FIELD_FORMATS.map");
  });

  it("uses the shared city autocomplete and stores its identifier", () => {
    expect(contactsSource).toContain('if (format === "city")');
    expect(contactsSource).toContain("<CityAutocomplete");
    expect(contactsSource).toContain("onChange={(cityId) => onChange(cityId)}");
  });

  it("standardizes the city search with a leading icon and a protected UF", () => {
    expect(contactsSource).toContain("cityFieldLabel={");
    expect(locationFieldsSource).toContain(
      'className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4',
    );
    expect(locationFieldsSource).toContain('aria-label="UF definida pela cidade"');
    expect(locationFieldsSource).toContain('initialDivision || "-"');
    expect(locationFieldsSource).toContain('className="absolute bottom-full z-50 mb-1');
  });

  it("resolves the city description in contact grid visualization", () => {
    expect(contactsSource).toContain("<CityReferenceLabel");
    expect(contactsSource).toContain("locationApi.city(cityId)");
  });
});
