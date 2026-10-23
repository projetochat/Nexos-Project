import { afterEach, describe, expect, it, vi } from "vitest";
import { TransactionalEmailService } from "./transactional-email.service";

describe("TransactionalEmailService customer portal invitation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("includes all registered access details in text and HTML", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: "email-a" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const config = {
      get: vi.fn((key: string) => {
        if (key === "RESEND_API_KEY") return "test-key";
        if (key === "TRIXUS_EMAIL_FROM") return "Trixus <noreply@trixus.test>";
        return undefined;
      }),
    };
    const service = new TransactionalEmailService(config as never);

    await service.sendCustomerPortalInvitation({
      to: "clara@example.test",
      contactName: "Clara",
      customerName: "SDE",
      login: "clara@example.test",
      profileName: "Colaborador",
      departmentName: "Financeiro",
      branchName: "Unidade01",
      acceptUrl: "https://app.trixus.test/login/portal-cliente?invite=token",
      expiresAt: new Date("2026-10-25T12:00:00-03:00"),
    });

    const request = fetchMock.mock.calls[0]?.[1] as { body: string };
    const payload = JSON.parse(request.body) as { text: string; html: string };
    for (const expected of [
      "Nome: Clara",
      "Login: clara@example.test",
      "Perfil: Colaborador",
      "Departamento: Financeiro",
      "Filial: Unidade01",
    ]) {
      expect(payload.text).toContain(expected);
    }
    expect(payload.html).toContain("Clara");
    expect(payload.html).toContain("clara@example.test");
    expect(payload.html).toContain("Colaborador");
    expect(payload.html).toContain("Financeiro");
    expect(payload.html).toContain("Unidade01");
  });
});
