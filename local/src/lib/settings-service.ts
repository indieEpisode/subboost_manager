import { prisma } from "./prisma";

export type LocalSettingValues = {
  forceRefreshOnFetch: boolean;
  forceRefreshMinIntervalSeconds: number;
};

const SETTING_ID = "global";
// 最小刷新间隔的下限：避免设成 0 退化为「每次拉取都刷」，拖垮服务器与上游。
const MIN_INTERVAL_FLOOR_SECONDS = 60;

const DEFAULT_SETTINGS: LocalSettingValues = {
  forceRefreshOnFetch: false,
  forceRefreshMinIntervalSeconds: 600,
};

export async function getLocalSettings(): Promise<LocalSettingValues> {
  try {
    const row = await prisma.localSetting.findUnique({ where: { id: SETTING_ID } });
    if (!row) return { ...DEFAULT_SETTINGS };
    return {
      forceRefreshOnFetch: row.forceRefreshOnFetch,
      forceRefreshMinIntervalSeconds: row.forceRefreshMinIntervalSeconds,
    };
  } catch {
    // 设置表不可用（例如迁移尚未应用）时降级为默认值，避免影响订阅拉取主流程。
    return { ...DEFAULT_SETTINGS };
  }
}

function normalizeInterval(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric) || numeric < MIN_INTERVAL_FLOOR_SECONDS) {
    throw new Error(`最小刷新间隔必须是不小于 ${MIN_INTERVAL_FLOOR_SECONDS} 秒的整数`);
  }
  return numeric;
}

export async function updateLocalSettings(input: unknown): Promise<LocalSettingValues> {
  const obj = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const data: Partial<LocalSettingValues> = {};
  if ("forceRefreshOnFetch" in obj) {
    data.forceRefreshOnFetch = Boolean(obj.forceRefreshOnFetch);
  }
  if ("forceRefreshMinIntervalSeconds" in obj) {
    data.forceRefreshMinIntervalSeconds = normalizeInterval(obj.forceRefreshMinIntervalSeconds);
  }
  const row = await prisma.localSetting.upsert({
    where: { id: SETTING_ID },
    create: { id: SETTING_ID, ...DEFAULT_SETTINGS, ...data },
    update: data,
  });
  return {
    forceRefreshOnFetch: row.forceRefreshOnFetch,
    forceRefreshMinIntervalSeconds: row.forceRefreshMinIntervalSeconds,
  };
}

/** 判断本次拉取是否应触发强制刷新：开关开 + 距上次刷新已超过最小间隔（或从未刷新过）。 */
export function shouldForceRefresh(
  settings: LocalSettingValues,
  lastUpdatedAt: Date | null,
  now: Date
): boolean {
  if (!settings.forceRefreshOnFetch) return false;
  if (!lastUpdatedAt) return true;
  return now.getTime() - lastUpdatedAt.getTime() >= settings.forceRefreshMinIntervalSeconds * 1000;
}
