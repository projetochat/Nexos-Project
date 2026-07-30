import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import request from "supertest";
import helmet from "helmet";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

describe("Nexos API organization and RBAC", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ??
      "postgresql://nexos:nexos_dev_password@localhost:5432/nexos?schema=public";
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-access-secret-minimum-32-chars";
    process.env.JWT_REFRESH_SECRET =
      process.env.JWT_REFRESH_SECRET ?? "test-refresh-secret-minimum-32-chars";

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
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
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
});
