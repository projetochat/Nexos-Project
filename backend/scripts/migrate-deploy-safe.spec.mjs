import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  anonymizeCollisionRows,
  canonicalNormalizedName,
  canonicalVariableKey,
  classifyMigrationHistory,
  hasUnknownMigrationHistory,
  inspectContactCustomFieldIdentity,
  migrationChecksum,
  nativeKeys,
  nativeNames,
  parseMode,
  validateReconciliationManifest,
  semanticDrift,
  structuralDrift,
} from "./migrate-deploy-safe.mjs";
import {
  canonicalContactFieldVariableKey,
  NATIVE_CONTACT_FIELD_NAMES,
  NATIVE_RESERVED_VARIABLE_KEYS,
  normalizeCanonicalContactFieldName,
} from "../src/crm/contact-custom-field-catalog.ts";

const migrationPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "prisma",
  "migrations",
  "20261005210000_contact_custom_field_identity",
  "migration.sql",
);
const checksum = await migrationChecksum();
const completed = (value = checksum) => ({
  checksum: value,
  finished_at: new Date("2026-10-06T00:00:00Z"),
  rolled_back_at: null,
});
const incomplete = (value = checksum) => ({
  checksum: value,
  finished_at: null,
  rolled_back_at: null,
});
const rolledBack = (value = checksum) => ({
  checksum: value,
  finished_at: null,
  rolled_back_at: new Date("2026-10-06T00:00:00Z"),
});
const validCatalog = {
  column_exists: true,
  column_is_text: true,
  column_not_null: true,
  index_exists: true,
  index_name_exists: true,
  index_on_target: true,
  index_unique: true,
  index_valid: true,
  index_ready: true,
  index_partial: false,
  index_expression: false,
  index_key_count: 2,
  index_attribute_count: 2,
  index_columns: ["tenantId", "variableKey"],
};
const validMetrics = {
  null_keys: 0,
  empty_keys: 0,
  invalid_format_keys: 0,
  reserved_keys: 0,
  unexpected_keys: 0,
  unexpected_normalized_names: 0,
  duplicate_keys: 0,
};

describe("safe contact custom field migration preflight", () => {
  it("computes the checksum from the exact migration bytes", async () => {
    const packagedBytes = await readFile(migrationPath);
    const independentlyCalculated = createHash("sha256").update(packagedBytes).digest("hex");
    await expect(migrationChecksum()).resolves.toBe(independentlyCalculated);
  });

  it("rejects unknown migration history in every state", () => {
    const folders = new Set(["20261005210000_contact_custom_field_identity"]);
    for (const row of [completed(), incomplete(), rolledBack()]) {
      expect(
        hasUnknownMigrationHistory(
          [{ migration_name: "20990101000000_unknown", ...row }],
          folders,
        ),
      ).toBe(true);
    }
  });

  it("accepts only a strict, unique reconciliation manifest", () => {
    const valid = {
      legacyChecksum: "1".repeat(64),
      currentChecksum: "2".repeat(64),
      forwardMigration: "20261006030000_reconcile_contact_custom_field_identity",
      forwardChecksum: "3".repeat(64),
    };
    expect(validateReconciliationManifest({ contactCustomFieldIdentity: [valid] })).toEqual([
      valid,
    ]);
    for (const invalid of [
      { ...valid, forwardChecksum: "not-a-hash" },
      { ...valid, forwardMigration: "../escape" },
      { ...valid, extra: true },
    ]) {
      expect(() =>
        validateReconciliationManifest({ contactCustomFieldIdentity: [invalid] }),
      ).toThrow(/RECONCILIATION_MANIFEST_INVALID/);
    }
    expect(() =>
      validateReconciliationManifest({ contactCustomFieldIdentity: [valid, { ...valid }] }),
    ).toThrow(/RECONCILIATION_MANIFEST_INVALID/);
  });

  it("matches the canonical application semantics and reserved catalog", () => {
    const corpus = [
      "  Plano   do Cliente ",
      "Šifra",
      "E-mail",
      "AÇÃO de cobrança",
      "  ",
      "Departamento do contato",
    ];
    for (const value of corpus) {
      expect(canonicalNormalizedName(value)).toBe(normalizeCanonicalContactFieldName(value));
      expect(canonicalVariableKey(value)).toBe(canonicalContactFieldVariableKey(value));
    }
    expect(new Set(nativeKeys)).toEqual(new Set(NATIVE_RESERVED_VARIABLE_KEYS));
    expect(new Set(nativeNames)).toEqual(
      new Set(NATIVE_CONTACT_FIELD_NAMES.map(normalizeCanonicalContactFieldName)),
    );
  });

  it.each([
    [[], "NOT_APPLIED"],
    [[incomplete()], "INCOMPLETE"],
    [[completed()], "COMPLETED_VALID"],
    [[rolledBack()], "ROLLED_BACK"],
    [[completed("0".repeat(64))], "COMPLETED_CHECKSUM_MISMATCH"],
    [[incomplete("0".repeat(64))], "INCOMPLETE_CHECKSUM_MISMATCH"],
    [[rolledBack("0".repeat(64))], "ROLLED_BACK_CHECKSUM_MISMATCH"],
    [[completed(), incomplete()], "AMBIGUOUS_HISTORY"],
    [[completed(), completed()], "AMBIGUOUS_HISTORY"],
    [[{ ...completed(), rolled_back_at: new Date("2026-10-06T01:00:00Z") }], "AMBIGUOUS_HISTORY"],
  ])("classifies migration history without rewriting it: %s", (rows, expected) => {
    expect(classifyMigrationHistory(rows, checksum)).toBe(expected);
  });

  it.each([
    [{ column_not_null: false }, "COLUMN_NULLABLE"],
    [{ column_is_text: false }, "COLUMN_TYPE_NOT_TEXT"],
    [{ index_unique: false }, "INDEX_NOT_UNIQUE"],
    [{ index_on_target: false }, "INDEX_WRONG_TABLE"],
    [{ index_columns: ["variableKey", "tenantId"] }, "INDEX_COLUMNS"],
    [{ index_columns: ["tenantId", "id"] }, "INDEX_COLUMNS"],
    [{ index_valid: false }, "INDEX_INVALID"],
    [{ index_ready: false }, "INDEX_NOT_READY"],
    [{ index_partial: true }, "INDEX_PARTIAL"],
    [{ index_expression: true }, "INDEX_EXPRESSION"],
    [{ index_key_count: 3 }, "INDEX_KEY_COUNT"],
  ])("detects catalog drift: %s", (change, expected) => {
    expect(structuralDrift({ ...validCatalog, ...change })).toContain(expected);
  });

  it.each([
    ["null_keys", "NULL_KEYS"],
    ["empty_keys", "EMPTY_KEYS"],
    ["invalid_format_keys", "INVALID_KEY_FORMAT"],
    ["reserved_keys", "RESERVED_KEYS"],
    ["unexpected_keys", "UNEXPECTED_KEYS"],
    ["unexpected_normalized_names", "UNEXPECTED_NORMALIZED_NAMES"],
    ["duplicate_keys", "DUPLICATE_KEYS"],
  ])("detects semantic drift in active or archived rows: %s", (field, expected) => {
    expect(semanticDrift({ ...validMetrics, [field]: 1 })).toContain(expected);
  });

  it("does not expose tenant or technical key values in its collision report", () => {
    const [collision] = anonymizeCollisionRows(
      [
        {
          tenant_id: "tenant-secret",
          conflicting_key: "codigo_cliente",
          collision_type: "variable_key",
          definition_count: 2,
          active_count: 1,
          archived_count: 1,
          value_count: 8,
        },
      ],
      "fixed-test-salt",
    );
    expect(collision).toMatchObject({
      collisionType: "variable_key",
      definitions: 2,
      activeDefinitions: 1,
      archivedDefinitions: 1,
      affectedValues: 8,
    });
    expect(JSON.stringify(collision)).not.toContain("tenant-secret");
    expect(JSON.stringify(collision)).not.toContain("codigo_cliente");
  });

  it("uses the same Unicode semantics as the application", () => {
    expect(canonicalVariableKey("Šifra do Cliente")).toBe("sifra_cliente");
    expect(canonicalVariableKey("Si\u0301fra do Cliente")).toBe("sifra_cliente");
    expect(canonicalNormalizedName("  SI\u0301FRA   do Cliente ")).toBe("sífra do cliente");
  });

  it("rejects a completed migration whose checksum differs before catalog validation", async () => {
    const prisma = {
      $queryRawUnsafe: vi
        .fn()
        .mockResolvedValueOnce([{ table_exists: true, history_exists: true }])
        .mockResolvedValueOnce([completed("0".repeat(64))]),
    };
    await expect(inspectContactCustomFieldIdentity(prisma, checksum)).rejects.toThrow(
      "CONTACT_CUSTOM_FIELD_IDENTITY_COMPLETED_CHECKSUM_MISMATCH",
    );
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
  });

  it("rejects homonymous but structurally divergent objects", async () => {
    const prisma = {
      $queryRawUnsafe: vi
        .fn()
        .mockResolvedValueOnce([{ table_exists: true, history_exists: true }])
        .mockResolvedValueOnce([completed()])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ ...validCatalog, index_unique: false }]),
    };
    await expect(inspectContactCustomFieldIdentity(prisma, checksum)).rejects.toThrow(
      "CONTACT_CUSTOM_FIELD_IDENTITY_STRUCTURAL_DRIFT",
    );
  });

  it("rejects the expected index name when it belongs to another table", async () => {
    const prisma = {
      $queryRawUnsafe: vi
        .fn()
        .mockResolvedValueOnce([
          { table_exists: true, history_exists: true, index_name_exists: true },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            ...validCatalog,
            column_exists: false,
            index_exists: false,
            index_name_exists: true,
            index_on_target: false,
          },
        ]),
    };
    await expect(inspectContactCustomFieldIdentity(prisma, checksum)).rejects.toThrow(
      "CONTACT_CUSTOM_FIELD_IDENTITY_PARTIAL_STATE",
    );
  });

  it("rejects semantic drift after a completed migration", async () => {
    const prisma = {
      $queryRawUnsafe: vi
        .fn()
        .mockResolvedValueOnce([{ table_exists: true, history_exists: true }])
        .mockResolvedValueOnce([completed()])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([validCatalog])
        .mockResolvedValueOnce([{ ...validMetrics, unexpected_keys: 1 }]),
    };
    await expect(inspectContactCustomFieldIdentity(prisma, checksum)).rejects.toThrow(
      "CONTACT_CUSTOM_FIELD_IDENTITY_SEMANTIC_DRIFT",
    );
  });

  it("accepts only a checksum, catalog and data set that all agree", async () => {
    const prisma = {
      $queryRawUnsafe: vi
        .fn()
        .mockResolvedValueOnce([{ table_exists: true, history_exists: true }])
        .mockResolvedValueOnce([completed()])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([validCatalog])
        .mockResolvedValueOnce([validMetrics])
        .mockResolvedValueOnce([]),
    };
    await expect(inspectContactCustomFieldIdentity(prisma, checksum)).resolves.toMatchObject({
      migrationState: "COMPLETED_VALID",
      collisions: [],
    });
  });

  it("accepts only the exact reviewed forward reconciliation", async () => {
    const legacyChecksum = "9ff6347fc38618491c8465bc91440381de81e8d2f06bc15d1f32cfd5c8850fef";
    const forwardChecksum = "bde512d7624acd765e0ac723b94d8bcce22995e37bd64e0d8e107a679136c4c7";
    const prisma = {
      $queryRawUnsafe: vi
        .fn()
        .mockResolvedValueOnce([{ table_exists: true, history_exists: true }])
        .mockResolvedValueOnce([completed(legacyChecksum)])
        .mockResolvedValueOnce([completed(forwardChecksum)])
        .mockResolvedValueOnce([validCatalog])
        .mockResolvedValueOnce([validMetrics])
        .mockResolvedValueOnce([]),
    };
    await expect(inspectContactCustomFieldIdentity(prisma, checksum)).resolves.toMatchObject({
      migrationState: "COMPLETED_RECONCILED",
      forwardState: "COMPLETED_VALID",
    });
  });

  it("blocks incomplete history even when the transaction left no target objects", async () => {
    const prisma = {
      $queryRawUnsafe: vi
        .fn()
        .mockResolvedValueOnce([{ table_exists: true, history_exists: true }])
        .mockResolvedValueOnce([incomplete()]),
    };
    await expect(inspectContactCustomFieldIdentity(prisma, checksum)).rejects.toThrow(
      "CONTACT_CUSTOM_FIELD_IDENTITY_INCOMPLETE",
    );
  });

  it("allows a reviewed rolled-back retry only when target objects are absent", async () => {
    const prisma = {
      $queryRawUnsafe: vi
        .fn()
        .mockResolvedValueOnce([{ table_exists: true, history_exists: true }])
        .mockResolvedValueOnce([rolledBack()])
        .mockResolvedValueOnce([
          {
            ...validCatalog,
            column_exists: false,
            column_is_text: false,
            column_not_null: false,
            index_exists: false,
            index_name_exists: false,
            index_on_target: false,
            index_unique: false,
            index_valid: false,
            index_ready: false,
            index_key_count: 0,
            index_attribute_count: 0,
            index_columns: [],
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
    };
    await expect(inspectContactCustomFieldIdentity(prisma, checksum)).resolves.toMatchObject({
      migrationState: "ROLLED_BACK",
      collisions: [],
    });
  });

  it("selects help and version before any database access", () => {
    expect(parseMode(["--help"])).toBe("help");
    expect(parseMode(["-h"])).toBe("help");
    expect(parseMode(["--version"])).toBe("version");
    expect(parseMode(["--apply-reviewed-reconciliation"])).toBe("reconcile");
  });
});
