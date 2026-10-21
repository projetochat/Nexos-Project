import { createReadStream, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("../src/generated/prisma");

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.split("=");
    return [key, value.join("=") || true];
  }),
);
const apply = args.has("--apply");
const sourceDir = resolve(String(args.get("--source-dir") || "tmp/geonames"));
const ibgeXlsArg = args.get("--ibge-xls");
const ibgeXlsPath = typeof ibgeXlsArg === "string" ? resolve(ibgeXlsArg) : null;
const includeGeoNames = !ibgeXlsPath && !args.has("--skip-geonames");
const includeIbge = !args.has("--skip-ibge");
const includeBackfill = args.has("--with-backfill");
const requiredFiles = ["countryInfo.txt", "admin1CodesASCII.txt", "cities500.txt"];
const expectedIbge2025MunicipalityCount = 5571;
const expectedIbge2025BaseDate = "31/12/2025";
const normalize = (value) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

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

function readIbgeSpreadsheet(filePath) {
  if (!existsSync(filePath)) throw new Error(`Planilha do IBGE ausente: ${filePath}`);
  const XLSX = require("xlsx");
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("A planilha do IBGE não possui abas.");
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: null,
    raw: false,
  });
  const requiredHeaders = ["UF", "Nome_UF", "Código Município Completo", "Nome_Município"];
  const baseDate = rows
    .flat()
    .find((value) => typeof value === "string" && value.trim().startsWith("DATA BASE:"))
    ?.split(":")
    .slice(1)
    .join(":")
    .trim();
  if (baseDate !== expectedIbge2025BaseDate) {
    throw new Error(
      `Data-base da planilha inválida: ${baseDate || "não informada"}. Esperado: ${expectedIbge2025BaseDate}.`,
    );
  }
  const headerIndex = rows.findIndex((row) =>
    requiredHeaders.every((header) => row.includes(header)),
  );
  if (headerIndex < 0) {
    throw new Error(
      `Cabeçalho do IBGE inválido. Colunas esperadas: ${requiredHeaders.join(", ")}.`,
    );
  }
  const header = rows[headerIndex];
  const column = Object.fromEntries(requiredHeaders.map((name) => [name, header.indexOf(name)]));
  const cities = [];
  const seenCodes = new Set();
  const statesFound = new Set();

  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row.some((value) => value !== null && String(value).trim())) continue;
    const sourceRow = index + 1;
    const stateNumericCode = String(row[column.UF] ?? "")
      .trim()
      .padStart(2, "0");
    const stateName = String(row[column.Nome_UF] ?? "").trim();
    const ibgeCode = String(row[column["Código Município Completo"]] ?? "").trim();
    const name = String(row[column.Nome_Município] ?? "").trim();
    const state = brazilianStates.get(stateNumericCode);
    if (!state || normalize(state.name) !== normalize(stateName)) {
      throw new Error(`UF inválida na linha ${sourceRow}: ${stateNumericCode} - ${stateName}.`);
    }
    if (!/^\d{7}$/.test(ibgeCode) || !ibgeCode.startsWith(stateNumericCode)) {
      throw new Error(`Código municipal inválido na linha ${sourceRow}: ${ibgeCode}.`);
    }
    if (!name) throw new Error(`Nome do município ausente na linha ${sourceRow}.`);
    if (seenCodes.has(ibgeCode)) throw new Error(`Código municipal duplicado: ${ibgeCode}.`);
    seenCodes.add(ibgeCode);
    statesFound.add(stateNumericCode);
    cities.push({ ibgeCode, name, stateCode: state.code, stateName: state.name });
  }
  if (statesFound.size !== brazilianStates.size) {
    const missing = [...brazilianStates.keys()].filter((code) => !statesFound.has(code));
    throw new Error(`A planilha não contém todas as 27 UFs. Ausentes: ${missing.join(", ")}.`);
  }
  if (cities.length !== expectedIbge2025MunicipalityCount) {
    throw new Error(
      `Quantidade de municípios inválida para a DTB 2025: ${cities.length}. ` +
        `Esperado: ${expectedIbge2025MunicipalityCount}.`,
    );
  }
  return { sheetName, headerRow: headerIndex + 1, baseDate, cities, statesFound };
}

let ibgeSpreadsheet = null;
if (ibgeXlsArg === true)
  throw new Error("Informe o arquivo em --ibge-xls=C:\\caminho\\arquivo.xls");
if (ibgeXlsPath) {
  ibgeSpreadsheet = readIbgeSpreadsheet(ibgeXlsPath);
  console.log(
    `Planilha IBGE validada: ${ibgeSpreadsheet.cities.length} municípios, ` +
      `${ibgeSpreadsheet.statesFound.size} UFs, aba ${ibgeSpreadsheet.sheetName}, ` +
      `data-base ${ibgeSpreadsheet.baseDate}, cabeçalho na linha ${ibgeSpreadsheet.headerRow}.`,
  );
}

if (!apply) {
  console.log("Prévia segura: nenhuma gravação realizada. Use --apply para importar.");
  if (!ibgeXlsPath) console.log(`Diretório esperado: ${sourceDir}`);
  process.exit(0);
}
if (includeGeoNames) {
  for (const file of requiredFiles) {
    if (!existsSync(resolve(sourceDir, file))) throw new Error(`Arquivo oficial ausente: ${file}`);
  }
}

const prisma = new PrismaClient();
const countryIds = new Map();
const divisionIds = new Map();

async function lines(file, consume) {
  const reader = createInterface({
    input: createReadStream(resolve(sourceDir, file)),
    crlfDelay: Infinity,
  });
  for await (const line of reader) {
    if (line && !line.startsWith("#")) await consume(line.split("\t"));
  }
}

async function importCountries() {
  await lines("countryInfo.txt", async (row) => {
    const code = row[0];
    if (!code) return;
    const country = await prisma.country.upsert({
      where: { code },
      create: { code, name: code === "BR" ? "Brasil" : row[4], geonamesId: row[16] || null },
      update: {
        name: code === "BR" ? "Brasil" : row[4],
        geonamesId: row[16] || null,
        active: true,
      },
      select: { id: true },
    });
    countryIds.set(code, country.id);
  });
}

async function importDivisions() {
  await lines("admin1CodesASCII.txt", async (row) => {
    const [compoundCode, name, , geonamesId] = row;
    const [countryCode, code] = compoundCode.split(".");
    const countryId = countryIds.get(countryCode);
    if (!countryId || countryCode === "BR") return;
    const division = await prisma.administrativeDivision.upsert({
      where: { countryId_code: { countryId, code } },
      create: { countryId, code, name, geonamesId: geonamesId || null },
      update: { name, geonamesId: geonamesId || null, active: true },
      select: { id: true },
    });
    divisionIds.set(`${countryCode}.${code}`, division.id);
  });
}

async function importGeoNamesCities() {
  let imported = 0;
  await lines("cities500.txt", async (row) => {
    const geonamesId = row[0];
    const countryCode = row[8];
    if (!geonamesId || row[6] !== "P" || countryCode === "BR") return;
    const countryId = countryIds.get(countryCode);
    if (!countryId) return;
    const divisionCode = row[10] || "-";
    const normalizedName = normalize(row[2] || row[1]);
    const dedupeKey = `${countryCode}|${divisionCode}|${normalizedName}`;
    await prisma.city.upsert({
      where: { dedupeKey },
      create: {
        name: row[1],
        normalizedName,
        dedupeKey,
        countryId,
        divisionId: divisionIds.get(`${countryCode}.${divisionCode}`) || null,
        geonamesId,
        latitude: Number(row[4]),
        longitude: Number(row[5]),
      },
      update: {
        name: row[1],
        normalizedName,
        countryId,
        divisionId: divisionIds.get(`${countryCode}.${divisionCode}`) || null,
        geonamesId,
        latitude: Number(row[4]),
        longitude: Number(row[5]),
        active: true,
      },
    });
    imported += 1;
    if (imported % 1000 === 0) console.log(`GeoNames: ${imported} cidades`);
  });
}

async function backfillLegacyModel(modelName) {
  const model = prisma[modelName];
  const report = { matched: 0, ambiguous: 0, unmatched: 0, skipped: 0 };
  let cursor;
  while (true) {
    const records = await model.findMany({
      where: { cityId: null },
      orderBy: { id: "asc" },
      take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, city: true, state: true, country: true },
    });
    if (!records.length) break;
    for (const record of records) {
      if (!record.city || !record.country) {
        report.skipped += 1;
        continue;
      }
      const country = await prisma.country.findFirst({
        where: {
          active: true,
          OR: [
            { code: record.country.trim().toUpperCase() },
            { name: { equals: record.country.trim(), mode: "insensitive" } },
          ],
        },
        select: { id: true },
      });
      if (!country) {
        report.unmatched += 1;
        continue;
      }
      const candidates = await prisma.city.findMany({
        where: {
          active: true,
          countryId: country.id,
          normalizedName: normalize(record.city),
          ...(record.state?.trim()
            ? { division: { code: record.state.trim().toUpperCase(), active: true } }
            : {}),
        },
        select: { id: true },
        take: 2,
      });
      if (candidates.length === 1) {
        await model.update({ where: { id: record.id }, data: { cityId: candidates[0].id } });
        report.matched += 1;
      } else if (candidates.length > 1) {
        report.ambiguous += 1;
      } else {
        report.unmatched += 1;
      }
    }
    cursor = records.at(-1).id;
  }
  console.log(`Backfill ${modelName}: ${JSON.stringify(report)}`);
  return report;
}

function ibgeDivisionCode(city) {
  return (
    city.microrregiao?.mesorregiao?.UF?.sigla ||
    city["regiao-imediata"]?.["regiao-intermediaria"]?.UF?.sigla
  );
}

async function importIbge() {
  const states = await fetch(
    "https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome",
  ).then((r) => {
    if (!r.ok) throw new Error(`IBGE estados respondeu ${r.status}`);
    return r.json();
  });
  const statesByNumericCode = new Map();
  for (const state of states) {
    const numericCode = String(state.id).padStart(2, "0");
    const expected = brazilianStates.get(numericCode);
    if (
      !expected ||
      expected.code !== state.sigla ||
      normalize(expected.name) !== normalize(state.nome)
    ) {
      throw new Error(
        `UF inesperada na API do IBGE: ${numericCode} - ${state.sigla} - ${state.nome}.`,
      );
    }
    statesByNumericCode.set(numericCode, expected);
  }
  const cities = await fetch(
    "https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome",
  ).then((r) => {
    if (!r.ok) throw new Error(`IBGE municípios respondeu ${r.status}`);
    return r.json();
  });
  const dataset = {
    cities: cities.map((city) => {
      const stateCode = ibgeDivisionCode(city);
      const state = [...statesByNumericCode.values()].find(
        (candidate) => candidate.code === stateCode,
      );
      if (!state) throw new Error(`Município ${city.id} retornado sem UF válida pela API do IBGE.`);
      return {
        ibgeCode: String(city.id),
        name: city.nome,
        stateCode: state.code,
        stateName: state.name,
      };
    }),
  };
  await importBrazilianCities(dataset, "IBGE API");
}

async function importBrazilianCities(dataset, sourceLabel) {
  const result = await prisma.$transaction(
    async (tx) => {
      const country = await tx.country.upsert({
        where: { code: "BR" },
        create: { code: "BR", name: "Brasil" },
        update: { name: "Brasil", active: true },
        select: { id: true },
      });
      countryIds.set("BR", country.id);

      const presentStateCodes = new Set(dataset.cities.map((city) => city.stateCode));
      for (const state of brazilianStates.values()) {
        if (!presentStateCodes.has(state.code)) continue;
        const division = await tx.administrativeDivision.upsert({
          where: { countryId_code: { countryId: country.id, code: state.code } },
          create: { countryId: country.id, code: state.code, name: state.name },
          update: { name: state.name, active: true },
          select: { id: true },
        });
        divisionIds.set(`BR.${state.code}`, division.id);
      }

      const existingCities = await tx.city.findMany({
        where: { countryId: country.id },
        select: { id: true, ibgeCode: true, dedupeKey: true },
      });
      const byIbgeCode = new Map(
        existingCities.filter((city) => city.ibgeCode).map((city) => [city.ibgeCode, city]),
      );
      const byDedupeKey = new Map(existingCities.map((city) => [city.dedupeKey, city]));

      for (const city of dataset.cities) {
        const dedupeKey = `BR|${city.stateCode}|${normalize(city.name)}`;
        const codeMatch = byIbgeCode.get(city.ibgeCode);
        const keyMatch = byDedupeKey.get(dedupeKey);
        if (codeMatch && keyMatch && codeMatch.id !== keyMatch.id) {
          throw new Error(
            `Conflito na base para ${city.ibgeCode}: código IBGE e chave de cidade apontam para registros diferentes.`,
          );
        }
        if (keyMatch?.ibgeCode && keyMatch.ibgeCode !== city.ibgeCode) {
          throw new Error(
            `Conflito na base para ${city.name}: chave de cidade já vinculada ao código ${keyMatch.ibgeCode}.`,
          );
        }
      }

      let created = 0;
      let updated = 0;
      for (const city of dataset.cities) {
        const normalizedName = normalize(city.name);
        const dedupeKey = `BR|${city.stateCode}|${normalizedName}`;
        const existing = byIbgeCode.get(city.ibgeCode) || byDedupeKey.get(dedupeKey);
        const data = {
          name: city.name,
          normalizedName,
          dedupeKey,
          countryId: country.id,
          divisionId: divisionIds.get(`BR.${city.stateCode}`),
          ibgeCode: city.ibgeCode,
          active: true,
        };
        if (existing) {
          await tx.city.update({ where: { id: existing.id }, data });
          updated += 1;
        } else {
          const createdCity = await tx.city.create({
            data,
            select: { id: true, ibgeCode: true, dedupeKey: true },
          });
          byIbgeCode.set(city.ibgeCode, createdCity);
          byDedupeKey.set(dedupeKey, createdCity);
          created += 1;
        }
        if ((created + updated) % 500 === 0) {
          console.log(
            `${sourceLabel}: ${created + updated}/${dataset.cities.length} municípios processados`,
          );
        }
      }
      return { created, updated };
    },
    { maxWait: 10_000, timeout: 180_000 },
  );
  console.log(
    `${sourceLabel} concluída: ${result.created} criados e ${result.updated} atualizados.`,
  );
}

try {
  if (includeGeoNames) {
    await importCountries();
    await importDivisions();
    await importGeoNamesCities();
  }
  if (ibgeSpreadsheet) await importBrazilianCities(ibgeSpreadsheet, "IBGE planilha");
  else if (includeIbge) await importIbge();
  if (includeBackfill) {
    await backfillLegacyModel("customer");
    await backfillLegacyModel("platformClient");
  }
  console.log("Sincronização concluída.");
} finally {
  await prisma.$disconnect();
}
