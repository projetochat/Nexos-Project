import { describe, expect, it } from "vitest";
import { MessageStatus } from "../generated/prisma";
import { canProgress } from "./messaging-status.service";

describe("message status progression", () => {
  it("allows monotonic delivery progression and idempotent repeats", () => {
    expect(canProgress(MessageStatus.SENDING, MessageStatus.SENT)).toBe(true);
    expect(canProgress(MessageStatus.SENT, MessageStatus.DELIVERED)).toBe(true);
    expect(canProgress(MessageStatus.DELIVERED, MessageStatus.READ)).toBe(true);
    expect(canProgress(MessageStatus.READ, MessageStatus.READ)).toBe(true);
  });

  it("blocks invalid regressions", () => {
    expect(canProgress(MessageStatus.READ, MessageStatus.SENT)).toBe(false);
    expect(canProgress(MessageStatus.DELIVERED, MessageStatus.SENT)).toBe(false);
  });

  it("keeps failed terminal except repeated failure", () => {
    expect(canProgress(MessageStatus.SENT, MessageStatus.FAILED)).toBe(true);
    expect(canProgress(MessageStatus.FAILED, MessageStatus.FAILED)).toBe(true);
    expect(canProgress(MessageStatus.FAILED, MessageStatus.READ)).toBe(false);
  });
});
