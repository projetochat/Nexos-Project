import "reflect-metadata";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TasksService, type TaskRow, taskOccurrenceId } from "./tasks.service";
import { TasksWorker } from "./tasks.worker";
import { TaskSmtpService, TaskSmtpFailure, isPublicSmtpAddress } from "./task-smtp";
import { normalizeTaskInput, normalizeTaskSettings, normalizeTaskSmtp } from "./task-input";
import {
  matchesTaskCondition,
  resolveTaskAudience,
  taskContactScope,
  taskFilterFields,
} from "./task-audience";
import type { TaskInput } from "./task-contract";
const actor = {
  tenantId: "tenant",
  membershipId: "member",
  userId: "user",
  roleId: "role",
  roleKey: "tenant_admin",
  platformRole: "USER",
  permissions: [
    "schedules.read",
    "schedules.create",
    "schedules.update",
    "schedules.delete",
    "messages.send",
  ],
} as never;
const input = (): TaskInput => ({
  title: "Check account",
  description: "Review without external sending",
  type: "task",
  assignedMembershipId: "member",
  priority: "medium",
  status: "active",
  recurrence: {
    frequency: "daily",
    interval: 1,
    weekdays: [],
    monthDays: [],
    startAt: "2030-02-01T12:00:00Z",
    timezone: "America/Sao_Paulo",
    maxOccurrences: 3,
  },
  audience: { mode: "contacts", selection: "fixed", contactIds: [], groupIds: [], conditions: [] },
  channels: {
    popup: false,
    bell: false,
    whatsapp: { enabled: false, connectionId: "", message: "", leadMinutes: 0 },
    email: { enabled: false, smtpAccountId: "", subject: "", body: "", leadMinutes: 0 },
  },
});
function service(enabled = true) {
  const prisma = {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
    tenantMembership: { findFirst: vi.fn() },
  };
  const config = {
    get: (key: string) =>
      key === "TASKS_SMTP_ENCRYPTION_KEY" ? "11".repeat(32) : enabled ? "true" : undefined,
  };
  const smtp = new TaskSmtpService(config as never);
  const entitlements = { assertFeature: vi.fn() };
  return {
    prisma,
    smtp,
    entitlements,
    tasks: new TasksService(prisma as never, config as never, entitlements as never, smtp),
  };
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2030-01-10T12:00:00Z"));
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
describe("task input and recipient contracts", () => {
  it("does not enable external channels merely by selecting contacts or a WhatsApp activity type", () => {
    const value = input();
    value.type = "whatsapp";
    value.audience.contactIds = ["contact"];
    const saved = normalizeTaskInput(value);
    expect(saved.channels.whatsapp.enabled).toBe(false);
    expect(saved.channels.email.enabled).toBe(false);
  });
  it("rejects inferred responsible WhatsApp targets and unbounded/unknown configuration", () => {
    const value = input();
    value.channels.whatsapp = {
      enabled: true,
      connectionId: "connection",
      message: "Notice",
      leadMinutes: 0,
      recipientMode: "responsible",
    };
    expect(() => normalizeTaskInput(value)).toThrow("telefone explícito");
    value.channels.whatsapp.recipientMode = "audience";
    value.channels.whatsapp.leadMinutes = 43201;
    expect(() => normalizeTaskInput(value)).toThrow("Antecedência");
    expect(() =>
      normalizeTaskInput({ ...input(), recurrence: { ...input().recurrence, unknown: "bad" } }),
    ).toThrow("desconhecido");
  });
  it("allows description edits of an old unchanged recurrence while requiring a future new schedule", () => {
    const old = input();
    old.recurrence.startAt = "2029-01-01T12:00:00Z";
    expect(() => normalizeTaskInput({ ...old, description: "Edited" }, old)).not.toThrow();
    expect(() => normalizeTaskInput(old)).toThrow();
  });
  it("validates independent global channels and never treats a group as an email recipient", () => {
    expect(
      normalizeTaskSettings({
        popupEnabled: true,
        bellEnabled: false,
        whatsappEnabled: false,
        emailEnabled: true,
        defaultSmtpAccountId: null,
        defaultLeadMinutes: 15,
        timezone: "America/Sao_Paulo",
      }),
    ).toMatchObject({
      popupEnabled: true,
      bellEnabled: false,
      whatsappEnabled: false,
      emailEnabled: true,
    });
    expect(() =>
      normalizeTaskSmtp({
        name: "SMTP",
        host: "localhost\r\nAUTH",
        port: 25,
        secure: false,
        username: "u",
        password: "p",
        fromAddress: "a@example.invalid",
        fromName: "Tasks",
        active: true,
      }),
    ).toThrow();
  });
  it("uses typed numeric/date/list/checkbox operators instead of lexical number comparison", () => {
    expect(matchesTaskCondition("100", { field: "age", operator: "gt", value: 20 }, "number")).toBe(
      true,
    );
    expect(
      matchesTaskCondition(
        "2029-12-01",
        { field: "date", operator: "between", value: ["2029-11-01", "2030-01-01"] },
        "date",
      ),
    ).toBe(true);
    expect(
      matchesTaskCondition(
        ["one", "two"],
        { field: "tag", operator: "in", value: ["two"] },
        "list",
      ),
    ).toBe(true);
    expect(
      matchesTaskCondition("false", { field: "flag", operator: "unchecked" }, "checkbox"),
    ).toBe(true);
    expect(() =>
      matchesTaskCondition("5", { field: "age", operator: "gt", value: [1, 2] }, "number"),
    ).toThrow("exatamente um");
    expect(() =>
      matchesTaskCondition("a", { field: "name", operator: "gt", value: "b" }, "text"),
    ).toThrow("incompatível");
  });
  it("combines conditions with AND and scopes custom-field definitions and values by tenant", async () => {
    const db = {
      contactCustomField: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: "age", tenantId: "tenant", label: "Age", type: "NUMBER", options: [] },
          ]),
      },
      contact: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "first",
            name: "First",
            email: "first@example.invalid",
            normalizedPhone: "+5511987654321",
            phone: "+5511987654321",
            customer: { tenantId: "tenant", city: "Goiânia" },
            tags: [{ tagId: "active" }],
            customFieldValues: [{ fieldId: "age", value: "100" }],
          },
          {
            id: "second",
            name: "Second",
            email: null,
            normalizedPhone: "+5511987654322",
            phone: "+5511987654322",
            customer: { tenantId: "tenant", city: "Other" },
            tags: [{ tagId: "active" }],
            customFieldValues: [{ fieldId: "age", value: "100" }],
          },
        ]),
      },
    };
    const rows = await resolveTaskAudience(db as never, actor, {
      mode: "filters",
      selection: "dynamic",
      contactIds: [],
      groupIds: [],
      conditions: [
        { field: "city", operator: "eq", value: "Goiânia" },
        { field: "tagIds", operator: "in", value: ["active"] },
        { field: "custom:age", operator: "gt", value: 20 },
      ],
    });
    expect(rows.map((row) => row.id)).toEqual(["first"]);
    expect(db.contact.findMany.mock.calls[0][0].where.AND[0]).toMatchObject({
      tenantId: "tenant",
      active: true,
      archivedAt: null,
    });
    expect(db.contactCustomField.findMany.mock.calls[0][0].where).toMatchObject({
      tenantId: "tenant",
      archivedAt: null,
    });
  });
  it("requires actual conversation department/assignment visibility for a non-admin contact or group", async () => {
    const current = {
      ...(actor as object),
      roleKey: "operator",
      connectionIds: ["allowed"],
      chatDepartmentIds: ["department"],
      chatScopes: [
        { connectionId: "allowed", departmentIds: ["department"], favoriteDepartmentId: null },
      ],
      permissions: ["schedules.read"],
      membershipId: "member",
      tenantId: "tenant",
    } as never;
    const scope = taskContactScope(current);
    expect(JSON.stringify(scope)).toContain("department");
    expect(JSON.stringify(scope)).toContain("assignedMembershipId");
    const db = { conversation: { findMany: vi.fn().mockResolvedValue([]) } };
    await expect(
      resolveTaskAudience(db as never, current, {
        mode: "groups",
        selection: "fixed",
        contactIds: [],
        groupIds: ["foreign"],
        conditions: [],
      }),
    ).rejects.toThrow("escopo");
    expect(JSON.stringify(db.conversation.findMany.mock.calls[0][0])).toContain("allowed");
  });
  it("keeps archived contacts visible historically while refusing them for a new external delivery", async () => {
    const current = {
      ...(actor as object),
      roleKey: "operator",
      connectionIds: ["allowed"],
      chatDepartmentIds: ["department"],
      chatScopes: [
        { connectionId: "allowed", departmentIds: ["department"], favoriteDepartmentId: null },
      ],
      permissions: ["schedules.read"],
      membershipId: "member",
      tenantId: "tenant",
    } as never;
    const db = {
      contact: {
        findMany: vi.fn(async ({ where }: { where: unknown }) =>
          JSON.stringify(where).includes('"archivedAt":null')
            ? []
            : [
                {
                  id: "archived",
                  name: "Archived contact",
                  email: null,
                  normalizedPhone: "+5511987654321",
                  phone: "+5511987654321",
                  customer: null,
                  tags: [],
                  customFieldValues: [],
                },
              ],
        ),
      },
    };
    const audience = {
      mode: "contacts",
      selection: "fixed",
      contactIds: ["archived"],
      groupIds: [],
      conditions: [],
    } as const;
    await expect(resolveTaskAudience(db as never, current, audience as never)).rejects.toThrow(
      "Contato indisponível",
    );
    expect(
      (await resolveTaskAudience(db as never, current, audience as never, undefined, true)).map(
        (r) => r.name,
      ),
    ).toEqual(["Archived contact"]);
    const historical = JSON.stringify(db.contact.findMany.mock.calls[1][0].where);
    expect(historical).toContain("allowed");
    expect(historical).toContain("department");
    expect(historical).toContain("assignedMembershipId");
    expect(historical).toContain("tenant");
  });
  it("does not even load protected custom-field metadata without the additional-fields permission", async () => {
    const db = { contactCustomField: { findMany: vi.fn() } };
    const fields = await taskFilterFields(
      db as never,
      { roleKey: "operator", permissions: [] } as never,
    );
    expect(fields.custom).toEqual([]);
    expect(db.contactCustomField.findMany).not.toHaveBeenCalled();
  });
});
describe("task default-off and read-only contracts", () => {
  it("touches no new table, existing membership query or transport when disabled", async () => {
    const f = service(false);
    const calls = [
      f.tasks.list({}, actor),
      f.tasks.summary({}, actor),
      f.tasks.get("task", actor),
      f.tasks.settings(actor),
      f.tasks.options(actor),
      f.tasks.smtpList(actor),
      f.tasks.popups(actor),
      f.tasks.create(input(), actor),
    ];
    for (const call of calls) await expect(call).rejects.toMatchObject({ status: 503 });
    expect(await f.tasks.notificationDetails(["task"], actor)).toEqual({});
    const worker = new TasksWorker(f.tasks, {} as never, {} as never);
    expect(await worker.runOnce()).toMatchObject({ disabled: true });
    expect(f.prisma.$queryRaw).not.toHaveBeenCalled();
    expect(f.prisma.$executeRaw).not.toHaveBeenCalled();
    expect(f.prisma.tenantMembership.findFirst).not.toHaveBeenCalled();
    expect(f.entitlements.assertFeature).not.toHaveBeenCalled();
  });
  it("rejects revoked memberships and granular permission removal before task reads", async () => {
    const f = service();
    f.prisma.tenantMembership.findFirst.mockResolvedValue(null);
    await expect(f.tasks.get("task", actor)).rejects.toThrow("Vínculo ativo");
    f.prisma.tenantMembership.findFirst.mockResolvedValue({
      id: "member",
      tenantId: "tenant",
      userId: "user",
      roleId: "role",
      role: { key: "operator", active: true, permissions: [] },
    });
    await expect(f.tasks.get("task", actor)).rejects.toThrow("Permissão");
    expect(f.prisma.$queryRaw).not.toHaveBeenCalled();
  });
  it("requires send permission to enable global external channels or resume an external task", async () => {
    const f = service();
    const current = {
      ...(actor as object),
      permissions: ["schedules.read", "schedules.update"],
    } as never;
    vi.spyOn(f.tasks, "context").mockResolvedValue(current);
    vi.spyOn(f.tasks, "settingsFor").mockResolvedValue({
      popupEnabled: true,
      bellEnabled: true,
      whatsappEnabled: false,
      emailEnabled: false,
      defaultSmtpAccountId: null,
      defaultLeadMinutes: 0,
      timezone: "UTC",
    });
    await expect(
      f.tasks.saveSettings(
        {
          popupEnabled: true,
          bellEnabled: true,
          whatsappEnabled: true,
          emailEnabled: false,
          defaultSmtpAccountId: null,
          defaultLeadMinutes: 0,
          timezone: "UTC",
        },
        current,
      ),
    ).rejects.toThrow("Permissão");
    expect(f.prisma.$executeRaw).not.toHaveBeenCalled();
    const value = input();
    value.channels.whatsapp.enabled = true;
    const row = {
      id: "task",
      tenantId: "tenant",
      status: "paused",
      version: 1,
      payload: {
        input: value,
        fixed: { contactIds: [], groupIds: [] },
        creatorScope: { connections: null, departments: null },
      },
    };
    const internal = f.tasks as unknown as {
      row: (id: string, tenant: string) => Promise<unknown>;
      visible: (r: unknown, a: unknown) => Promise<void>;
    };
    vi.spyOn(internal, "row").mockResolvedValue(row);
    vi.spyOn(internal, "visible").mockResolvedValue();
    await expect(f.tasks.setStatus("task", "active", current)).rejects.toThrow("Permissão");
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
  });
  it("copies the original fixed recipient identifiers instead of re-running a saved filter", async () => {
    const f = service();
    vi.spyOn(f.tasks, "context").mockResolvedValue(actor);
    const value = input();
    value.audience = {
      mode: "filters",
      selection: "fixed",
      contactIds: [],
      groupIds: [],
      conditions: [{ field: "name", operator: "contains", value: "Customer" }],
    };
    const fixed = { contactIds: ["original-contact"], groupIds: [] };
    const internal = f.tasks as unknown as {
      row: () => Promise<unknown>;
      visible: () => Promise<void>;
    };
    vi.spyOn(internal, "row").mockResolvedValue({
      id: "task",
      tenantId: "tenant",
      title: "Task",
      payload: { input: value, fixed },
    });
    vi.spyOn(internal, "visible").mockResolvedValue();
    const create = vi.spyOn(f.tasks, "create").mockResolvedValue({ id: "copy" } as never);
    await f.tasks.duplicate("task", { recurrence: value.recurrence }, actor);
    expect(create.mock.calls[0][2]).toEqual(fixed);
    expect(create.mock.calls[0][0]).toMatchObject({ status: "paused", audience: value.audience });
  });
  it("returns future recurrence previews for an old series, without writing an occurrence", async () => {
    const f = service();
    vi.spyOn(f.tasks, "context").mockResolvedValue(actor);
    const recurrence = input().recurrence;
    recurrence.startAt = "2029-01-01T12:00:00Z";
    delete recurrence.maxOccurrences;
    const result = await f.tasks.previewRecurrence({ recurrence }, actor);
    expect(result.dates).toHaveLength(10);
    expect(result.dates.every((value) => new Date(value) > new Date())).toBe(true);
    expect(f.prisma.$executeRaw).not.toHaveBeenCalled();
  });
  it("uses deterministic per-task/date identifiers without merging tenants or dates", () => {
    const a = taskOccurrenceId("tenant-a-task", "2030-02-01T12:00:00.000Z");
    expect(a).toBe(taskOccurrenceId("tenant-a-task", "2030-02-01T12:00:00.000Z"));
    expect(a).not.toBe(taskOccurrenceId("tenant-b-task", "2030-02-01T12:00:00.000Z"));
    expect(a).not.toBe(taskOccurrenceId("tenant-a-task", "2030-02-02T12:00:00.000Z"));
  });
  it("does not revive cancelled history when the worker or calendar materializes a range", async () => {
    const f = service();
    f.prisma.$executeRaw.mockResolvedValue(1);
    const row = {
      id: "task",
      tenantId: "tenant",
      status: "active",
      version: 1,
      payload: {
        input: input(),
        fixed: { contactIds: [], groupIds: [] },
        creatorScope: { connections: null, departments: null },
      },
    } as TaskRow;
    await f.tasks.materializeRow(
      f.prisma as never,
      row,
      new Date("2030-02-01Z"),
      new Date("2030-02-03Z"),
      false,
    );
    expect(f.prisma.$executeRaw.mock.calls[0][0].strings.join("")).toContain("DO NOTHING");
    await f.tasks.materializeRow(
      f.prisma as never,
      row,
      new Date("2030-02-01Z"),
      new Date("2030-02-03Z"),
      false,
      true,
    );
    expect(f.prisma.$executeRaw.mock.calls[1][0].strings.join("")).toContain("DO UPDATE");
  });
  it("requires explicit confirmation before any SMTP verify transport call", async () => {
    const f = service();
    vi.spyOn(f.tasks, "context").mockResolvedValue(actor);
    const verify = vi.spyOn(f.smtp, "verify");
    await expect(f.tasks.smtpVerify("smtp", { confirm: false }, actor)).rejects.toThrow("Confirme");
    expect(verify).not.toHaveBeenCalled();
    expect(f.prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
describe("SMTP credential isolation and conservative delivery", () => {
  it("binds AES-GCM credentials to tenant and account and never returns the password as a field", () => {
    const f = service();
    const value = f.smtp.encrypt("synthetic-test-password", "tenant", "account");
    expect(JSON.stringify(value)).not.toContain("synthetic-test-password");
    expect(f.smtp.decrypt(value, "tenant", "account")).toBe("synthetic-test-password");
    expect(() => f.smtp.decrypt(value, "other-tenant", "account")).toThrow();
    expect(() => f.smtp.decrypt(value, "tenant", "other-account")).toThrow();
  });
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "169.254.1.1",
    "172.16.1.1",
    "192.168.1.1",
    "::1",
    "::127.0.0.1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
    "2::1",
    "2002:a00:1::1",
    "192.0.2.1",
    "198.51.100.1",
    "203.0.113.1",
  ])("rejects non-public SMTP destination %s", (address) => {
    expect(isPublicSmtpAddress(address)).toBe(false);
  });
  it("accepts public addresses while requiring an independently configured host allowlist", () => {
    expect(isPublicSmtpAddress("8.8.8.8")).toBe(true);
    expect(isPublicSmtpAddress("2606:4700:4700::1111")).toBe(true);
  });
  it("does not retry an SMTP outcome that became ambiguous after the processing claim", async () => {
    const value = input();
    value.channels.email = {
      enabled: true,
      smtpAccountId: "smtp",
      subject: "Notice",
      body: "Body",
      leadMinutes: 0,
    };
    const row = {
      id: "task",
      tenantId: "tenant",
      status: "active",
      createdByMembershipId: "member",
      assignedMembershipId: "member",
      payload: { input: value },
    };
    let status = "pending";
    const delivery = {
      id: "delivery",
      tenantId: "tenant",
      taskId: "task",
      occurrenceId: "occurrence",
      channel: "email",
      destination: "email:synthetic",
      payload: { input: value, email: "test@example.invalid" },
      status,
      attempts: 0,
    };
    const db = {
      $queryRaw: vi.fn(async (sql: { strings: string[] }) =>
        sql.strings.join("").includes('UPDATE "task_deliveries"')
          ? status === "pending"
            ? ((status = "processing"), [{ ...delivery, status }])
            : []
          : [row],
      ),
      $executeRaw: vi.fn(async (sql: { values: unknown[] }) => {
        if (sql.values.includes("ambiguous")) status = "ambiguous";
        return 1;
      }),
      $transaction: vi.fn(),
    };
    db.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(db));
    const send = vi.fn().mockRejectedValue(new TaskSmtpFailure(true));
    const tasks = {
      prisma: db,
      actorByMembership: vi.fn().mockResolvedValue(actor),
      settingsFor: vi.fn().mockResolvedValue({
        emailEnabled: true,
        whatsappEnabled: true,
        popupEnabled: true,
        bellEnabled: true,
      }),
      smtpRow: vi.fn().mockResolvedValue({ id: "smtp", credential: {} }),
      smtp: { send, decrypt: () => "synthetic" },
      history: vi.fn(),
    };
    const worker = new TasksWorker(tasks as never, {} as never, {} as never);
    const internal = worker as unknown as {
      deliver: (row: unknown, now: Date) => Promise<boolean>;
    };
    await expect(internal.deliver(delivery, new Date())).rejects.toBeInstanceOf(TaskSmtpFailure);
    expect(status).toBe("ambiguous");
    expect(await internal.deliver(delivery, new Date())).toBe(false);
    expect(send).toHaveBeenCalledOnce();
  });
});
