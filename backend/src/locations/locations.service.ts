import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export function normalizeLocationSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("en-US");
}

@Injectable()
export class LocationsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async countries() {
    return this.prisma.country.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true },
    });
  }

  async divisions(countryCode: string) {
    const code = countryCode.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) throw new BadRequestException("País inválido.");
    return this.prisma.administrativeDivision
      .findMany({
        where: { active: true, country: { code, active: true } },
        orderBy: { name: "asc" },
        select: { id: true, code: true, name: true, country: { select: { code: true } } },
      })
      .then((items) =>
        items.map((item) => ({
          id: item.id,
          code: item.code,
          name: item.name,
          countryCode: item.country.code,
        })),
      );
  }

  async cities(query: {
    q?: string;
    countryCode?: string;
    divisionId?: string;
    page?: string;
    pageSize?: string;
  }) {
    const page = positiveInteger(query.page, 1, 10_000);
    const pageSize = positiveInteger(query.pageSize, 20, 50);
    const q = query.q ? normalizeLocationSearch(query.q) : "";
    const countryCode = query.countryCode?.trim().toUpperCase();
    if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) {
      throw new BadRequestException("País inválido.");
    }
    const where = {
      active: true,
      ...(q ? { normalizedName: { contains: q } } : {}),
      ...(countryCode ? { country: { code: countryCode, active: true } } : {}),
      ...(query.divisionId ? { divisionId: query.divisionId } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.city.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        include: { country: true, division: true },
      }),
      this.prisma.city.count({ where }),
    ]);
    return {
      items: items.map(serializeCity),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async city(id: string) {
    const city = await this.prisma.city.findFirst({
      where: { id, active: true, country: { active: true } },
      include: { country: true, division: true },
    });
    if (!city) throw new NotFoundException("Cidade não encontrada.");
    return serializeCity(city);
  }

  async resolveCity(id: string) {
    const city = await this.prisma.city.findFirst({
      where: { id, active: true, country: { active: true } },
      include: { country: true, division: true },
    });
    if (!city) throw new BadRequestException("A cidade selecionada não está disponível.");
    return {
      cityId: city.id,
      city: city.name,
      state: city.division?.code ?? "",
      country: city.country.name,
    };
  }
}

function serializeCity(city: {
  id: string;
  name: string;
  ibgeCode: string | null;
  geonamesId: string | null;
  country: { code: string; name: string };
  division: { id: string; code: string; name: string } | null;
}) {
  return {
    id: city.id,
    name: city.name,
    countryCode: city.country.code,
    countryName: city.country.name,
    divisionId: city.division?.id ?? null,
    divisionCode: city.division?.code ?? null,
    divisionName: city.division?.name ?? null,
    ibgeCode: city.ibgeCode,
    geonamesId: city.geonamesId,
  };
}

function positiveInteger(value: string | undefined, fallback: number, max: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new BadRequestException("Paginação inválida.");
  }
  return parsed;
}
