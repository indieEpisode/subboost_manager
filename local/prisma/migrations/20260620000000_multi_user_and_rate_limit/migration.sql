-- 多用户：LocalAdmin 增加角色、禁用标记与每用户配额/限流阈值。
-- 现有记录 role 默认 'admin'，历史单管理员无缝成为管理员。
ALTER TABLE "LocalAdmin" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE "LocalAdmin" ADD COLUMN "disabledAt" TIMESTAMP(3);
ALTER TABLE "LocalAdmin" ADD COLUMN "maxSubscriptions" INTEGER;
ALTER TABLE "LocalAdmin" ADD COLUMN "maxNodesPerSubscription" INTEGER;
ALTER TABLE "LocalAdmin" ADD COLUMN "pullRateLimitMax" INTEGER;
ALTER TABLE "LocalAdmin" ADD COLUMN "pullRateWindowSeconds" INTEGER;
ALTER TABLE "LocalAdmin" ADD COLUMN "pullCooldownSeconds" INTEGER;

-- 限流运行态：拉取（config.yaml）与手动刷新各自的固定窗口计数 + 冷却到期时间。
ALTER TABLE "Subscription" ADD COLUMN "pullWindowStartedAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "pullCountInWindow" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Subscription" ADD COLUMN "pullThrottledUntil" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "pullThrottleTrippedAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "refreshWindowStartedAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "refreshCountInWindow" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Subscription" ADD COLUMN "refreshThrottledUntil" TIMESTAMP(3);

-- 看板按 pullThrottledUntil 查"当前被限流的订阅"。
CREATE INDEX "Subscription_pullThrottledUntil_idx" ON "Subscription"("pullThrottledUntil");
