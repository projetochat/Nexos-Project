import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { LocationsService, normalizeLocationSearch } from "./locations.service";

function serviceWith(overrides: Record<string, unknown> = {}) {
  const prisma = {
    country: { findMany: vi.fn() },
    administrativeDivision: { findMany: vi.fn() },
    city: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn(async (queries: unknown[]) => Promise.all(queries)),
    ...overrides,
  };
  return { prisma, service: new LocationsService(prisma as never) };
}

describe("LocationsService", () => {
  it("normaliza acentos e espaços para a busca persistida", () => {
    expect(normalizeLocationSearch("  São José  ")).toBe("sao jose");
  });

  it("retorna cidades paginadas no contrato público", async () => {
    const { prisma, service } = serviceWith();
    prisma.city.findMany.mockResolvedValue([
      {
        id: "city-1",
        name: "Goiânia",
        ibgeCode: "5208707",
        geonamesId: null,
        country: { code: "BR", name: "Brasil" },
        division: { id: "go", code: "GO", name: "Goiás" },
      },
    ]);
    prisma.city.count.mockResolvedValue(1);

    await expect(service.cities({ q: "Goiânia", countryCode: "br", page: "1" })).resolves.toEqual({
      items: [
        {
          id: "city-1",
          name: "Goiânia",
          countryCode: "BR",
          countryName: "Brasil",
          divisionId: "go",
          divisionCode: "GO",
          divisionName: "Goiás",
          ibgeCode: "5208707",
          geonamesId: null,
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    expect(prisma.city.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ normalizedName: { contains: "goiania" } }),
      }),
    );
  });

  it("rejeita país e paginação inválidos", async () => {
    const { service } = serviceWith();
    await expect(service.divisions("BRA")).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.cities({ pageSize: "999" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("não resolve cidade inativa ou inexistente", async () => {
    const { prisma, service } = serviceWith();
    prisma.city.findFirst.mockResolvedValue(null);
    await expect(service.city("missing")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.resolveCity("missing")).rejects.toBeInstanceOf(BadRequestException);
  });
});
