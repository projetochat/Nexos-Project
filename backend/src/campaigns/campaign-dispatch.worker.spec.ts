import { beforeEach, describe, expect, it, vi } from "vitest";
import { CampaignDispatchWorker } from "./campaign-dispatch.worker";

const workerCalls = vi.hoisted(() => [] as Array<{ queueName: string; options: unknown }>);

vi.mock("bullmq", async (importActual) => {
  const actual = await importActual<typeof import("bullmq")>();
  class WorkerMock {
    constructor(queueName: string, _handler: unknown, options: unknown) {
      workerCalls.push({ queueName, options });
    }

    on = vi.fn();
    close = vi.fn();
  }

  return {
    ...actual,
    Worker: WorkerMock,
  };
});

describe("CampaignDispatchWorker", () => {
  beforeEach(() => {
    workerCalls.length = 0;
  });

  it("bootstraps with string env values parsed as BullMQ numeric options", async () => {
    const config = {
      get: (key: string) =>
        ({
          NEXOS_CAMPAIGN_CONCURRENCY: "1",
          NEXOS_CAMPAIGN_MESSAGES_PER_MINUTE: "5",
          NEXOS_CAMPAIGN_BATCH_SIZE: "5",
          NEXOS_CAMPAIGN_MAX_RECIPIENTS: "5",
        })[key],
    };
    const redis = {
      enabled: vi.fn().mockReturnValue(true),
      createConnection: vi.fn().mockReturnValue({ connectionName: "campaign-worker" }),
    };
    const campaigns = {
      reconcileScheduledCampaigns: vi.fn().mockResolvedValue({ scheduled: 0 }),
    };

    await new CampaignDispatchWorker(
      config as never,
      redis as never,
      {} as never,
      campaigns as never,
    ).onModuleInit();

    expect(campaigns.reconcileScheduledCampaigns).toHaveBeenCalledOnce();
    expect(workerCalls).toHaveLength(1);
    const options = workerCalls[0]?.options as {
      concurrency: unknown;
      limiter: { max: unknown; duration: number };
    };
    expect(options.concurrency).toBe(1);
    expect(typeof options.concurrency).toBe("number");
    expect(options.limiter.max).toBe(5);
    expect(typeof options.limiter.max).toBe("number");
    expect(options.limiter.duration).toBe(60_000);
  });
});
