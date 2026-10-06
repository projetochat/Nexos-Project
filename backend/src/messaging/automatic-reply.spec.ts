import { describe, expect, it } from "vitest";
import { isWithinServiceHours, selectAutomaticReply } from "./automatic-reply";

const hours = [
  { day: "Segunda", active: false, start: "08:00", end: "18:00" },
  { day: "Terça", active: false, start: "08:00", end: "18:00" },
  { day: "Quarta", active: false, start: "08:00", end: "18:00" },
  { day: "Quinta", active: true, start: "08:00", end: "18:00" },
  { day: "Sexta", active: false, start: "08:00", end: "18:00" },
  { day: "Sábado", active: false, start: "08:00", end: "18:00" },
  { day: "Domingo", active: false, start: "08:00", end: "18:00" },
];

function select(overrides: Partial<Parameters<typeof selectAutomaticReply>[0]> = {}) {
  return selectAutomaticReply({
    createdConversation: true,
    isGroup: false,
    fromMe: false,
    welcomeEnabled: true,
    welcomeTemplate: "Saudação",
    absenceEnabled: true,
    absenceTemplate: "Ausência",
    serviceHours: hours,
    timezone: "America/Sao_Paulo",
    at: new Date("2026-09-17T12:00:00.000Z"),
    ...overrides,
  });
}

describe("selectAutomaticReply", () => {
  it("sends the greeting during service hours when both messages are active", () => {
    expect(select()).toEqual({ kind: "welcome", template: "Saudação" });
  });

  it("sends the absence message outside service hours when both messages are active", () => {
    expect(select({ at: new Date("2026-09-17T22:00:00.000Z") })).toEqual({
      kind: "absence",
      template: "Ausência",
    });
  });

  it("sends the greeting at any time when absence is disabled", () => {
    expect(select({ absenceEnabled: false, at: new Date("2026-09-17T22:00:00.000Z") })).toEqual({
      kind: "welcome",
      template: "Saudação",
    });
  });
  it("uses every configured period and treats the gap as absence", () => {
    const multiple = hours.map((row) =>
      row.day === "Quinta"
        ? {
            ...row,
            periods: [
              { start: "08:00", end: "12:00" },
              { start: "13:00", end: "18:00" },
            ],
          }
        : row,
    );
    expect(select({ serviceHours: multiple, at: new Date("2026-09-17T14:00:00.000Z") })).toEqual({
      kind: "welcome",
      template: "Saudação",
    });
    expect(select({ serviceHours: multiple, at: new Date("2026-09-17T15:30:00.000Z") })).toEqual({
      kind: "absence",
      template: "Ausência",
    });
    expect(select({ serviceHours: multiple, at: new Date("2026-09-17T17:00:00.000Z") })).toEqual({
      kind: "welcome",
      template: "Saudação",
    });
  });

  it("keeps an overnight period active after the local day changes", () => {
    const overnight = hours.map((row) =>
      row.day === "Quinta"
        ? { ...row, active: true, start: "22:00", end: "02:00" }
        : { ...row, active: false },
    );
    expect(
      isWithinServiceHours(overnight, "America/Sao_Paulo", new Date("2026-09-18T04:30:00Z")),
    ).toBe(true);
    expect(
      isWithinServiceHours(overnight, "America/Sao_Paulo", new Date("2026-09-18T05:00:00Z")),
    ).toBe(false);
  });

  it("uses IANA daylight-saving rules for overnight hours", () => {
    const overnight = hours.map((row) =>
      row.day === "Sábado"
        ? { ...row, active: true, start: "22:00", end: "03:30" }
        : { ...row, active: false },
    );
    // 2026-11-01 repeats 01:00 in New York; both instants remain inside Saturday's period.
    expect(
      isWithinServiceHours(overnight, "America/New_York", new Date("2026-11-01T05:30:00Z")),
    ).toBe(true);
    expect(
      isWithinServiceHours(overnight, "America/New_York", new Date("2026-11-01T06:30:00Z")),
    ).toBe(true);
  });

  it("suppresses automatic replies when the instance time zone is absent or invalid", () => {
    expect(select({ timezone: null })).toBeNull();
    expect(select({ timezone: "Invalid/Timezone" })).toBeNull();
  });
});
