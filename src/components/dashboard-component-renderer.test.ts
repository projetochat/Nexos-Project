import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./dashboard-component-renderer.tsx", import.meta.url), "utf8");

describe("DashboardComponentRenderer height contract", () => {
  it("uses a numeric height for compact column and bar previews", () => {
    expect(source.match(/height=\{compact \? height : "100%"\}/g)).toHaveLength(2);
  });
});
