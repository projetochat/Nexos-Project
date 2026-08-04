// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activatePlatformImpersonation,
  apiRequest,
  clearNexosApiSession,
  loginWithNexosApi,
  logoutFromNexosApi,
  readStoredPlatformImpersonation,
  connectionsApi,
  stopStoredPlatformImpersonation,
} from "./nexos-api";

describe("nexos-api auth client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearNexosApiSession();
  });

  it("stores tokens and maps the homologation login response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        responseJson(201, {
          accessToken: "access",
          refreshToken: "refresh",
          user: {
            id: "user-a",
            email: "admin@nexo.app",
            name: "Admin Homologacao",
            roleId: "role-a",
            roleKey: "tenant_admin",
            platformRole: "USER",
          },
          tenant: { id: "tenant-a", slug: "homologacao", name: "Homologacao Nexos" },
          membership: { id: "membership-a", role: "tenant_admin", roleId: "role-a" },
          permissions: ["users.manage"],
        }),
      ),
    );

    await expect(loginWithNexosApi("admin@nexo.app", "demo1234")).resolves.toMatchObject({
      email: "admin@nexo.app",
      role: "admin",
      empresaNome: "Homologacao Nexos",
    });

    expect(localStorage.getItem("nexo.api.accessToken")).toBe("access");
    expect(localStorage.getItem("nexo.api.refreshToken")).toBe("refresh");
  });

  it("distinguishes invalid credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          responseJson(401, { code: "INVALID_CREDENTIALS", message: "E-mail ou senha invalidos." }),
        ),
    );

    await expect(loginWithNexosApi("admin@nexo.app", "wrong-password")).rejects.toThrow(
      "E-mail ou senha invalidos.",
    );
  });

  it("surfaces network failures distinctly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    await expect(loginWithNexosApi("admin@nexo.app", "demo1234")).rejects.toThrow("fetch failed");
  });

  it("distinguishes missing membership", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        responseJson(403, {
          code: "USER_WITHOUT_ACTIVE_MEMBERSHIP",
          message: "Seu usuario nao possui acesso a nenhuma organizacao ativa.",
        }),
      ),
    );

    await expect(loginWithNexosApi("sem-membership@nexo.app", "demo1234")).rejects.toThrow(
      "Seu usuario nao possui acesso a nenhuma organizacao ativa.",
    );
  });

  it("distinguishes internal authentication errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseJson(500, {})));

    await expect(loginWithNexosApi("admin@nexo.app", "demo1234")).rejects.toThrow(
      "Ocorreu um erro interno ao autenticar.",
    );
  });

  it("uses one refresh request for concurrent 401 responses and retries each request once", async () => {
    localStorage.setItem("nexo.api.accessToken", "old-access");
    localStorage.setItem("nexo.api.refreshToken", "refresh");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) {
        return responseJson(200, { accessToken: "new-access" });
      }
      const authorization = new Headers(init?.headers).get("Authorization");
      if (authorization === "Bearer old-access") return responseJson(401, { message: "expired" });
      return responseJson(200, { ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      Promise.all([apiRequest<{ ok: true }>("/conversations"), apiRequest<{ ok: true }>("/users")]),
    ).resolves.toEqual([{ ok: true }, { ok: true }]);

    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/auth/refresh")),
    ).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(localStorage.getItem("nexo.api.accessToken")).toBe("new-access");
  });

  it("does not recursively refresh the refresh endpoint after a definitive 401", async () => {
    localStorage.setItem("nexo.api.accessToken", "old-access");
    localStorage.setItem("nexo.api.refreshToken", "refresh");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) return responseJson(401, { message: "invalid refresh" });
      return responseJson(401, { message: "expired" });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest("/conversations")).rejects.toThrow("expired");

    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/auth/refresh")),
    ).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem("nexo.api.accessToken")).toBeNull();
    expect(localStorage.getItem("nexo.api.refreshToken")).toBeNull();
  });

  it("activates and stops a platform impersonation by restoring platform tokens", async () => {
    localStorage.setItem("nexo.api.accessToken", "platform-access");
    localStorage.setItem("nexo.api.refreshToken", "platform-refresh");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const authorization = new Headers(init?.headers).get("Authorization");
      expect(authorization).toBe("Bearer platform-access");
      expect(String(input)).toContain("/platform/impersonation/session-a/stop");
      return responseJson(201, { id: "session-a" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = activatePlatformImpersonation(
      {
        id: "session-a",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        tenant: { id: "tenant-a", name: "Tenant A", slug: "tenant-a" },
        membership: {
          id: "membership-a",
          status: "ACTIVE",
          user: {
            id: "user-a",
            email: "admin@tenant.test",
            name: "Admin Tenant",
            status: "ACTIVE",
            platformRole: "USER",
          },
          role: { id: "role-a", key: "tenant_admin", name: "Administrador" },
          departments: [],
        },
        tokens: {
          accessToken: "tenant-access",
          refreshToken: "tenant-refresh",
          user: {
            id: "user-a",
            email: "admin@tenant.test",
            name: "Admin Tenant",
            roleId: "role-a",
            roleKey: "tenant_admin",
            platformRole: "USER",
          },
          tenant: { id: "tenant-a", slug: "tenant-a", name: "Tenant A" },
          membership: { id: "membership-a", role: "tenant_admin", roleId: "role-a" },
          permissions: ["users.manage"],
        },
      },
      {
        id: "platform-user",
        nome: "Platform Admin",
        email: "platform@nexo.app",
        role: "super_admin",
        empresaId: "platform",
        empresaNome: "Nexos Platform",
        permissions: [],
      },
    );

    expect(user.role).toBe("admin");
    expect(localStorage.getItem("nexo.api.accessToken")).toBe("tenant-access");
    expect(readStoredPlatformImpersonation()?.id).toBe("session-a");

    await expect(stopStoredPlatformImpersonation()).resolves.toMatchObject({
      role: "super_admin",
      email: "platform@nexo.app",
    });
    expect(localStorage.getItem("nexo.api.accessToken")).toBe("platform-access");
    expect(readStoredPlatformImpersonation()).toBeNull();
  });

  it("expires a local impersonation and restores platform credentials", async () => {
    localStorage.setItem("nexo.api.accessToken", "platform-access");
    localStorage.setItem("nexo.api.refreshToken", "platform-refresh");
    activatePlatformImpersonation(
      {
        id: "session-expired",
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        tenant: { id: "tenant-a", name: "Tenant A", slug: "tenant-a" },
        membership: {
          id: "membership-a",
          status: "ACTIVE",
          user: {
            id: "user-a",
            email: "admin@tenant.test",
            name: "Admin Tenant",
            status: "ACTIVE",
            platformRole: "USER",
          },
          role: { id: "role-a", key: "tenant_admin", name: "Administrador" },
          departments: [],
        },
        tokens: {
          accessToken: "tenant-access",
          refreshToken: "tenant-refresh",
          user: {
            id: "user-a",
            email: "admin@tenant.test",
            name: "Admin Tenant",
            roleId: "role-a",
            roleKey: "tenant_admin",
            platformRole: "USER",
          },
          tenant: { id: "tenant-a", slug: "tenant-a", name: "Tenant A" },
          membership: { id: "membership-a", role: "tenant_admin", roleId: "role-a" },
          permissions: ["users.manage"],
        },
      },
      {
        id: "platform-user",
        nome: "Platform Admin",
        email: "platform@nexo.app",
        role: "super_admin",
        empresaId: "platform",
        empresaNome: "Nexos Platform",
        permissions: [],
      },
    );

    expect(readStoredPlatformImpersonation()).toBeNull();
    expect(localStorage.getItem("nexo.api.accessToken")).toBe("platform-access");
  });

  it("stops server-side impersonation before logout clears local tokens", async () => {
    localStorage.setItem("nexo.api.accessToken", "platform-access");
    localStorage.setItem("nexo.api.refreshToken", "platform-refresh");
    activatePlatformImpersonation(
      {
        id: "session-logout",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        tenant: { id: "tenant-a", name: "Tenant A", slug: "tenant-a" },
        membership: {
          id: "membership-a",
          status: "ACTIVE",
          user: {
            id: "user-a",
            email: "admin@tenant.test",
            name: "Admin Tenant",
            status: "ACTIVE",
            platformRole: "USER",
          },
          role: { id: "role-a", key: "tenant_admin", name: "Administrador" },
          departments: [],
        },
        tokens: {
          accessToken: "tenant-access",
          refreshToken: "tenant-refresh",
          user: {
            id: "user-a",
            email: "admin@tenant.test",
            name: "Admin Tenant",
            roleId: "role-a",
            roleKey: "tenant_admin",
            platformRole: "USER",
          },
          tenant: { id: "tenant-a", slug: "tenant-a", name: "Tenant A" },
          membership: { id: "membership-a", role: "tenant_admin", roleId: "role-a" },
          permissions: ["users.manage"],
        },
      },
      {
        id: "platform-user",
        nome: "Platform Admin",
        email: "platform@nexo.app",
        role: "super_admin",
        empresaId: "platform",
        empresaNome: "Nexos Platform",
        permissions: [],
      },
    );
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const authorization = new Headers(init?.headers).get("Authorization");
      if (String(input).endsWith("/platform/impersonation/session-logout/stop")) {
        expect(authorization).toBe("Bearer platform-access");
        return responseJson(201, { id: "session-logout" });
      }
      expect(String(input)).toContain("/auth/logout");
      expect(authorization).toBe("Bearer platform-access");
      return responseJson(201, { ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    await logoutFromNexosApi();

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "http://localhost:3001/api/platform/impersonation/session-logout/stop",
      "http://localhost:3001/api/auth/logout",
    ]);
    expect(localStorage.getItem("nexo.api.accessToken")).toBeNull();
    expect(readStoredPlatformImpersonation()).toBeNull();
  });

  it("calls the canonical DELETE endpoint for connection removal", async () => {
    localStorage.setItem("nexo.api.accessToken", "tenant-access");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://localhost:3001/api/messaging/connections/connection-a");
      expect(init?.method).toBe("DELETE");
      return responseJson(200, {
        id: "connection-a",
        removed: true,
        archived: true,
        status: "removed",
        providerInstanceExisted: false,
        idempotent: true,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(connectionsApi.remove("connection-a")).resolves.toMatchObject({
      removed: true,
      archived: true,
      status: "removed",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

function responseJson(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
