import { describe, expect, it } from "vitest";
import { selectAutomaticReply } from "./automatic-reply";

const hours = [
  { day: "Segunda", active: false, start: "08:00", end: "18:00" },
  { day: "Terça", active: false, start: "08:00", end: "18:00" },
  { day: "Quarta", active: true, start: "08:00", end: "18:00" },
  { day: "Quinta", active: false, start: "08:00", end: "18:00" },
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
    expect(
      select({ absenceEnabled: false, at: new Date("2026-09-17T22:00:00.000Z") }),
    ).toEqual({ kind: "welcome", template: "Saudação" });
  });
});
