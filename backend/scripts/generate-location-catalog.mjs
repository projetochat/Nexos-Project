import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, resolve } from "node:path";
import { createInterface } from "node:readline";
import { gzipSync } from "node:zlib";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const args = new Map(
  process.argv.slice(2).map((argument) => {
    const [key, ...value] = argument.split("=");
    return [key, value.join("=") || true];
  }),
);

const sourceFiles = {
  countries: requiredPath("--countries"),
  divisions: requiredPath("--divisions"),
  cities: requiredPath("--cities"),
  citiesArchive: requiredPath("--cities-archive"),
  ibge: requiredPath("--ibge-xls"),
  ibgeArchive: requiredPath("--ibge-archive"),
};
const outputDir = resolve(String(args.get("--output") || "backend/data/locations/catalog-v1"));
const snapshotDate = String(args.get("--snapshot-date") || "");
const expectedIbgeBaseDate = "31/12/2025";
const expectedIbgeMunicipalities = 5571;
const shardSize = 25_000;

if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) {
  throw new Error("Informe --snapshot-date=AAAA-MM-DD.");
}
mkdirSync(outputDir, { recursive: true });
if (readdirSync(outputDir).length > 0) {
  throw new Error(`Diretório de saída deve estar vazio: ${outputDir}`);
}

const brazilianStates = new Map([
  ["11", { code: "RO", name: "Rondônia" }],
  ["12", { code: "AC", name: "Acre" }],
  ["13", { code: "AM", name: "Amazonas" }],
  ["14", { code: "RR", name: "Roraima" }],
  ["15", { code: "PA", name: "Pará" }],
  ["16", { code: "AP", name: "Amapá" }],
  ["17", { code: "TO", name: "Tocantins" }],
  ["21", { code: "MA", name: "Maranhão" }],
  ["22", { code: "PI", name: "Piauí" }],
  ["23", { code: "CE", name: "Ceará" }],
  ["24", { code: "RN", name: "Rio Grande do Norte" }],
  ["25", { code: "PB", name: "Paraíba" }],
  ["26", { code: "PE", name: "Pernambuco" }],
  ["27", { code: "AL", name: "Alagoas" }],
  ["28", { code: "SE", name: "Sergipe" }],
  ["29", { code: "BA", name: "Bahia" }],
  ["31", { code: "MG", name: "Minas Gerais" }],
  ["32", { code: "ES", name: "Espírito Santo" }],
  ["33", { code: "RJ", name: "Rio de Janeiro" }],
  ["35", { code: "SP", name: "São Paulo" }],
  ["41", { code: "PR", name: "Paraná" }],
  ["42", { code: "SC", name: "Santa Catarina" }],
  ["43", { code: "RS", name: "Rio Grande do Sul" }],
  ["50", { code: "MS", name: "Mato Grosso do Sul" }],
  ["51", { code: "MT", name: "Mato Grosso" }],
  ["52", { code: "GO", name: "Goiás" }],
  ["53", { code: "DF", name: "Distrito Federal" }],
]);

const countries = new Map();
await forEachTsv(sourceFiles.countries, (row) => {
  const code = row[0]?.trim();
  if (!/^[A-Z]{2}$/.test(code || "")) return;
  countries.set(code, [code, code === "BR" ? "Brasil" : row[4].trim(), row[16] || null]);
});

const divisions = new Map();
await forEachTsv(sourceFiles.divisions, (row) => {
  const [compoundCode, name, , geonamesId] = row;
  const separator = compoundCode?.indexOf(".") ?? -1;
  if (separator < 1) return;
  const countryCode = compoundCode.slice(0, separator);
  const code = compoundCode.slice(separator + 1);
  if (!countries.has(countryCode) || countryCode === "BR" || !code || !name) return;
  divisions.set(`${countryCode}.${code}`, [countryCode, code, name, geonamesId || null]);
});

const citiesByKey = new Map();
await forEachTsv(sourceFiles.cities, (row) => {
  const geonamesId = row[0]?.trim();
  const name = row[1]?.trim();
  const countryCode = row[8]?.trim();
  if (!geonamesId || !name || row[6] !== "P" || countryCode === "BR") return;
  if (!countries.has(countryCode)) return;
  const sourceDivisionCode = row[10]?.trim() || null;
  const divisionCode =
    sourceDivisionCode && divisions.has(`${countryCode}.${sourceDivisionCode}`)
      ? sourceDivisionCode
      : null;
  const normalizedName = normalize(row[2] || name);
  if (!normalizedName) return;
  const dedupeKey = `${countryCode}|${divisionCode || "-"}|${normalizedName}`;
  const population = Number.parseInt(row[14] || "0", 10) || 0;
  const candidate = {
    row: [
      name,
      normalizedName,
      dedupeKey,
      countryCode,
      divisionCode,
      null,
      geonamesId,
      finiteNumber(row[4]),
      finiteNumber(row[5]),
    ],
    population,
    geonamesId: Number.parseInt(geonamesId, 10),
  };
  const current = citiesByKey.get(dedupeKey);
  if (
    !current ||
    candidate.population > current.population ||
    (candidate.population === current.population && candidate.geonamesId < current.geonamesId)
  ) {
    citiesByKey.set(dedupeKey, candidate);
  }
});

const ibge = readIbgeMunicipalities(sourceFiles.ibge);
for (const state of brazilianStates.values()) {
  divisions.set(`BR.${state.code}`, ["BR", state.code, state.name, null]);
}
for (const city of ibge.cities) {
  const normalizedName = normalize(city.name);
  const dedupeKey = `BR|${city.stateCode}|${normalizedName}`;
  citiesByKey.set(dedupeKey, {
    row: [
      city.name,
      normalizedName,
      dedupeKey,
      "BR",
      city.stateCode,
      city.ibgeCode,
      null,
      null,
      null,
    ],
    population: 0,
    geonamesId: 0,
  });
}

const records = {
  countries: [...countries.values()].sort((a, b) => a[0].localeCompare(b[0])),
  divisions: [...divisions.values()].sort((a, b) =>
    `${a[0]}.${a[1]}`.localeCompare(`${b[0]}.${b[1]}`),
  ),
  cities: [...citiesByKey.values()]
    .map((entry) => entry.row)
    .sort((a, b) =>
      `${a[3]}|${a[4] || "-"}|${a[1]}|${a[6] || a[5]}`.localeCompare(
        `${b[3]}|${b[4] || "-"}|${b[1]}|${b[6] || b[5]}`,
      ),
    ),
};

const catalogHash = createHash("sha256");
const files = [];
writeShards("countries", records.countries, records.countries.length);
writeShards("divisions", records.divisions, records.divisions.length);
writeShards("cities", records.cities, shardSize);

const manifest = {
  schemaVersion: 1,
  version: `geonames-cities500-${snapshotDate}_ibge-dtb-2025`,
  snapshotDate,
  catalogSha256: catalogHash.digest("hex"),
  counts: {
    countries: records.countries.length,
    divisions: records.divisions.length,
    cities: records.cities.length,
    brazilianMunicipalities: ibge.cities.length,
  },
  sources: [
    source(
      "GeoNames countryInfo",
      sourceFiles.countries,
      "https://download.geonames.org/export/dump/countryInfo.txt",
      "CC BY 4.0",
    ),
    source(
      "GeoNames admin1CodesASCII",
      sourceFiles.divisions,
      "https://download.geonames.org/export/dump/admin1CodesASCII.txt",
      "CC BY 4.0",
    ),
    source(
      "GeoNames cities500",
      sourceFiles.cities,
      "https://download.geonames.org/export/dump/cities500.zip",
      "CC BY 4.0",
      sourceFiles.citiesArchive,
    ),
    source(
      "IBGE DTB 2025 municípios",
      sourceFiles.ibge,
      "https://geoftp.ibge.gov.br/organizacao_do_territorio/estrutura_territorial/divisao_territorial/2025/DTB_2025.zip",
      "Arquivo público do IBGE",
      sourceFiles.ibgeArchive,
    ),
  ],
  files,
};
writeFileSync(resolve(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest, null, 2));

function requiredPath(name) {
  const value = args.get(name);
  if (typeof value !== "string") throw new Error(`Informe ${name}=CAMINHO.`);
  const path = resolve(value);
  if (!existsSync(path)) throw new Error(`Arquivo ausente: ${path}`);
  return path;
}

async function forEachTsv(path, consume) {
  const reader = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of reader) {
    if (line && !line.startsWith("#")) consume(line.split("\t"));
  }
}

function normalize(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("en-US");
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function readIbgeMunicipalities(path) {
  const workbook = XLSX.readFile(path, { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("A planilha do IBGE não possui abas.");
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: null,
    raw: false,
  });
  const headers = ["UF", "Nome_UF", "Código Município Completo", "Nome_Município"];
  const baseDate = rows
    .flat()
    .find((value) => typeof value === "string" && value.trim().startsWith("DATA BASE:"))
    ?.split(":")
    .slice(1)
    .join(":")
    .trim();
  if (baseDate !== expectedIbgeBaseDate) {
    throw new Error(`Data-base IBGE inválida: ${baseDate || "ausente"}.`);
  }
  const headerIndex = rows.findIndex((row) => headers.every((header) => row.includes(header)));
  if (headerIndex < 0) throw new Error("Cabeçalho da planilha IBGE não encontrado.");
  const header = rows[headerIndex];
  const column = Object.fromEntries(headers.map((name) => [name, header.indexOf(name)]));
  const seen = new Set();
  const states = new Set();
  const cities = [];
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row.some((value) => value !== null && String(value).trim())) continue;
    const numericStateCode = String(row[column.UF] ?? "")
      .trim()
      .padStart(2, "0");
    const state = brazilianStates.get(numericStateCode);
    const stateName = String(row[column.Nome_UF] ?? "").trim();
    const ibgeCode = String(row[column["Código Município Completo"]] ?? "").trim();
    const name = String(row[column.Nome_Município] ?? "").trim();
    if (!state || normalize(state.name) !== normalize(stateName)) {
      throw new Error(`UF inválida na linha ${index + 1}.`);
    }
    if (!/^\d{7}$/.test(ibgeCode) || !ibgeCode.startsWith(numericStateCode)) {
      throw new Error(`Código municipal inválido na linha ${index + 1}: ${ibgeCode}.`);
    }
    if (!name || seen.has(ibgeCode))
      throw new Error(`Município inválido ou duplicado: ${ibgeCode}.`);
    seen.add(ibgeCode);
    states.add(numericStateCode);
    cities.push({ ibgeCode, name, stateCode: state.code });
  }
  if (states.size !== 27 || cities.length !== expectedIbgeMunicipalities) {
    throw new Error(`DTB inválida: ${states.size} UFs e ${cities.length} municípios.`);
  }
  return { baseDate, cities };
}

function writeShards(kind, values, maximumRows) {
  for (let offset = 0, index = 1; offset < values.length; offset += maximumRows, index += 1) {
    const shard = values.slice(offset, offset + maximumRows);
    const text = `${shard.map((row) => JSON.stringify(row)).join("\n")}\n`;
    catalogHash.update(kind).update("\0").update(text);
    const content = gzipSync(text, { level: 9, mtime: 0 });
    const name = `${kind}-${String(index).padStart(3, "0")}.jsonl.gz`;
    writeFileSync(resolve(outputDir, name), content);
    files.push({
      name,
      kind,
      rows: shard.length,
      bytes: content.length,
      sha256: createHash("sha256").update(content).digest("hex"),
    });
  }
}

function source(name, path, url, license, archivePath = null) {
  return {
    name,
    file: basename(path),
    url,
    license,
    sha256: createHash("sha256").update(require("node:fs").readFileSync(path)).digest("hex"),
    ...(archivePath
      ? {
          archiveFile: basename(archivePath),
          archiveSha256: createHash("sha256")
            .update(require("node:fs").readFileSync(archivePath))
            .digest("hex"),
        }
      : {}),
  };
}
