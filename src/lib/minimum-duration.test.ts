import { afterEach, describe, expect, it, vi } from "vitest";
import { waitForMinimumDuration } from "./minimum-duration";

describe("waitForMinimumDuration", () => {
  afterEach(() => vi.useRealTimers());

  it("waits only for the time remaining in the minimum duration", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(4_000);
    const pending = waitForMinimumDuration(1_000, 5_000);

    let completed = false;
    void pending.then(() => {
      completed = true;
    });
    await vi.advanceTimersByTimeAsync(1_999);
    expect(completed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBeUndefined();
  });

  it("resolves immediately when the minimum duration has elapsed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    await expect(waitForMinimumDuration(1_000, 5_000)).resolves.toBeUndefined();
  });
});
