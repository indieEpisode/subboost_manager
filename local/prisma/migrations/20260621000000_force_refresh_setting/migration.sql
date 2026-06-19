-- 单例全局设置：客户端拉取时是否强制先刷新订阅，以及最小刷新间隔。
CREATE TABLE "LocalSetting" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "forceRefreshOnFetch" BOOLEAN NOT NULL DEFAULT false,
  "forceRefreshMinIntervalSeconds" INTEGER NOT NULL DEFAULT 600,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LocalSetting_pkey" PRIMARY KEY ("id")
);
