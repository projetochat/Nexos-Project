import { describe, expect, it } from "vitest";
import {
  locationAfterCountryChange,
  locationAfterDivisionChange,
  locationFromCity,
  type InternationalLocationValue,
} from "./international-location-value";

const current: InternationalLocationValue = {
  cityId: "city-goiania",
  city: "Goiânia",
  divisionId: "state-go",
  state: "GO",
  countryCode: "BR",
  country: "Brasil",
};

describe("international location selection", () => {
  it("clears an incompatible division and city when the country changes", () => {
    expect(locationAfterCountryChange(current, { id: "pt", code: "PT", name: "Portugal" })).toEqual(
      {
        cityId: "",
        city: "",
        divisionId: "",
        state: "",
        countryCode: "PT",
        country: "Portugal",
      },
    );
  });

  it("clears the city when the administrative division changes", () => {
    expect(
      locationAfterDivisionChange(current, {
        id: "state-sp",
        code: "SP",
        name: "São Paulo",
        countryCode: "BR",
      }),
    ).toMatchObject({ cityId: "", city: "", divisionId: "state-sp", state: "SP" });
  });

  it("persists the canonical identifiers and snapshots from the selected city", () => {
    expect(
      locationFromCity({
        id: "city-lisbon",
        name: "Lisboa",
        countryCode: "PT",
        countryName: "Portugal",
        divisionId: "district-lisbon",
        divisionCode: "11",
        divisionName: "Lisboa",
        ibgeCode: null,
        geonamesId: "2267057",
      }),
    ).toEqual({
      cityId: "city-lisbon",
      city: "Lisboa",
      divisionId: "district-lisbon",
      state: "11",
      countryCode: "PT",
      country: "Portugal",
    });
  });
});
