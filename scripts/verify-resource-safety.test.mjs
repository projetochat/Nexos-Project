import { describe, expect, it } from "vitest";
import {
  assertDisposableVerifyDatabase,
  assertDisposableVerifyRedis,
} from "./verify-resource-safety.mjs";

describe("verify resource safety", () => {
  it("accepts the explicitly confirmed local CI database", () => {
    expect(
      assertDisposableVerifyDatabase({
        databaseUrl: "postgresql://127.0.0.1:5432/trixus_1200?schema=public",
        nodeEnv: "test",
        confirmation: "trixus_1200",
      }),
    ).toMatchObject({ databaseName: "trixus_1200" });
  });

  it.each([
    [undefined, "test", "trixus_1200"],
    ["not-a-url", "test", "trixus_1200"],
    ["mysql://127.0.0.1:3306/trixus_1200", "test", "trixus_1200"],
    ["postgresql://db.example.com:5432/trixus_1200", "test", "trixus_1200"],
    ["postgresql://127.0.0.1:5432/trixus", "test", "trixus"],
    ["postgresql://127.0.0.1:5432/trixus_homolog", "test", "trixus_homolog"],
    ["postgresql://127.0.0.1:5432/trixus_1200", "production", "trixus_1200"],
    ["postgresql://127.0.0.1:5432/trixus_1200", "test", "wrong-name"],
  ])("rejects an unsafe database target", (databaseUrl, nodeEnv, confirmation) => {
    expect(() => assertDisposableVerifyDatabase({ databaseUrl, nodeEnv, confirmation })).toThrow(
      "VERIFY_DATABASE_BLOCKED",
    );
  });

  it("accepts an explicitly confirmed local Redis", () => {
    expect(
      assertDisposableVerifyRedis({
        redisUrl: "redis://127.0.0.1:6379",
        nodeEnv: "test",
        confirmation: "true",
      }),
    ).toMatchObject({ redisUrl: "redis://127.0.0.1:6379" });
  });

  it.each([
    [undefined, "test", "true"],
    ["not-a-url", "test", "true"],
    ["http://127.0.0.1:6379", "test", "true"],
    ["redis://redis.example.com:6379", "test", "true"],
    ["redis://127.0.0.1:6379", "production", "true"],
    ["redis://127.0.0.1:6379", "test", undefined],
  ])("rejects an unsafe Redis target", (redisUrl, nodeEnv, confirmation) => {
    expect(() => assertDisposableVerifyRedis({ redisUrl, nodeEnv, confirmation })).toThrow(
      "VERIFY_REDIS_BLOCKED",
    );
  });
});
