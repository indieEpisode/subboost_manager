import { getCurrentAdmin, isSetupRequired } from "@local/lib/auth";
import { json } from "@local/lib/http";
import { prisma } from "@local/lib/prisma";
import { resolveAccountQuota } from "@local/lib/quota-policy";

export async function GET() {
  const [setupRequired, admin] = await Promise.all([isSetupRequired(), getCurrentAdmin()]);
  if (!admin) {
    return json({ setupRequired, authenticated: false, user: null });
  }

  const [account, subscriptionCount, templateCount] = await Promise.all([
    prisma.localAdmin.findUnique({
      where: { id: admin.id },
      select: {
        createdAt: true,
        maxSubscriptions: true,
        maxNodesPerSubscription: true,
        pullRateLimitMax: true,
        pullRateWindowSeconds: true,
        pullCooldownSeconds: true,
      },
    }),
    prisma.subscription.count({ where: { ownerId: admin.id } }),
    prisma.localTemplate.count({ where: { ownerId: admin.id } }),
  ]);

  const quota = resolveAccountQuota(account);
  const now = new Date().toISOString();
  return json({
    setupRequired,
    authenticated: true,
    user: {
      id: admin.id,
      username: admin.username,
      name: admin.username,
      avatarUrl: null,
      trustLevel: 4,
      aiAssistantEnabled: false,
      isAdmin: admin.role === "admin",
      isBanned: false,
      active: true,
      silenced: false,
      saveRequirementSatisfied: true,
      saveRequirementSatisfiedAt: now,
      createdAt: account?.createdAt ? account.createdAt.toISOString() : now,
      updatedAt: now,
      accounts: [],
      quota: {
        maxSubscriptions: quota.maxSubscriptions,
        maxNodesPerSubscription: quota.maxNodesPerSubscription,
        maxCustomTemplates: 9999,
        maxImportSourcesPerType: 9999,
        canUseSubscriptionLink: true,
      },
      subscriptionCount,
      templateCount,
    },
  });
}
