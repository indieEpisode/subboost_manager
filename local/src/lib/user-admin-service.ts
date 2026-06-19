import bcrypt from "bcryptjs";
import { LOCAL_ADMIN_PASSWORD_MIN_LENGTH } from "./admin-credentials";
import { prisma } from "./prisma";
import { normalizeQuotaInput } from "./rate-limit-policy";

export type AdminUserQuota = {
  maxSubscriptions: number | null;
  maxNodesPerSubscription: number | null;
  pullRateLimitMax: number | null;
  pullRateWindowSeconds: number | null;
  pullCooldownSeconds: number | null;
};

export type AdminUserListItem = {
  id: string;
  username: string;
  role: string;
  disabled: boolean;
  disabledAt: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  subscriptionCount: number;
  templateCount: number;
  quota: AdminUserQuota;
};

const QUOTA_KEYS = [
  "maxSubscriptions",
  "maxNodesPerSubscription",
  "pullRateLimitMax",
  "pullRateWindowSeconds",
  "pullCooldownSeconds",
] as const;

const adminListSelect = {
  id: true,
  username: true,
  role: true,
  disabledAt: true,
  createdAt: true,
  lastLoginAt: true,
  maxSubscriptions: true,
  maxNodesPerSubscription: true,
  pullRateLimitMax: true,
  pullRateWindowSeconds: true,
  pullCooldownSeconds: true,
  _count: { select: { subscriptions: true, templates: true } },
} as const;

type AdminRow = {
  id: string;
  username: string;
  role: string;
  disabledAt: Date | null;
  createdAt: Date;
  lastLoginAt: Date | null;
  maxSubscriptions: number | null;
  maxNodesPerSubscription: number | null;
  pullRateLimitMax: number | null;
  pullRateWindowSeconds: number | null;
  pullCooldownSeconds: number | null;
  _count: { subscriptions: number; templates: number };
};

function mapAdmin(a: AdminRow): AdminUserListItem {
  return {
    id: a.id,
    username: a.username,
    role: a.role,
    disabled: Boolean(a.disabledAt),
    disabledAt: a.disabledAt ? a.disabledAt.toISOString() : null,
    createdAt: a.createdAt.toISOString(),
    lastLoginAt: a.lastLoginAt ? a.lastLoginAt.toISOString() : null,
    subscriptionCount: a._count.subscriptions,
    templateCount: a._count.templates,
    quota: {
      maxSubscriptions: a.maxSubscriptions,
      maxNodesPerSubscription: a.maxNodesPerSubscription,
      pullRateLimitMax: a.pullRateLimitMax,
      pullRateWindowSeconds: a.pullRateWindowSeconds,
      pullCooldownSeconds: a.pullCooldownSeconds,
    },
  };
}

function getString(input: unknown, key: string): string {
  if (!input || typeof input !== "object") return "";
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

function hasKey(input: unknown, key: string): boolean {
  return Boolean(input) && typeof input === "object" && key in (input as Record<string, unknown>);
}

function parseQuotaFromInput(input: unknown): AdminUserQuota {
  const obj = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return {
    maxSubscriptions: normalizeQuotaInput(obj.maxSubscriptions, "最大订阅数"),
    maxNodesPerSubscription: normalizeQuotaInput(obj.maxNodesPerSubscription, "每订阅最大节点数"),
    pullRateLimitMax: normalizeQuotaInput(obj.pullRateLimitMax, "拉取次数上限"),
    pullRateWindowSeconds: normalizeQuotaInput(obj.pullRateWindowSeconds, "拉取统计窗口（秒）"),
    pullCooldownSeconds: normalizeQuotaInput(obj.pullCooldownSeconds, "超限冷却时长（秒）"),
  };
}

function assertNewCredentials(username: string, password: string): void {
  if (!username) throw new Error("请输入用户名");
  if (username.length > 64) throw new Error("用户名过长（最多 64 个字符）");
  if (password.length < LOCAL_ADMIN_PASSWORD_MIN_LENGTH) {
    throw new Error(`密码至少需要 ${LOCAL_ADMIN_PASSWORD_MIN_LENGTH} 个字符`);
  }
}

/** 禁用/删除前确保系统至少保留一个启用的管理员，避免把自己锁死。 */
async function assertNotLastActiveAdmin(target: { role: string; disabledAt: Date | null }): Promise<void> {
  if (target.role !== "admin" || target.disabledAt) return; // 目标本就不是「启用的管理员」，无需保护
  const activeAdmins = await prisma.localAdmin.count({ where: { role: "admin", disabledAt: null } });
  if (activeAdmins <= 1) {
    throw new Error("系统必须保留至少一个启用的管理员。");
  }
}

async function fetchManagedUser(id: string): Promise<AdminUserListItem | null> {
  const admin = await prisma.localAdmin.findUnique({ where: { id }, select: adminListSelect });
  return admin ? mapAdmin(admin) : null;
}

export async function listManagedUsers(): Promise<AdminUserListItem[]> {
  const admins = await prisma.localAdmin.findMany({
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: adminListSelect,
  });
  return admins.map(mapAdmin);
}

export async function createManagedUser(input: unknown): Promise<AdminUserListItem> {
  const username = getString(input, "username");
  const password = getString(input, "password");
  assertNewCredentials(username, password);
  const quota = parseQuotaFromInput(input);

  const exists = await prisma.localAdmin.findUnique({ where: { username }, select: { id: true } });
  if (exists) throw new Error("用户名已存在，请换一个。");

  const passwordHash = await bcrypt.hash(password, 12);
  const created = await prisma.localAdmin.create({
    // 管理员创建的账号一律普通用户；提权不在本期范围。
    data: { username, passwordHash, role: "user", ...quota },
    select: { id: true },
  });
  const item = await fetchManagedUser(created.id);
  if (!item) throw new Error("用户创建后未能读取。");
  return item;
}

export async function updateManagedUser(
  id: string,
  input: unknown
): Promise<AdminUserListItem | null> {
  const target = await prisma.localAdmin.findUnique({
    where: { id },
    select: { id: true, role: true, disabledAt: true },
  });
  if (!target) return null;

  const data: Record<string, unknown> = {};

  const newPassword = getString(input, "password");
  if (newPassword) {
    if (newPassword.length < LOCAL_ADMIN_PASSWORD_MIN_LENGTH) {
      throw new Error(`密码至少需要 ${LOCAL_ADMIN_PASSWORD_MIN_LENGTH} 个字符`);
    }
    data.passwordHash = await bcrypt.hash(newPassword, 12);
  }

  if (hasKey(input, "disabled")) {
    const disabled = Boolean((input as Record<string, unknown>).disabled);
    if (disabled) {
      await assertNotLastActiveAdmin(target);
      data.disabledAt = target.disabledAt ?? new Date();
    } else {
      data.disabledAt = null;
    }
  }

  // 配额作为整体编辑：只要带了任一配额字段，就按提交内容整体覆盖（缺失字段视为「用默认」）。
  if (QUOTA_KEYS.some((key) => hasKey(input, key))) {
    Object.assign(data, parseQuotaFromInput(input));
  }

  if (Object.keys(data).length > 0) {
    await prisma.localAdmin.update({ where: { id }, data });
  }
  return fetchManagedUser(id);
}

export async function deleteManagedUser(actingAdminId: string, id: string): Promise<boolean> {
  if (id === actingAdminId) {
    throw new Error("不能删除当前登录的管理员账号。");
  }
  const target = await prisma.localAdmin.findUnique({
    where: { id },
    select: { id: true, role: true, disabledAt: true },
  });
  if (!target) return false;
  await assertNotLastActiveAdmin(target);
  // 外键 ON DELETE CASCADE：该用户的订阅与模板一并删除。
  await prisma.localAdmin.delete({ where: { id } });
  return true;
}

/** 管理员手动解除某订阅的限流（拉取与刷新都重置）。 */
export async function clearSubscriptionThrottle(id: string): Promise<boolean> {
  const row = await prisma.subscription.findUnique({ where: { id }, select: { id: true } });
  if (!row) return false;
  await prisma.subscription.update({
    where: { id },
    data: {
      pullThrottledUntil: null,
      pullWindowStartedAt: null,
      pullCountInWindow: 0,
      pullThrottleTrippedAt: null,
      refreshThrottledUntil: null,
      refreshWindowStartedAt: null,
      refreshCountInWindow: 0,
    },
  });
  return true;
}
