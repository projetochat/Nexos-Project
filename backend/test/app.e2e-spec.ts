import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import request from "supertest";
import helmet from "helmet";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

describe("Nexos API vertical slice", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
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

  it("authenticates and exposes the current tenant context", async () => {
    const token = await login("admin@nexo.app", "demo1234", "acme");

    await request(app.getHttpServer())
      .get("/api/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.user.email).toBe("admin@nexo.app");
        expect(body.tenant.slug).toBe("acme");
        expect(body.permissions.canManageTenant).toBe(true);
      });
  });

  it("keeps protected records isolated by tenant", async () => {
    const acmeToken = await login("admin@nexo.app", "demo1234", "acme");
    const orbitRecord = await prisma.protectedRecord.findFirstOrThrow({
      where: { tenant: { slug: "orbit" } },
    });

    await request(app.getHttpServer())
      .get(`/api/tenant-records/${orbitRecord.id}`)
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
});
