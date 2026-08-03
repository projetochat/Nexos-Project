import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import helmet from "helmet";
import { AppModule } from "../src/app.module";
import {
  ConversationStatus,
  MessageDirection,
  MessageType,
  MessagingConnectionStatus,
  MessagingProviderType,
} from "../src/generated/prisma";
import { PrismaService } from "../src/prisma/prisma.service";

describe("Nexos API organization and RBAC", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  beforeAll(async () => {
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ??
      "postgresql://nexos:nexos_dev_password@localhost:5432/nexos?schema=public";
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-access-secret-minimum-32-chars";
    process.env.JWT_REFRESH_SECRET =
      process.env.JWT_REFRESH_SECRET ?? "test-refresh-secret-minimum-32-chars";
    process.env.EVOLUTION_WEBHOOK_SECRET =
      process.env.EVOLUTION_WEBHOOK_SECRET ?? "test-evolution-webhook-secret";

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
  });

  afterAll(async () => {
    await app?.close();
  });

  afterEach(async () => {
    await cleanupEvolutionTestConnections();
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
    const phone = `(11) 9${suffix.slice(0, 4)}-${suffix.slice(2, 6)}`;

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
    const phone = `(11) 98888-${`${Date.now()}`.slice(-4)}`;

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

    expect(created.body).toMatchObject({
      conversation_id: activeConversation,
      sender: "agent",
      type: "text",
      content,
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
    expect(conversation.lastMessagePreview).toBe(content);
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

  it("rejects invalid credentials", async () => {
    await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: "admin@nexo.app", password: "wrong-password", tenantSlug: "acme" })
      .expect(401);
  });

  async function login(email: string, password: string, tenantSlug: string) {
    const response = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email, password, tenantSlug })
      .expect(201);
    return response.body.accessToken as string;
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
          { name: { startsWith: "Evolution Acme Cross" } },
          { name: { startsWith: "Evolution Orbit Cross" } },
          { externalReference: { startsWith: "e2e-" } },
        ],
      },
      select: { id: true, tenantId: true },
    });
    for (const connection of connections) {
      await prisma.$transaction([
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
