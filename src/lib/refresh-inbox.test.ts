import { describe, expect, it, vi } from "vitest";
import { refreshInboxData } from "./refresh-inbox";

describe("refreshInboxData", () => {
  it("refetches only the current list, open conversation and its messages", async () => {
    const listKey = ["trixus", "conversations", { tab: "standby", instance: "vocical" }] as const;
    const queryClient = {
      refetchQueries: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      refreshInboxData(queryClient as never, listKey, "conversation-a"),
    ).resolves.toBeUndefined();
    expect(queryClient.refetchQueries).toHaveBeenCalledWith(
      {
        queryKey: listKey,
        exact: true,
        type: "active",
      },
      { throwOnError: true },
    );
    expect(queryClient.refetchQueries).toHaveBeenCalledWith(
      {
        queryKey: ["trixus", "conversations", "conversation-a"],
        exact: true,
        type: "active",
      },
      { throwOnError: true },
    );
    expect(queryClient.refetchQueries).toHaveBeenCalledWith(
      {
        queryKey: ["trixus", "messages", "conversation-a"],
        exact: true,
        type: "active",
      },
      { throwOnError: true },
    );
    expect(queryClient.refetchQueries).toHaveBeenCalledTimes(3);
  });

  it("refetches only the current list when no conversation is open", async () => {
    const listKey = ["trixus", "conversations", { tab: "leads" }] as const;
    const queryClient = { refetchQueries: vi.fn().mockResolvedValue(undefined) };

    await refreshInboxData(queryClient as never, listKey);

    expect(queryClient.refetchQueries).toHaveBeenCalledTimes(1);
    expect(queryClient.refetchQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: listKey, exact: true }),
      { throwOnError: true },
    );
  });
});
