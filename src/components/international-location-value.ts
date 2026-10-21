import type { ApiAdministrativeDivision, ApiCity, ApiCountry } from "@/lib/trixus-api";

export type InternationalLocationValue = {
  cityId: string;
  city: string;
  divisionId: string;
  state: string;
  countryCode: string;
  country: string;
};

export function locationAfterCountryChange(
  current: InternationalLocationValue,
  country?: ApiCountry,
): InternationalLocationValue {
  return {
    ...current,
    cityId: "",
    city: "",
    divisionId: "",
    state: "",
    countryCode: country?.code ?? "",
    country: country?.name ?? "",
  };
}

export function locationAfterDivisionChange(
  current: InternationalLocationValue,
  division?: ApiAdministrativeDivision,
): InternationalLocationValue {
  return {
    ...current,
    cityId: "",
    city: "",
    divisionId: division?.id ?? "",
    state: division?.code || division?.name || "",
  };
}

export function locationFromCity(city: ApiCity): InternationalLocationValue {
  return {
    cityId: city.id,
    city: city.name,
    divisionId: city.divisionId ?? "",
    state: city.divisionCode || city.divisionName || "",
    countryCode: city.countryCode,
    country: city.countryName,
  };
}
