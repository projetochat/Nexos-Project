import { describe, expect, it, vi } from "vitest";
import { SERVICE_DAYS, validateServiceHours } from "./dto/service-hours.dto";
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
});
