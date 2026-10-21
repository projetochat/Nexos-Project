import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, MapPin, Search } from "lucide-react";
import { Field, Input, Select } from "@/components/ui-kit";
import {
  locationAfterCountryChange,
  locationAfterDivisionChange,
  locationFromCity,
  type InternationalLocationValue,
} from "@/components/international-location-value";
import { locationApi, type ApiCity } from "@/lib/trixus-api";

type Props = {
  value: InternationalLocationValue;
  onChange: (value: InternationalLocationValue) => void;
  cityError?: string;
  stateError?: string;
  disabled?: boolean;
  className?: string;
  cityResultsPlacement?: "top" | "bottom";
  lockDivision?: boolean;
  lockDivisionAndCountry?: boolean;
  divisionCodeOnly?: boolean;
  errorPresentation?: "message" | "border";
};

function cityLabel(city: ApiCity) {
  return [city.name, city.divisionCode || city.divisionName].filter(Boolean).join(" - ");
}

export function CityAutocomplete({
  value,
  onChange,
  initialLabel,
  onSearchChange,
  onCitySelect,
  selectionLabel = "full",
  cityFieldLabel = "Cidade",
  initialDivision,
  showDivisionField = true,
  disabled,
  invalid,
}: {
  value: string;
  onChange: (cityId: string) => void;
  initialLabel?: string;
  onSearchChange?: (value: string) => void;
  onCitySelect?: (city: ApiCity) => void;
  selectionLabel?: "name" | "full";
  cityFieldLabel?: React.ReactNode;
  initialDivision?: string;
  showDivisionField?: boolean;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const [search, setSearch] = React.useState(initialLabel ?? "");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const clearingFromInput = React.useRef(false);
  const selectedCity = useQuery({
    queryKey: ["locations", "city", value],
    queryFn: () => locationApi.city(value),
    enabled: Boolean(value),
    staleTime: 60 * 60 * 1000,
  });

  React.useEffect(() => {
    if (selectedCity.data)
      setSearch(selectionLabel === "name" ? selectedCity.data.name : cityLabel(selectedCity.data));
    if (!value && !clearingFromInput.current) setSearch(initialLabel ?? "");
    clearingFromInput.current = false;
  }, [initialLabel, selectedCity.data, selectionLabel, value]);
  React.useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const cities = useQuery({
    queryKey: ["locations", "cities", "custom-field", debouncedSearch],
    queryFn: () => locationApi.cities({ q: debouncedSearch, page: 1, pageSize: 20 }),
    enabled:
      !disabled &&
      open &&
      debouncedSearch.length >= 2 &&
      debouncedSearch !== (selectedCity.data ? cityLabel(selectedCity.data) : ""),
    staleTime: 5 * 60 * 1000,
  });
  const divisionLabel = value
    ? selectedCity.data?.divisionCode || selectedCity.data?.divisionName || initialDivision || "-"
    : initialDivision || "-";

  return (
    <div
      className={showDivisionField ? "grid w-full grid-cols-[minmax(0,1fr)_5rem] gap-3" : "w-full"}
    >
      <div className="min-w-0">
        <div className="mb-1.5 flex min-h-4 items-center gap-1.5 text-xs font-medium leading-none text-muted-foreground">
          {cityFieldLabel}
        </div>
        <div className="relative w-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            disabled={disabled}
            readOnly={disabled}
            autoComplete="off"
            aria-invalid={invalid}
            className="pl-9 pr-9"
            placeholder="Pesquisar cidade..."
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 120)}
            onChange={(event) => {
              setSearch(event.target.value);
              onSearchChange?.(event.target.value);
              clearingFromInput.current = true;
              onChange("");
              setOpen(true);
            }}
          />
          {selectedCity.isFetching || cities.isFetching ? (
            <LoaderCircle className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : null}
          {!disabled && open && debouncedSearch.length >= 2 ? (
            <div className="absolute bottom-full z-50 mb-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-lg">
              {cities.data?.items.map((city) => (
                <button
                  key={city.id}
                  type="button"
                  className="flex w-full items-start gap-2 rounded px-3 py-2 text-left text-sm hover:bg-muted"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(city.id);
                    onCitySelect?.(city);
                    setSearch(selectionLabel === "name" ? city.name : cityLabel(city));
                    setOpen(false);
                  }}
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{cityLabel(city)}</span>
                </button>
              ))}
              {!cities.isFetching && cities.data?.items.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">
                  Nenhuma cidade encontrada.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {showDivisionField ? (
        <div>
          <span className="mb-1.5 block min-h-4 text-xs font-medium leading-none text-muted-foreground">
            UF
          </span>
          <Input value={divisionLabel} disabled aria-label="UF definida pela cidade" />
        </div>
      ) : null}
    </div>
  );
}

export function InternationalLocationFields({
  value,
  onChange,
  cityError,
  stateError,
  disabled,
  className,
  cityResultsPlacement = "top",
  lockDivision = false,
  lockDivisionAndCountry = false,
  divisionCodeOnly = false,
  errorPresentation = "message",
}: Props) {
  const [search, setSearch] = React.useState(value.city);
  const [debouncedSearch, setDebouncedSearch] = React.useState(value.city);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => setSearch(value.city), [value.city]);
  React.useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const countries = useQuery({
    queryKey: ["locations", "countries"],
    queryFn: locationApi.countries,
    staleTime: 60 * 60 * 1000,
  });
  const divisions = useQuery({
    queryKey: ["locations", "divisions", value.countryCode],
    queryFn: () => locationApi.divisions(value.countryCode),
    enabled: Boolean(value.countryCode),
    staleTime: 60 * 60 * 1000,
  });
  const cities = useQuery({
    queryKey: ["locations", "cities", value.countryCode, value.divisionId, debouncedSearch],
    queryFn: () =>
      locationApi.cities({
        q: debouncedSearch,
        countryCode: value.countryCode,
        divisionId: value.divisionId || undefined,
        page: 1,
        pageSize: 20,
      }),
    enabled: Boolean(value.countryCode && debouncedSearch.length >= 2),
    staleTime: 5 * 60 * 1000,
  });

  React.useEffect(() => {
    if (value.countryCode || !value.country || !countries.data) return;
    const normalized = value.country.trim().toLocaleLowerCase("pt-BR");
    const match = countries.data.find(
      (country) => country.name.trim().toLocaleLowerCase("pt-BR") === normalized,
    );
    if (match) onChange({ ...value, countryCode: match.code });
  }, [countries.data, onChange, value]);

  React.useEffect(() => {
    if (value.divisionId || !value.state || !divisions.data) return;
    const normalized = value.state.trim().toLocaleLowerCase("pt-BR");
    const match = divisions.data.find(
      (division) =>
        division.code.toLocaleLowerCase("pt-BR") === normalized ||
        division.name.toLocaleLowerCase("pt-BR") === normalized,
    );
    if (match) onChange({ ...value, divisionId: match.id, state: match.code || match.name });
  }, [divisions.data, onChange, value]);

  return (
    <div
      className={
        className ??
        "grid gap-4 sm:grid-cols-[minmax(0,2.335fr)_minmax(10rem,0.75fr)_minmax(10.2rem,0.765fr)]"
      }
    >
      <Field label="Cidade *" error={errorPresentation === "message" ? cityError : undefined}>
        <div className="relative">
          <Input
            value={search}
            disabled={disabled || !value.countryCode}
            autoComplete="off"
            aria-invalid={Boolean(cityError)}
            className={`pl-10 pr-9 ${errorPresentation === "border" && cityError ? "!border-destructive focus:!border-destructive" : ""}`}
            placeholder={value.countryCode ? "Digite o nome da cidade..." : "Selecione o país"}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 120)}
            onChange={(event) => {
              const city = event.target.value;
              setSearch(city);
              setOpen(true);
              onChange({ ...value, cityId: "", city });
            }}
          />
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          {cities.isFetching ? (
            <LoaderCircle className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : null}
          {open && debouncedSearch.length >= 2 ? (
            <div
              className={`absolute z-50 max-h-56 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-lg ${cityResultsPlacement === "top" ? "bottom-full mb-1" : "top-full mt-1"}`}
            >
              {cities.data?.items.map((city) => (
                <button
                  key={city.id}
                  type="button"
                  className="flex w-full items-start gap-2 rounded px-3 py-2 text-left text-sm hover:bg-muted"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(locationFromCity(city));
                    setSearch(city.name);
                    setOpen(false);
                  }}
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{cityLabel(city)}</span>
                </button>
              ))}
              {!cities.isFetching && cities.data?.items.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">
                  Nenhuma cidade encontrada.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </Field>
      <Field
        label={
          value.countryCode === "BR"
            ? `UF${lockDivision || lockDivisionAndCountry ? "" : " *"}`
            : `Estado / Província${lockDivision || lockDivisionAndCountry ? "" : " *"}`
        }
        error={stateError}
      >
        {lockDivision || lockDivisionAndCountry ? (
          <Input value={value.state || "-"} disabled aria-label="UF definida pela cidade" />
        ) : (
          <Select
            value={value.divisionId}
            disabled={disabled || !value.countryCode || divisions.isPending}
            onChange={(event) => {
              const division = divisions.data?.find((item) => item.id === event.target.value);
              onChange(locationAfterDivisionChange(value, division));
            }}
          >
            <option value="">Selecione...</option>
            {divisions.data?.map((division) => (
              <option key={division.id} value={division.id}>
                {divisionCodeOnly
                  ? division.code || division.name
                  : `${division.name}${division.code ? ` (${division.code})` : ""}`}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={lockDivisionAndCountry ? "País" : "País *"}>
        <Select
          value={value.countryCode}
          disabled={disabled || lockDivisionAndCountry || countries.isPending}
          onChange={(event) => {
            const country = countries.data?.find((item) => item.code === event.target.value);
            onChange(locationAfterCountryChange(value, country));
          }}
        >
          <option value="">Selecione...</option>
          {countries.data?.map((country) => (
            <option key={country.id} value={country.code}>
              {country.name}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
