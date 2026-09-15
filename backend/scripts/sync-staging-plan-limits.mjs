import { PrismaClient } from "../src/generated/prisma/index.js";

const prisma = new PrismaClient();

const planCode = process.env.STAGING_PLAN_CODE?.trim() || "professional";
const maxConnections = readLimit(process.env.STAGING_MAX_CONNECTIONS, 5);
const subscriptionStatuses = ["TRIALING", "ACTIVE", "PAST_DUE", "SUSPENDED"];

try {
  const plan = await prisma.plan.findUnique({ where: { code: planCode } });
  if (!plan) {
    console.log(JSON.stringify({ ok: false, planCode, error: "plan_not_found" }, null, 2));
    process.exitCode = 1;
  } else {
    const nextPlanLimits = mergeLimit(plan.limits, maxConnections);
    await prisma.plan.update({
      where: { id: plan.id },
      data: { limits: nextPlanLimits },
    });

    const subscriptions = await prisma.tenantSubscription.findMany({
      where: { planId: plan.id, status: { in: subscriptionStatuses } },
      select: { id: true, tenantId: true, limitsSnapshot: true },
    });

    for (const subscription of subscriptions) {
      await prisma.tenantSubscription.update({
        where: { id: subscription.id },
        data: { limitsSnapshot: mergeLimit(subscription.limitsSnapshot, maxConnections) },
      });
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          planCode,
          maxConnections,
          updatedPlanId: plan.id,
          updatedSubscriptions: subscriptions.length,
        },
        null,
        2,
      ),
    );
  }
} finally {
  await prisma.$disconnect();
}

function mergeLimit(value, maxConnections) {
  const current = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return { ...current, maxConnections };
}

function readLimit(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}
