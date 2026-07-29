import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService, type JwtSignOptions } from "@nestjs/jwt";
import { compare } from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { JwtPayload } from "./auth.types";
import { LoginDto } from "./dto/login.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
      include: { memberships: { include: { tenant: true } } },
    });
    if (!user || user.status !== "ACTIVE")
      throw new UnauthorizedException("Credenciais invalidas.");

    const validPassword = await compare(dto.password, user.passwordHash);
    if (!validPassword) throw new UnauthorizedException("Credenciais invalidas.");

    const membership = dto.tenantSlug
      ? user.memberships.find((item) => item.tenant.slug === dto.tenantSlug)
      : user.memberships[0];
    if (!membership) throw new UnauthorizedException("Tenant nao autorizado para este usuario.");

    const basePayload = {
      sub: user.id,
      tenantId: membership.tenantId,
      membershipId: membership.id,
      role: membership.role,
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
        role: membership.role,
      },
      tenant: {
        id: membership.tenant.id,
        slug: membership.tenant.slug,
        name: membership.tenant.name,
      },
    };
  }

  async refresh(refreshToken: string) {
    const payload = await this.verifyToken(refreshToken, "JWT_REFRESH_SECRET");
    if (payload.typ !== "refresh") throw new UnauthorizedException("Refresh token invalido.");

    const membership = await this.prisma.tenantMembership.findUnique({
      where: { id: payload.membershipId },
      include: { user: true, tenant: true },
    });
    if (!membership || membership.user.status !== "ACTIVE") {
      throw new UnauthorizedException("Sessao expirada.");
    }

    return {
      accessToken: await this.signToken(
        {
          sub: membership.userId,
          tenantId: membership.tenantId,
          membershipId: membership.id,
          role: membership.role,
          typ: "access",
        },
        "JWT_SECRET",
        "15m",
      ),
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
}
