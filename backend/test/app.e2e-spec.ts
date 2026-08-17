import { INestApplication, Logger, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { vi } from "vitest";
import helmet from "helmet";
import { hash } from "bcryptjs";
import { AppModule } from "../src/app.module";
import { EvolutionClient } from "../src/messaging/evolution/evolution.client";
import {
  CampaignStatus,
  ConversationStatus,
  MessageDirection,
  MessageType,
  MessagingConnectionStatus,
  MessagingProviderType,
  PlatformRole,
} from "../src/generated/prisma";
import { PrismaService } from "../src/prisma/prisma.service";
import { PlatformAuditService } from "../src/platform/platform-audit.service";
import { PlatformController } from "../src/platform/platform.controller";
import { PlanEntitlementService } from "../src/platform/plan-entitlement.service";
import { PlatformService } from "../src/platform/platform.service";
import { TicketsController } from "../src/tickets/tickets.controller";
import { TicketsModule } from "../src/tickets/tickets.module";
import { TicketsService } from "../src/tickets/tickets.service";

describe("Nexos API organization and RBAC", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  function uniqueBrazilianMobilePhone() {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1_000_000)
      .toString()
      .padStart(6, "0")}`.slice(-8);
    return `(11) 9${suffix.slice(0, 4)}-${suffix.slice(4, 8)}`;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL =
      process.env.NEXOS_TEST_DATABASE_URL ??
      "postgresql://nexos:nexos_dev_password@localhost:5432/nexos_1200?schema=public";
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-access-secret-minimum-32-chars";
    process.env.JWT_REFRESH_SECRET =
      process.env.JWT_REFRESH_SECRET ?? "test-refresh-secret-minimum-32-chars";
    process.env.EVOLUTION_WEBHOOK_SECRET =
      process.env.EVOLUTION_WEBHOOK_SECRET ?? "test-evolution-webhook-secret";
    process.env.NEXOS_CAMPAIGN_CONCURRENCY = "1";
    process.env.NEXOS_CAMPAIGN_MESSAGES_PER_MINUTE = "5";
    process.env.NEXOS_CAMPAIGN_BATCH_SIZE = "5";
    process.env.NEXOS_CAMPAIGN_MAX_RECIPIENTS = "5";
    process.env.NEXOS_QUEUE_WORKER_ENABLED = "false";

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(helmet());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix("api");
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    await app.init();
    await cleanupPlatformImpersonations();
  });

  afterAll(async () => {
    await app?.close();
  });

  afterEach(async () => {
    await cleanupEvolutionTestConnections();
    await cleanupPlatformImpersonations();
  });

  it("reports API and database health", async () => {
    await request(app.getHttpServer())
      .get("/api/health")
      .expect(200)
      .expect(({ body }) => {
        expect(body.ok).toBe(true);
        expect(body.database).toBe("up");
      });
  });

  it("denies unauthenticated and invalid token requests", async () => {
    await request(app.getHttpServer()).get("/api/users").expect(401);
    await request(app.getHttpServer())
      .get("/api/users")
      .set("Authorization", "Bearer invalid-token")
      .expect(401);
  });

  it("authenticates and exposes current tenant context with permissions", async () => {
    const token = await login("admin@nexo.app", "demo1234", "acme");

    await request(app.getHttpServer())
      .get("/api/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.user.email).toBe("admin@nexo.app");
        expect(body.user.roleKey).toBe("tenant_admin");
        expect(body.tenant.slug).toBe("acme");
        expect(body.permissions).toContain("users.manage");
        expect(body.permissions).toContain("crm.manage");
      });
  });

  it("authenticates with normalized email and auto-selects a single active membership", async () => {
    await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: " Admin@Nexo.App ", password: "demo1234" })
      .expect(201)
      .expect(({ body }) => {
        expect(body.accessToken).toEqual(expect.any(String));
        expect(body.refreshToken).toEqual(expect.any(String));
        expect(body.user.email).toBe("admin@nexo.app");
        expect(body.tenant.slug).toBe("acme");
        expect(body.membership.role).toBe("tenant_admin");
      });
  });

  it("exposes the official auth /me endpoint", async () => {
    const token = await login("admin@nexo.app", "demo1234", "acme");

    await request(app.getHttpServer())
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.user.email).toBe("admin@nexo.app");
        expect(body.tenant.slug).toBe("acme");
        expect(body.membership.role).toBe("tenant_admin");
      });
  });

  it("refreshes an active session and accepts logout", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: "admin@nexo.app", password: "demo1234", tenantSlug: "acme" })
      .expect(201);

    await request(app.getHttpServer())
      .post("/api/auth/refresh")
      .send({ refreshToken: response.body.refreshToken })
      .expect(201)
      .expect(({ body }) => {
        expect(body.accessToken).toEqual(expect.any(String));
      });

    await request(app.getHttpServer()).post("/api/auth/logout").expect(201, { ok: true });
  });

  it("rejects inactive users with a canonical error", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "admin@nexo.app" } });
    await prisma.user.update({ where: { id: user.id }, data: { status: "DISABLED" } });

    try {
      await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: "admin@nexo.app", password: "demo1234", tenantSlug: "acme" })
        .expect(403)
        .expect(({ body }) => {
          expect(body.code).toBe("USER_INACTIVE");
        });
    } finally {
      await prisma.user.update({ where: { id: user.id }, data: { status: "ACTIVE" } });
    }
  });

  it("rejects users without active membership with a canonical error", async () => {
    const email = "sem-membership@nexo.app";
    await prisma.user.upsert({
      where: { email },
      update: { passwordHash: await hash("demo1234", 12), status: "ACTIVE" },
      create: {
        email,
        name: "Sem Membership",
        passwordHash: await hash("demo1234", 12),
        status: "ACTIVE",
      },
    });

    try {
      await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email, password: "demo1234" })
        .expect(403)
        .expect(({ body }) => {
          expect(body.code).toBe("USER_WITHOUT_ACTIVE_MEMBERSHIP");
        });
    } finally {
      await prisma.user.delete({ where: { email } });
    }
  });

  it("denies inactive memberships even when the token was previously valid", async () => {
    const token = await login("atendente@nexo.app", "demo1234", "acme");
    const membership = await prisma.tenantMembership.findFirstOrThrow({
      where: { user: { email: "atendente@nexo.app" }, tenant: { slug: "acme" } },
    });

    await prisma.tenantMembership.update({
      where: { id: membership.id },
      data: { status: "DISABLED" },
    });
    await request(app.getHttpServer())
      .get("/api/departments")
      .set("Authorization", `Bearer ${token}`)
      .expect(401);
    await prisma.tenantMembership.update({
      where: { id: membership.id },
      data: { status: "ACTIVE" },
    });
  });

  it("denies missing permissions and allows valid permissions", async () => {
    const agentToken = await login("atendente@nexo.app", "demo1234", "acme");
    await request(app.getHttpServer())
      .post("/api/departments")
      .set("Authorization", `Bearer ${agentToken}`)
      .send({ name: "Sem permissao", color: "#111111" })
      .expect(403);

    const adminToken = await login("admin@nexo.app", "demo1234", "acme");
    await request(app.getHttpServer())
      .get("/api/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(
          body.some((item: { user: { email: string } }) => item.user.email === "admin@nexo.app"),
        ).toBe(true);
      });
  });

  it("blocks cross-tenant user and department access", async () => {
    const acmeToken = await login("admin@nexo.app", "demo1234", "acme");
    const orbitMembership = await prisma.tenantMembership.findFirstOrThrow({
      where: { tenant: { slug: "orbit" }, user: { email: "agent-orbit@nexo.app" } },
    });
    const orbitDepartment = await prisma.department.findFirstOrThrow({
      where: { tenant: { slug: "orbit" } },
    });

    await request(app.getHttpServer())
      .get(`/api/users/${orbitMembership.id}`)
      .set("Authorization", `Bearer ${acmeToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/departments/${orbitDepartment.id}`)
      .set("Authorization", `Bearer ${acmeToken}`)
      .send({ name: "Cross tenant blocked" })
      .expect(404);
  });

  it("blocks cross-tenant department membership assignment", async () => {
    const acmeToken = await login("admin@nexo.app", "demo1234", "acme");
    const acmeDepartment = await prisma.department.findFirstOrThrow({
      where: { tenant: { slug: "acme" } },
    });
    const orbitMembership = await prisma.tenantMembership.findFirstOrThrow({
      where: { tenant: { slug: "orbit" }, user: { email: "agent-orbit@nexo.app" } },
    });

    await request(app.getHttpServer())
      .post(`/api/departments/${acmeDepartment.id}/members`)
      .set("Authorization", `Bearer ${acmeToken}`)
      .send({ membershipId: orbitMembership.id })
      .expect(400);
  });

  it("blocks cross-tenant role assignment", async () => {
    const acmeToken = await login("admin@nexo.app", "demo1234", "acme");
    const acmeMembership = await prisma.tenantMembership.findFirstOrThrow({
      where: { tenant: { slug: "acme" }, user: { email: "atendente@nexo.app" } },
    });
    const orbitRole = await prisma.role.findFirstOrThrow({
      where: { tenant: { slug: "orbit" }, key: "agent" },
    });

    await request(app.getHttpServer())
      .patch(`/api/users/${acmeMembership.id}`)
      .set("Authorization", `Bearer ${acmeToken}`)
      .send({ roleId: orbitRole.id })
      .expect(400);
  });

  it("keeps platform admin separate from tenant admin", async () => {
    const token = await login("platform@nexo.app", "demo1234", "acme");

    await request(app.getHttpServer())
      .post("/api/users")
      .set("Authorization", `Bearer ${token}`)
      .send({
        email: "blocked-platform-admin@nexo.app",
        name: "Blocked Platform",
        password: "demo1234",
      })
      .expect(403);
  });

  it("protects platform API with server-side platform role", async () => {
    const tenantAdminToken = await login("admin@nexo.app", "demo1234", "acme");
    await request(app.getHttpServer())
      .get("/api/platform/tenants")
      .set("Authorization", `Bearer ${tenantAdminToken}`)
      .expect(403)
      .expect(({ body }) => {
        expect(body.code).toBe("PLATFORM_ACCESS_DENIED");
      });

    const platformToken = await login("platform@nexo.app", "demo1234");
    await request(app.getHttpServer())
      .get("/api/platform/tenants")
      .set("Authorization", `Bearer ${platformToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(Array.isArray(body.items)).toBe(true);
      });
  });

  it("bootstraps the platform module dependencies in a real Nest application", () => {
    expect(app.get(PlatformController)).toBeDefined();
    expect(app.get(PlatformService)).toBeDefined();
    expect(app.get(PlatformAuditService)).toBeDefined();
    expect(app.get(PlanEntitlementService)).toBeDefined();
    expect(app.get(PrismaService)).toBeDefined();
  });

  it("serves all platform list APIs with string pagination and canonical failures", async () => {
    const platformToken = await login("platform@nexo.app", "demo1234");
    const tenantAdminToken = await login("admin@nexo.app", "demo1234", "acme");

    const routes = [
      "/api/platform/dashboard",
      "/api/platform/tenants?page=1&pageSize=20",
      "/api/platform/plans?page=1&pageSize=20",
      "/api/platform/subscriptions?page=1&pageSize=20",
      "/api/platform/invoices?page=1&pageSize=20",
      "/api/platform/audit-logs?page=1&pageSize=20",
      "/api/platform/health",
    ];
    for (const route of routes) {
      await request(app.getHttpServer())
        .get(route)
        .set("Authorization", `Bearer ${platformToken}`)
        .expect(200);
    }

    await request(app.getHttpServer())
      .get("/api/platform/tenants?q=no-such-tenant&page=1&pageSize=20")
      .set("Authorization", `Bearer ${platformToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ items: [], page: 1, pageSize: 20, total: 0 });
      });

    await request(app.getHttpServer())
      .get("/api/platform/tenants?status=NOT_A_STATUS")
      .set("Authorization", `Bearer ${platformToken}`)
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe("PLATFORM_QUERY_INVALID");
        expect(body.message).not.toContain("Invalid `");
      });

    await request(app.getHttpServer())
      .get("/api/platform/plans?page=1&pageSize=20")
      .set("Authorization", `Bearer ${platformToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.items.some((plan: { code: string }) => plan.code === "starter")).toBe(true);
        expect(body.items.some((plan: { code: string }) => plan.code === "professional")).toBe(
          true,
        );
      });

    await request(app.getHttpServer())
      .get("/api/platform/tenants")
      .set("Authorization", `Bearer ${tenantAdminToken}`)
      .expect(403)
      .expect(({ body }) => {
        expect(body.code).toBe("PLATFORM_ACCESS_DENIED");
      });
  });

  it("keeps platform list APIs stable with tenants without subscriptions and archived plans", async () => {
    const platformToken = await login("platform@nexo.app", "demo1234");
    const suffix = Date.now();
    const tenant = await prisma.tenant.create({
      data: {
        name: `No Subscription ${suffix}`,
        legalName: `No Subscription ${suffix}`,
        displayName: `No Subscription ${suffix}`,
        slug: `no-sub-${suffix}`,
        status: "ACTIVE",
      },
    });
    const archivedPlan = await prisma.plan.create({
      data: {
        code: `archived-${suffix}`,
        name: `Archived ${suffix}`,
        status: "ARCHIVED",
        billingPeriod: "MANUAL",
        features: {},
        limits: {},
        archivedAt: new Date(),
      },
    });
    const subscribedTenant = await prisma.tenant.create({
      data: {
        name: `Archived Plan Tenant ${suffix}`,
        legalName: `Archived Plan Tenant ${suffix}`,
        displayName: `Archived Plan Tenant ${suffix}`,
        slug: `archived-plan-${suffix}`,
        status: "ACTIVE",
      },
    });
    await prisma.tenantSubscription.create({
      data: {
        tenantId: subscribedTenant.id,
        planId: archivedPlan.id,
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
        limitsSnapshot: {},
        featuresSnapshot: {},
      },
    });

    try {
      await request(app.getHttpServer())
        .get(`/api/platform/tenants?q=${tenant.slug}&page=1&pageSize=20`)
        .set("Authorization", `Bearer ${platformToken}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body.items).toHaveLength(1);
          expect(body.items[0].plan).toBeNull();
          expect(body.items[0].subscriptionStatus).toBeNull();
        });

      await request(app.getHttpServer())
        .get(`/api/platform/subscriptions?planId=${archivedPlan.id}&page=1&pageSize=20`)
        .set("Authorization", `Bearer ${platformToken}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body.items).toHaveLength(1);
          expect(body.items[0].tenant.id).toBe(subscribedTenant.id);
          expect(body.items[0].plan.status).toBe("ARCHIVED");
          expect(body.items[0].inconsistent).toBe(false);
        });
    } finally {
      await prisma.tenant.deleteMany({ where: { id: { in: [tenant.id, subscribedTenant.id] } } });
      await prisma.plan.deleteMany({ where: { id: archivedPlan.id } });
    }
  });

  it("manages tenant suspension/reactivation and revokes old tenant sessions", async () => {
    const platformToken = await login("platform@nexo.app", "demo1234");
    const tenantToken = await login("admin-orbit@nexo.app", "demo1234", "orbit");
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "orbit" } });

    await request(app.getHttpServer())
      .post(`/api/platform/tenants/${tenant.id}/suspend`)
      .set("Authorization", `Bearer ${platformToken}`)
      .send({ reason: "E2E platform suspension" })
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe("SUSPENDED");
      });

    await request(app.getHttpServer())
      .get("/api/departments")
      .set("Authorization", `Bearer ${tenantToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: "admin-orbit@nexo.app", password: "demo1234", tenantSlug: "orbit" })
      .expect(403)
      .expect(({ body }) => {
        expect(body.code).toBe("TENANT_INACTIVE");
      });

    await request(app.getHttpServer())
      .post(`/api/platform/tenants/${tenant.id}/reactivate`)
      .set("Authorization", `Bearer ${platformToken}`)
      .send({ reason: "E2E platform reactivation" })
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe("ACTIVE");
      });
  });

  it("lists plans, creates manual invoices and writes sanitized audit logs", async () => {
    const platformToken = await login("platform@nexo.app", "demo1234");
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "acme" } });
    const subscription = await prisma.tenantSubscription.findFirstOrThrow({
      where: { tenantId: tenant.id, status: { in: ["ACTIVE", "TRIALING"] } },
    });

    await request(app.getHttpServer())
      .get("/api/platform/plans")
      .set("Authorization", `Bearer ${platformToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.items.some((plan: { code: string }) => plan.code === "professional")).toBe(
          true,
        );
      });

    const invoice = await request(app.getHttpServer())
      .post("/api/platform/invoices")
      .set("Authorization", `Bearer ${platformToken}`)
      .send({
        tenantId: tenant.id,
        subscriptionId: subscription.id,
        subtotalCents: 12345,
        discountCents: 345,
        dueAt: new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString(),
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.number).toMatch(/^INV-\d{4}-\d{6}$/);
        expect(body.totalCents).toBe(12000);
      });

    await request(app.getHttpServer())
      .patch(`/api/platform/invoices/${invoice.body.id}/status`)
      .set("Authorization", `Bearer ${platformToken}`)
      .send({ status: "PAID" })
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe("PAID");
      });

    await request(app.getHttpServer())
      .get("/api/platform/audit-logs")
      .set("Authorization", `Bearer ${platformToken}`)
      .expect(200)
      .expect(({ body }) => {
        const serialized = JSON.stringify(body);
        expect(serialized).toContain("invoice.created");
        expect(serialized).not.toContain("demo1234");
      });
  });

  it("enforces SUPPORT and READONLY platform permissions", async () => {
    await ensurePlatformUser("platform-support@nexo.app", PlatformRole.SUPPORT);
    await ensurePlatformUser("platform-readonly@nexo.app", PlatformRole.READONLY);

    const supportToken = await login("platform-support@nexo.app", "demo1234");
    const readonlyToken = await login("platform-readonly@nexo.app", "demo1234");
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "acme" } });

    await request(app.getHttpServer())
      .get("/api/platform/tenants")
      .set("Authorization", `Bearer ${supportToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/platform/tenants/${tenant.id}/terminate`)
      .set("Authorization", `Bearer ${supportToken}`)
      .send({ reason: "Support cannot terminate", confirmSlug: tenant.slug })
      .expect(403);
    await request(app.getHttpServer())
      .get("/api/platform/plans")
      .set("Authorization", `Bearer ${readonlyToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post("/api/platform/impersonation/start")
      .set("Authorization", `Bearer ${readonlyToken}`)
      .send({ tenantId: tenant.id, membershipId: "none", reason: "Readonly cannot impersonate" })
      .expect(403);
  });

  it("exposes platform detail APIs and protected health without sensitive values", async () => {
    const platformToken = await login("platform@nexo.app", "demo1234");
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "acme" } });
    const plan = await prisma.plan.findFirstOrThrow({ where: { code: "professional" } });
    const subscription = await prisma.tenantSubscription.findFirstOrThrow({
      where: { tenantId: tenant.id },
    });
    const invoice = await prisma.invoice.create({
      data: {
        tenantId: tenant.id,
        subscriptionId: subscription.id,
        number: `INV-2099-${String(Date.now()).slice(-6)}`,
        subtotalCents: 1000,
        totalCents: 1000,
        dueAt: new Date(Date.now() + 86_400_000),
      },
    });
    const audit = await prisma.platformAuditLog.create({
      data: {
        actorUserId: (
          await prisma.user.findUniqueOrThrow({ where: { email: "platform@nexo.app" } })
        ).id,
        actorPlatformRole: "ADMIN",
        action: "platform.health.test",
        targetType: "health",
        metadataJson: { ok: true },
      },
    });

    await request(app.getHttpServer())
      .get("/api/platform/health")
      .set("Authorization", `Bearer ${platformToken}`)
      .expect(200)
      .expect(({ body }) => {
        const serialized = JSON.stringify(body);
        expect(body.database).toMatch(/up|down/);
        expect(serialized).not.toContain("JWT_SECRET");
        expect(serialized).not.toContain("EVOLUTION_API_KEY");
        expect(serialized).not.toContain(process.env.EVOLUTION_WEBHOOK_SECRET);
      });

    await request(app.getHttpServer())
      .get(`/api/platform/tenants/${tenant.id}`)
      .set("Authorization", `Bearer ${platformToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.usage).toBeDefined();
        expect(body.detail.users).toEqual(expect.any(Array));
      });
    await request(app.getHttpServer())
      .get(`/api/platform/plans/${plan.id}`)
      .set("Authorization", `Bearer ${platformToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/platform/subscriptions/${subscription.id}`)
      .set("Authorization", `Bearer ${platformToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/platform/invoices/${invoice.id}`)
      .set("Authorization", `Bearer ${platformToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/platform/audit-logs/${audit.id}`)
      .set("Authorization", `Bearer ${platformToken}`)
      .expect(200);
  });

  it("rolls back tenant creation when initial admin provisioning fails", async () => {
    const platformToken = await login("platform@nexo.app", "demo1234");
    const plan = await prisma.plan.findFirstOrThrow({ where: { code: "starter" } });
    const slug = `rollback-${Date.now()}`;
    const response = await request(app.getHttpServer())
      .post("/api/platform/tenants")
      .set("Authorization", `Bearer ${platformToken}`)
      .send({
        name: "Rollback Tenant",
        slug,
        planId: plan.id,
        admin: { name: "Broken Admin", email: "not-an-email", password: "demo1234" },
      })
      .expect(400);
    expect(response.body.message).toBeDefined();
    await expect(prisma.tenant.findUnique({ where: { slug } })).resolves.toBeNull();
  });

  it("blocks high-risk platform mutations while an impersonation session is active", async () => {
    const platformToken = await login("platform@nexo.app", "demo1234");
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "acme" } });
    const membership = await prisma.tenantMembership.findFirstOrThrow({
      where: { tenantId: tenant.id, status: "ACTIVE" },
    });
    const session = await request(app.getHttpServer())
      .post("/api/platform/impersonation/start")
      .set("Authorization", `Bearer ${platformToken}`)
      .send({
        tenantId: tenant.id,
        membershipId: membership.id,
        reason: "E2E high-risk guard",
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.tokens.accessToken).toEqual(expect.any(String));
        expect(body.membership.id).toBe(membership.id);
      });

    await request(app.getHttpServer())
      .post(`/api/platform/tenants/${tenant.id}/suspend`)
      .set("Authorization", `Bearer ${platformToken}`)
      .send({ reason: "Must be blocked" })
      .expect(403)
      .expect(({ body }) => {
        expect(body.code).toBe("IMPERSONATION_HIGH_RISK_ACTION_BLOCKED");
      });

    await request(app.getHttpServer())
      .post(`/api/platform/impersonation/${session.body.id}/stop`)
      .set("Authorization", `Bearer ${platformToken}`)
      .expect(201);
  });

  it("serializes concurrent user creation at the last plan slot", async () => {
    const { token, tenantId } = await createStarterTenant("users");
    await request(app.getHttpServer())
      .post("/api/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: `seed-user-${Date.now()}@nexo.app`, name: "Seed User", password: "demo1234" })
      .expect(201);

    const suffix = Date.now();
    const responses = await Promise.all([
      request(app.getHttpServer())
        .post("/api/users")
        .set("Authorization", `Bearer ${token}`)
        .send({ email: `limit-a-${suffix}@nexo.app`, name: "Limit A", password: "demo1234" }),
      request(app.getHttpServer())
        .post("/api/users")
        .set("Authorization", `Bearer ${token}`)
        .send({ email: `limit-b-${suffix}@nexo.app`, name: "Limit B", password: "demo1234" }),
    ]);
    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(
      responses.some(
        (response) => response.status === 409 && response.body.code === "PLAN_LIMIT_USERS_REACHED",
      ),
    ).toBe(true);
    await expect(
      prisma.tenantMembership.count({
        where: { tenantId, status: "ACTIVE", user: { status: "ACTIVE" } },
      }),
    ).resolves.toBe(3);
  });

  it("serializes concurrent department creation at the last plan slot", async () => {
    const { token, tenantId } = await createStarterTenant("departments");
    await request(app.getHttpServer())
      .post("/api/departments")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Departamento Seed", color: "#2563eb" })
      .expect(201);

    const responses = await Promise.all([
      request(app.getHttpServer())
        .post("/api/departments")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: `Departamento A ${Date.now()}`, color: "#2563eb" }),
      request(app.getHttpServer())
        .post("/api/departments")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: `Departamento B ${Date.now()}`, color: "#16a34a" }),
    ]);
    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(
      responses.some(
        (response) =>
          response.status === 409 && response.body.code === "PLAN_LIMIT_DEPARTMENTS_REACHED",
      ),
    ).toBe(true);
    await expect(prisma.department.count({ where: { tenantId, active: true } })).resolves.toBe(2);
  });

  it("lists CRM data for agents but denies CRM writes without manage permission", async () => {
    const agentToken = await login("atendente@nexo.app", "demo1234", "acme");

    await request(app.getHttpServer())
      .get("/api/crm/contacts?pageSize=5")
      .set("Authorization", `Bearer ${agentToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(Array.isArray(body.items)).toBe(true);
      });

    await request(app.getHttpServer())
      .post("/api/crm/customers")
      .set("Authorization", `Bearer ${agentToken}`)
      .send({ name: "Cliente bloqueado" })
      .expect(403);
  });

  it("creates, searches, updates and archives CRM contacts", async () => {
    const token = await login("admin@nexo.app", "demo1234", "acme");
    const suffix = `${Date.now()}`.slice(-6);
    const phone = uniqueBrazilianMobilePhone();

    const customerResponse = await request(app.getHttpServer())
      .post("/api/crm/customers")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: `Cliente Sprint ${suffix}`,
        responsibleContactName: "Ana Teste",
        color: "#2563eb",
      })
      .expect(201);

    const customerId = customerResponse.body.id as string;
    const contactResponse = await request(app.getHttpServer())
      .post("/api/crm/contacts")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: `Contato Sprint ${suffix}`,
        phone,
        email: `contato-${suffix}@example.com`,
        customerId,
        departmentName: "Suporte",
        companyRole: "GERENTE",
        instance: "FLOWID",
      })
      .expect(201);

    const contactId = contactResponse.body.id as string;
    expect(contactResponse.body.customer_id).toBe(customerId);
    expect(contactResponse.body.normalizedPhone).toMatch(/^\+55/);

    await request(app.getHttpServer())
      .get(`/api/crm/contacts?q=Sprint%20${suffix}&linked=linked`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.total).toBeGreaterThanOrEqual(1);
        expect(body.items.some((item: { id: string }) => item.id === contactId)).toBe(true);
      });

    await request(app.getHttpServer())
      .patch(`/api/crm/contacts/${contactId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: `Contato Atualizado ${suffix}`, customerId: null, tagIds: [] })
      .expect(200)
      .expect(({ body }) => {
        expect(body.nome).toBe(`Contato Atualizado ${suffix}`);
        expect(body.customer_id).toBeNull();
      });

    await request(app.getHttpServer())
      .delete(`/api/crm/contacts/${contactId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/crm/contacts/${contactId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(404);

    await request(app.getHttpServer())
      .post("/api/crm/contacts")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: `Contato Restaurado ${suffix}`,
        phone,
        customerId,
        departmentName: "Suporte",
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.id).toBe(contactId);
        expect(body.lifecycle).toBe("restored");
        expect(body.nome).toBe(`Contato Restaurado ${suffix}`);
      });
  });

  it("blocks cross-tenant CRM access and links", async () => {
    const acmeToken = await login("admin@nexo.app", "demo1234", "acme");
    const orbitContact = await prisma.contact.findFirstOrThrow({
      where: { tenant: { slug: "orbit" }, archivedAt: null },
    });
    const orbitCustomer = await prisma.customer.findFirstOrThrow({
      where: { tenant: { slug: "orbit" }, archivedAt: null },
    });
    const acmeContact = await prisma.contact.findFirstOrThrow({
      where: { tenant: { slug: "acme" }, archivedAt: null },
    });

    await request(app.getHttpServer())
      .get(`/api/crm/contacts/${orbitContact.id}`)
      .set("Authorization", `Bearer ${acmeToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/crm/contacts/${acmeContact.id}`)
      .set("Authorization", `Bearer ${acmeToken}`)
      .send({ customerId: orbitCustomer.id })
      .expect(400);
  });

  it("validates CRM input and rejects duplicate phones per tenant", async () => {
    const token = await login("admin@nexo.app", "demo1234", "acme");
    const customer = await prisma.customer.findFirstOrThrow({
      where: { tenant: { slug: "acme" }, archivedAt: null },
    });
    const phone = uniqueBrazilianMobilePhone();

    await request(app.getHttpServer())
      .post("/api/crm/contacts")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Telefone ruim", phone: "123", customerId: customer.id })
      .expect(400);

    await request(app.getHttpServer())
      .post("/api/crm/contacts")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Campo desconhecido",
        phone,
        customerId: customer.id,
        departmentName: "Suporte",
        unexpected: true,
      })
      .expect(400);

    await request(app.getHttpServer())
      .post("/api/crm/contacts")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Duplicado A",
        phone,
        customerId: customer.id,
        departmentName: "Suporte",
      })
      .expect(201);

    await request(app.getHttpServer())
      .post("/api/crm/contacts")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Duplicado B",
        phone,
        customerId: customer.id,
        departmentName: "Suporte",
      })
      .expect(409)
      .expect(({ body }) => {
        expect(body.message).toBe("Ja existe um contato ativo com este telefone.");
      });

    const orbitToken = await login("admin-orbit@nexo.app", "demo1234", "orbit");
    await request(app.getHttpServer())
      .post("/api/crm/contacts")
      .set("Authorization", `Bearer ${orbitToken}`)
      .send({
        name: "Mesmo telefone outro tenant",
        phone,
        departmentName: "Suporte Orbit",
      })
      .expect(201);
  });

  it("supports invitation first access and password reset without exposing token hashes", async () => {
    const token = await login("admin@nexo.app", "demo1234", "acme");
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "acme" } });
    const role = await prisma.role.findUniqueOrThrow({
      where: { tenantId_key: { tenantId: tenant.id, key: "agent" } },
    });
    const department = await prisma.department.findFirstOrThrow({
      where: { tenantId: tenant.id, active: true },
    });
    const email = `invite-${Date.now()}@example.com`;

    const invitation = await request(app.getHttpServer())
      .post("/api/user-invitations")
      .set("Authorization", `Bearer ${token}`)
      .send({ email, roleId: role.id, departmentIds: [department.id] })
      .expect(201)
      .expect(({ body }) => {
        expect(body.email).toBe(email);
        expect(body.status).toBe("pending");
        expect(JSON.stringify(body)).not.toContain("tokenHash");
      });
    const inviteToken = new URL(invitation.body.acceptUrl).searchParams.get("invite");
    expect(inviteToken).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .post("/api/auth/invitations/accept")
      .send({ token: inviteToken, password: "newpass123", name: "Invite User" })
      .expect(201)
      .expect(({ body }) => {
        expect(body.user.email).toBe(email);
        expect(body.tenant.slug).toBe("acme");
      });

    const reset = await request(app.getHttpServer())
      .post("/api/auth/password/forgot")
      .send({ email })
      .expect(201)
      .expect(({ body }) => {
        expect(body.ok).toBe(true);
        expect(JSON.stringify(body)).not.toContain("tokenHash");
      });
    const resetToken = new URL(reset.body.resetUrl).searchParams.get("reset");
    expect(resetToken).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .post("/api/auth/password/reset")
      .send({ token: resetToken, password: "resetpass123" })
      .expect(201)
      .expect(({ body }) => expect(body.ok).toBe(true));

    await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email, password: "resetpass123", tenantSlug: "acme" })
      .expect(201);
  });

  it("protects conversations with authentication and explicit RBAC", async () => {
    await request(app.getHttpServer()).get("/api/conversations").expect(401);

    const platformMembership = await prisma.tenantMembership.findFirstOrThrow({
      where: { tenant: { slug: "acme" }, user: { email: "platform@nexo.app" } },
    });
    const noConversationRole = await prisma.role.upsert({
      where: { tenantId_key: { tenantId: platformMembership.tenantId, key: "no_conversations" } },
      update: { name: "Sem Conversas", system: false },
      create: {
        id: `${platformMembership.tenantId}:no_conversations`,
        tenantId: platformMembership.tenantId,
        key: "no_conversations",
        name: "Sem Conversas",
        system: false,
      },
    });
    const originalRoleId = platformMembership.roleId;
    await prisma.tenantMembership.update({
      where: { id: platformMembership.id },
      data: { roleId: noConversationRole.id },
    });

    try {
      const token = await login("platform@nexo.app", "demo1234", "acme");
      await request(app.getHttpServer())
        .get("/api/conversations")
        .set("Authorization", `Bearer ${token}`)
        .expect(403);
    } finally {
      await prisma.tenantMembership.update({
        where: { id: platformMembership.id },
        data: { roleId: originalRoleId },
      });
    }

    const adminToken = await login("admin@nexo.app", "demo1234", "acme");
    await request(app.getHttpServer())
      .get("/api/conversations?pageSize=2")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.items).toHaveLength(2);
        expect(body.total).toBeGreaterThanOrEqual(5);
        expect(body.counts).toMatchObject({
          ativas: expect.any(Number),
          standby: expect.any(Number),
          fila: expect.any(Number),
          leads: expect.any(Number),
        });
      });
  });

  it("lists conversations with server-side filters, search and sort", async () => {
    const token = await login("admin@nexo.app", "demo1234", "acme");
    const customer = await prisma.customer.findFirstOrThrow({
      where: { tenant: { slug: "acme" }, name: "Nexos Cafe" },
    });

    await request(app.getHttpServer())
      .get("/api/conversations?tab=leads&source=bots&pageSize=20")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.items.length).toBeGreaterThanOrEqual(1);
        expect(
          body.items.every(
            (item: { is_lead: boolean; agent_id: string | null }) =>
              item.is_lead && item.agent_id === null,
          ),
        ).toBe(true);
      });

    await request(app.getHttpServer())
      .get(
        `/api/conversations?q=Marina&customerId=${customer.id}&instance=FLOWID&sort=createdAt&direction=asc`,
      )
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.items.length).toBeGreaterThanOrEqual(1);
        expect(
          body.items.every(
            (item: { contact: { nome: string; customer_id: string; instancia: string } }) =>
              item.contact.nome.includes("Marina") &&
              item.contact.customer_id === customer.id &&
              item.contact.instancia === "FLOWID",
          ),
        ).toBe(true);
      });
  });

  it("returns details and blocks cross-tenant conversation and contact access", async () => {
    const token = await login("admin@nexo.app", "demo1234", "acme");
    const orbitConversation = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
    const acmeConversation = "44444444-4444-4444-8444-444444444441";
    const orbitContact = await prisma.contact.findFirstOrThrow({
      where: { tenant: { slug: "orbit" }, archivedAt: null },
    });

    await request(app.getHttpServer())
      .get(`/api/conversations/${acmeConversation}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.id).toBe(acmeConversation);
        expect(body.contact.nome).toBe("Marina Lopes");
      });

    await request(app.getHttpServer())
      .get(`/api/conversations/${orbitConversation}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(404);

    await request(app.getHttpServer())
      .post("/api/conversations")
      .set("Authorization", `Bearer ${token}`)
      .send({ contactId: orbitContact.id, assignToSelf: true })
      .expect(400);
  });

  it("enforces assignment, unassignment and assignee isolation", async () => {
    const token = await login("admin@nexo.app", "demo1234", "acme");
    const queueConversation = "44444444-4444-4444-8444-444444444443";
    const agentMembership = await prisma.tenantMembership.findFirstOrThrow({
      where: { tenant: { slug: "acme" }, user: { email: "atendente@nexo.app" } },
    });
    const orbitMembership = await prisma.tenantMembership.findFirstOrThrow({
      where: { tenant: { slug: "orbit" }, user: { email: "agent-orbit@nexo.app" } },
    });

    await request(app.getHttpServer())
      .patch(`/api/conversations/${queueConversation}/assignee`)
      .set("Authorization", `Bearer ${token}`)
      .send({ membershipId: agentMembership.id })
      .expect(200)
      .expect(({ body }) => {
        expect(body.assigned_membership_id).toBe(agentMembership.id);
        expect(body.status).toBe("em_andamento");
      });

    await request(app.getHttpServer())
      .patch(`/api/conversations/${queueConversation}/assignee`)
      .set("Authorization", `Bearer ${token}`)
      .send({ unassign: true })
      .expect(200)
      .expect(({ body }) => {
        expect(body.assigned_membership_id).toBeNull();
        expect(body.status).toBe("aberta");
      });

    await request(app.getHttpServer())
      .patch(`/api/conversations/${queueConversation}/assignee`)
      .set("Authorization", `Bearer ${token}`)
      .send({ membershipId: orbitMembership.id })
      .expect(400);

    await prisma.tenantMembership.update({
      where: { id: agentMembership.id },
      data: { status: "DISABLED" },
    });
    await request(app.getHttpServer())
      .patch(`/api/conversations/${queueConversation}/assignee`)
      .set("Authorization", `Bearer ${token}`)
      .send({ membershipId: agentMembership.id })
      .expect(400);
    await prisma.tenantMembership.update({
      where: { id: agentMembership.id },
      data: { status: "ACTIVE" },
    });
  });

  it("enforces department transfer scope and cross-tenant department isolation", async () => {
    const adminToken = await login("admin@nexo.app", "demo1234", "acme");
    const supervisorToken = await login("supervisor@nexo.app", "demo1234", "acme");
    const activeConversation = "44444444-4444-4444-8444-444444444441";
    const sales = await prisma.department.findFirstOrThrow({
      where: { tenant: { slug: "acme" }, name: "Comercial" },
    });
    const support = await prisma.department.findFirstOrThrow({
      where: { tenant: { slug: "acme" }, name: "Suporte" },
    });
    const orbitDepartment = await prisma.department.findFirstOrThrow({
      where: { tenant: { slug: "orbit" } },
    });

    await request(app.getHttpServer())
      .patch(`/api/conversations/${activeConversation}/department`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({ departmentId: sales.id })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/conversations/${activeConversation}/department`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ departmentId: orbitDepartment.id })
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/api/conversations/${activeConversation}/department`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ departmentId: sales.id })
      .expect(200)
      .expect(({ body }) => {
        expect(body.department_id).toBe(sales.id);
      });

    await request(app.getHttpServer())
      .patch(`/api/conversations/${activeConversation}/department`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ departmentId: support.id })
      .expect(200);
  });

  it("enforces status transitions and agent department visibility", async () => {
    const adminToken = await login("admin@nexo.app", "demo1234", "acme");
    const agentToken = await login("atendente@nexo.app", "demo1234", "acme");
    const financeConversation = "44444444-4444-4444-8444-444444444446";
    const contact = await prisma.contact.findFirstOrThrow({
      where: { tenant: { slug: "acme" }, archivedAt: null },
    });
    const created = await request(app.getHttpServer())
      .post("/api/conversations")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ contactId: contact.id, assignToSelf: true, firstMessagePreview: "Status test" })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/conversations/${created.body.id}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "aberta" })
      .expect(200)
      .expect(({ body }) => {
        expect(body.agent_id).toBeNull();
        expect(body.status).toBe("aberta");
      });
    await expect(
      prisma.message.findFirstOrThrow({
        where: {
          conversationId: created.body.id,
          direction: MessageDirection.SYSTEM,
          content: "Conversa movida para fila.",
        },
      }),
    ).resolves.toBeTruthy();

    await request(app.getHttpServer())
      .patch(`/api/conversations/${created.body.id}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "fechada" })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/conversations/${created.body.id}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "em_andamento" })
      .expect(400);

    await request(app.getHttpServer())
      .get("/api/conversations?pageSize=100")
      .set("Authorization", `Bearer ${agentToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.items.some((item: { id: string }) => item.id === financeConversation)).toBe(
          false,
        );
      });

    await request(app.getHttpServer())
      .get(`/api/conversations/${financeConversation}`)
      .set("Authorization", `Bearer ${agentToken}`)
      .expect(404);
  });

  it("creates conversations only with connected Evolution connections and reuses open duplicates", async () => {
    const adminToken = await login("admin@nexo.app", "demo1234", "acme");
    const [tenant, orbit] = await Promise.all([
      prisma.tenant.findUniqueOrThrow({ where: { slug: "acme" } }),
      prisma.tenant.findUniqueOrThrow({ where: { slug: "orbit" } }),
    ]);
    const contact = await prisma.contact.findFirstOrThrow({
      where: { tenantId: tenant.id, archivedAt: null },
    });
    const suffix = Date.now();
    const [connected, disconnected, crossTenant] = await Promise.all([
      prisma.messagingConnection.create({
        data: {
          tenantId: tenant.id,
          name: "Evolution E2E Conversation",
          providerType: MessagingProviderType.EVOLUTION,
          status: MessagingConnectionStatus.CONNECTED,
          externalReference: `e2e-conversation-${suffix}`,
        },
      }),
      prisma.messagingConnection.create({
        data: {
          tenantId: tenant.id,
          name: "Evolution E2E Conversation Disconnected",
          providerType: MessagingProviderType.EVOLUTION,
          status: MessagingConnectionStatus.DISCONNECTED,
          externalReference: `e2e-conversation-disconnected-${suffix}`,
        },
      }),
      prisma.messagingConnection.create({
        data: {
          tenantId: orbit.id,
          name: "Evolution E2E Conversation Orbit",
          providerType: MessagingProviderType.EVOLUTION,
          status: MessagingConnectionStatus.CONNECTED,
          externalReference: `e2e-conversation-orbit-${suffix}`,
        },
      }),
    ]);

    const created = await request(app.getHttpServer())
      .post("/api/conversations")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ contactId: contact.id, connectionId: connected.id, assignToSelf: true })
      .expect(201);

    expect(created.body.connection_id).toBe(connected.id);
    expect(created.body.status).toBe("em_andamento");
    expect(created.body.assigned_membership_id).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .post("/api/conversations")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ contactId: contact.id, connectionId: connected.id, assignToSelf: true })
      .expect(201)
      .expect(({ body }) => {
        expect(body.id).toBe(created.body.id);
      });

    await request(app.getHttpServer())
      .post("/api/conversations")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ contactId: contact.id, connectionId: disconnected.id, assignToSelf: true })
      .expect(400);

    await request(app.getHttpServer())
      .post("/api/conversations")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ contactId: contact.id, connectionId: crossTenant.id, assignToSelf: true })
      .expect(400);
  });

  it("lists conversation messages with cursor pagination and tenant visibility", async () => {
    const adminToken = await login("admin@nexo.app", "demo1234", "acme");
    const agentToken = await login("atendente@nexo.app", "demo1234", "acme");
    const financeConversation = "44444444-4444-4444-8444-444444444446";
    const orbitConversation = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "acme" } });
    const membership = await prisma.tenantMembership.findFirstOrThrow({
      where: { tenantId: tenant.id, user: { email: "admin@nexo.app" } },
    });
    const department = await prisma.department.findFirstOrThrow({
      where: { tenantId: tenant.id, name: "Suporte" },
    });
    const contact = await prisma.contact.findFirstOrThrow({
      where: { tenantId: tenant.id, archivedAt: null },
    });
    const createdAt = new Date();
    const pagedConversation = await prisma.conversation.create({
      data: {
        tenantId: tenant.id,
        contactId: contact.id,
        departmentId: department.id,
        assignedMembershipId: membership.id,
        status: ConversationStatus.EM_ANDAMENTO,
        lastMessagePreview: "Terceira mensagem",
        lastMessageAt: createdAt,
      },
    });
    await prisma.message.createMany({
      data: [
        {
          tenantId: tenant.id,
          conversationId: pagedConversation.id,
          direction: MessageDirection.SYSTEM,
          type: MessageType.SYSTEM,
          authorMembershipId: membership.id,
          content: "Primeira mensagem",
          createdAt: new Date(createdAt.getTime() - 2_000),
        },
        {
          tenantId: tenant.id,
          conversationId: pagedConversation.id,
          direction: MessageDirection.INBOUND,
          type: MessageType.TEXT,
          content: "Segunda mensagem",
          createdAt: new Date(createdAt.getTime() - 1_000),
        },
        {
          tenantId: tenant.id,
          conversationId: pagedConversation.id,
          direction: MessageDirection.OUTBOUND,
          type: MessageType.TEXT,
          authorMembershipId: membership.id,
          content: "Terceira mensagem",
          createdAt,
        },
      ],
    });

    const firstPage = await request(app.getHttpServer())
      .get(`/api/conversations/${pagedConversation.id}/messages?limit=2`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(firstPage.body.items).toHaveLength(2);
    expect(Date.parse(firstPage.body.items[0].created_at)).toBeLessThanOrEqual(
      Date.parse(firstPage.body.items[1].created_at),
    );
    expect(firstPage.body.nextCursor).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .get(
        `/api/conversations/${pagedConversation.id}/messages?limit=2&cursor=${firstPage.body.nextCursor}`,
      )
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.items.length).toBeGreaterThanOrEqual(1);
        expect(body.items.some((message: { type: string }) => message.type === "system")).toBe(
          true,
        );
      });

    await request(app.getHttpServer())
      .get(`/api/conversations/${orbitConversation}/messages`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/api/conversations/${financeConversation}/messages`)
      .set("Authorization", `Bearer ${agentToken}`)
      .expect(404);
  });

  it("sends text messages transactionally and validates message input", async () => {
    const agentToken = await login("atendente@nexo.app", "demo1234", "acme");
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "acme" } });
    const agentMembership = await prisma.tenantMembership.findFirstOrThrow({
      where: { tenantId: tenant.id, user: { email: "atendente@nexo.app" } },
    });
    const department = await prisma.department.findFirstOrThrow({
      where: { tenantId: tenant.id, name: "Suporte" },
    });
    const contact = await prisma.contact.findFirstOrThrow({
      where: { tenantId: tenant.id, archivedAt: null },
    });
    const connection = await prisma.messagingConnection.findFirstOrThrow({
      where: { tenantId: tenant.id, providerType: MessagingProviderType.DEVELOPMENT },
    });
    const activeConversation = (
      await prisma.conversation.create({
        data: {
          tenantId: tenant.id,
          contactId: contact.id,
          connectionId: connection.id,
          departmentId: department.id,
          assignedMembershipId: agentMembership.id,
          status: ConversationStatus.EM_ANDAMENTO,
          lastMessagePreview: "Conversa para envio e2e",
          lastMessageAt: new Date(),
        },
      })
    ).id;
    const content = `<b>Resposta segura ${Date.now()}</b>`;
    const clientMessageId = `e2e-${Date.now()}`;

    await request(app.getHttpServer())
      .post(`/api/conversations/${activeConversation}/messages`)
      .send({ content })
      .expect(401);

    await request(app.getHttpServer())
      .post(`/api/conversations/${activeConversation}/messages`)
      .set("Authorization", `Bearer ${agentToken}`)
      .send({ content: "   " })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/conversations/${activeConversation}/messages`)
      .set("Authorization", `Bearer ${agentToken}`)
      .send({ content: "x".repeat(4001) })
      .expect(400);

    const created = await request(app.getHttpServer())
      .post(`/api/conversations/${activeConversation}/messages`)
      .set("Authorization", `Bearer ${agentToken}`)
      .send({ content, clientMessageId })
      .expect(201);

    const contentWithAgentName = `*Camila Duarte:*\n\n${content}`;
    expect(created.body).toMatchObject({
      conversation_id: activeConversation,
      sender: "agent",
      type: "text",
      content: contentWithAgentName,
    });

    await request(app.getHttpServer())
      .post(`/api/conversations/${activeConversation}/messages`)
      .set("Authorization", `Bearer ${agentToken}`)
      .send({ content, clientMessageId })
      .expect(201)
      .expect(({ body }) => {
        expect(body.id).toBe(created.body.id);
      });

    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: activeConversation },
    });
    expect(conversation.lastMessagePreview).toBe(contentWithAgentName);
    expect(conversation.lastMessageAt?.toISOString()).toBe(created.body.created_at);
  });

  it("enforces message send permissions and conversation states", async () => {
    const adminToken = await login("admin@nexo.app", "demo1234", "acme");
    const supervisorToken = await login("supervisor@nexo.app", "demo1234", "acme");
    const activeConversation = "44444444-4444-4444-8444-444444444441";
    const closedConversation = "44444444-4444-4444-8444-444444444445";
    const standbyConversation = "44444444-4444-4444-8444-444444444442";
    const platformMembership = await prisma.tenantMembership.findFirstOrThrow({
      where: { tenant: { slug: "acme" }, user: { email: "platform@nexo.app" } },
    });
    const noSendRole = await prisma.role.upsert({
      where: { tenantId_key: { tenantId: platformMembership.tenantId, key: "no_message_send" } },
      update: { name: "Sem Envio", system: false },
      create: {
        id: `${platformMembership.tenantId}:no_message_send`,
        tenantId: platformMembership.tenantId,
        key: "no_message_send",
        name: "Sem Envio",
        system: false,
      },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: noSendRole.id } });
    await prisma.rolePermission.createMany({
      data: [
        { roleId: noSendRole.id, permissionId: "conversations.read" },
        { roleId: noSendRole.id, permissionId: "conversations.assign" },
      ],
      skipDuplicates: true,
    });
    const originalRoleId = platformMembership.roleId;
    await prisma.tenantMembership.update({
      where: { id: platformMembership.id },
      data: { roleId: noSendRole.id },
    });

    try {
      const noSendToken = await login("platform@nexo.app", "demo1234", "acme");
      await request(app.getHttpServer())
        .post(`/api/conversations/${activeConversation}/messages`)
        .set("Authorization", `Bearer ${noSendToken}`)
        .send({ content: "Sem permissao" })
        .expect(403);
    } finally {
      await prisma.tenantMembership.update({
        where: { id: platformMembership.id },
        data: { roleId: originalRoleId },
      });
    }

    await request(app.getHttpServer())
      .post(`/api/conversations/${closedConversation}/messages`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ content: "Nao pode enviar em conversa encerrada" })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/conversations/${standbyConversation}/messages`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({ content: "Retomar antes de enviar" })
      .expect(400);
  });

  it("marks inbound messages as read and resets conversation unread count", async () => {
    const adminToken = await login("admin@nexo.app", "demo1234", "acme");
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "acme" } });
    const membership = await prisma.tenantMembership.findFirstOrThrow({
      where: { tenantId: tenant.id, user: { email: "admin@nexo.app" } },
    });
    const department = await prisma.department.findFirstOrThrow({
      where: { tenantId: tenant.id, name: "Suporte" },
    });
    const contact = await prisma.contact.findFirstOrThrow({
      where: { tenantId: tenant.id, archivedAt: null },
    });
    const conversation = await prisma.conversation.create({
      data: {
        tenantId: tenant.id,
        contactId: contact.id,
        departmentId: department.id,
        assignedMembershipId: membership.id,
        status: ConversationStatus.EM_ANDAMENTO,
        unreadCount: 2,
        lastMessagePreview: "Mensagem inbound pendente",
        lastMessageAt: new Date(),
      },
    });
    await prisma.message.createMany({
      data: [
        {
          tenantId: tenant.id,
          conversationId: conversation.id,
          direction: MessageDirection.INBOUND,
          type: MessageType.TEXT,
          content: "Primeira pendente",
        },
        {
          tenantId: tenant.id,
          conversationId: conversation.id,
          direction: MessageDirection.INBOUND,
          type: MessageType.TEXT,
          content: "Segunda pendente",
        },
      ],
    });

    await request(app.getHttpServer())
      .patch(`/api/conversations/${conversation.id}/messages/read`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.unreadCount).toBe(0);
        expect(body.readAt).toEqual(expect.any(String));
      });

    const [updated, unread] = await Promise.all([
      prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } }),
      prisma.message.count({
        where: {
          tenantId: tenant.id,
          conversationId: conversation.id,
          direction: MessageDirection.INBOUND,
          readAt: null,
        },
      }),
    ]);
    expect(updated.unreadCount).toBe(0);
    expect(unread).toBe(0);
  });

  it("processes Evolution inbound webhook idempotently", async () => {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "acme" } });
    const connection = await prisma.messagingConnection.create({
      data: {
        tenantId: tenant.id,
        name: "Evolution E2E",
        providerType: MessagingProviderType.EVOLUTION,
        status: MessagingConnectionStatus.CONNECTED,
        externalReference: `e2e-acme-${Date.now()}`,
      },
    });
    const token = webhookToken();
    const payload = {
      event: "messages.upsert",
      instance: connection.externalReference,
      data: {
        key: {
          remoteJid: "551198887777@s.whatsapp.net",
          fromMe: false,
          id: "EXT-DUP-1",
        },
        message: { conversation: "Webhook inbound duplicate" },
        messageTimestamp: Math.floor(Date.now() / 1000),
        pushName: "Webhook Cliente",
      },
    };

    await request(app.getHttpServer())
      .post("/api/webhooks/evolution")
      .set("Authorization", `Bearer ${token}`)
      .send(payload)
      .expect(200);
    await request(app.getHttpServer())
      .post("/api/webhooks/evolution")
      .set("Authorization", `Bearer ${token}`)
      .send(payload)
      .expect(200);

    await expect(
      prisma.message.count({
        where: {
          tenantId: tenant.id,
          connectionId: connection.id,
          externalMessageId: "EXT-DUP-1",
        },
      }),
    ).resolves.toBe(1);
    const conversation = await prisma.conversation.findFirstOrThrow({
      where: {
        tenantId: tenant.id,
        connectionId: connection.id,
        messages: { some: { externalMessageId: "EXT-DUP-1" } },
      },
    });
    const lead = await prisma.lead.findFirstOrThrow({
      where: { tenantId: tenant.id, conversationId: conversation.id },
    });
    await expect(
      prisma.notification.count({
        where: {
          tenantId: tenant.id,
          entityType: "lead",
          entityId: lead.id,
          kind: "LEAD_CREATED",
        },
      }),
    ).resolves.toBeGreaterThanOrEqual(1);
  });

  it("accepts the Evolution webhook jwt_key header configured on the real instance", async () => {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "acme" } });
    const connection = await prisma.messagingConnection.create({
      data: {
        tenantId: tenant.id,
        name: "Evolution E2E Jwt Key",
        providerType: MessagingProviderType.EVOLUTION,
        status: MessagingConnectionStatus.CONNECTED,
        externalReference: `e2e-jwt-key-${Date.now()}`,
      },
    });
    const externalMessageId = `EXT-JWT-KEY-${Date.now()}`;

    await request(app.getHttpServer())
      .post("/api/webhooks/evolution")
      .set("jwt_key", process.env.EVOLUTION_WEBHOOK_SECRET ?? "test-evolution-webhook-secret")
      .send({
        event: "MESSAGES_UPSERT",
        instance: connection.externalReference,
        data: {
          key: {
            remoteJid: "551198887778@s.whatsapp.net",
            fromMe: false,
            id: externalMessageId,
          },
          message: { conversation: "Webhook inbound via jwt_key" },
          messageTimestamp: Math.floor(Date.now() / 1000),
          pushName: "Webhook Cliente Jwt",
        },
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.kind).toBe("inbound");
      });

    await expect(
      prisma.message.count({
        where: {
          tenantId: tenant.id,
          connectionId: connection.id,
          externalMessageId,
        },
      }),
    ).resolves.toBe(1);
  });

  it("rejects Evolution webhook requests with an incorrect jwt_key header", async () => {
    await request(app.getHttpServer())
      .post("/api/webhooks/evolution")
      .set("jwt_key", "wrong-webhook-secret")
      .send({ event: "MESSAGES_UPSERT", instance: "unknown", data: {} })
      .expect(401);
  });

  it("accepts the compatible Evolution webhook Bearer JWT contract", async () => {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "acme" } });
    const connection = await prisma.messagingConnection.create({
      data: {
        tenantId: tenant.id,
        name: "Evolution E2E Bearer",
        providerType: MessagingProviderType.EVOLUTION,
        status: MessagingConnectionStatus.CONNECTED,
        externalReference: `e2e-bearer-${Date.now()}`,
      },
    });
    const externalMessageId = `EXT-BEARER-${Date.now()}`;

    await request(app.getHttpServer())
      .post("/api/webhooks/evolution")
      .set("Authorization", `Bearer ${webhookToken()}`)
      .send({
        event: "MESSAGES_UPSERT",
        instance: connection.externalReference,
        data: {
          key: {
            remoteJid: "551198887779@s.whatsapp.net",
            fromMe: false,
            id: externalMessageId,
          },
          message: { conversation: "Webhook inbound via bearer" },
          messageTimestamp: Math.floor(Date.now() / 1000),
          pushName: "Webhook Cliente Bearer",
        },
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.kind).toBe("inbound");
      });
  });

  it("does not write the Evolution webhook secret to auth failure logs", async () => {
    const previousSecret = process.env.EVOLUTION_WEBHOOK_SECRET;
    process.env.EVOLUTION_WEBHOOK_SECRET = "super-secret-value-never-log";
    const warnSpy = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const logSpy = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);

    try {
      await request(app.getHttpServer())
        .post("/api/webhooks/evolution")
        .set("jwt_key", "wrong-webhook-secret")
        .send({ event: "MESSAGES_UPSERT", instance: "unknown", data: {} })
        .expect(401);
    } finally {
      process.env.EVOLUTION_WEBHOOK_SECRET = previousSecret;
    }

    const logged = JSON.stringify([...warnSpy.mock.calls, ...logSpy.mock.calls]);
    expect(logged).not.toContain("super-secret-value-never-log");
    expect(logged).toContain("invalid_jwt_key");
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("deduplicates inbound messages across reconnected Evolution instances with the same owner", async () => {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "acme" } });
    const suffix = Date.now();
    const ownerPhoneNormalized = "+551199990000";
    const remotePhone = `5511988${String(suffix).slice(-6)}`;
    const [firstConnection, reconnectedConnection] = await Promise.all([
      prisma.messagingConnection.create({
        data: {
          tenantId: tenant.id,
          name: "Evolution E2E Owner First",
          providerType: MessagingProviderType.EVOLUTION,
          status: MessagingConnectionStatus.CONNECTED,
          externalReference: `e2e-owner-first-${suffix}`,
          ownerExternalId: "551199990000@s.whatsapp.net",
          ownerPhoneNormalized,
        },
      }),
      prisma.messagingConnection.create({
        data: {
          tenantId: tenant.id,
          name: "Evolution E2E Owner Reconnected",
          providerType: MessagingProviderType.EVOLUTION,
          status: MessagingConnectionStatus.CONNECTED,
          externalReference: `e2e-owner-reconnected-${suffix}`,
          ownerExternalId: "551199990000@s.whatsapp.net",
          ownerPhoneNormalized,
        },
      }),
    ]);
    const token = webhookToken();
    const externalMessageId = `EXT-OWNER-${suffix}`;
    const baseData = {
      key: {
        remoteJid: `${remotePhone}@s.whatsapp.net`,
        fromMe: false,
        id: externalMessageId,
      },
      message: { conversation: "Mensagem apos reconexao" },
      messageTimestamp: Math.floor(Date.now() / 1000),
      pushName: "Webhook Cliente Reconexao",
    };

    for (const connection of [firstConnection, reconnectedConnection]) {
      await request(app.getHttpServer())
        .post("/api/webhooks/evolution")
        .set("Authorization", `Bearer ${token}`)
        .send({
          event: "messages.upsert",
          instance: connection.externalReference,
          data: baseData,
        })
        .expect(200);
    }

    const messages = await prisma.message.findMany({
      where: { tenantId: tenant.id, externalMessageId },
      include: { conversation: true },
    });
    expect(messages).toHaveLength(1);
    expect(messages[0].conversation.unreadCount).toBe(1);

    await expect(
      prisma.conversation.count({
        where: {
          tenantId: tenant.id,
          contact: { normalizedPhone: `+${remotePhone}` },
          status: { not: ConversationStatus.FECHADA },
        },
      }),
    ).resolves.toBe(1);
  });

  it("marks same-tenant duplicate WhatsApp owners as connection errors without blocking other tenants", async () => {
    const [acme, orbit] = await Promise.all([
      prisma.tenant.findUniqueOrThrow({ where: { slug: "acme" } }),
      prisma.tenant.findUniqueOrThrow({ where: { slug: "orbit" } }),
    ]);
    const suffix = Date.now();
    const ownerJid = "551188880000@s.whatsapp.net";
    const token = webhookToken();
    const [acmeFirst, acmeSecond, orbitConnection] = await Promise.all([
      prisma.messagingConnection.create({
        data: {
          tenantId: acme.id,
          name: "Evolution E2E Owner Active",
          providerType: MessagingProviderType.EVOLUTION,
          status: MessagingConnectionStatus.CONNECTING,
          externalReference: `e2e-owner-active-${suffix}`,
        },
      }),
      prisma.messagingConnection.create({
        data: {
          tenantId: acme.id,
          name: "Evolution E2E Owner Duplicate",
          providerType: MessagingProviderType.EVOLUTION,
          status: MessagingConnectionStatus.CONNECTING,
          externalReference: `e2e-owner-duplicate-${suffix}`,
        },
      }),
      prisma.messagingConnection.create({
        data: {
          tenantId: orbit.id,
          name: "Evolution Orbit Cross Owner",
          providerType: MessagingProviderType.EVOLUTION,
          status: MessagingConnectionStatus.CONNECTING,
          externalReference: `e2e-owner-orbit-${suffix}`,
        },
      }),
    ]);

    for (const connection of [acmeFirst, orbitConnection, acmeSecond]) {
      await request(app.getHttpServer())
        .post("/api/webhooks/evolution")
        .set("Authorization", `Bearer ${token}`)
        .send({
          event: "connection.update",
          instance: connection.externalReference,
          data: { state: "open", ownerJid },
        })
        .expect(200);
    }

    await expect(
      prisma.messagingConnection.findUniqueOrThrow({ where: { id: acmeFirst.id } }),
    ).resolves.toMatchObject({ status: MessagingConnectionStatus.CONNECTED });
    await expect(
      prisma.messagingConnection.findUniqueOrThrow({ where: { id: orbitConnection.id } }),
    ).resolves.toMatchObject({ status: MessagingConnectionStatus.CONNECTED });
    await expect(
      prisma.messagingConnection.findUniqueOrThrow({ where: { id: acmeSecond.id } }),
    ).resolves.toMatchObject({
      status: MessagingConnectionStatus.ERROR,
      ownerPhoneNormalized: "+551188880000",
    });
  });

  it("keeps equal external message IDs isolated across tenants", async () => {
    const [acme, orbit] = await Promise.all([
      prisma.tenant.findUniqueOrThrow({ where: { slug: "acme" } }),
      prisma.tenant.findUniqueOrThrow({ where: { slug: "orbit" } }),
    ]);
    const suffix = Date.now();
    const [acmeConnection, orbitConnection] = await Promise.all([
      prisma.messagingConnection.create({
        data: {
          tenantId: acme.id,
          name: "Evolution Acme Cross",
          providerType: MessagingProviderType.EVOLUTION,
          status: MessagingConnectionStatus.CONNECTED,
          externalReference: `e2e-acme-cross-${suffix}`,
        },
      }),
      prisma.messagingConnection.create({
        data: {
          tenantId: orbit.id,
          name: "Evolution Orbit Cross",
          providerType: MessagingProviderType.EVOLUTION,
          status: MessagingConnectionStatus.CONNECTED,
          externalReference: `e2e-orbit-cross-${suffix}`,
        },
      }),
    ]);
    const token = webhookToken();
    const externalMessageId = `EXT-CROSS-${suffix}`;

    for (const [connection, phone] of [
      [acmeConnection, "551198881111"],
      [orbitConnection, "553198882222"],
    ] as const) {
      await request(app.getHttpServer())
        .post("/api/webhooks/evolution")
        .set("Authorization", `Bearer ${token}`)
        .send({
          event: "messages.upsert",
          instance: connection.externalReference,
          data: {
            key: {
              remoteJid: `${phone}@s.whatsapp.net`,
              fromMe: false,
              id: externalMessageId,
            },
            message: { conversation: "Mesmo external id" },
            messageTimestamp: Math.floor(Date.now() / 1000),
            pushName: "Cross Tenant",
          },
        })
        .expect(200);
    }

    await expect(prisma.message.count({ where: { externalMessageId } })).resolves.toBe(2);
  });

  it("rejects unauthenticated Evolution webhooks", async () => {
    await request(app.getHttpServer())
      .post("/api/webhooks/evolution")
      .send({ event: "labels.edit", instance: "unknown", data: {} })
      .expect(401);
  });

  it("lists messaging connections by tenant and blocks cross-tenant detail access", async () => {
    const acmeToken = await login("admin@nexo.app", "demo1234", "acme");
    const orbit = await prisma.tenant.findUniqueOrThrow({ where: { slug: "orbit" } });
    const orbitConnection = await prisma.messagingConnection.findFirstOrThrow({
      where: { tenantId: orbit.id },
    });

    await request(app.getHttpServer())
      .get("/api/messaging/connections")
      .set("Authorization", `Bearer ${acmeToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(Array.isArray(body)).toBe(true);
        expect(
          body.every((connection: { tenantId: string }) => connection.tenantId !== orbit.id),
        ).toBe(true);
      });

    await request(app.getHttpServer())
      .get(`/api/messaging/connections/${orbitConnection.id}`)
      .set("Authorization", `Bearer ${acmeToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/api/messaging/connections/${orbitConnection.id}/qr`)
      .set("Authorization", `Bearer ${acmeToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/messaging/connections/${orbitConnection.id}/logout`)
      .set("Authorization", `Bearer ${acmeToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/messaging/connections/${orbitConnection.id}`)
      .set("Authorization", `Bearer ${acmeToken}`)
      .expect(404);
  });

  it("archives messaging connections with historical relations and keeps delete idempotent", async () => {
    const adminToken = await login("admin@nexo.app", "demo1234", "acme");
    const agentToken = await login("atendente@nexo.app", "demo1234", "acme");
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "acme" } });
    const membership = await prisma.tenantMembership.findFirstOrThrow({
      where: { tenantId: tenant.id, user: { email: "admin@nexo.app" } },
    });
    const contact = await prisma.contact.create({
      data: {
        tenantId: tenant.id,
        name: "Connection Delete E2E",
        phone: "11912345678",
        normalizedPhone: `+551191234${String(Date.now()).slice(-4)}`,
      },
    });
    const connection = await prisma.messagingConnection.create({
      data: {
        tenantId: tenant.id,
        name: "Connection Delete E2E",
        providerType: MessagingProviderType.EVOLUTION,
        status: MessagingConnectionStatus.CONNECTED,
        externalReference: `delete-e2e-${Date.now()}`,
      },
    });
    const conversation = await prisma.conversation.create({
      data: {
        tenantId: tenant.id,
        contactId: contact.id,
        connectionId: connection.id,
        status: ConversationStatus.ABERTA,
      },
    });
    const campaign = await prisma.campaign.create({
      data: {
        tenantId: tenant.id,
        name: "Connection Delete Campaign E2E",
        messageText: "Historico preservado",
        connectionId: connection.id,
        audienceType: "CONTACTS",
        audienceContactIds: [contact.id],
        createdByMembershipId: membership.id,
      },
    });
    const message = await prisma.message.create({
      data: {
        tenantId: tenant.id,
        conversationId: conversation.id,
        connectionId: connection.id,
        direction: MessageDirection.OUTBOUND,
        type: MessageType.TEXT,
        status: "CREATED",
        content: "Historico preservado",
        campaignId: campaign.id,
      },
    });
    const deleteSpy = vi.spyOn(app.get(EvolutionClient), "deleteInstance").mockResolvedValue({});

    try {
      await request(app.getHttpServer())
        .delete(`/api/messaging/connections/${connection.id}`)
        .set("Authorization", `Bearer ${agentToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .delete(`/api/messaging/connections/${connection.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            id: connection.id,
            removed: true,
            archived: true,
            status: "removed",
            providerInstanceExisted: true,
            idempotent: false,
          });
        });

      await expect(
        prisma.messagingConnection.findUniqueOrThrow({ where: { id: connection.id } }),
      ).resolves.toMatchObject({
        status: MessagingConnectionStatus.REMOVED,
        archivedAt: expect.any(Date),
        externalReference: null,
      });
      await expect(
        prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } }),
      ).resolves.toMatchObject({ connectionId: connection.id });
      await expect(
        prisma.message.findUniqueOrThrow({ where: { id: message.id } }),
      ).resolves.toMatchObject({ connectionId: connection.id });
      await expect(
        prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } }),
      ).resolves.toMatchObject({ connectionId: connection.id });

      await request(app.getHttpServer())
        .post("/api/campaigns")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Campaign with removed connection",
          messageText: "Nao deve iniciar",
          connectionId: connection.id,
          audience: { type: "CONTACTS", contactIds: [contact.id], tagIds: [], customerIds: [] },
        })
        .expect(400)
        .expect(({ body }) => {
          expect(body.code).toBe("CAMPAIGN_CONNECTION_UNAVAILABLE");
        });

      await request(app.getHttpServer())
        .delete(`/api/messaging/connections/${connection.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body.idempotent).toBe(true);
        });
      await request(app.getHttpServer())
        .get("/api/messaging/connections")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body.some((item: { id: string }) => item.id === connection.id)).toBe(false);
        });
      expect(deleteSpy).toHaveBeenCalledTimes(1);
    } finally {
      deleteSpy.mockRestore();
      await prisma.message.deleteMany({ where: { id: message.id } });
      await prisma.campaign.deleteMany({ where: { id: campaign.id } });
      await prisma.conversation.deleteMany({ where: { id: conversation.id } });
      await prisma.contact.deleteMany({ where: { id: contact.id } });
      await prisma.messagingConnection.deleteMany({ where: { id: connection.id } });
    }
  });

  it("allows tenant admin to manage tags while agents only use existing catalog tags", async () => {
    const adminToken = await login("admin@nexo.app", "demo1234", "acme");
    const agentToken = await login("atendente@nexo.app", "demo1234", "acme");
    const orbitToken = await login("admin-orbit@nexo.app", "demo1234", "orbit");
    const suffix = Date.now();
    const acmeContact = await prisma.contact.findFirstOrThrow({
      where: { tenant: { slug: "acme" }, archivedAt: null },
    });
    const orbitContact = await prisma.contact.findFirstOrThrow({
      where: { tenant: { slug: "orbit" }, archivedAt: null },
    });

    const created = await request(app.getHttpServer())
      .post("/api/tags")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: `E2E Prioritario ${suffix}`, color: "#2563eb" })
      .expect(201);

    await request(app.getHttpServer())
      .post("/api/tags")
      .set("Authorization", `Bearer ${agentToken}`)
      .send({ name: `E2E Agent Denied ${suffix}`, color: "#2563eb" })
      .expect(403);

    await request(app.getHttpServer())
      .get("/api/tags")
      .set("Authorization", `Bearer ${agentToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.some((tag: { id: string }) => tag.id === created.body.id)).toBe(true);
      });

    await request(app.getHttpServer())
      .post(`/api/contacts/${acmeContact.id}/tags/${created.body.id}`)
      .set("Authorization", `Bearer ${agentToken}`)
      .expect(201)
      .expect(({ body }) => {
        expect(body.some((tag: { id: string }) => tag.id === created.body.id)).toBe(true);
      });

    await request(app.getHttpServer())
      .post(`/api/contacts/${acmeContact.id}/tags/${created.body.id}`)
      .set("Authorization", `Bearer ${agentToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/contacts/${orbitContact.id}/tags/${created.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`/api/contacts/${acmeContact.id}/tags/${created.body.id}`)
      .set("Authorization", `Bearer ${orbitToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/contacts/${acmeContact.id}/tags/${created.body.id}`)
      .set("Authorization", `Bearer ${agentToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.some((tag: { id: string }) => tag.id === created.body.id)).toBe(false);
      });

    await request(app.getHttpServer())
      .delete(`/api/tags/${created.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get("/api/tags")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.some((tag: { id: string }) => tag.id === created.body.id)).toBe(false);
      });
  });

  it("enforces quick reply API RBAC, tenant scope, duplicate shortcuts and archive", async () => {
    const adminToken = await login("admin@nexo.app", "demo1234", "acme");
    const agentToken = await login("atendente@nexo.app", "demo1234", "acme");
    const orbitToken = await login("admin-orbit@nexo.app", "demo1234", "orbit");
    const suffix = Date.now();
    const shortcut = `s10${suffix}`;

    const created = await request(app.getHttpServer())
      .post("/api/quick-replies")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Sprint 10 E2E", shortcut, content: "Resposta Sprint 10." })
      .expect(201)
      .expect(({ body }) => {
        expect(body.atalho).toBe(`/${shortcut}`);
        expect(body.texto).toBe("Resposta Sprint 10.");
        expect(body.close_on_send).toBe(false);
      });

    await request(app.getHttpServer())
      .post("/api/quick-replies")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Sprint 10 Dup", shortcut, content: "Duplicada." })
      .expect(409);

    await request(app.getHttpServer())
      .get("/api/quick-replies?q=Sprint%2010")
      .set("Authorization", `Bearer ${agentToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.some((reply: { id: string }) => reply.id === created.body.id)).toBe(true);
      });

    await request(app.getHttpServer())
      .post("/api/quick-replies")
      .set("Authorization", `Bearer ${agentToken}`)
      .send({ title: "Agent denied", shortcut: `agent${suffix}`, content: "Denied." })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/quick-replies/${created.body.id}`)
      .set("Authorization", `Bearer ${agentToken}`)
      .send({ content: "Denied." })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/quick-replies/${created.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ content: "Resposta editada Sprint 10." })
      .expect(200)
      .expect(({ body }) => {
        expect(body.texto).toBe("Resposta editada Sprint 10.");
      });

    await request(app.getHttpServer())
      .get("/api/quick-replies")
      .set("Authorization", `Bearer ${orbitToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.some((reply: { id: string }) => reply.id === created.body.id)).toBe(false);
      });

    await request(app.getHttpServer())
      .delete(`/api/quick-replies/${created.body.id}`)
      .set("Authorization", `Bearer ${agentToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/quick-replies/${created.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get("/api/quick-replies")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.some((reply: { id: string }) => reply.id === created.body.id)).toBe(false);
      });
  });

  it("bootstraps AppModule and resolves TicketsModule controller/service dependencies", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), AppModule],
    }).compile();
    try {
      const controller = moduleRef.get(TicketsController, { strict: false });
      const service = moduleRef.get(TicketsService, { strict: false });
      expect(controller).toBeDefined();
      expect(service).toBeDefined();
      Logger.log(
        {
          event: "tickets.di.audit",
          moduleLoaded: true,
          controllerInstance: controller.constructor.name,
          servicePresent: Boolean(service),
          serviceConstructorName: service.constructor.name,
          providerResolved: true,
        },
        "TicketsControllerDiTest",
      );
    } finally {
      await moduleRef.close();
    }
  });

  it("compiles TicketsModule and resolves TicketsController/TicketsService explicitly", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), TicketsModule],
    }).compile();
    try {
      const controller = moduleRef.get(TicketsController);
      const service = moduleRef.get(TicketsService);
      expect(controller).toBeDefined();
      expect(service).toBeDefined();
      Logger.log(
        {
          event: "tickets.module.di.audit",
          moduleLoaded: true,
          controllerInstance: controller.constructor.name,
          servicePresent: Boolean(service),
          serviceConstructorName: service.constructor.name,
          providerResolved: true,
        },
        "TicketsControllerDiTest",
      );
    } finally {
      await moduleRef.close();
    }
  });

  it("lists tickets through a real Nest app without controller DI TypeError", async () => {
    const adminToken = await login("admin@nexo.app", "demo1234", "acme");
    await request(app.getHttpServer())
      .get("/api/tickets")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(Array.isArray(body.items)).toBe(true);
        expect(body.page).toEqual(expect.any(Number));
        expect(body.pageSize).toEqual(expect.any(Number));
        expect(body.total).toEqual(expect.any(Number));
        Logger.log(
          {
            event: "tickets.http.audit",
            endpoint: "GET /api/tickets",
            httpStatus: 200,
            moduleLoaded: true,
            providerResolved: true,
          },
          "TicketsControllerDiTest",
        );
      });
  });

  it("creates tickets through a real Nest app without controller DI TypeError", async () => {
    const adminToken = await login("admin@nexo.app", "demo1234", "acme");
    const department = await prisma.department.findFirstOrThrow({
      where: { tenant: { slug: "acme" }, name: "Suporte" },
    });
    const conversation = await prisma.conversation.findFirstOrThrow({
      where: { tenant: { slug: "acme" }, archivedAt: null, contact: { customerId: { not: null } } },
      include: { contact: true },
    });
    const agent = await prisma.tenantMembership.findFirstOrThrow({
      where: { tenant: { slug: "acme" }, user: { email: "atendente@nexo.app" } },
    });

    await request(app.getHttpServer())
      .post("/api/tickets")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: `Ticket DI Rework ${Date.now()}`,
        descriptionHtml: "<p>Criacao real via controller DI.</p>",
        priority: "NORMAL",
        category: "SUPORTE",
        departmentId: department.id,
        conversationId: conversation.id,
        assignedMembershipId: agent.id,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.protocol).toMatch(/^TKT-\d{6}$/);
        expect(body.department.id).toBe(department.id);
        expect(body.conversation.id).toBe(conversation.id);
        expect(body.requesterContact.id).toBe(conversation.contactId);
        expect(body.customer.id).toBe(conversation.contact.customerId);
        expect(body.assignedMembership.id).toBe(agent.id);
        Logger.log(
          {
            event: "tickets.http.audit",
            endpoint: "POST /api/tickets",
            httpStatus: 201,
            moduleLoaded: true,
            providerResolved: true,
          },
          "TicketsControllerDiTest",
        );
      });
  });

  it("manages tickets with sanitized content, comments, attachments and tenant isolation", async () => {
    const adminToken = await login("admin@nexo.app", "demo1234", "acme");
    const agentToken = await login("atendente@nexo.app", "demo1234", "acme");
    const orbitToken = await login("admin-orbit@nexo.app", "demo1234", "orbit");
    const department = await prisma.department.findFirstOrThrow({
      where: { tenant: { slug: "acme" }, name: "Suporte" },
    });
    const contact = await prisma.contact.findFirstOrThrow({
      where: { tenant: { slug: "acme" }, archivedAt: null },
    });
    const agent = await prisma.tenantMembership.findFirstOrThrow({
      where: { tenant: { slug: "acme" }, user: { email: "atendente@nexo.app" } },
    });
    const suffix = Date.now().toString(36);

    const created = await request(app.getHttpServer())
      .post("/api/tickets")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: `Ticket Sprint 11 ${suffix}`,
        descriptionHtml:
          '<p>Falha critica</p><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">bad</a><a href="https://nexo.local/ticket">ok</a>',
        priority: "ALTA",
        category: "SUPORTE",
        departmentId: department.id,
        requesterContactId: contact.id,
        assignedMembershipId: agent.id,
      })
      .expect(201);

    expect(created.body.protocol).toMatch(/^TKT-\d{6}$/);
    expect(created.body.descriptionHtmlSanitized).not.toContain("<script");
    expect(created.body.descriptionHtmlSanitized).not.toContain("onerror");
    expect(created.body.descriptionHtmlSanitized).not.toContain("javascript:");
    expect(created.body.descriptionHtmlSanitized).toContain('rel="noopener noreferrer"');

    await request(app.getHttpServer())
      .get(`/api/tickets/${created.body.id}`)
      .set("Authorization", `Bearer ${agentToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.id).toBe(created.body.id);
        expect(body.assignedMembership.id).toBe(agent.id);
      });

    await request(app.getHttpServer())
      .get(`/api/tickets/${created.body.id}`)
      .set("Authorization", `Bearer ${orbitToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/tickets/${created.body.id}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "FECHADO" })
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe("TICKET_STATUS_TRANSITION_INVALID");
      });

    await request(app.getHttpServer())
      .patch(`/api/tickets/${created.body.id}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "EM_ANDAMENTO" })
      .expect(200);

    const comment = await request(app.getHttpServer())
      .post(`/api/tickets/${created.body.id}/comments`)
      .set("Authorization", `Bearer ${agentToken}`)
      .send({ bodyHtml: '<p>Comentario interno</p><iframe src="x"></iframe>' })
      .expect(201);
    expect(comment.body.bodyText).toBe("Comentario interno");
    expect(comment.body.bodyHtmlSanitized).not.toContain("iframe");

    const pdfBody = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(249 * 1024 - 9, 0x20)]);
    const pdf = await request(app.getHttpServer())
      .post(`/api/tickets/${created.body.id}/attachments`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Content-Type", "application/pdf")
      .set("X-File-Name", encodeURIComponent("../evidencia-com-nome-muito-longo.pdf"))
      .set("X-File-Size", String(pdfBody.byteLength))
      .send(pdfBody)
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe("READY");
        expect(body.originalName).toBe("evidencia-com-nome-muito-longo.pdf");
      });

    await request(app.getHttpServer())
      .get(`/api/tickets/${created.body.id}/attachments/${pdf.body.id}/download`)
      .set("Authorization", `Bearer ${agentToken}`)
      .expect(200)
      .expect("Content-Type", /application\/pdf/)
      .expect("Content-Disposition", /attachment/)
      .expect(({ body }) => {
        expect(Buffer.isBuffer(body)).toBe(true);
        expect(body.subarray(0, 5).toString("ascii")).toBe("%PDF-");
      });

    await request(app.getHttpServer())
      .get(`/api/tickets/${created.body.id}/attachments/${pdf.body.id}/inline`)
      .set("Authorization", `Bearer ${agentToken}`)
      .expect(200)
      .expect("Content-Disposition", /inline/);

    await request(app.getHttpServer())
      .post(`/api/tickets/${created.body.id}/attachments`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Content-Type", "application/x-msdownload")
      .set("X-File-Name", "malware.exe")
      .set("X-File-Size", "4")
      .send(Buffer.from("MZxx"))
      .expect(415)
      .expect(({ body }) => {
        expect(body.code).toBe("ATTACHMENT_MIME_NOT_ALLOWED");
      });

    await request(app.getHttpServer())
      .post(`/api/tickets/${created.body.id}/attachments`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Content-Type", "text/plain")
      .set("X-File-Name", "grande.txt")
      .set("X-File-Size", String(11 * 1024 * 1024))
      .send(Buffer.from("too-large"))
      .expect(413)
      .expect(({ body }) => {
        expect(body.code).toBe("ATTACHMENT_TOO_LARGE");
      });

    const missing = await prisma.ticketAttachment.create({
      data: {
        tenantId: department.tenantId,
        ticketId: created.body.id,
        uploadedByMembershipId: agent.id,
        storageProvider: "local",
        objectKey: `tenants/${department.tenantId}/tickets/${created.body.id}/missing/file.txt`,
        originalNameSanitized: "missing.txt",
        mimeType: "text/plain",
        sizeBytes: 7,
        status: "READY",
      },
    });
    await request(app.getHttpServer())
      .get(`/api/tickets/${created.body.id}/attachments/${missing.id}/download`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe("ATTACHMENT_OBJECT_MISSING");
      });
  });

  it("creates campaigns, previews audience, snapshots recipients and blocks duplicate starts", async () => {
    const adminToken = await login("admin@nexo.app", "demo1234", "acme");
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "acme" } });
    const staleCampaigns = await prisma.campaign.findMany({
      where: { tenantId: tenant.id, name: "Campaign E2E" },
      select: { id: true },
    });
    await prisma.message.deleteMany({
      where: { tenantId: tenant.id, campaignId: { in: staleCampaigns.map((item) => item.id) } },
    });
    await prisma.campaign.deleteMany({ where: { tenantId: tenant.id, name: "Campaign E2E" } });
    const staleContacts = await prisma.contact.findMany({
      where: { tenantId: tenant.id, normalizedPhone: "+5511999998888" },
      select: { id: true },
    });
    const staleConversations = await prisma.conversation.findMany({
      where: { tenantId: tenant.id, contactId: { in: staleContacts.map((item) => item.id) } },
      select: { id: true },
    });
    await prisma.message.deleteMany({
      where: {
        tenantId: tenant.id,
        conversationId: { in: staleConversations.map((item) => item.id) },
      },
    });
    await prisma.lead.deleteMany({
      where: { tenantId: tenant.id, contactId: { in: staleContacts.map((item) => item.id) } },
    });
    await prisma.conversation.deleteMany({
      where: { tenantId: tenant.id, id: { in: staleConversations.map((item) => item.id) } },
    });
    await prisma.contact.deleteMany({
      where: { tenantId: tenant.id, normalizedPhone: "+5511999998888" },
    });
    await prisma.messagingConnection.deleteMany({
      where: { tenantId: tenant.id, name: "Evolution Campaign E2E" },
    });
    const connection = await prisma.messagingConnection.create({
      data: {
        tenantId: tenant.id,
        name: "Evolution Campaign E2E",
        providerType: MessagingProviderType.EVOLUTION,
        status: MessagingConnectionStatus.CONNECTED,
        externalReference: `campaign-e2e-${Date.now()}`,
      },
    });
    const contact = await prisma.contact.create({
      data: {
        tenantId: tenant.id,
        name: "Campanha E2E",
        phone: "11999998888",
        normalizedPhone: "+5511999998888",
      },
    });

    const previewPayload = {
      messageText: "NEXOS-S12-E2E - Ola, {{contact.name}}.",
      audience: { type: "CONTACTS", contactIds: [contact.id], tagIds: [], customerIds: [] },
    };
    await request(app.getHttpServer())
      .post("/api/campaigns/audience-preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(previewPayload)
      .expect(201)
      .expect(({ body }) => {
        expect(body.eligibleCount).toBe(1);
        expect(body.sample[0].renderedMessage).toContain("Campanha E2E");
        expect(body.sample[0].phoneMasked).not.toContain("999998888");
      });

    const created = await request(app.getHttpServer())
      .post("/api/campaigns")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Campaign E2E",
        messageText: previewPayload.messageText,
        connectionId: connection.id,
        audience: previewPayload.audience,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe("DRAFT");
        expect(body.connectionId).toBe(connection.id);
      });

    await request(app.getHttpServer())
      .post(`/api/campaigns/${created.body.id}/start`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ confirm: true, expectedEligibleCount: 1 })
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe("QUEUED");
        expect(body.counters.eligible).toBe(1);
      });

    await request(app.getHttpServer())
      .patch(`/api/campaigns/${created.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ messageText: "Nao pode editar" })
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe("CAMPAIGN_IMMUTABLE_AFTER_START");
      });

    await request(app.getHttpServer())
      .post(`/api/campaigns/${created.body.id}/start`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ confirm: true, expectedEligibleCount: 1 })
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe("CAMPAIGN_STATUS_TRANSITION_INVALID");
      });

    const recipients = await request(app.getHttpServer())
      .get(`/api/campaigns/${created.body.id}/recipients`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(recipients.body.items).toHaveLength(1);
    expect(recipients.body.items[0].phoneMasked).not.toContain("999998888");

    await prisma.campaign.update({
      where: { id: created.body.id },
      data: { status: CampaignStatus.RUNNING },
    });
    await request(app.getHttpServer())
      .post(`/api/campaigns/${created.body.id}/cancel`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe("CANCELLING");
      });

    await prisma.message.deleteMany({
      where: { tenantId: tenant.id, campaignId: created.body.id },
    });
    await prisma.conversation.deleteMany({ where: { tenantId: tenant.id, contactId: contact.id } });
    await prisma.campaign.deleteMany({ where: { id: created.body.id } });
    await prisma.contact.deleteMany({ where: { id: contact.id } });
    await prisma.messagingConnection.delete({ where: { id: connection.id } });
  });

  it("excludes marketing opt-out contacts from campaign preview", async () => {
    const adminToken = await login("admin@nexo.app", "demo1234", "acme");
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "acme" } });
    await prisma.contact.deleteMany({
      where: { tenantId: tenant.id, normalizedPhone: "+5511977776666" },
    });
    const contact = await prisma.contact.create({
      data: {
        tenantId: tenant.id,
        name: "Opt Out E2E",
        phone: "11977776666",
        normalizedPhone: "+5511977776666",
        messagingPreferences: {
          create: {
            channel: "WHATSAPP",
            marketingAllowed: false,
            optedOutAt: new Date(),
            source: "e2e",
          },
        },
      },
    });

    await request(app.getHttpServer())
      .post("/api/campaigns/audience-preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        messageText: "Ola, {{contact.name}}.",
        audience: { type: "CONTACTS", contactIds: [contact.id], tagIds: [], customerIds: [] },
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.eligibleCount).toBe(0);
        expect(body.optedOutCount).toBe(1);
      });

    await prisma.contact.deleteMany({ where: { id: contact.id } });
  });

  it("does not allow agents to create campaigns", async () => {
    const agentToken = await login("atendente@nexo.app", "demo1234", "acme");
    await request(app.getHttpServer())
      .post("/api/campaigns")
      .set("Authorization", `Bearer ${agentToken}`)
      .send({
        name: "Sem permissao",
        messageText: "Ola",
        connectionId: "00000000-0000-4000-8000-000000000000",
        audience: { type: "ALL", tagIds: [], customerIds: [], contactIds: [] },
      })
      .expect(403);
  });

  it("serves operational dashboard, history, timeline, queues and report exports from Prisma data", async () => {
    const adminToken = await login("admin@nexo.app", "demo1234", "acme");
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "acme" } });
    const membership = await prisma.tenantMembership.findFirstOrThrow({
      where: { tenantId: tenant.id, user: { email: "atendente@nexo.app" } },
    });
    const department = await prisma.department.findFirstOrThrow({
      where: {
        tenantId: tenant.id,
        active: true,
        members: { some: { membershipId: membership.id } },
      },
    });
    const suffix = Date.now().toString(36);
    const contact = await prisma.contact.create({
      data: {
        tenantId: tenant.id,
        name: `Operacao RC15 ${suffix}`,
        phone: `1198${suffix.slice(-6).padStart(6, "0")}`,
        normalizedPhone: `+551198${suffix.slice(-6).padStart(6, "0")}`,
      },
    });
    const conversation = await prisma.conversation.create({
      data: {
        tenantId: tenant.id,
        contactId: contact.id,
        departmentId: department.id,
        assignedMembershipId: membership.id,
        status: ConversationStatus.FECHADA,
        protocol: `RC15-${suffix}`,
        lastMessagePreview: "Atendimento operacional RC15",
        lastMessageAt: new Date(),
        closedAt: new Date(),
      },
    });
    const activeConversation = await prisma.conversation.create({
      data: {
        tenantId: tenant.id,
        contactId: contact.id,
        departmentId: department.id,
        assignedMembershipId: membership.id,
        status: ConversationStatus.ABERTA,
        protocol: `RC15-ACTIVE-${suffix}`,
        lastMessagePreview: "Conversa ativa nao deve ir para historico",
        lastMessageAt: new Date(),
      },
    });
    const closeViaEndpoint = await prisma.conversation.create({
      data: {
        tenantId: tenant.id,
        contactId: contact.id,
        departmentId: department.id,
        assignedMembershipId: membership.id,
        status: ConversationStatus.EM_ANDAMENTO,
        protocol: `RC15-CLOSE-${suffix}`,
        lastMessagePreview: "Encerramento via endpoint",
        lastMessageAt: new Date(Date.now() - 60_000),
      },
    });
    const ghostLeadConversation = await prisma.conversation.create({
      data: {
        tenantId: tenant.id,
        contactId: contact.id,
        departmentId: department.id,
        assignedMembershipId: membership.id,
        status: ConversationStatus.FECHADA,
        protocol: `RC15-GHOST-${suffix}`,
        lastMessagePreview: "Lead ativo preso em conversa encerrada",
        lastMessageAt: new Date(),
        closedAt: new Date(),
      },
    });
    const dashboardBeforeGhostLead = await request(app.getHttpServer())
      .get("/api/operations/dashboard?period=30d")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    try {
      await prisma.lead.create({
        data: {
          tenantId: tenant.id,
          contactId: contact.id,
          conversationId: conversation.id,
          departmentId: department.id,
          assignedMembershipId: membership.id,
          source: "WHATSAPP",
          status: "CONVERTED",
          convertedAt: new Date(),
          firstMessagePreview: "Lead RC15",
        },
      });
      await prisma.lead.create({
        data: {
          tenantId: tenant.id,
          contactId: contact.id,
          conversationId: ghostLeadConversation.id,
          departmentId: department.id,
          assignedMembershipId: membership.id,
          source: "WHATSAPP",
          status: "NEW",
          firstMessagePreview: "Lead fantasma em conversa encerrada",
        },
      });
      await prisma.message.createMany({
        data: [
          {
            tenantId: tenant.id,
            conversationId: conversation.id,
            direction: MessageDirection.INBOUND,
            type: MessageType.TEXT,
            content: "Mensagem inbound RC15",
            status: "DELIVERED",
          },
          {
            tenantId: tenant.id,
            conversationId: conversation.id,
            direction: MessageDirection.OUTBOUND,
            type: MessageType.TEXT,
            authorMembershipId: membership.id,
            content: "Resposta operacional RC15",
            status: "SENT",
          },
        ],
      });

      await request(app.getHttpServer())
        .patch(`/api/conversations/${closeViaEndpoint.id}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "fechada" })
        .expect(200)
        .expect(({ body }) => {
          expect(body.status).toBe("fechada");
        });
      const closedViaEndpoint = await prisma.conversation.findUniqueOrThrow({
        where: { id: closeViaEndpoint.id },
      });
      expect(closedViaEndpoint.closedAt).toBeTruthy();
      expect(closedViaEndpoint.lastMessageAt?.toISOString()).toBe(
        closeViaEndpoint.lastMessageAt?.toISOString(),
      );

      await request(app.getHttpServer())
        .get("/api/operations/dashboard?period=30d")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body.kpis.conversasEncerradas.value).toBeGreaterThanOrEqual(1);
          expect(body.kpis.leadsAtivos.value).toBe(
            dashboardBeforeGhostLead.body.kpis.leadsAtivos.value,
          );
          expect(body.kpis.conversasEncerradas.changePercent).toEqual(expect.any(Number));
          expect(body.semantics.conversasEncerradas).toContain("FECHADA");
          expect(
            body.charts.byDepartment.some(
              (item: { nome: string }) => item.nome === department.name,
            ),
          ).toBe(true);
          expect(Array.isArray(body.recent)).toBe(true);
        });

      await request(app.getHttpServer())
        .get(
          `/api/operations/history/conversations?period=30d&status=fechada&q=${conversation.protocol}&page=1&pageSize=10`,
        )
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body.total).toBe(1);
          expect(body.items[0].id).toBe(conversation.id);
          expect(body.items[0].protocolo).toBe(conversation.protocol);
        });

      await request(app.getHttpServer())
        .get(
          `/api/operations/history/conversations?period=30d&status=aberta&q=${activeConversation.protocol}&page=1&pageSize=10`,
        )
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body.total).toBe(0);
          expect(body.items).toHaveLength(0);
        });

      await request(app.getHttpServer())
        .get(`/api/operations/history/conversations/${conversation.id}/timeline`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body.items.map((item: { event: string }) => item.event)).toContain("lead.created");
          expect(body.items.map((item: { event: string }) => item.event)).toContain(
            "message.inbound",
          );
          expect(body.items.map((item: { event: string }) => item.event)).toContain(
            "message.outbound",
          );
        });

      await request(app.getHttpServer())
        .get("/api/operations/queues?period=30d")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .expect(({ body }) => {
          const queue = body.items.find((item: { id: string }) => item.id === department.id);
          expect(queue).toBeDefined();
          expect(queue.conversasEncerradas).toBeGreaterThanOrEqual(1);
          expect(queue.sla).toEqual(expect.any(Number));
        });

      await request(app.getHttpServer())
        .get(`/api/operations/reports/attendance?period=30d&q=${conversation.protocol}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body.conversations.total).toBe(1);
          expect(body.conversations.items[0].id).toBe(conversation.id);
          expect(body.semantics.conversasEncerradas).toContain("closedAt");
        });

      await request(app.getHttpServer())
        .get(
          `/api/operations/reports/attendance/export?period=30d&q=${conversation.protocol}&format=csv`,
        )
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .expect("Content-Type", /text\/csv/)
        .expect((response) => {
          expect(response.text).toContain(conversation.protocol);
          expect(response.text).toContain("Operacao RC15");
        });

      await request(app.getHttpServer())
        .get("/api/operations/history/conversations?status=nao-existe")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(400)
        .expect(({ body }) => {
          expect(body.code).toBe("OPERATIONS_STATUS_INVALID");
        });
    } finally {
      await prisma.message.deleteMany({
        where: {
          tenantId: tenant.id,
          conversationId: {
            in: [
              conversation.id,
              activeConversation.id,
              closeViaEndpoint.id,
              ghostLeadConversation.id,
            ],
          },
        },
      });
      await prisma.lead.deleteMany({
        where: {
          tenantId: tenant.id,
          conversationId: {
            in: [
              conversation.id,
              activeConversation.id,
              closeViaEndpoint.id,
              ghostLeadConversation.id,
            ],
          },
        },
      });
      await prisma.conversation.deleteMany({
        where: {
          tenantId: tenant.id,
          id: {
            in: [
              conversation.id,
              activeConversation.id,
              closeViaEndpoint.id,
              ghostLeadConversation.id,
            ],
          },
        },
      });
      await prisma.contact.deleteMany({ where: { tenantId: tenant.id, id: contact.id } });
    }
  });

  it("rejects invalid credentials", async () => {
    await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: "admin@nexo.app", password: "wrong-password", tenantSlug: "acme" })
      .expect(401);
  });

  async function login(email: string, password: string, tenantSlug?: string) {
    const response = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send(tenantSlug ? { email, password, tenantSlug } : { email, password })
      .expect(201);
    return response.body.accessToken as string;
  }

  async function ensurePlatformUser(email: string, platformRole: PlatformRole) {
    await prisma.user.upsert({
      where: { email },
      update: {
        name: email,
        passwordHash: await hash("demo1234", 12),
        status: "ACTIVE",
        platformRole,
      },
      create: {
        email,
        name: email,
        passwordHash: await hash("demo1234", 12),
        status: "ACTIVE",
        platformRole,
      },
    });
  }

  async function cleanupPlatformImpersonations() {
    await prisma.impersonationSession.updateMany({
      where: { status: "ACTIVE" },
      data: { status: "STOPPED", stoppedAt: new Date() },
    });
  }

  async function createStarterTenant(scope: string) {
    const platformToken = await login("platform@nexo.app", "demo1234");
    const plan = await prisma.plan.findFirstOrThrow({ where: { code: "starter" } });
    const slug = `limit-${scope}-${Date.now()}`;
    const adminEmail = `${slug}@nexo.app`;
    const created = await request(app.getHttpServer())
      .post("/api/platform/tenants")
      .set("Authorization", `Bearer ${platformToken}`)
      .send({
        name: `Limit ${scope}`,
        slug,
        planId: plan.id,
        admin: { name: `Limit ${scope} Admin`, email: adminEmail, password: "demo1234" },
      })
      .expect(201);
    return {
      tenantId: created.body.id as string,
      token: await login(adminEmail, "demo1234", slug),
    };
  }

  function webhookToken() {
    return jwt.sign(
      { app: "evolution", action: "webhook" },
      { secret: process.env.EVOLUTION_WEBHOOK_SECRET, expiresIn: "10m" },
    );
  }

  async function cleanupEvolutionTestConnections() {
    const connections = await prisma.messagingConnection.findMany({
      where: {
        providerType: MessagingProviderType.EVOLUTION,
        OR: [
          { name: { startsWith: "Evolution E2E" } },
          { name: { startsWith: "Evolution Campaign E2E" } },
          { name: { startsWith: "Evolution Acme Cross" } },
          { name: { startsWith: "Evolution Orbit Cross" } },
          { externalReference: { startsWith: "e2e-" } },
        ],
      },
      select: { id: true, tenantId: true },
    });
    for (const connection of connections) {
      const campaigns = await prisma.campaign.findMany({
        where: { tenantId: connection.tenantId, connectionId: connection.id },
        select: { id: true },
      });
      await prisma.$transaction([
        prisma.message.deleteMany({
          where: {
            tenantId: connection.tenantId,
            OR: [
              { connectionId: connection.id },
              { campaignId: { in: campaigns.map((campaign) => campaign.id) } },
            ],
          },
        }),
        prisma.campaign.deleteMany({
          where: {
            tenantId: connection.tenantId,
            id: { in: campaigns.map((campaign) => campaign.id) },
          },
        }),
        prisma.message.updateMany({
          where: { tenantId: connection.tenantId, connectionId: connection.id },
          data: { connectionId: null },
        }),
        prisma.conversation.updateMany({
          where: { tenantId: connection.tenantId, connectionId: connection.id },
          data: { connectionId: null },
        }),
        prisma.messagingConnection.delete({
          where: { tenantId_id: { tenantId: connection.tenantId, id: connection.id } },
        }),
      ]);
    }
  }
});
