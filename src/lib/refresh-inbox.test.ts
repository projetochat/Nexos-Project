import { describe, expect, it, vi } from "vitest";
import { refreshInboxData } from "./refresh-inbox";

describe("refreshInboxData", () => {
  it("refetches the list, open conversation messages and returns its current status", async () => {
    const closed = { id: "conversation-a", status: "fechada" };
    const queryClient = {
      refetchQueries: vi.fn().mockResolvedValue(undefined),
      getQueryData: vi.fn().mockReturnValue(closed),
    };

    await expect(refreshInboxData(queryClient as never, "conversation-a")).resolves.toBe(closed);
    expect(queryClient.refetchQueries).toHaveBeenCalledWith({
      queryKey: ["trixus", "conversations"],
      type: "all",
    });
    expect(queryClient.refetchQueries).toHaveBeenCalledWith({
      queryKey: ["trixus", "messages", "conversation-a"],
      type: "all",
    });
  });
});
