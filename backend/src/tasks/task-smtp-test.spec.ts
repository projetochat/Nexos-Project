import "reflect-metadata";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TasksService } from "./tasks.service";
import {
  TaskSmtpService,
  TaskSmtpFailure,
  taskSmtpConfigurationFingerprint,
  type TaskEncryptedPassword,
} from "./task-smtp";
import { normalizeTaskSmtpTest } from "./task-input";
import type { TaskSmtpInput } from "./task-contract";
const actor = {
  tenantId: "tenant",
  membershipId: "member",
  userId: "user",
  roleKey: "tenant_admin",
  roleId: "role",
  platformRole: "USER",
  permissions: ["schedules.read", "schedules.update", "messages.send"],
} as never;
const accountInput = (): TaskSmtpInput => ({
  name: "Synthetic SMTP",
  host: "smtp.example.invalid",
  port: 465,
  secure: true,
  username: "test@example.invalid",
  fromAddress: "test@example.invalid",
  fromName: "Trixus Test",
  active: true,
});
function fixture() {
  const db = {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn().mockResolvedValue(1),
    $transaction: vi.fn(),
    platformAuditLog: { create: vi.fn().mockResolvedValue({ id: "audit" }) },
  };
  db.$transaction.mockImplementation(async (callback: (tx: typeof db) => unknown) => callback(db));
  const smtp = {
    configured: () => true,
    encrypt: vi.fn().mockReturnValue({ ciphertext: "new-encrypted", iv: "new-iv", tag: "new-tag" }),
    decrypt: vi.fn().mockReturnValue("dummy"),
    verify: vi.fn().mockResolvedValue({ verified: true }),
    send: vi.fn().mockImplementation(async (_account, _password, input) => ({
      sent: true,
      accepted: true,
      messageId: `<${input.deliveryId}@trixus.invalid>`,
    })),
  };
  const tasks = new TasksService(
    db as never,
    { get: () => "true" } as never,
    {} as never,
    smtp as never,
  );
  vi.spyOn(tasks, "context").mockResolvedValue(actor);
  const input = accountInput();
  const credential: TaskEncryptedPassword = { ciphertext: "encrypted", iv: "iv", tag: "tag" };
  const fingerprint = taskSmtpConfigurationFingerprint(input, credential);
  Object.assign(credential, {
    connectionFingerprint: fingerprint,
    lastTestFingerprint: fingerprint,
    lastTestAcceptedAt: "2030-01-01T12:00:00.000Z",
    lastTestReference: "prior-test",
    lastTestMessageId: "<prior-test@trixus.invalid>",
  });
  const account = {
    ...input,
    id: "smtp",
    tenantId: "tenant",
    credential,
    lastVerifiedAt: new Date("2030-01-01T12:00:00Z"),
    createdAt: new Date("2030-01-01T12:00:00Z"),
    updatedAt: new Date("2030-01-01T12:00:00Z"),
  };
  db.$queryRaw.mockResolvedValue([account]);
  return { db, smtp, tasks, account };
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2030-01-02T15:00:00Z"));
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("NETWORK_BLOCKED");
    }),
  );
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("explicit SMTP test email", () => {
  it.each([
    "person@example.invalid,other@example.invalid",
    "Name <person@example.invalid>",
    "person@example.invalid\r\nBcc: other@example.invalid",
    "person@example.invalid;other@example.invalid",
    "",
  ])("rejects multiple/header-injected or missing recipient %s", (recipient) => {
    expect(() => normalizeTaskSmtpTest({ confirm: true, recipient })).toThrow();
  });
  it("requires confirmation and explicit recipient before any account lookup or transport", async () => {
    const f = fixture();
    await expect(
      f.tasks.smtpVerify("smtp", { confirm: false, recipient: "recipient@example.invalid" }, actor),
    ).rejects.toThrow("Confirme");
    await expect(f.tasks.smtpVerify("smtp", { confirm: true }, actor)).rejects.toThrow();
    expect(f.db.$queryRaw).not.toHaveBeenCalled();
    expect(f.smtp.send).not.toHaveBeenCalled();
    expect(f.smtp.verify).not.toHaveBeenCalled();
  });
  it("does not send if authorization, own active account, or durable intent audit fails", async () => {
    const f = fixture();
    vi.spyOn(f.tasks, "context").mockResolvedValue({
      ...(actor as object),
      permissions: ["schedules.update"],
    } as never);
    await expect(
      f.tasks.smtpVerify("smtp", { confirm: true, recipient: "recipient@example.invalid" }, actor),
    ).rejects.toThrow("Permissão");
    expect(f.db.$queryRaw).not.toHaveBeenCalled();
    vi.spyOn(f.tasks, "context").mockResolvedValue(actor);
    f.db.$queryRaw.mockResolvedValue([]);
    await expect(
      f.tasks.smtpVerify(
        "foreign",
        { confirm: true, recipient: "recipient@example.invalid" },
        actor,
      ),
    ).rejects.toThrow("indisponível");
    expect(f.smtp.send).not.toHaveBeenCalled();
    f.db.$queryRaw.mockResolvedValue([f.account]);
    f.db.platformAuditLog.create.mockRejectedValue(new Error("audit unavailable"));
    await expect(
      f.tasks.smtpVerify("smtp", { confirm: true, recipient: "recipient@example.invalid" }, actor),
    ).rejects.toMatchObject({ status: 503 });
    expect(f.smtp.send).not.toHaveBeenCalled();
  });
  it("sends exactly one fixed test email and records acceptance without logging recipient, password or body", async () => {
    const f = fixture();
    const result = await f.tasks.smtpVerify(
      "smtp",
      { confirm: true, recipient: "recipient@example.invalid" },
      actor,
    );
    expect(result).toMatchObject({
      verified: true,
      accepted: true,
      auditRecorded: true,
      configurationUnchanged: true,
      message: "E-mail de teste aceito pelo servidor SMTP.",
    });
    expect(result.messageId).toBe(`<${result.reference}@trixus.invalid>`);
    expect(f.smtp.send).toHaveBeenCalledOnce();
    expect(f.smtp.verify).not.toHaveBeenCalled();
    const payload = f.smtp.send.mock.calls[0][2];
    expect(payload).toMatchObject({
      to: "recipient@example.invalid",
      subject: "Teste de e-mail — Trixus",
      deliveryId: result.reference,
    });
    expect(payload.body).toContain("2030-01-02T15:00:00.000Z");
    expect(payload.body).toContain(result.reference);
    expect(payload.body).not.toContain("dummy");
    const audits = f.db.platformAuditLog.create.mock.calls.map(([call]) => call.data);
    expect(audits.map((a) => a.action)).toEqual([
      "tasks.smtp.test.requested",
      "tasks.smtp.test.accepted",
    ]);
    expect(audits.every((a) => a.tenantId === "tenant" && a.targetId === "smtp")).toBe(true);
    const serialized = JSON.stringify(audits);
    expect(serialized).not.toContain("recipient@example.invalid");
    expect(serialized).not.toContain("dummy");
    expect(serialized).not.toContain("Este é um e-mail");
  });
  it("reports an uncertain outcome without any automatic resend or acceptance badge", async () => {
    const f = fixture();
    f.smtp.send.mockRejectedValue(new TaskSmtpFailure(true));
    let response: unknown;
    try {
      await f.tasks.smtpVerify(
        "smtp",
        { confirm: true, recipient: "recipient@example.invalid" },
        actor,
      );
    } catch (error) {
      response = (error as { getResponse: () => unknown }).getResponse();
    }
    expect(response).toMatchObject({
      code: "TASK_SMTP_TEST_OUTCOME_UNKNOWN",
      retryable: false,
      details: { retryable: false },
    });
    expect((response as { details: { reference: string } }).details.reference).toMatch(
      /^[a-f0-9-]{36}$/,
    );
    expect(f.smtp.send).toHaveBeenCalledOnce();
    expect(f.db.$executeRaw).not.toHaveBeenCalled();
    expect(f.db.platformAuditLog.create.mock.calls.at(-1)![0].data.action).toBe(
      "tasks.smtp.test.ambiguous",
    );
  });
  it("distinguishes explicit pre-acceptance rejection and unknown transport exceptions", async () => {
    for (const failure of [new TaskSmtpFailure(false), new Error("unknown adapter failure")]) {
      const f = fixture();
      f.smtp.send.mockRejectedValue(failure);
      await expect(
        f.tasks.smtpVerify(
          "smtp",
          { confirm: true, recipient: "recipient@example.invalid" },
          actor,
        ),
      ).rejects.toMatchObject({
        response: {
          code:
            failure instanceof TaskSmtpFailure
              ? "TASK_SMTP_TEST_FAILED"
              : "TASK_SMTP_TEST_OUTCOME_UNKNOWN",
        },
      });
      expect(f.smtp.send).toHaveBeenCalledOnce();
    }
  });
  it("does not stamp a newer account configuration after an old test was accepted", async () => {
    const f = fixture();
    f.db.$executeRaw.mockResolvedValue(0);
    const result = await f.tasks.smtpVerify(
      "smtp",
      { confirm: true, recipient: "recipient@example.invalid" },
      actor,
    );
    expect(result.accepted).toBe(true);
    expect(result.configurationUnchanged).toBe(false);
    const sql = f.db.$executeRaw.mock.calls[0][0];
    expect(sql.strings.join("")).toContain('"updatedAt"=');
    expect(sql.strings.join("")).toContain('"credential"=');
    expect(sql.values).toContain("tenant");
  });
  it("preserves known SMTP acceptance even if outcome persistence fails, without resending", async () => {
    const f = fixture();
    f.db.$transaction.mockRejectedValue(new Error("database unavailable after acceptance"));
    const result = await f.tasks.smtpVerify(
      "smtp",
      { confirm: true, recipient: "recipient@example.invalid" },
      actor,
    );
    expect(result).toMatchObject({ accepted: true, auditRecorded: false });
    expect(f.smtp.send).toHaveBeenCalledOnce();
    expect(f.db.platformAuditLog.create).toHaveBeenCalledOnce();
  });
});
describe("save and validate SMTP connection", () => {
  it("validates TLS/AUTH before persisting an active account, without sending MAIL", async () => {
    const f = fixture();
    const order: string[] = [];
    f.smtp.verify.mockImplementation(async () => {
      order.push("verify");
      return { verified: true };
    });
    f.db.$queryRaw.mockImplementation(async (sql: { strings: string[]; values: unknown[] }) => {
      if (sql.strings.join("").includes('INSERT INTO "task_smtp_accounts"')) {
        order.push("persist");
        const credential = JSON.parse(String(sql.values[9]));
        return [{ ...f.account, id: sql.values[0], credential, lastVerifiedAt: new Date() }];
      }
      return [f.account];
    });
    const result = await f.tasks.smtpSave(
      undefined,
      { ...accountInput(), password: "dummy" },
      actor,
    );
    expect(order).toEqual(["verify", "persist"]);
    expect(result.validationStatus).toBe("validated");
    expect(result.lastValidatedAt).toBe("2030-01-02T15:00:00.000Z");
    expect(result.lastTestAcceptedAt).toBeNull();
    expect(f.smtp.send).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("password");
    expect(JSON.stringify(result)).not.toContain("ciphertext");
  });
  it("leaves the prior configuration untouched when validation fails", async () => {
    const f = fixture();
    f.smtp.verify.mockRejectedValue(new TaskSmtpFailure(false));
    await expect(
      f.tasks.smtpSave("smtp", { ...accountInput(), fromName: "Changed" }, actor),
    ).rejects.toMatchObject({ response: { code: "TASK_SMTP_CONNECTION_VALIDATION_FAILED" } });
    expect(f.db.$transaction).not.toHaveBeenCalled();
    expect(f.smtp.send).not.toHaveBeenCalled();
  });
  it("saves an inactive draft without any SMTP connection and clears both badges", async () => {
    const f = fixture();
    f.db.$queryRaw.mockImplementation(async (sql: { strings: string[]; values: unknown[] }) => {
      if (sql.strings.join("").startsWith('UPDATE "task_smtp_accounts"'))
        return [
          {
            ...f.account,
            active: false,
            credential: JSON.parse(String(sql.values[7])),
            lastVerifiedAt: null,
          },
        ];
      return [f.account];
    });
    const result = await f.tasks.smtpSave("smtp", { ...accountInput(), active: false }, actor);
    expect(result.validationStatus).toBe("unvalidated");
    expect(result.lastValidatedAt).toBeNull();
    expect(result.lastTestAcceptedAt).toBeNull();
    expect(f.smtp.verify).not.toHaveBeenCalled();
    expect(f.smtp.send).not.toHaveBeenCalled();
  });
  it("clears the accepted-test marker after sender/config changes and guards concurrent account writes", async () => {
    const f = fixture();
    f.db.$queryRaw.mockImplementation(async (sql: { strings: string[]; values: unknown[] }) => {
      if (sql.strings.join("").startsWith('UPDATE "task_smtp_accounts"'))
        return [
          {
            ...f.account,
            fromName: "Changed",
            credential: JSON.parse(String(sql.values[7])),
            lastVerifiedAt: new Date(),
          },
        ];
      return [f.account];
    });
    const result = await f.tasks.smtpSave(
      "smtp",
      { ...accountInput(), fromName: "Changed" },
      actor,
    );
    expect(result.validationStatus).toBe("validated");
    expect(result.lastTestAcceptedAt).toBeNull();
    const update = f.db.$queryRaw.mock.calls.find(([sql]) =>
      sql.strings.join("").startsWith('UPDATE "task_smtp_accounts"'),
    )![0];
    expect(update.strings.join("")).toContain('"updatedAt"=');
    expect(update.strings.join("")).toContain('"credential"=');
    expect(f.smtp.send).not.toHaveBeenCalled();
  });
  it("keeps a matching prior MAIL acceptance when revalidating an unchanged active connection", async () => {
    const f = fixture();
    f.db.$queryRaw.mockImplementation(async (sql: { strings: string[]; values: unknown[] }) =>
      sql.strings.join("").startsWith('UPDATE "task_smtp_accounts"')
        ? [
            {
              ...f.account,
              credential: JSON.parse(String(sql.values[7])),
              lastVerifiedAt: new Date(),
            },
          ]
        : [f.account],
    );
    const result = await f.tasks.smtpSave("smtp", accountInput(), actor);
    expect(result.lastTestReference).toBe("prior-test");
    expect(result.lastTestAcceptedAt).toBe("2030-01-01T12:00:00.000Z");
    expect(f.smtp.verify).toHaveBeenCalledOnce();
    expect(f.smtp.send).not.toHaveBeenCalled();
  });
  it("rejects a stale concurrent save and never persists an unvalidated configuration", async () => {
    const f = fixture();
    f.db.$queryRaw.mockImplementation(async (sql: { strings: string[] }) =>
      sql.strings.join("").startsWith('UPDATE "task_smtp_accounts"') ? [] : [f.account],
    );
    await expect(f.tasks.smtpSave("smtp", accountInput(), actor)).rejects.toMatchObject({
      status: 409,
    });
    expect(f.smtp.verify).toHaveBeenCalledOnce();
    expect(f.smtp.send).not.toHaveBeenCalled();
  });
});
describe("SMTP wire construction without network", () => {
  it("captures one envelope recipient, fixed subject/body and Message-ID only after DATA acceptance", async () => {
    const smtp = new TaskSmtpService({ get: () => undefined } as never);
    const session = { command: vi.fn().mockResolvedValue("250 accepted"), close: vi.fn() };
    vi.spyOn(smtp as unknown as { open: () => Promise<unknown> }, "open").mockResolvedValue(
      session,
    );
    const id = "11111111-1111-4111-8111-111111111111";
    const result = await smtp.send(accountInput(), "dummy", {
      to: "recipient@example.invalid",
      subject: "Teste de e-mail — Trixus",
      body: "Texto fixo de teste",
      deliveryId: id,
    });
    expect(result).toEqual({ sent: true, accepted: true, messageId: `<${id}@trixus.invalid>` });
    expect(session.command.mock.calls.slice(0, 3).map(([value]) => value)).toEqual([
      "MAIL FROM:<test@example.invalid>",
      "RCPT TO:<recipient@example.invalid>",
      "DATA",
    ]);
    expect(session.command.mock.calls[2][1]).toEqual([354]);
    expect(session.command.mock.calls[3][1]).toEqual([250]);
    const wire = session.command.mock.calls[3][0];
    expect(wire).toContain(`Message-ID: <${id}@trixus.invalid>`);
    expect(wire).toContain(Buffer.from("Teste de e-mail — Trixus").toString("base64"));
    expect(wire).toContain(Buffer.from("Texto fixo de teste").toString("base64"));
    expect(wire).not.toContain("dummy");
    expect(session.close).toHaveBeenCalledOnce();
  });
  it("marks a lost reply after DATA as ambiguous and does not submit the message again", async () => {
    const smtp = new TaskSmtpService({ get: () => undefined } as never);
    const session = {
      command: vi
        .fn()
        .mockResolvedValueOnce("250")
        .mockResolvedValueOnce("250")
        .mockResolvedValueOnce("354")
        .mockRejectedValueOnce(new Error("ack lost")),
      close: vi.fn(),
    };
    vi.spyOn(smtp as unknown as { open: () => Promise<unknown> }, "open").mockResolvedValue(
      session,
    );
    await expect(
      smtp.send(accountInput(), "dummy", {
        to: "recipient@example.invalid",
        subject: "Teste",
        body: "Text",
        deliveryId: "test-reference",
      }),
    ).rejects.toMatchObject({ ambiguous: true });
    expect(session.command).toHaveBeenCalledTimes(4);
    expect(session.close).toHaveBeenCalledOnce();
  });
});
