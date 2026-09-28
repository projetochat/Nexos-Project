import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("schedule execution migration", () => {
  it("backfills only valid ISO one-shot Chat messages and isolates malformed legacy dates", () => {
    const sql = readFileSync(
      resolve(__dirname, "../../prisma/migrations/20260927224000_schedule_execution/migration.sql"),
      "utf8",
    );

    expect(sql).toContain("payload->>'type' = 'message'");
    expect(sql).toContain("payload->>'recurrence' = 'once'");
    expect(sql).toContain("jsonb_array_length(payload->'recipientIds') = 0");
    expect(sql).toContain("jsonb_typeof(payload->'conversationId') = 'string'");
    expect(sql).toContain("Z|[+-]\\d{2}:\\d{2}");
    expect(sql).toContain("CURRENT_TIMESTAMP - INTERVAL '24 hours'");
    expect(sql).toContain("\"executionStatus\" = 'FAILED'");
    expect(sql).toContain("\"executionStatus\" = 'PENDING'");
    expect(sql).toContain("EXCEPTION WHEN OTHERS THEN");
  });
});
