import { describe, expect, it } from "vitest";
import { positiveDelayMs, readCampaignRuntimeConfig, readPositiveInteger } from "./campaign-config";

function config(values: Record<string, string | number | undefined>) {
  return {
    get: (key: string) => values[key],
  };
}

describe("campaign numeric config", () => {
  it.each([
    ["missing value", undefined, 2],
    ["string 1", "1", 1],
    ["string 5", "5", 5],
    ["number 7", 7, 7],
    ["zero", "0", 2],
    ["negative", "-1", 2],
    ["letters", "abc", 2],
    ["empty", "", 2],
    ["whitespace", "   ", 2],
    ["Infinity number", Number.POSITIVE_INFINITY, 2],
    ["NaN number", Number.NaN, 2],
    ["Infinity string", "Infinity", 2],
    ["NaN string", "NaN", 2],
  ])("returns the expected value for %s", (_label, value, expected) => {
    expect(readPositiveInteger(config({ TEST_VALUE: value }), "TEST_VALUE", 2)).toBe(expected);
  });

  it("reads all campaign runtime numeric settings as positive numbers", () => {
    const runtimeConfig = readCampaignRuntimeConfig(
      config({
        NEXOS_CAMPAIGN_CONCURRENCY: "1",
        NEXOS_CAMPAIGN_MESSAGES_PER_MINUTE: "5",
        NEXOS_CAMPAIGN_BATCH_SIZE: "5",
        NEXOS_CAMPAIGN_MAX_RECIPIENTS: "5",
      }),
    );

    expect(runtimeConfig).toEqual({
      concurrency: 1,
      messagesPerMinute: 5,
      batchSize: 5,
      maxRecipients: 5,
    });
  });

  it("falls back and clamps unsafe campaign runtime settings", () => {
    const runtimeConfig = readCampaignRuntimeConfig(
      config({
        NEXOS_CAMPAIGN_CONCURRENCY: "0",
        NEXOS_CAMPAIGN_MESSAGES_PER_MINUTE: "abc",
        NEXOS_CAMPAIGN_BATCH_SIZE: "200",
        NEXOS_CAMPAIGN_MAX_RECIPIENTS: "",
      }),
    );

    expect(runtimeConfig).toEqual({
      concurrency: 2,
      messagesPerMinute: 12,
      batchSize: 100,
      maxRecipients: 25,
    });
  });

  it("returns only finite positive delays", () => {
    expect(positiveDelayMs(1_500, 1_000)).toBe(500);
    expect(positiveDelayMs(500, 1_000)).toBe(0);
    expect(positiveDelayMs(Number.NaN, 1_000)).toBe(0);
    expect(positiveDelayMs(Number.POSITIVE_INFINITY, 1_000)).toBe(0);
  });
});
