import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { requestObservability } from "./request-observability.middleware";

describe("requestObservability", () => {
  it("preserves a safe correlation id and excludes query values", () => {
    const response = new EventEmitter() as EventEmitter & {
      statusCode: number;
      setHeader: ReturnType<typeof vi.fn>;
    };
    response.statusCode = 200;
    response.setHeader = vi.fn();
    const next = vi.fn();
    const request = {
      headers: {} as Record<string, string>,
      header: vi.fn().mockReturnValue("request-123"),
      method: "GET",
      path: "/api/operations/dashboard",
    };
    requestObservability(request as never, response as never, next);
    expect(response.setHeader).toHaveBeenCalledWith("x-request-id", "request-123");
    expect(request.headers["x-request-id"]).toBe("request-123");
    expect(next).toHaveBeenCalledOnce();
    response.emit("finish");
  });

  it("replaces an unsafe request id", () => {
    const response = new EventEmitter() as EventEmitter & {
      statusCode: number;
      setHeader: ReturnType<typeof vi.fn>;
    };
    response.statusCode = 200;
    response.setHeader = vi.fn();
    const request = {
      headers: {} as Record<string, string>,
      header: vi.fn().mockReturnValue("bad\nlog"),
      method: "GET",
      path: "/api/health",
    };
    requestObservability(request as never, response as never, vi.fn());
    const generated = response.setHeader.mock.calls[0][1] as string;
    expect(generated).toMatch(/^[0-9a-f-]{36}$/);
    expect(request.headers["x-request-id"]).toBe(generated);
  });
});
