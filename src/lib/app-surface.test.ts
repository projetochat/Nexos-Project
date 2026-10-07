// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appSurfaceForHostname,
  appTitleForHostname,
  appTitleWithUnreadConversations,
  loginEndpointForSurface,
  surfaceRedirect,
} from "./app-surface";

describe("app surface routing", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_TRIXUS_PLATFORM_APP_URL", "https://app.trixus.com.br");
    vi.stubEnv("VITE_TRIXUS_TENANT_APP_URL", "https://chat.trixus.com.br");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("keeps localhost on the compatible unified surface", () => {
    expect(appSurfaceForHostname("localhost")).toBe("unified");
    expect(appSurfaceForHostname("127.0.0.1")).toBe("unified");
    expect(loginEndpointForSurface("unified")).toBe("/auth/login");
  });

  it("uses an explicit login endpoint for each production surface", () => {
    expect(appSurfaceForHostname("app.trixus.com.br")).toBe("platform");
    expect(appSurfaceForHostname("chat.trixus.com.br")).toBe("tenant");
    expect(appTitleForHostname("app.trixus.com.br")).toBe("Trixus | App");
    expect(appTitleForHostname("chat.trixus.com.br")).toBe("Trixus | App");
    expect(loginEndpointForSurface("platform")).toBe("/auth/platform/login");
    expect(loginEndpointForSurface("tenant")).toBe("/auth/tenant/login");
  });

  it("keeps the fixed app title and adds only a positive unread conversation count", () => {
    expect(appTitleWithUnreadConversations(3)).toBe("(3) Trixus | App");
    expect(appTitleWithUnreadConversations(0)).toBe("Trixus | App");
    expect(appTitleWithUnreadConversations(-1)).toBe("Trixus | App");
  });

  it("redirects routes to their correct origin without copying secrets", () => {
    expect(
      surfaceRedirect({ hostname: "app.trixus.com.br", pathname: "/inbox/conversation-1" }),
    ).toBe("https://chat.trixus.com.br/inbox/conversation-1");
    expect(surfaceRedirect({ hostname: "chat.trixus.com.br", pathname: "/admin/tenants" })).toBe(
      "https://app.trixus.com.br/admin/tenants",
    );
    expect(surfaceRedirect({ hostname: "app.trixus.com.br", pathname: "/login" })).toBeNull();
    expect(surfaceRedirect({ hostname: "chat.trixus.com.br", pathname: "/login" })).toBeNull();
  });

  it("honors custom configured origins while accepting only their origins", () => {
    vi.stubEnv("VITE_TRIXUS_PLATFORM_APP_URL", "https://console.example.test/nested");
    vi.stubEnv("VITE_TRIXUS_TENANT_APP_URL", "https://workspace.example.test/path");
    expect(appSurfaceForHostname("console.example.test")).toBe("platform");
    expect(surfaceRedirect({ hostname: "console.example.test", pathname: "/inbox" })).toBe(
      "https://workspace.example.test/inbox",
    );
  });

  it("does not expose the compatible login on an unknown production host", () => {
    vi.stubEnv("VITE_APP_MODE", "production");
    expect(appSurfaceForHostname("unexpected.example.test")).toBe("unknown");
    expect(
      surfaceRedirect({ hostname: "unexpected.example.test", pathname: "/admin?token=secret" }),
    ).toBe("https://chat.trixus.com.br/login");
  });

  it("rejects non-HTTP redirect origins from configuration", () => {
    vi.stubEnv("VITE_TRIXUS_TENANT_APP_URL", "javascript:alert(1)");
    expect(surfaceRedirect({ hostname: "app.trixus.com.br", pathname: "/inbox" })).toBe(
      "https://chat.trixus.com.br/inbox",
    );
  });
});
