import { hash } from "bcryptjs";
import { PlatformRole, type PrismaClient } from "../src/generated/prisma";

export const TRIXUS_ENVIRONMENTS = ["production", "homologation", "staging"] as const;

export type TrixusEnvironment = (typeof TRIXUS_ENVIRONMENTS)[number];

type PlatformAdminClient = Pick<PrismaClient, "user">;

type PlatformAdminInput = {
  email?: string;
  password?: string;
};

export function resolveTrixusEnvironment(value?: string): TrixusEnvironment {
  const normalized = value?.trim();
  if (!TRIXUS_ENVIRONMENTS.includes(normalized as TrixusEnvironment)) {
    throw new Error("TRIXUS_ENVIRONMENT_INVALID: use production, homologation or staging.");
  }
  return normalized as TrixusEnvironment;
}

export async function ensurePlatformAdmin(
  client: PlatformAdminClient,
  input: PlatformAdminInput,
): Promise<"created" | "unchanged"> {
  const email = input.email?.trim().toLowerCase();
  if (!email) {
    throw new Error("TRIXUS_PLATFORM_ADMIN_EMAIL_REQUIRED");
  }

  const findExisting = () =>
    client.user.findMany({
      where: { email: { equals: email, mode: "insensitive" } },
      take: 2,
    });
  const existingMatches = await findExisting();
  if (existingMatches.length > 1) {
    throw new Error("PLATFORM_ADMIN_EMAIL_AMBIGUOUS");
  }
  const existing = existingMatches[0];
  if (existing) {
    if (existing.platformRole !== PlatformRole.ADMIN) {
      throw new Error("PLATFORM_ADMIN_EMAIL_ALREADY_USED_BY_NON_ADMIN");
    }
    return "unchanged";
  }

  if (!input.password) {
    throw new Error("TRIXUS_PLATFORM_ADMIN_PASSWORD_REQUIRED_FOR_CREATION");
  }

  try {
    await client.user.create({
      data: {
        email,
        name: "Platform Admin",
        passwordHash: await hash(input.password, 12),
        status: "ACTIVE",
        platformRole: PlatformRole.ADMIN,
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const concurrentMatches = await findExisting();
    if (concurrentMatches.length !== 1) throw error;
    if (concurrentMatches[0]?.platformRole !== PlatformRole.ADMIN) {
      throw new Error("PLATFORM_ADMIN_EMAIL_ALREADY_USED_BY_NON_ADMIN");
    }
    return "unchanged";
  }
  return "created";
}

function isUniqueConstraintError(error: unknown): error is { code: "P2002" } {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}
