import { describe, expect, it, vi } from "vitest";
import { MessagingErrorCode } from "./messaging.contracts";
import { OutboundDispatchError } from "./messaging-outbound.service";
import { MessagingOutboundWorker } from "./messaging-outbound.worker";

describe("MessagingOutboundWorker ordering", () => {
  it("processes jobs from the same conversation in submission order", async () => {
    const processed: string[] = [];
    const worker = workerWith({
      conversations: { a: "conversation-1", b: "conversation-1", c: "conversation-1" },
      dispatch: async ({ messageId }: { messageId: string }) => {
        processed.push(messageId);
      },
    });

    await Promise.all([processJob(worker, "a"), processJob(worker, "b"), processJob(worker, "c")]);

    expect(processed).toEqual(["a", "b", "c"]);
  });

  it("does not globally block different conversations", async () => {
    const processed: string[] = [];
    let releaseA!: () => void;
    const aMayFinish = new Promise<void>((resolve) => {
      releaseA = resolve;
    });

    const worker = workerWith({
      conversations: { a: "conversation-a", b: "conversation-b" },
      dispatch: async ({ messageId }: { messageId: string }) => {
        if (messageId === "a") {
          processed.push("a-start");
          await aMayFinish;
          processed.push("a-end");
          return;
        }
        processed.push("b");
      },
    });

    const a = processJob(worker, "a");
    await Promise.resolve();
    const b = processJob(worker, "b");
    await b;
    releaseA();
    await a;

    expect(processed).toEqual(["a-start", "b", "a-end"]);
  });

  it("returns worker rejections without leaving the lock promise unhandled", async () => {
    const unhandled: unknown[] = [];
    const listener = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", listener);
    try {
      const worker = workerWith({
        conversations: { a: "conversation-1" },
        dispatch: async () => {
          throw new OutboundDispatchError(
            MessagingErrorCode.TEMPORARY_PROVIDER_FAILURE,
            "Evolution temporary failure.",
            true,
          );
        },
      });

      await expect(processJob(worker, "a")).rejects.toMatchObject({ retryable: true });
      await new Promise((resolve) => setImmediate(resolve));

      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", listener);
    }
  });
});

function workerWith(input: {
  conversations: Record<string, string>;
  dispatch: (input: { messageId: string }) => Promise<void>;
}) {
  const prisma = {
    message: {
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) => ({
        conversationId: input.conversations[where.id],
      })),
    },
  };
  const outbound = { dispatchQueuedMessage: vi.fn(input.dispatch) };
  return new MessagingOutboundWorker(
    { get: vi.fn() } as never,
    prisma as never,
    { enabled: vi.fn().mockReturnValue(false), createConnection: vi.fn() } as never,
    outbound as never,
  );
}

function processJob(worker: MessagingOutboundWorker, messageId: string) {
  return (worker as unknown as { process: (job: unknown) => Promise<unknown> }).process({
    id: `message-${messageId}`,
    data: { tenantId: "tenant-a", messageId },
    attemptsMade: 0,
    opts: { attempts: 5 },
  });
}
