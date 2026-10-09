import { describe, expect, it } from "vitest";

import { FAVICON_HREF, resolveFaviconEnvironment, resolveFaviconHref } from "./favicon";
import { renderErrorPage } from "./error-page";

describe("environment favicon", () => {
  it("always uses the development favicon on the local dev server", () => {
    expect(
      resolveFaviconHref({ appMode: "homologation", viteMode: "development", isDev: true }),
    ).toContain("/favicon-dev.ico");
  });

  it.each([
    ["development", "development", "/favicon-dev.ico"],
    ["homologation", "production", "/favicon-hom.ico"],
    ["production", "production", "/favicon-prod.ico"],
    ["hom", "production", "/favicon-hom.ico"],
    ["prod", "production", "/favicon-prod.ico"],
  ])("maps app mode %s to its favicon", (appMode, viteMode, expectedPath) => {
    expect(resolveFaviconHref({ appMode, viteMode })).toContain(expectedPath);
  });

  it("supports an explicit homologation Vite mode", () => {
    expect(resolveFaviconEnvironment({ viteMode: "homologation" })).toBe("homologation");
  });

  it("falls back to production for an unknown non-development build", () => {
    expect(resolveFaviconEnvironment({ appMode: "unknown", viteMode: "custom" })).toBe(
      "production",
    );
  });

  it("keeps the standalone error page on the same environment favicon", () => {
    expect(renderErrorPage()).toContain(`href="${FAVICON_HREF}"`);
  });
});
