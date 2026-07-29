import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Request } from "express";
import { AuthService } from "./auth.service";
import { AuthenticatedUser } from "./auth.types";

export type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    const [scheme, token] = header?.split(" ") ?? [];
    if (scheme !== "Bearer" || !token) throw new UnauthorizedException("Token ausente.");

    const payload = await this.auth.verifyToken(token, "JWT_SECRET");
    if (payload.typ !== "access") throw new UnauthorizedException("Token invalido.");

    request.user = {
      userId: payload.sub,
      tenantId: payload.tenantId,
      membershipId: payload.membershipId,
      role: payload.role,
    };
    return true;
  }
}
