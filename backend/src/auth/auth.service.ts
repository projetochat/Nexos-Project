import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService, type JwtSignOptions } from "@nestjs/jwt";
import { compare } from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { JwtPayload } from "./auth.types";
import { LoginDto } from "./dto/login.dto";

@Injectable()
export class AuthService {
  private readonly failedLoginAttempts = new Map<string, { count: number; resetAt: number }>();

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(JwtService)
    private readonly jwt: JwtService,
    @Inject(ConfigService)
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const email = dto.email.toLowerCase().trim();
    this.assertLoginRateLimit(email);

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: {
            tenant: true,
            role: { include: { permissions: { select: { permissionId: true } } } },
          },
        },
      },
    });
    if (!user) throw this.invalidCredentials(email);
    if (user.status !== "ACTIVE") {
      throw new ForbiddenException({
        code: "USER_INACTIVE",
        message: "Usuario inativo.",
      });
    }

    const validPassword = await compare(dto.password, user.passwordHash);
    if (!validPassword) throw this.invalidCredentials(email);

    const requestedTenantSlug = dto.tenantSlug?.trim().toLowerCase();
    if (!requestedTenantSlug && user.platformRole !== "USER") {
      const basePayload = {
        sub: user.id,
        tenantId: "",
        membershipId: "",
        roleId: "",
        roleKey: "platform_admin",
        platformRole: user.platformRole,
        iatMs: Date.now(),
      };
      return {
        accessToken: await this.signToken({ ...basePayload, typ: "access" }, "JWT_SECRET", "15m"),
        refreshToken: await this.signToken(
          { ...basePayload, typ: "refresh" },
          "JWT_REFRESH_SECRET",
          "7d",
        ),
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          roleId: "",
          roleKey: "platform_admin",
          platformRole: user.platformRole,
        },
        tenant: {
          id: "platform",
          slug: "platform",
          name: "Nexos Platform",
        },
        membership: {
          id: "",
          role: "platform_admin",
          roleId: "",
        },
        permissions: [],
      };
    }

    const activeMemberships = user.memberships.filter((item) => item.status === "ACTIVE");
    const membership = requestedTenantSlug
      ? activeMemberships.find((item) => item.tenant.slug === requestedTenantSlug)
      : activeMemberships.length === 1
        ? activeMemberships[0]
        : (activeMemberships.find((item) => item.tenant.slug === "homologacao") ?? null);
    if (!membership) {
      throw new ForbiddenException({
        code: "USER_WITHOUT_ACTIVE_MEMBERSHIP",
        message: "Seu usuario nao possui acesso a nenhuma organizacao ativa.",
      });
    }
    if (!["ACTIVE", "TRIAL"].includes(membership.tenant.status)) {
      throw new ForbiddenException({
        code: "TENANT_INACTIVE",
        message: "Organizacao suspensa ou encerrada.",
      });
    }
    const permissions = membership.role.permissions.map((item) => item.permissionId);

    const basePayload = {
      sub: user.id,
      tenantId: membership.tenantId,
      membershipId: membership.id,
      roleId: membership.roleId,
      roleKey: membership.role.key,
      platformRole: user.platformRole,
      iatMs: Date.now(),
    };

    return {
      accessToken: await this.signToken({ ...basePayload, typ: "access" }, "JWT_SECRET", "15m"),
      refreshToken: await this.signToken(
        { ...basePayload, typ: "refresh" },
        "JWT_REFRESH_SECRET",
        "7d",
      ),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roleId: membership.roleId,
        roleKey: membership.role.key,
        platformRole: user.platformRole,
      },
      tenant: {
        id: membership.tenant.id,
        slug: membership.tenant.slug,
        name: membership.tenant.name,
      },
      membership: {
        id: membership.id,
        role: membership.role.key,
        roleId: membership.roleId,
      },
      permissions,
    };
  }

  async refresh(refreshToken: string) {
    const payload = await this.verifyToken(refreshToken, "JWT_REFRESH_SECRET");
    if (payload.typ !== "refresh") throw new UnauthorizedException("Refresh token invalido.");

    if (!payload.membershipId && payload.platformRole !== "USER") {
      const user = await this.prisma.user.findFirst({
        where: { id: payload.sub, status: "ACTIVE", platformRole: { not: "USER" } },
      });
      if (!user) throw new UnauthorizedException("Sessao expirada.");
      return {
        accessToken: await this.signToken(
          {
            sub: user.id,
            tenantId: "",
            membershipId: "",
            roleId: "",
            roleKey: "platform_admin",
            platformRole: user.platformRole,
            iatMs: Date.now(),
            typ: "access",
          },
          "JWT_SECRET",
          "15m",
        ),
      };
    }

    const membership = await this.prisma.tenantMembership.findUnique({
      where: { id: payload.membershipId },
      include: { user: true, tenant: true, role: true },
    });
    if (!membership || membership.status !== "ACTIVE" || membership.user.status !== "ACTIVE") {
      throw new UnauthorizedException("Sessao expirada.");
    }
    if (!["ACTIVE", "TRIAL"].includes(membership.tenant.status)) {
      throw new UnauthorizedException("Tenant inativo.");
    }
    if (
      membership.tenant.authRevokedAt &&
      payload.iatMs &&
      payload.iatMs < membership.tenant.authRevokedAt.getTime()
    ) {
      throw new UnauthorizedException("Sessao revogada.");
    }

    return {
      accessToken: await this.signToken(
        {
          sub: membership.userId,
          tenantId: membership.tenantId,
          membershipId: membership.id,
          roleId: membership.roleId,
          roleKey: membership.role.key,
          platformRole: membership.user.platformRole,
          iatMs: Date.now(),
          typ: "access",
        },
        "JWT_SECRET",
        "15m",
      ),
    };
  }

  async me(membershipId: string) {
    if (!membershipId) {
      throw new ForbiddenException({
        code: "PLATFORM_CONTEXT_REQUIRES_PLATFORM_API",
        message: "Use /api/platform para plano de controle.",
      });
    }
    const membership = await this.prisma.tenantMembership.findUniqueOrThrow({
      where: { id: membershipId },
      include: {
        user: true,
        tenant: true,
        role: { include: { permissions: { select: { permissionId: true } } } },
        departments: { include: { department: true } },
      },
    });
    const permissions = membership.role.permissions.map((item) => item.permissionId);

    return {
      user: {
        id: membership.user.id,
        email: membership.user.email,
        name: membership.user.name,
        roleId: membership.roleId,
        roleKey: membership.role.key,
        roleName: membership.role.name,
        platformRole: membership.user.platformRole,
      },
      tenant: {
        id: membership.tenant.id,
        slug: membership.tenant.slug,
        name: membership.tenant.name,
      },
      membership: {
        id: membership.id,
        role: membership.role.key,
        roleId: membership.roleId,
      },
      departments: membership.departments.map((item) => ({
        id: item.department.id,
        name: item.department.name,
        description: item.department.description,
        color: item.department.color,
        active: item.department.active,
      })),
      permissions,
      capabilities: {
        canManageTenant: permissions.includes("users.manage"),
        canOperateInbox: permissions.some((permission) => permission.startsWith("chat.")),
      },
    };
  }

  async verifyToken(token: string, secretName: "JWT_SECRET" | "JWT_REFRESH_SECRET") {
    return this.jwt.verifyAsync<JwtPayload>(token, {
      secret: this.requiredSecret(secretName),
    });
  }

  private signToken(
    payload: JwtPayload,
    secretName: "JWT_SECRET" | "JWT_REFRESH_SECRET",
    expiresIn: JwtSignOptions["expiresIn"],
  ) {
    return this.jwt.signAsync(payload, {
      secret: this.requiredSecret(secretName),
      expiresIn,
    });
  }

  private requiredSecret(name: "JWT_SECRET" | "JWT_REFRESH_SECRET") {
    const value = this.config.get<string>(name);
    if (!value || value.startsWith("change-me")) {
      throw new Error(`${name} must be configured with a non-placeholder value.`);
    }
    return value;
  }

  private invalidCredentials(email: string) {
    this.recordFailedLogin(email);
    return new UnauthorizedException({
      code: "INVALID_CREDENTIALS",
      message: "E-mail ou senha invalidos.",
    });
  }

  private assertLoginRateLimit(email: string) {
    const now = Date.now();
    const entry = this.failedLoginAttempts.get(email);
    if (!entry || entry.resetAt <= now) return;
    if (entry.count >= 5) {
      throw new HttpException(
        {
          code: "TOO_MANY_LOGIN_ATTEMPTS",
          message: "Muitas tentativas de acesso. Aguarde e tente novamente.",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private recordFailedLogin(email: string) {
    const now = Date.now();
    const entry = this.failedLoginAttempts.get(email);
    if (!entry || entry.resetAt <= now) {
      this.failedLoginAttempts.set(email, { count: 1, resetAt: now + 60_000 });
      return;
    }
    entry.count += 1;
  }
}
