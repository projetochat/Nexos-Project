import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MESSAGING_OUTBOUND_JOB,
  MESSAGING_OUTBOUND_QUEUE,
  MessagingOutboundQueue,
  OUTBOUND_JOB_OPTIONS,
  RedisConnectionFactory,
  outboundJobId,
} from "./messaging-outbound.queue";

describe("MessagingOutboundQueue", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses a deterministic job id and explicit retry policy", () => {
    expect(MESSAGING_OUTBOUND_QUEUE).toBe("messaging-outbound");
    expect(MESSAGING_OUTBOUND_JOB).toBe("send-message");
    expect(outboundJobId("message-a")).toBe("message-message-a");
    expect(OUTBOUND_JOB_OPTIONS).toMatchObject({
      attempts: 5,
      backoff: { type: "exponential", delay: 1_000 },
      removeOnFail: false,
    });
  });

  it("enqueues the minimal payload with the deterministic job id", async () => {
    const add = vi.fn().mockResolvedValue({ id: "message-message-a" });
    const queue = new MessagingOutboundQueue({
      enabled: vi.fn().mockReturnValue(true),
      createConnection: vi.fn(),
    } as unknown as RedisConnectionFactory);
    vi.spyOn(queue, "getQueue").mockReturnValue({ add } as never);

    await queue.enqueue({ tenantId: "tenant-a", messageId: "message-a" });

    expect(add).toHaveBeenCalledWith(
      "send-message",
      { tenantId: "tenant-a", messageId: "message-a" },
      expect.objectContaining({ jobId: "message-message-a", attempts: 5 }),
    );
  });
});
