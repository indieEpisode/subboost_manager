import type { FixedWindowConfig } from "@subboost/server-core/subscription";

/**
 * 拉取限流的出厂默认值与「每用户配额覆盖」解析。
 *
 * 拉取（config.yaml）默认：10 分钟内超过 20 次 → 冷却 1 天。
 * 这些是出厂默认；管理员可在用户管理里按用户覆盖（存 LocalAdmin 的 pull* 字段，null = 用默认）。
 */
export const DEFAULT_PULL_RATE_LIMIT_MAX = 20;
export const DEFAULT_PULL_RATE_WINDOW_SECONDS = 600;
export const DEFAULT_PULL_COOLDOWN_SECONDS = 86_400;

/**
 * 手动刷新默认：10 分钟内超过 10 次 → 冷却 1 小时。
 * 手动刷新是登录端点、低频，用全局默认即可，不进每用户配额（避免字段膨胀）。
 */
export const DEFAULT_REFRESH_RATE_LIMIT_MAX = 10;
export const DEFAULT_REFRESH_RATE_WINDOW_SECONDS = 600;
export const DEFAULT_REFRESH_COOLDOWN_SECONDS = 3_600;

/** 每用户拉取限流覆盖（来自 LocalAdmin 的 pull* 字段，null = 用默认）。 */
export type UserPullRateOverride = {
  pullRateLimitMax: number | null;
  pullRateWindowSeconds: number | null;
  pullCooldownSeconds: number | null;
};

function positiveOr(value: number | null | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

/** 解析某用户的拉取限流配置：有覆盖用覆盖，否则用出厂默认。 */
export function resolvePullRateLimitConfig(override?: UserPullRateOverride | null): FixedWindowConfig {
  return {
    limit: positiveOr(override?.pullRateLimitMax, DEFAULT_PULL_RATE_LIMIT_MAX),
    windowSeconds: positiveOr(override?.pullRateWindowSeconds, DEFAULT_PULL_RATE_WINDOW_SECONDS),
    cooldownSeconds: positiveOr(override?.pullCooldownSeconds, DEFAULT_PULL_COOLDOWN_SECONDS),
  };
}

/** 手动刷新限流配置（全局默认）。 */
export function resolveRefreshRateLimitConfig(): FixedWindowConfig {
  return {
    limit: DEFAULT_REFRESH_RATE_LIMIT_MAX,
    windowSeconds: DEFAULT_REFRESH_RATE_WINDOW_SECONDS,
    cooldownSeconds: DEFAULT_REFRESH_COOLDOWN_SECONDS,
  };
}

/**
 * 解析管理员输入的配额/阈值：空 → null（表示用默认）；正整数 → 取整；其它 → 抛错。
 * 用于创建/修改用户时校验 maxSubscriptions / pullRateLimitMax 等输入。
 */
export function normalizeQuotaInput(value: unknown, label: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric) || numeric <= 0) {
    throw new Error(`${label}必须是正整数`);
  }
  return numeric;
}
