import { prisma } from "./prisma";
import {
  DEFAULT_PULL_COOLDOWN_SECONDS,
  DEFAULT_PULL_RATE_LIMIT_MAX,
  DEFAULT_PULL_RATE_WINDOW_SECONDS,
} from "./rate-limit-policy";

/**
 * 账户配额：订阅数 / 每订阅节点数 / 拉取限流阈值。
 * 字段为 null 表示该用户用出厂默认。本期对 maxSubscriptions 做创建时强制校验；
 * maxNodesPerSubscription 仅用于展示与全局上限参照（按用户裁剪节点本期不做）。
 */
export const DEFAULT_MAX_SUBSCRIPTIONS = 9999;
export const DEFAULT_MAX_NODES_PER_SUBSCRIPTION = 10000;

export type AccountQuotaFields = {
  maxSubscriptions: number | null;
  maxNodesPerSubscription: number | null;
  pullRateLimitMax: number | null;
  pullRateWindowSeconds: number | null;
  pullCooldownSeconds: number | null;
};

export type ResolvedAccountQuota = {
  maxSubscriptions: number;
  maxNodesPerSubscription: number;
  pullRateLimitMax: number;
  pullRateWindowSeconds: number;
  pullCooldownSeconds: number;
};

function positiveOr(value: number | null | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

/** 把存储的配额字段（含 null）解析为带默认值的有效配额。 */
export function resolveAccountQuota(fields: AccountQuotaFields | null | undefined): ResolvedAccountQuota {
  return {
    maxSubscriptions: positiveOr(fields?.maxSubscriptions, DEFAULT_MAX_SUBSCRIPTIONS),
    maxNodesPerSubscription: positiveOr(fields?.maxNodesPerSubscription, DEFAULT_MAX_NODES_PER_SUBSCRIPTION),
    pullRateLimitMax: positiveOr(fields?.pullRateLimitMax, DEFAULT_PULL_RATE_LIMIT_MAX),
    pullRateWindowSeconds: positiveOr(fields?.pullRateWindowSeconds, DEFAULT_PULL_RATE_WINDOW_SECONDS),
    pullCooldownSeconds: positiveOr(fields?.pullCooldownSeconds, DEFAULT_PULL_COOLDOWN_SECONDS),
  };
}

/** 创建订阅前检查订阅数配额；超限抛错（信息面向用户）。 */
export async function assertSubscriptionQuotaAvailable(
  ownerId: string,
  maxSubscriptions: number | null
): Promise<void> {
  const limit = positiveOr(maxSubscriptions, DEFAULT_MAX_SUBSCRIPTIONS);
  const current = await prisma.subscription.count({ where: { ownerId } });
  if (current >= limit) {
    throw new Error(`已达到订阅数量上限（${limit}），请联系管理员调整配额。`);
  }
}
