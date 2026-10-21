import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { packagedCatalogDir, verifyPackagedLocationCatalog } from "./location-catalog.mjs";

describe("packaged international location catalog", () => {
  it("verifies the reviewed GeoNames and IBGE snapshot", () => {
    const manifest = verifyPackagedLocationCatalog();
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      version: "geonames-cities500-2026-10-21_ibge-dtb-2025",
      catalogSha256: "e00d7f6b6eeab51765584d08033246153eab59fa2f4a32b2d2f2b768f2800a27",
      counts: {
        countries: 252,
        divisions: 3865,
        cities: 230044,
        brazilianMunicipalities: 5571,
      },
    });
    expect(readFileSync(resolve(packagedCatalogDir, "manifest.json"), "utf8")).toContain(
      "f1cc7e34c7a3a65195a545221521b8e11c63b2c473d6d01c72158ce33a9611e6",
    );
  });

  it("rejects an altered shard before opening a database", () => {
    const directory = fixtureCatalog();
    const shard = resolve(directory, "cities-001.jsonl.gz");
    const content = Buffer.from(readFileSync(shard));
    content[content.length - 1] ^= 1;
    writeFileSync(shard, content);
    expect(() => verifyPackagedLocationCatalog(directory)).toThrow(
      "LOCATION_CATALOG_SHARD_MISMATCH",
    );
  });
});

function fixtureCatalog() {
  const directory = mkdtempSync(resolve(tmpdir(), "trixus-location-catalog-"));
  const records = {
    countries: [["BR", "Brasil", "3469034"]],
    divisions: [["BR", "SP", "São Paulo", null]],
    cities: [
      ["São Paulo", "sao paulo", "BR|SP|sao paulo", "BR", "SP", "3550308", null, null, null],
    ],
  };
  const hash = createHash("sha256");
  const files = [];
  for (const [kind, rows] of Object.entries(records)) {
    const text = `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
    hash.update(kind).update("\0").update(text);
    const content = gzipSync(text, { level: 9, mtime: 0 });
    const name = `${kind}-001.jsonl.gz`;
    writeFileSync(resolve(directory, name), content);
    files.push({
      name,
      kind,
      rows: rows.length,
      bytes: content.length,
      sha256: createHash("sha256").update(content).digest("hex"),
    });
  }
  writeFileSync(
    resolve(directory, "manifest.json"),
    JSON.stringify({
      schemaVersion: 1,
      version: "fixture-v1",
      snapshotDate: "2026-10-21",
      catalogSha256: hash.digest("hex"),
      counts: { countries: 1, divisions: 1, cities: 1, brazilianMunicipalities: 1 },
      sources: [],
      files,
    }),
  );
  return directory;
}
