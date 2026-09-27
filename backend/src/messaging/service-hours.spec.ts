import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { SERVICE_DAYS, validateServiceHours } from "./dto/service-hours.dto";
import { UpdateMessagingConnectionDto } from "./dto/update-messaging-connection.dto";
import { MessagingConnectionsService } from "./messaging-connections.service";

const hours = () =>
  SERVICE_DAYS.map((day, index) => ({ day, active: index < 5, start: "08:00", end: "18:00" }));
describe("instance service hours", () => {
  it("accepts a daytime schedule and rejects equal, reversed or malformed hours", () => {
    expect(validateServiceHours(hours())).toEqual(hours());
    for (const end of ["08:00", "07:59", "24:00", "8:00", "18:60", ""]) {
      const rows = hours();
      rows[0].end = end;
      expect(() => validateServiceHours(rows)).toThrow();
    }
    const duplicate = hours();
    duplicate[6].day = duplicate[0].day;
    expect(() => validateServiceHours(duplicate)).toThrow();
  });
  it("accepts multiple periods while preserving the legacy fields", () => {
    const multiple = hours().map((row) => ({
      ...row,
      periods: [{ start: row.start, end: row.end }],
    }));
    multiple[0].periods = [
      { start: "08:00", end: "12:00" },
      { start: "13:00", end: "18:00" },
    ];
    expect(validateServiceHours(multiple)[0]).toEqual({
      day: "Segunda",
      active: true,
      start: "08:00",
      end: "12:00",
      periods: [
        { start: "08:00", end: "12:00" },
        { start: "13:00", end: "18:00" },
      ],
    });
    multiple[0].periods[1].end = "";
    expect(() => validateServiceHours(multiple)).toThrow("Informe horários válidos em Segunda");
  });
  it("allows multiple periods through the HTTP validation contract", async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    const serviceHours = hours().map((row) => ({
      ...row,
      periods: [{ start: row.start, end: row.end }],
    }));
    serviceHours[0].periods.push({ start: "19:00", end: "20:00" });
    const result = await pipe.transform(
      { serviceHours },
      { type: "body", metatype: UpdateMessagingConnectionDto },
    );
    expect(result.serviceHours[0].periods).toHaveLength(2);
  });
  it("saves and returns edited hours, inactive days and timezone", async () => {
    let record = {
      id: "instance",
      tenantId: "tenant",
      status: "DISCONNECTED",
      ownerPhoneNormalized: "5511999999999",
      providerType: "EVOLUTION",
      absenceEnabled: true,
      absenceMessage: "Ausente",
      serviceHours: hours(),
      timezone: "America/Sao_Paulo",
    };
    const prisma = {
      messagingConnection: {
        findFirst: vi.fn(async (query: { select?: unknown }) => (query.select ? null : record)),
        update: vi.fn(async ({ data }) => {
          record = {
            ...record,
            ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)),
          };
          return record;
        }),
      },
    };
    const service = new MessagingConnectionsService(prisma as never, {} as never);
    const current = { tenantId: "tenant" } as never;
    const edited = hours();
    edited[0].start = "09:30";
    edited[1].active = false;
    const saved = await service.update(
      "instance",
      { serviceHours: edited, timezone: "America/Manaus" },
      current,
    );
    expect(saved.serviceHours).toEqual(edited);
    expect(saved.timezone).toBe("America/Manaus");
    const savedAgain = await service.update("instance", { name: "Novo nome" }, current);
    expect(savedAgain.serviceHours).toEqual(edited);
    expect(savedAgain.timezone).toBe("America/Manaus");
    const invalid = hours();
    invalid[0].end = "08:00";
    await expect(service.update("instance", { serviceHours: invalid }, current)).rejects.toThrow(
      "fim deve ser maior",
    );
    expect(prisma.messagingConnection.update).toHaveBeenCalledTimes(2);
  });
  it("saves and returns multiple periods for the same day", async () => {
    let record = {
      id: "instance",
      tenantId: "tenant",
      status: "DISCONNECTED",
      ownerPhoneNormalized: "5511999999999",
      providerType: "EVOLUTION",
      absenceEnabled: true,
      absenceMessage: "Ausente",
      serviceHours: hours(),
      timezone: "America/Sao_Paulo",
    };
    const prisma = {
      messagingConnection: {
        findFirst: vi.fn(async (query: { select?: unknown }) => (query.select ? null : record)),
        update: vi.fn(async ({ data }) => {
          record = { ...record, ...data };
          return record;
        }),
      },
    };
    const service = new MessagingConnectionsService(prisma as never, {} as never);
    const edited = hours().map((row) => ({
      ...row,
      periods: [{ start: row.start, end: row.end }],
    }));
    edited[0].periods = [
      { start: "08:00", end: "12:00" },
      { start: "12:00", end: "18:00" },
    ];
    const saved = await service.update("instance", { serviceHours: edited }, {
      tenantId: "tenant",
    } as never);
    expect(saved.serviceHours).toEqual(validateServiceHours(edited));
  });
});
