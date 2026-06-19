import { prisma } from "./prisma";
import { listManagedUsers, type AdminUserListItem } from "./user-admin-service";

export type AdminUserStat = AdminUserListItem & {
  /** 该用户当前被限流的订阅数。 */
  throttledCount: number;
  /** 该用户所有订阅当前窗口内的拉取计数之和（近似「近期拉取活跃度」）。 */
  recentPullCount: number;
  /** 该用户订阅最近一次被客户端拉取的时间。 */
  lastAccessedAt: string | null;
  /** 该用户开启了自动更新的订阅数。 */
  autoUpdateEnabledCount: number;
};

export type ThrottledSubscriptionItem = {
  id: string;
  name: string;
  ownerId: string;
  ownerUsername: string;
  pullThrottledUntil: string | null;
  refreshThrottledUntil: string | null;
  trippedAt: string | null;
};

export type AdminStats = {
  overview: {
    totalUsers: number;
    totalSubscriptions: number;
    totalTemplates: number;
    throttledSubscriptions: number;
    autoDisabledSubscriptions: number;
  };
  users: AdminUserStat[];
  throttledSubscriptions: ThrottledSubscriptionItem[];
};

type UserAgg = {
  throttledCount: number;
  recentPullCount: number;
  lastAccessedAtMs: number | null;
  autoUpdateEnabledCount: number;
};

/**
 * 汇总管理员看板数据，聚焦「拉取频率监控」。
 * 只查少量标量字段、不解密订阅内容，避免遍历时产生大量 CPU 开销。
 */
export async function buildAdminStats(now = new Date()): Promise<AdminStats> {
  const users = await listManagedUsers();
  const subs = await prisma.subscription.findMany({
    select: {
      id: true,
      ownerId: true,
      name: true,
      lastAccessedAt: true,
      autoUpdateInterval: true,
      pullThrottledUntil: true,
      refreshThrottledUntil: true,
      pullThrottleTrippedAt: true,
      pullCountInWindow: true,
      autoUpdateState: { select: { disabledAt: true } },
    },
  });

  const usernameById = new Map(users.map((u) => [u.id, u.username]));
  const agg = new Map<string, UserAgg>();
  for (const u of users) {
    agg.set(u.id, { throttledCount: 0, recentPullCount: 0, lastAccessedAtMs: null, autoUpdateEnabledCount: 0 });
  }

  const throttledList: ThrottledSubscriptionItem[] = [];
  let autoDisabledTotal = 0;
  const nowMs = now.getTime();

  for (const s of subs) {
    const pullThrottled = s.pullThrottledUntil != null && s.pullThrottledUntil.getTime() > nowMs;
    const refreshThrottled = s.refreshThrottledUntil != null && s.refreshThrottledUntil.getTime() > nowMs;
    const isThrottled = pullThrottled || refreshThrottled;
    if (isThrottled) {
      throttledList.push({
        id: s.id,
        name: s.name,
        ownerId: s.ownerId,
        ownerUsername: usernameById.get(s.ownerId) ?? "",
        pullThrottledUntil: pullThrottled ? s.pullThrottledUntil!.toISOString() : null,
        refreshThrottledUntil: refreshThrottled ? s.refreshThrottledUntil!.toISOString() : null,
        trippedAt: s.pullThrottleTrippedAt ? s.pullThrottleTrippedAt.toISOString() : null,
      });
    }
    if (s.autoUpdateState?.disabledAt) autoDisabledTotal++;

    const a = agg.get(s.ownerId);
    if (a) {
      if (isThrottled) a.throttledCount++;
      a.recentPullCount += s.pullCountInWindow ?? 0;
      if (s.autoUpdateInterval != null) a.autoUpdateEnabledCount++;
      if (s.lastAccessedAt) {
        const t = s.lastAccessedAt.getTime();
        if (a.lastAccessedAtMs === null || t > a.lastAccessedAtMs) a.lastAccessedAtMs = t;
      }
    }
  }

  const userStats: AdminUserStat[] = users.map((u) => {
    const a = agg.get(u.id)!;
    return {
      ...u,
      throttledCount: a.throttledCount,
      recentPullCount: a.recentPullCount,
      lastAccessedAt: a.lastAccessedAtMs != null ? new Date(a.lastAccessedAtMs).toISOString() : null,
      autoUpdateEnabledCount: a.autoUpdateEnabledCount,
    };
  });

  // 限流告警区按触发时间倒序（最新触发的排在前）。
  throttledList.sort((x, y) => (y.trippedAt ?? "").localeCompare(x.trippedAt ?? ""));

  return {
    overview: {
      totalUsers: users.length,
      totalSubscriptions: subs.length,
      totalTemplates: users.reduce((sum, u) => sum + u.templateCount, 0),
      throttledSubscriptions: throttledList.length,
      autoDisabledSubscriptions: autoDisabledTotal,
    },
    users: userStats,
    throttledSubscriptions: throttledList,
  };
}
