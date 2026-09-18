import { expect, it } from "vitest";
import { orderHistoryMessages } from "./history-message-order";
import type { ApiMessage } from "./trixus-api";

const message = (id: string, hour: number, content: string, system = false) =>
  ({
    id,
    created_at: `2026-09-18T${String(hour).padStart(2, "0")}:00:00Z`,
    content,
    type: system ? "system" : "text",
    direction: system ? "system" : "inbound",
  }) as ApiMessage;

it("places a late opening before imported messages and interleaves transitions chronologically", () => {
  const items = [
    message("end", 20, "Conversa encerrada - protocolo 000001.", true),
    message("second", 12, "Resposta"),
    message("queue", 11, "Conversa movida para fila.", true),
    message("first", 9, "Olá"),
    message("start", 10, "Conversa iniciada - protocolo 000001.", true),
  ];
  const original = structuredClone(items);
  expect(orderHistoryMessages(items).map((m) => m.id)).toEqual([
    "start",
    "first",
    "queue",
    "second",
    "end",
  ]);
  expect(items).toEqual(original);
});
it("does not treat ordinary text as a boundary and deduplicates overlapping pages", () => {
  const first = message("first", 9, "Olá");
  expect(
    orderHistoryMessages([message("text", 10, "Conversa iniciada"), first, first]).map((m) => m.id),
  ).toEqual(["first", "text"]);
});
it("keeps intermediate closures, openings and resumption events in chronological order", () => {
  const items = [
    message("start", 8, "Conversa iniciada.", true),
    message("end1", 9, "Conversa encerrada.", true),
    message("start2", 10, "Conversa iniciada.", true),
    message("resume", 11, "Conversa retomada.", true),
    message("end2", 12, "Conversa encerrada.", true),
  ];
  expect(orderHistoryMessages(items).map((m) => m.id)).toEqual(items.map((m) => m.id));
});
