import { describe, expect, it, vi } from "vitest";
import { realtimeAllowedOrigins, realtimeCorsOrigin } from "./realtime.config";

describe("realtime CORS", () => {
  it("uses the dedicated exact-origin list instead of the broader HTTP list", () => {
    expect(
      realtimeAllowedOrigins({
        TRIXUS_REALTIME_CORS_ORIGIN: " https://chat.trixus.com.br ",
        FRONTEND_ORIGIN: "https://app.trixus.com.br,https://chat.trixus.com.br",
      }),
    ).toEqual(["https://chat.trixus.com.br"]);
  });

  it("keeps the HTTP origin and localhost fallbacks for non-production compatibility", () => {
    expect(realtimeAllowedOrigins({ FRONTEND_ORIGIN: "http://localhost:4173" })).toEqual([
      "http://localhost:4173",
    ]);
    expect(realtimeAllowedOrigins({})).toEqual(["http://localhost:5173"]);
  });

  it("accepts only configured browser origins and permits clients without an Origin header", () => {
    const previous = process.env.TRIXUS_REALTIME_CORS_ORIGIN;
    process.env.TRIXUS_REALTIME_CORS_ORIGIN = "https://chat.trixus.com.br";
    try {
      const accepted = vi.fn();
      realtimeCorsOrigin("https://chat.trixus.com.br", accepted);
      expect(accepted).toHaveBeenCalledWith(null, true);

      const rejected = vi.fn();
      realtimeCorsOrigin("https://app.trixus.com.br", rejected);
      expect(rejected.mock.calls[0]?.[0]).toBeInstanceOf(Error);
      expect(rejected).toHaveBeenCalledWith(expect.any(Error), false);

      const serverClient = vi.fn();
      realtimeCorsOrigin(undefined, serverClient);
      expect(serverClient).toHaveBeenCalledWith(null, true);
    } finally {
      if (previous === undefined) delete process.env.TRIXUS_REALTIME_CORS_ORIGIN;
      else process.env.TRIXUS_REALTIME_CORS_ORIGIN = previous;
    }
  });
});
