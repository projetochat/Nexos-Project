import { describe, expect, it, vi } from "vitest";
import {
  anonymizeCollisionRows,
  inspectContactCustomFieldIdentity,
} from "./migrate-deploy-safe.mjs";

describe("safe contact custom field migration preflight", () => {
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

  it("does not query application tables when the schema is empty", async () => {
    const prisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValueOnce([
        {
          table_exists: false,
          history_exists: false,
          column_exists: false,
          index_exists: false,
        },
      ]),
    };

    await expect(inspectContactCustomFieldIdentity(prisma)).resolves.toEqual({
      collisions: [],
      migrationFinished: false,
    });
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledOnce();
  });

  it("rejects a previous partial attempt instead of masking it", async () => {
    const prisma = {
      $queryRawUnsafe: vi
        .fn()
        .mockResolvedValueOnce([
          {
            table_exists: true,
            history_exists: true,
            column_exists: true,
            index_exists: false,
          },
        ])
        .mockResolvedValueOnce([{ finished_at: null, rolled_back_at: null }]),
    };

    await expect(inspectContactCustomFieldIdentity(prisma)).rejects.toThrow(
      "CONTACT_CUSTOM_FIELD_IDENTITY_PARTIAL_STATE",
    );
  });

  it("returns collisions without mutating migration history", async () => {
    const collision = {
      tenant_id: "tenant-a",
      conflicting_key: "a",
      collision_type: "normalized_name",
      definition_count: 2,
      active_count: 2,
      archived_count: 0,
      value_count: 3,
    };
    const prisma = {
      $queryRawUnsafe: vi
        .fn()
        .mockResolvedValueOnce([
          {
            table_exists: true,
            history_exists: true,
            column_exists: false,
            index_exists: false,
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([collision]),
    };

    await expect(inspectContactCustomFieldIdentity(prisma)).resolves.toEqual({
      collisions: [collision],
      migrationFinished: false,
    });
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(3);
  });

  it("allows a controlled retry after a failed attempt was marked rolled back", async () => {
    const prisma = {
      $queryRawUnsafe: vi
        .fn()
        .mockResolvedValueOnce([
          {
            table_exists: true,
            history_exists: true,
            column_exists: false,
            index_exists: false,
          },
        ])
        .mockResolvedValueOnce([
          { finished_at: null, rolled_back_at: new Date("2026-10-06T00:00:00Z") },
        ])
        .mockResolvedValueOnce([]),
    };

    await expect(inspectContactCustomFieldIdentity(prisma)).resolves.toEqual({
      collisions: [],
      migrationFinished: false,
    });
  });
});
