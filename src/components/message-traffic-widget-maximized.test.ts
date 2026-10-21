import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./message-traffic-widget.tsx", import.meta.url), "utf8");

describe("MessageTrafficWidget maximized layout", () => {
  it("centers the BI visual vertically while preserving full width", () => {
    expect(source).toContain("useDashboardMaximized()");
    expect(source).toContain('"flex min-h-0 flex-1 flex-col justify-center"');
    expect(source).toContain('height={maximized ? "58%" : 260}');
    expect(source).toContain("data-message-traffic-visual");
  });
});
