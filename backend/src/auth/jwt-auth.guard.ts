import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Request } from "express";
import { AuthService } from "./auth.service";
import type { AuthenticatedUser } from "./auth.types";

export type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    const [scheme, token] = header?.split(" ") ?? [];
    if (scheme !== "Bearer" || !token) throw new UnauthorizedException("Token ausente.");

    const payload = await this.verifyAccessToken(token);
    if (payload.typ !== "access") throw new UnauthorizedException("Token invalido.");

    request.user = {
      userId: payload.sub,
      tenantId: payload.tenantId,
      membershipId: payload.membershipId,
      roleId: payload.roleId,
      roleKey: payload.roleKey,
      platformRole: payload.platformRole,
      iatMs: payload.iatMs,
      impersonationSessionId: payload.impersonationSessionId,
      actorPlatformUserId: payload.actorPlatformUserId,
    };
    return true;
  }

  private async verifyAccessToken(token: string) {
    try {
      return await this.auth.verifyToken(token, "JWT_SECRET");
    } catch {
      throw new UnauthorizedException("Token invalido.");
    }
  }
}
