import { describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import {
  REGISTRATION_CASE_KEYS,
  normalizeRegistrationText,
  registrationCaseSnapshot,
  updateRegistrationCase,
} from "./registration-case";

function sqlText(query: { strings?: readonly string[] }) {
  return query.strings?.join("?") ?? "";
}

describe("tenant registration uppercase settings", () => {
  it("keeps the exact twelve independent options", () => {
    expect(REGISTRATION_CASE_KEYS).toEqual([
      "contacts",
      "contactCompanies",
      "contactDepartments",
      "contactProfiles",
      "attendants",
      "accessProfiles",
      "departments",
      "tags",
      "botFlows",
      "automations",
      "aiAgents",
      "ticketTitles",
    ]);
  });

  it("normalizes only when the tenant option is enabled", async () => {
    const enabled = { $queryRaw: vi.fn().mockResolvedValue([{ enabled: true }]) };
    const disabled = { $queryRaw: vi.fn().mockResolvedValue([]) };
    await expect(
      normalizeRegistrationText(enabled as never, "tenant-a", "contacts", " João da Silva "),
    ).resolves.toBe("JOÃO DA SILVA");
    await expect(
      normalizeRegistrationText(disabled as never, "tenant-b", "contacts", " João da Silva "),
    ).resolves.toBe("João da Silva");
  });

  it("returns defaults off and dynamic counts, including zero for unavailable modules", async () => {
    const prisma = {
      $queryRaw: vi.fn(async (query: { strings?: readonly string[] }) => {
        const text = sqlText(query);
        if (text.includes("SELECT contacts")) return [];
        if (text.includes("SELECT 0::int")) return [{ count: 0 }];
        return [{ count: 2 }];
      }),
    };
    const snapshot = await registrationCaseSnapshot(prisma as never, "tenant-a");
    expect(snapshot.values).toEqual(
      Object.fromEntries(REGISTRATION_CASE_KEYS.map((key) => [key, false])),
    );
    expect(snapshot.counts.botFlows).toBe(0);
    expect(snapshot.counts.aiAgents).toBe(0);
    expect(snapshot.counts.contacts).toBe(2);
  });

  it("requires confirmation before converting existing rows", async () => {
    const tx = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 3 }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = { $transaction: vi.fn((callback) => callback(tx)) };
    await expect(
      updateRegistrationCase(prisma as never, "tenant-a", {
        key: "contacts",
        enabled: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("converts and enables atomically after explicit confirmation", async () => {
    const tx = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 3 }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = { $transaction: vi.fn((callback) => callback(tx)) };
    await expect(
      updateRegistrationCase(prisma as never, "tenant-a", {
        key: "contacts",
        enabled: true,
        confirmExistingConversion: true,
      }),
    ).resolves.toEqual({ key: "contacts", enabled: true, converted: 3 });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(3);
    expect(sqlText(tx.$executeRaw.mock.calls[1][0])).toContain('UPDATE "contacts"');
    expect(sqlText(tx.$executeRaw.mock.calls[2][0])).toContain(
      'UPDATE "tenant_registration_case_settings"',
    );
  });

  it("applies the contact department setting to the unified customer departments", async () => {
    const tx = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 1 }])
        .mockResolvedValueOnce([]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = { $transaction: vi.fn((callback) => callback(tx)) };

    await updateRegistrationCase(prisma as never, "tenant-a", {
      key: "contactDepartments",
      enabled: true,
      confirmExistingConversion: true,
    });

    expect(sqlText(tx.$executeRaw.mock.calls[1][0])).toContain('UPDATE "customer_departments"');
  });

  it("rejects uppercase conversion when a customer would receive duplicate departments", async () => {
    const tx = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 2 }])
        .mockResolvedValueOnce([{ customerId: "customer-a", name: "FINANCEIRO" }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = { $transaction: vi.fn((callback) => callback(tx)) };

    await expect(
      updateRegistrationCase(prisma as never, "tenant-a", {
        key: "contactDepartments",
        enabled: true,
        confirmExistingConversion: true,
      }),
    ).rejects.toThrow("departamentos duplicados no mesmo cliente");
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
