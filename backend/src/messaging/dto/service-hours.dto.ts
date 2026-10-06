import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import { BadRequestException } from "@nestjs/common";
import { Type } from "class-transformer";

export const SERVICE_DAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
export class ServiceHoursPeriodDto {
  @IsString() start!: string;
  @IsString() end!: string;
}
export class ServiceHoursDto {
  @IsIn(SERVICE_DAYS) day!: string;
  @IsBoolean() active!: boolean;
  @IsOptional()
  @IsString()
  start?: string;
  @IsOptional()
  @IsString()
  end?: string;
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ServiceHoursPeriodDto)
  periods?: ServiceHoursPeriodDto[];
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
    if (typeof row.active !== "boolean") throw new BadRequestException("Horários inválidos.");
    const periods = row.periods ?? [{ start: row.start, end: row.end }];
    if (periods.length === 0)
      throw new BadRequestException(`Inclua ao menos um horário em ${row.day}.`);
    if (
      periods.some((period) => typeof period.start !== "string" || typeof period.end !== "string")
    ) {
      throw new BadRequestException("Horários inválidos.");
    }
    if (!row.active) continue;
    for (const period of periods) {
      if (
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(period.start!) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(period.end!)
      ) {
        throw new BadRequestException(`Informe horários válidos em ${row.day}.`);
      }
      if (period.end! === period.start!)
        throw new BadRequestException(`O início e o fim devem ser diferentes em ${row.day}.`);
    }
  }
  return SERVICE_DAYS.map((day) => {
    const row = rows.find((row) => row.day === day)!;
    if (!row.periods) return { day, active: row.active, start: row.start!, end: row.end! };
    const periods = row.periods.map(({ start, end }) => ({ start, end }));
    return {
      day,
      active: row.active,
      start: periods[0].start,
      end: periods[0].end,
      periods,
    };
  });
}
