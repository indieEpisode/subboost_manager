/**
 * 订阅拉取频率限流：固定窗口计数 + 超阈值冷却。
 *
 * 纯逻辑、不依赖 Prisma/Next：给定「当前时间 + 当前限流状态 + 阈值配置」，
 * 算出「是否放行 + 下一个状态 + 建议的 Retry-After」。持久化由调用方负责。
 *
 * 模式参照同目录的 auto-update-failure.ts（同样是无副作用的状态推进函数）。
 */

export type FixedWindowState = {
  /** 当前计数窗口的起点；null 表示尚未开始计数。 */
  windowStartedAt: Date | null;
  /** 当前窗口内已累计的请求次数。 */
  countInWindow: number;
  /** 冷却到期时间；在此之前的请求一律拒绝。null 表示未被限流。 */
  throttledUntil: Date | null;
};

export type FixedWindowConfig = {
  /** 窗口内允许的最大次数；超过即触发冷却。<=0 表示不限流。 */
  limit: number;
  /** 计数窗口长度（秒）。<=0 表示不限流。 */
  windowSeconds: number;
  /** 触发后冷却时长（秒）。 */
  cooldownSeconds: number;
};

export type FixedWindowDecision = {
  /** 是否放行本次请求。 */
  allowed: boolean;
  /** 被拒时建议返回的 Retry-After（秒，向上取整、至少 1）；放行时为 0。 */
  retryAfterSeconds: number;
  /** 本次请求是否刚刚触发限流（用于记录触发时间 / 告警）。 */
  justTripped: boolean;
  /** 调用方应持久化的新状态。 */
  nextState: FixedWindowState;
};

function isRateLimitDisabled(config: FixedWindowConfig): boolean {
  return (
    !Number.isFinite(config.limit) ||
    config.limit <= 0 ||
    !Number.isFinite(config.windowSeconds) ||
    config.windowSeconds <= 0
  );
}

function secondsUntil(now: Date, until: Date): number {
  return Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 1000));
}

/**
 * 推进一次固定窗口限流判断。
 *
 * 规则：
 * 1. 配置无效（未设阈值）→ 不限流，状态不变。
 * 2. 冷却中（now < throttledUntil）→ 拒绝，不计数、不改冷却到期。
 * 3. 窗口已过期或未开始 → 开新窗口、计数置 1。
 * 4. 否则计数 +1；超过 limit → 触发冷却并拒绝（justTripped）。
 * 5. 未超过 → 放行，并清除已过期的冷却标记。
 */
export function evaluateFixedWindow(
  now: Date,
  state: FixedWindowState,
  config: FixedWindowConfig
): FixedWindowDecision {
  if (isRateLimitDisabled(config)) {
    return { allowed: true, retryAfterSeconds: 0, justTripped: false, nextState: state };
  }

  // 冷却中：直接拒绝，不计数、不改变冷却到期时间。
  if (state.throttledUntil && now.getTime() < state.throttledUntil.getTime()) {
    return {
      allowed: false,
      retryAfterSeconds: secondsUntil(now, state.throttledUntil),
      justTripped: false,
      nextState: state,
    };
  }

  // 窗口已过期或尚未开始 → 开新窗口。
  const windowMs = config.windowSeconds * 1000;
  const windowExpired =
    !state.windowStartedAt || now.getTime() - state.windowStartedAt.getTime() >= windowMs;
  const windowStartedAt = windowExpired ? now : state.windowStartedAt;
  const countInWindow = windowExpired ? 1 : state.countInWindow + 1;

  // 超过阈值 → 触发冷却。
  if (countInWindow > config.limit) {
    const throttledUntil = new Date(now.getTime() + config.cooldownSeconds * 1000);
    return {
      allowed: false,
      retryAfterSeconds: secondsUntil(now, throttledUntil),
      justTripped: true,
      nextState: { windowStartedAt: now, countInWindow, throttledUntil },
    };
  }

  // 放行：清除可能已过期的冷却标记。
  return {
    allowed: true,
    retryAfterSeconds: 0,
    justTripped: false,
    nextState: { windowStartedAt, countInWindow, throttledUntil: null },
  };
}
