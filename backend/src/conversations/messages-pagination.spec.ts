import { expect, it, vi } from "vitest";
import { MessagesService } from "./messages.service";

it("uses the oldest message as the next cursor before reversing display order", async () => {
  const rows = [3, 2, 1].map((n) => ({ id: String(n), createdAt: new Date(2026, 8, 18, n) }));
  const db = { message: { findMany: vi.fn().mockResolvedValue(rows) } };
  const service = new MessagesService(db as never, {} as never, {} as never);
  vi.spyOn(service, "findVisibleConversation").mockResolvedValue({} as never);
  const serializer = service as unknown as { serialize: (row: { id: string }) => unknown };
  vi.spyOn(serializer, "serialize").mockImplementation((row) => ({ id: row.id }));
  const result = await service.list("conversation", { limit: 2 }, { tenantId: "tenant" } as never);
  expect(result.items).toEqual([{ id: "2" }, { id: "3" }]);
  expect(result.nextCursor).toBe("2");
});
