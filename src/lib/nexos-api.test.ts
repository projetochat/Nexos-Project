// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest, clearNexosApiSession, loginWithNexosApi } from "./nexos-api";

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

    await expect(apiRequest("/conversations")).rejects.toThrow("E-mail ou senha invalidos.");

    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/auth/refresh")),
    ).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem("nexo.api.accessToken")).toBeNull();
    expect(localStorage.getItem("nexo.api.refreshToken")).toBeNull();
  });
});

function responseJson(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
