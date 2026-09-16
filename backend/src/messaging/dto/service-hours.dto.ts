import { IsBoolean, IsIn, IsString } from "class-validator";
import { BadRequestException } from "@nestjs/common";

export const SERVICE_DAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
export class ServiceHoursDto {
  @IsIn(SERVICE_DAYS) day!: string;
  @IsBoolean() active!: boolean;
  @IsString() start!: string;
  @IsString() end!: string;
}

export function validateServiceHours(rows: ServiceHoursDto[]) {
  if (
    !Array.isArray(rows) ||
    rows.length !== 7 ||
    new Set(rows.map((row) => row.day)).size !== 7 ||
    rows.some((row) => !SERVICE_DAYS.includes(row.day))
  ) {
    throw new BadRequestException("Informe os sete dias da semana, sem repetir dias.");
  }
  for (const row of rows) {
    if (
      typeof row.active !== "boolean" ||
      typeof row.start !== "string" ||
      typeof row.end !== "string"
    )
      throw new BadRequestException("Horários inválidos.");
    if (!row.active) continue;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.end))
      throw new BadRequestException(`Informe horários válidos em ${row.day}.`);
    if (row.end <= row.start)
      throw new BadRequestException(`O fim deve ser maior que o início em ${row.day}.`);
  }
  return SERVICE_DAYS.map((day) => {
    const row = rows.find((row) => row.day === day)!;
    return { day, active: row.active, start: row.start, end: row.end };
  });
}
