import { describe, expect, it, vi } from "vitest";
import { retryTransientMediaAcquisition } from "./retry-media-acquisition";

describe("retryTransientMediaAcquisition", () => {
  it.each([
    "MEDIA_REMOTE_TIMEOUT",
    "MEDIA_REMOTE_HTTP_502",
    "MEDIA_REMOTE_HTTP_503",
    "MEDIA_REMOTE_HTTP_504",
  ])("retries %s once", async (message) => {
    const acquire = vi
      .fn()
      .mockRejectedValueOnce(new Error(message))
      .mockResolvedValue(Buffer.from("synthetic"));
    await expect(retryTransientMediaAcquisition(acquire)).resolves.toEqual(
      Buffer.from("synthetic"),
    );
    expect(acquire).toHaveBeenCalledTimes(2);
  });
  it("bounds repeated network failure to two acquisitions", async () => {
    const error = Object.assign(new Error("connection reset"), { code: "ECONNRESET" });
    const acquire = vi.fn().mockRejectedValue(error);
    await expect(retryTransientMediaAcquisition(acquire)).rejects.toBe(error);
    expect(acquire).toHaveBeenCalledTimes(2);
  });
  it.each([
    "MEDIA_REMOTE_HTTP_400",
    "MEDIA_REMOTE_HTTP_401",
    "MEDIA_REMOTE_HTTP_404",
    "MEDIA_REMOTE_HTTP_429",
    "MEDIA_REMOTE_TOO_LARGE",
    "MEDIA_REMOTE_ADDRESS_BLOCKED",
    "MEDIA_REMOTE_EMPTY",
    "MEDIA_REMOTE_URL_INVALID",
    "MIME forbidden",
  ])("does not retry %s", async (message) => {
    const error = new Error(message);
    const acquire = vi.fn().mockRejectedValue(error);
    await expect(retryTransientMediaAcquisition(acquire)).rejects.toBe(error);
    expect(acquire).toHaveBeenCalledTimes(1);
  });
});
