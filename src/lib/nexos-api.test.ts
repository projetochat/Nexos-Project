// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearNexosApiSession, loginWithNexosApi } from "./nexos-api";

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
});

function responseJson(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
