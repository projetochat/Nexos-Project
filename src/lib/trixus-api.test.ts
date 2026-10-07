// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acceptTenantInvitationWithTrixusApi,
  activatePlatformImpersonation,
  apiRequest,
  clearTrixusApiSession,
  createImpersonationHandoff,
  exchangeImpersonationHandoff,
  hydrateWithTrixusApi,
  loginWithTrixusApi,
  completeRequiredPasswordChangeWithTrixusApi,
  selectTenantWithTrixusApi,
  logoutFromTrixusApi,
  platformApi,
  readStoredHandoffImpersonation,
  readStoredPlatformImpersonation,
  connectionsApi,
  stopStoredPlatformImpersonation,
  stopHandoffImpersonation,
} from "./trixus-api";

describe("trixus-api auth client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearTrixusApiSession();
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
            email: "admin@trixus.app",
            name: "Admin Homologacao",
            roleId: "role-a",
            roleKey: "tenant_admin",
            platformRole: "USER",
          },
          tenant: { id: "tenant-a", slug: "homologacao", name: "Homologacao Trixus" },
          membership: { id: "membership-a", role: "tenant_admin", roleId: "role-a" },
          permissions: ["users.manage"],
        }),
      ),
    );

    await expect(loginWithTrixusApi("admin@trixus.app", "demo1234")).resolves.toMatchObject({
      email: "admin@trixus.app",
      role: "admin",
      empresaNome: "Homologacao Trixus",
    });

    expect(localStorage.getItem("trixus.api.accessToken")).toBe("access");
    expect(localStorage.getItem("trixus.api.refreshToken")).toBe("refresh");
  });

  it.each([
    ["platform", "/auth/platform/login"],
    ["tenant", "/auth/tenant/login"],
  ] as const)("uses the explicit %s authentication endpoint", async (surface, endpoint) => {
    const fetchMock = vi.fn().mockResolvedValue(
      responseJson(201, {
        passwordChangeRequired: true,
        passwordSetupToken: "setup-token",
        user: { id: "user-1", email: "user@trixus.app", name: "User" },
        tenant: { id: "tenant-1", slug: "tenant", name: "Tenant" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await loginWithTrixusApi("user@trixus.app", "safe-password", undefined, surface);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`${endpoint.replaceAll("/", "\\/")}$`)),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("keeps the first-login password challenge out of the authenticated session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        responseJson(201, {
          passwordChangeRequired: true,
          passwordSetupToken: "setup-token",
          user: { id: "admin-1", email: "admin@tenant.test", name: "Admin" },
          tenant: { id: "tenant-1", slug: "tenant", name: "Tenant" },
        }),
      ),
    );

    await expect(loginWithTrixusApi("admin@tenant.test", "Trixus@2026")).resolves.toMatchObject({
      passwordChangeRequired: true,
      passwordSetupToken: "setup-token",
    });
    expect(localStorage.getItem("trixus.api.accessToken")).toBeNull();
    expect(localStorage.getItem("trixus.api.refreshToken")).toBeNull();
  });

  it("returns the Tenant selection challenge without storing a session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        responseJson(201, {
          tenantSelectionRequired: true,
          tenantSelectionToken: "selection-token",
          tenants: [
            { id: "tenant-a", slug: "alpha", name: "Alpha" },
            { id: "tenant-b", slug: "beta", name: "Beta" },
          ],
        }),
      ),
    );

    await expect(loginWithTrixusApi("admin@tenant.test", "senha-segura")).resolves.toMatchObject({
      tenantSelectionRequired: true,
      tenants: [{ id: "tenant-a" }, { id: "tenant-b" }],
    });
    expect(localStorage.getItem("trixus.api.accessToken")).toBeNull();
  });

  it("stores a normal session only after the required password is changed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        responseJson(201, {
          accessToken: "new-access",
          refreshToken: "new-refresh",
          user: {
            id: "admin-1",
            email: "admin@tenant.test",
            name: "Admin",
            roleId: "role-1",
            roleKey: "tenant_admin",
            platformRole: "USER",
          },
          tenant: { id: "tenant-1", slug: "tenant", name: "Tenant" },
          membership: { id: "membership-1", role: "tenant_admin", roleId: "role-1" },
          permissions: ["users.manage"],
        }),
      ),
    );

    await expect(
      completeRequiredPasswordChangeWithTrixusApi({
        setupToken: "setup-token",
        newPassword: ["NovaSenha", "2026"].join("@"),
        confirmPassword: ["NovaSenha", "2026"].join("@"),
      }),
    ).resolves.toMatchObject({ role: "admin", empresaId: "tenant-1" });
    expect(localStorage.getItem("trixus.api.accessToken")).toBe("new-access");
  });

  it("establishes the selected Tenant context only after the server validates it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      responseJson(201, {
        accessToken: ["tenant", "access"].join("-"),
        refreshToken: "tenant-refresh",
        user: {
          id: "admin-1",
          email: "admin@tenant.test",
          name: "Admin",
          roleId: "role-b",
          roleKey: "tenant_admin",
          platformRole: "USER",
        },
        tenant: { id: "tenant-b", slug: "beta", name: "Beta" },
        membership: { id: "membership-b", role: "tenant_admin", roleId: "role-b" },
        permissions: ["users.manage"],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      selectTenantWithTrixusApi({ selectionToken: "selection-token", tenantId: "tenant-b" }),
    ).resolves.toMatchObject({ empresaId: "tenant-b", empresaNome: "Beta" });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/auth/tenant/select"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ selectionToken: "selection-token", tenantId: "tenant-b" }),
      }),
    );
  });

  it("accepts an administrator invitation and stores the new tenant session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      responseJson(201, {
        accessToken: ["invite", "access"].join("-"),
        refreshToken: "invite-refresh",
        user: {
          id: "user-invited",
          email: "admin@empresa.test",
          name: "Admin Empresa",
          roleId: "role-admin",
          roleKey: "tenant_admin",
          platformRole: "USER",
        },
        tenant: { id: "tenant-new", slug: "empresa", name: "Empresa" },
        membership: {
          id: "membership-admin",
          role: "tenant_admin",
          roleId: "role-admin",
        },
        permissions: ["users.manage"],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      acceptTenantInvitationWithTrixusApi({
        token: "single-use-token",
        password: ["senha", "segura"].join("-"),
        name: "Admin Empresa",
      }),
    ).resolves.toMatchObject({ role: "admin", empresaId: "tenant-new" });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/auth/invitations/accept"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(localStorage.getItem("trixus.api.accessToken")).toBe("invite-access");
    expect(localStorage.getItem("trixus.api.refreshToken")).toBe("invite-refresh");
  });

  it("restores the owner session without a tenant membership after a page refresh", async () => {
    localStorage.setItem("trixus.api.accessToken", "owner-access");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer owner-access");
        return responseJson(200, {
          user: {
            id: "owner-user",
            email: "platform@trixus.app",
            name: "Dono",
            roleId: "",
            roleKey: "platform_admin",
            roleName: "Dono",
            platformRole: "ADMIN",
          },
          tenant: { id: "platform", slug: "platform", name: "Trixus Platform" },
          membership: { id: "", role: "platform_admin", roleId: "" },
          departments: [],
          permissions: [],
        });
      }),
    );

    await expect(hydrateWithTrixusApi()).resolves.toMatchObject({
      id: "owner-user",
      email: "platform@trixus.app",
      role: "super_admin",
      empresaId: "platform",
    });
  });

  it("distinguishes invalid credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          responseJson(401, { code: "INVALID_CREDENTIALS", message: "E-mail ou senha inválidos." }),
        ),
    );

    await expect(loginWithTrixusApi("admin@trixus.app", "wrong-password")).rejects.toThrow(
      "E-mail ou senha inválidos.",
    );
  });

  it("returns a clear message for network failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    await expect(loginWithTrixusApi("admin@trixus.app", "demo1234")).rejects.toThrow(
      "Não foi possível conectar ao sistema. Verifique sua internet e tente novamente.",
    );
  });

  it("distinguishes missing membership", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        responseJson(403, {
          code: "USER_WITHOUT_ACTIVE_MEMBERSHIP",
          message: "Seu usuário não possui acesso a nenhuma organização ativa.",
        }),
      ),
    );

    await expect(loginWithTrixusApi("sem-membership@trixus.app", "demo1234")).rejects.toThrow(
      "Seu usuário não possui acesso a nenhuma organização ativa.",
    );
  });

  it("returns a clear message for internal authentication errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseJson(500, {})));

    await expect(loginWithTrixusApi("admin@trixus.app", "demo1234")).rejects.toThrow(
      "Não foi possível concluir a autenticação. Tente novamente em alguns instantes.",
    );
  });

  it("does not expose internal server messages in application requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(responseJson(500, { message: "Internal Server Error" })),
    );

    await expect(apiRequest("/roles")).rejects.toThrow(
      "Não foi possível concluir a ação agora. Tente novamente em alguns instantes.",
    );
  });

  it("preserves the request id from an application error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        responseJson(500, {
          requestId: "request-onboarding-qr",
          code: "INTERNAL_ERROR",
          message: "Não foi possível concluir a ação agora. Tente novamente em alguns instantes.",
        }),
      ),
    );

    await expect(apiRequest("/messaging/connections/evolution")).rejects.toMatchObject({
      status: 500,
      code: "INTERNAL_ERROR",
      requestId: "request-onboarding-qr",
    });
  });

  it("keeps a useful domain message returned by the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          responseJson(409, { message: "Já existe um perfil de acesso com este nome." }),
        ),
    );

    await expect(apiRequest("/roles")).rejects.toThrow(
      "Já existe um perfil de acesso com este nome.",
    );
  });

  it("translates the tenant attendant limit code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        responseJson(409, {
          code: "PLAN_LIMIT_USERS_REACHED",
          details: { limit: 5, currentValue: 5 },
        }),
      ),
    );

    await expect(apiRequest("/users")).rejects.toThrow("Número máximo de atendentes atingido");
  });

  it("uses one refresh request for concurrent 401 responses and retries each request once", async () => {
    localStorage.setItem("trixus.api.accessToken", "old-access");
    localStorage.setItem("trixus.api.refreshToken", "refresh");
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
    expect(localStorage.getItem("trixus.api.accessToken")).toBe("new-access");
  });

  it("does not recursively refresh the refresh endpoint after a definitive 401", async () => {
    localStorage.setItem("trixus.api.accessToken", "old-access");
    localStorage.setItem("trixus.api.refreshToken", "refresh");
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
    expect(localStorage.getItem("trixus.api.accessToken")).toBeNull();
    expect(localStorage.getItem("trixus.api.refreshToken")).toBeNull();
  });

  it("clears a session when the retried request remains unauthorized", async () => {
    localStorage.setItem("trixus.api.accessToken", "old-access");
    localStorage.setItem("trixus.api.refreshToken", "refresh");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) {
        return responseJson(200, { accessToken: "new-access" });
      }
      return responseJson(401, { message: "revoked session" });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest("/messaging/connections")).rejects.toThrow("revoked session");
    await expect(apiRequest("/messaging/connections")).rejects.toThrow("revoked session");

    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/auth/refresh")),
    ).toHaveLength(1);
    expect(localStorage.getItem("trixus.api.accessToken")).toBeNull();
    expect(localStorage.getItem("trixus.api.refreshToken")).toBeNull();
  });

  it("activates and stops a platform impersonation by restoring platform tokens", async () => {
    localStorage.setItem("trixus.api.accessToken", "platform-access");
    localStorage.setItem("trixus.api.refreshToken", "platform-refresh");
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
          accessToken: ["tenant", "access"].join("-"),
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
        email: "platform@trixus.app",
        role: "super_admin",
        empresaId: "platform",
        empresaNome: "Trixus Platform",
        permissions: [],
      },
    );

    expect(user.role).toBe("admin");
    expect(localStorage.getItem("trixus.api.accessToken")).toBe("tenant-access");
    expect(readStoredPlatformImpersonation()?.id).toBe("session-a");

    await expect(stopStoredPlatformImpersonation()).resolves.toMatchObject({
      role: "super_admin",
      email: "platform@trixus.app",
    });
    expect(localStorage.getItem("trixus.api.accessToken")).toBe("platform-access");
    expect(readStoredPlatformImpersonation()).toBeNull();
  });

  it("creates a cross-domain handoff without placing tokens in the URL", async () => {
    localStorage.setItem("trixus.api.accessToken", "platform-access-secret");
    localStorage.setItem("trixus.api.refreshToken", "platform-refresh-secret");
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { codeChallenge: string };
      expect(body.codeChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
      return responseJson(201, {
        code: "c".repeat(43),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        tenant: { id: "tenant-a", name: "Tenant A", slug: "tenant-a" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const handoff = await createImpersonationHandoff({
      tenantId: "tenant-a",
      membershipId: "membership-a",
      reason: "Suporte solicitado",
    });

    const url = new URL(handoff.url);
    expect(url.origin).toBe(window.location.origin);
    expect(url.pathname).toBe("/impersonation/callback");
    expect(url.searchParams.get("code")).toBe("c".repeat(43));
    expect(url.hash).toMatch(/^#verifier=[A-Za-z0-9_-]{43}$/);
    expect(handoff.url).not.toContain("platform-access-secret");
    expect(handoff.url).not.toContain("platform-refresh-secret");
  });

  it("exchanges and stops a cross-domain impersonation only with tenant credentials", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/auth/impersonation/exchange")) {
        expect(new Headers(init?.headers).get("Authorization")).toBeNull();
        return responseJson(201, {
          accessToken: ["tenant", "access"].join("-"),
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
          impersonation: {
            id: "session-a",
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            actorUser: { id: "actor-a", name: "Platform Admin", email: "admin@trixus.test" },
            tenant: { id: "tenant-a", slug: "tenant-a", name: "Tenant A" },
          },
        });
      }
      expect(url).toContain("/auth/impersonation/stop");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer tenant-access");
      return responseJson(201, { id: "session-a" });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      exchangeImpersonationHandoff("c".repeat(43), "v".repeat(43)),
    ).resolves.toMatchObject({
      user: { role: "admin", empresaId: "tenant-a" },
      impersonation: { id: "session-a", actorUser: { email: "admin@trixus.test" } },
    });
    expect(localStorage.getItem("trixus.api.accessToken")).toBe("tenant-access");
    expect(readStoredHandoffImpersonation()?.id).toBe("session-a");
    expect(localStorage.getItem("trixus.api.handoffImpersonation")).not.toContain(
      "platform-access",
    );

    await stopHandoffImpersonation();
    expect(localStorage.getItem("trixus.api.accessToken")).toBeNull();
    expect(readStoredHandoffImpersonation()).toBeNull();
  });

  it("expires a local impersonation and restores platform credentials", async () => {
    localStorage.setItem("trixus.api.accessToken", "platform-access");
    localStorage.setItem("trixus.api.refreshToken", "platform-refresh");
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
          accessToken: ["tenant", "access"].join("-"),
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
        email: "platform@trixus.app",
        role: "super_admin",
        empresaId: "platform",
        empresaNome: "Trixus Platform",
        permissions: [],
      },
    );

    expect(readStoredPlatformImpersonation()).toBeNull();
    expect(localStorage.getItem("trixus.api.accessToken")).toBe("platform-access");
  });

  it("stops server-side impersonation before logout clears local tokens", async () => {
    localStorage.setItem("trixus.api.accessToken", "platform-access");
    localStorage.setItem("trixus.api.refreshToken", "platform-refresh");
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
          accessToken: ["tenant", "access"].join("-"),
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
        email: "platform@trixus.app",
        role: "super_admin",
        empresaId: "platform",
        empresaNome: "Trixus Platform",
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

    await logoutFromTrixusApi();

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "http://localhost:3001/api/platform/impersonation/session-logout/stop",
      "http://localhost:3001/api/auth/logout",
    ]);
    expect(localStorage.getItem("trixus.api.accessToken")).toBeNull();
    expect(readStoredPlatformImpersonation()).toBeNull();
  });

  it("calls the canonical DELETE endpoint for connection removal", async () => {
    localStorage.setItem("trixus.api.accessToken", "tenant-access");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://localhost:3001/api/messaging/connections/connection-a");
      expect(init?.method).toBe("DELETE");
      expect(JSON.parse(String(init?.body))).toEqual({ confirmation: "REMOVER" });
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

  it("loads platform tenants with the platform token", async () => {
    localStorage.setItem("trixus.api.accessToken", "platform-access");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://localhost:3001/api/platform/tenants?pageSize=20");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer platform-access");
      return responseJson(200, {
        items: [
          {
            id: "tenant-a",
            name: "Tenant A",
            slug: "tenant-a",
            status: "ACTIVE",
            plan: null,
            subscriptionStatus: null,
            activeUsers: 0,
            connections: 0,
            createdAt: "2026-08-04T00:00:00.000Z",
            updatedAt: "2026-08-04T00:00:00.000Z",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(platformApi.tenants({ pageSize: 20 })).resolves.toMatchObject({
      total: 1,
      items: [{ slug: "tenant-a", plan: null }],
    });
  });

  it("preserves platform empty states instead of treating them as errors", async () => {
    localStorage.setItem("trixus.api.accessToken", "platform-access");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          responseJson(200, { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 }),
        ),
    );

    await expect(platformApi.tenants({ page: 1, pageSize: 20 })).resolves.toMatchObject({
      items: [],
      total: 0,
    });
  });

  it("surfaces canonical platform errors without converting them to empty lists", async () => {
    localStorage.setItem("trixus.api.accessToken", "platform-access");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        responseJson(500, {
          requestId: "request-a",
          code: "PLATFORM_UNEXPECTED_ERROR",
          message: "Erro seguro no plano de controle. Informe o requestId ao suporte.",
        }),
      ),
    );

    await expect(platformApi.plans()).rejects.toMatchObject({
      status: 500,
      code: "PLATFORM_UNEXPECTED_ERROR",
      message: "Erro seguro no plano de controle. Informe o requestId ao suporte.",
    });
  });
});

function responseJson(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
