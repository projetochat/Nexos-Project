import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const customerSource = readFileSync(new URL("./clientes.tsx", import.meta.url), "utf8");
const platformSource = readFileSync(new URL("./admin.empresas.tsx", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../lib/trixus-api.ts", import.meta.url), "utf8");
const locationFieldsSource = readFileSync(
  new URL("../components/international-location-fields.tsx", import.meta.url),
  "utf8",
);

describe("international city integration in client registration", () => {
  it.each([
    ["cliente da tenant", customerSource],
    ["cliente da Platform", platformSource],
  ])("uses the shared async location selector in %s", (_label, source) => {
    expect(source).toContain("<InternationalLocationFields");
    expect(source).toContain("cityId:");
    expect(source).toContain("country:");
  });

  it("keeps a single paginated location API contract", () => {
    expect(apiSource).toContain('apiRequest<ApiCountry[]>("/locations/countries")');
    expect(apiSource).toContain("`/locations/divisions${queryString({ countryCode })}`");
    expect(apiSource).toContain("apiRequest<PaginatedResponse<ApiCity>>");
  });

  it("resolves ViaCEP text to a canonical Brazilian city", () => {
    expect(customerSource).toContain("locationApi.cities({");
    expect(customerSource).toContain('countryCode: "BR"');
    expect(customerSource).toContain("canonicalLocation?.cityId");
  });

  it("keeps city, UF and country in the requested order with the city search icon inside", () => {
    const city = locationFieldsSource.indexOf('<Field label="Cidade *"');
    const division = locationFieldsSource.indexOf('value.countryCode === "BR"', city);
    const country = locationFieldsSource.indexOf(
      'label={lockDivisionAndCountry ? "País" : "País *"}',
      division,
    );

    expect(city).toBeGreaterThan(-1);
    expect(division).toBeGreaterThan(city);
    expect(country).toBeGreaterThan(division);
    expect(locationFieldsSource).toContain(
      'className={`pl-10 pr-9 ${errorPresentation === "border" && cityError',
    );
    expect(locationFieldsSource).toContain(
      'className="pointer-events-none absolute left-3 top-1/2 h-4 w-4',
    );
    expect(locationFieldsSource).toContain(
      "sm:grid-cols-[minmax(0,2.335fr)_minmax(10rem,0.75fr)_minmax(10.2rem,0.765fr)]",
    );
    expect(locationFieldsSource).toContain('"Digite o nome da cidade..."');
    expect(locationFieldsSource).not.toContain('"Digite ao menos 2 caracteres..."');
  });

  it("presents city results as city and abbreviated state without country", () => {
    expect(locationFieldsSource).toContain(
      '[city.name, city.divisionCode || city.divisionName].filter(Boolean).join(" - ")',
    );
    expect(locationFieldsSource).not.toContain(
      "[city.name, city.divisionName || city.divisionCode, city.countryName]",
    );
  });

  it("opens every city result list upward", () => {
    expect(locationFieldsSource).toContain('cityResultsPlacement?: "top" | "bottom"');
    expect(locationFieldsSource).toContain('cityResultsPlacement = "top"');
    expect(locationFieldsSource).toContain(
      'cityResultsPlacement === "top" ? "bottom-full mb-1" : "top-full mt-1"',
    );
    expect(locationFieldsSource).toContain('className="absolute bottom-full z-50 mb-1');
    expect(customerSource).toContain('cityResultsPlacement="top"');
    expect(customerSource).not.toContain(
      'cityResultsPlacement={form.fullAddress ? "bottom" : "top"}',
    );
    expect(platformSource).toContain('cityResultsPlacement="top"');
  });

  it("protects every derived state while keeping country editable on Platform", () => {
    expect(locationFieldsSource).toContain("lockDivision?: boolean");
    expect(locationFieldsSource).toContain("lockDivisionAndCountry?: boolean");
    expect(locationFieldsSource).toContain('value={value.state || "-"}');
    expect(locationFieldsSource).toContain('aria-label="UF definida pela cidade"');
    expect(locationFieldsSource).toContain(
      "disabled={disabled || lockDivisionAndCountry || countries.isPending}",
    );
    expect(customerSource).toContain("lockDivisionAndCountry");
    expect(platformSource).not.toContain("lockDivisionAndCountry");
    expect(platformSource).toContain("lockDivision");
  });

  it("reuses the centralized city autocomplete in customer branches", () => {
    expect(customerSource).toContain("<CityAutocomplete");
    expect(customerSource).toContain("onCitySelect={(selectedCity) =>");
    expect(customerSource).toContain("selectedCity.divisionCode || selectedCity.divisionName");
  });

  it("shows only the UF abbreviation and transfers its reduced width to city", () => {
    expect(locationFieldsSource).toContain("divisionCodeOnly?: boolean");
    expect(locationFieldsSource).toContain("division.code || division.name");
    expect(customerSource).toContain("divisionCodeOnly");
    expect(customerSource).toContain(
      "sm:grid-cols-[minmax(0,2.8225fr)_minmax(5rem,0.2625fr)_minmax(10.2rem,0.765fr)]",
    );
    expect(platformSource).not.toContain("divisionCodeOnly");
  });

  it("uses border-only city validation in the normal client form", () => {
    expect(locationFieldsSource).toContain('errorPresentation?: "message" | "border"');
    expect(locationFieldsSource).toContain(
      'error={errorPresentation === "message" ? cityError : undefined}',
    );
    expect(customerSource).toContain('errorPresentation="border"');
    expect(platformSource).toContain('errorPresentation="border"');
  });
});
