import { Role } from "../generated/prisma";

export type JwtPayload = {
  sub: string;
  tenantId: string;
  membershipId: string;
  role: Role;
  typ: "access" | "refresh";
};

export type AuthenticatedUser = {
  userId: string;
  tenantId: string;
  membershipId: string;
  role: Role;
};
