import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  hash: vi.fn(),
  localAdmin: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
  subscription: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  localSetting: { findUnique: vi.fn(), upsert: vi.fn() },
}));
vi.mock("bcryptjs", () => ({ default: { hash: mocks.hash } }));
vi.mock("./prisma", () => ({ prisma: mocks }));
import { createManagedUser, updateManagedUser, deleteManagedUser, clearSubscriptionThrottle, listManagedUsers } from "./user-admin-service";
import { buildAdminStats } from "./admin-stats-service";
import { getLocalSettings, updateLocalSettings, shouldForceRefresh } from "./settings-service";
import { normalizeQuotaInput } from "./rate-limit-policy";

const row = (values = {}) => ({
  id: "user-2", username: "user", role: "user", disabledAt: null,
  createdAt: new Date("2026-06-01"), lastLoginAt: null,
  maxSubscriptions: 1, maxNodesPerSubscription: null, pullRateLimitMax: 2,
  pullRateWindowSeconds: 600, pullCooldownSeconds: 3600,
  _count: { subscriptions: 1, templates: 2 }, ...values,
});
describe("fork account and global-settings policies", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.hash.mockResolvedValue("hashed-password");
    mocks.localAdmin.findUnique.mockResolvedValue(row());
    mocks.localAdmin.findMany.mockResolvedValue([row()]);
    mocks.localAdmin.create.mockResolvedValue({ id: "user-2" });
    mocks.localAdmin.count.mockResolvedValue(2);
    mocks.localSetting.upsert.mockImplementation(async ({ create, update }) => ({ ...create, ...update }));
  });
  it("lists quota and disabled-state metadata without password hashes", async () => {
    mocks.localAdmin.findMany.mockResolvedValueOnce([row({ disabledAt: new Date(), lastLoginAt: new Date() })]);
    const list = await listManagedUsers();
    expect(list[0]).toMatchObject({ disabled: true, subscriptionCount: 1, templateCount: 2, quota: { maxSubscriptions: 1 } });
    expect(list[0]).not.toHaveProperty("passwordHash");
  });
  it("creates only ordinary accounts and stores hashed passwords and quotas", async () => {
    mocks.localAdmin.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(row());
    await expect(createManagedUser({ username: " user ", password: "long-password", role: "admin", maxSubscriptions: "1" })).resolves.toMatchObject({ role: "user" });
    expect(mocks.localAdmin.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: "user", passwordHash: "hashed-password", maxSubscriptions: 1 }) }));
    expect(mocks.hash).toHaveBeenCalledWith("long-password", 12);
  });
  it("rejects invalid credentials, duplicate names and invalid quotas", async () => {
    for (const input of [null, { username: "x".repeat(65), password: "long-password" }, { username: "x", password: "short" }]) {
      await expect(createManagedUser(input)).rejects.toThrow();
    }
    await expect(createManagedUser({ username: "user", password: "long-password" })).rejects.toThrow("用户名已存在");
    for (const input of [0, -1, 1.5, "bad", Infinity]) expect(() => normalizeQuotaInput(input, "配额")).toThrow();
    for (const input of [null, undefined, ""]) expect(normalizeQuotaInput(input, "配额")).toBeNull();
    expect(normalizeQuotaInput("2", "配额")).toBe(2);
    expect(normalizeQuotaInput(2, "配额")).toBe(2);
    mocks.localAdmin.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    await expect(createManagedUser({ username: "new", password: "long-password" })).rejects.toThrow("创建后");
  });
  it("supports reset, quota changes, disable and re-enable while protecting the last active admin", async () => {
    await updateManagedUser("user-2", { password: "new-long-password", disabled: true, maxSubscriptions: 3 });
    expect(mocks.localAdmin.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ passwordHash: "hashed-password", disabledAt: expect.any(Date), maxSubscriptions: 3, pullRateLimitMax: null }) }));
    await updateManagedUser("user-2", { disabled: false });
    expect(mocks.localAdmin.update).toHaveBeenLastCalledWith({ where: { id: "user-2" }, data: { disabledAt: null } });
    await expect(updateManagedUser("user-2", { password: "short" })).rejects.toThrow("密码至少");
    mocks.localAdmin.findUnique.mockResolvedValueOnce(null);
    await expect(updateManagedUser("missing", {})).resolves.toBeNull();
    const calls = mocks.localAdmin.update.mock.calls.length;
    await updateManagedUser("user-2", {});
    expect(mocks.localAdmin.update).toHaveBeenCalledTimes(calls);
    mocks.localAdmin.findUnique.mockResolvedValueOnce(row({ role: "admin" }));
    mocks.localAdmin.count.mockResolvedValueOnce(1);
    await expect(updateManagedUser("admin", { disabled: true })).rejects.toThrow("至少一个启用的管理员");
    const disabledAt = new Date();
    mocks.localAdmin.findUnique.mockResolvedValueOnce(row({ role: "admin", disabledAt }));
    await updateManagedUser("admin", { disabled: true });
    expect(mocks.localAdmin.update).toHaveBeenLastCalledWith({ where: { id: "admin" }, data: { disabledAt } });
    mocks.localAdmin.findUnique.mockResolvedValueOnce(row({ role: "admin" }));
    await updateManagedUser("other-admin", { disabled: true });
  });
  it("prevents self-deletion and deletion of the last admin, and resets both throttles", async () => {
    await expect(deleteManagedUser("admin", "admin")).rejects.toThrow("当前登录");
    mocks.localAdmin.findUnique.mockResolvedValueOnce(null);
    await expect(deleteManagedUser("admin", "missing")).resolves.toBe(false);
    mocks.localAdmin.findUnique.mockResolvedValueOnce(row({ role: "admin" }));
    mocks.localAdmin.count.mockResolvedValueOnce(1);
    await expect(deleteManagedUser("admin", "other-admin")).rejects.toThrow("至少一个");
    await expect(deleteManagedUser("admin", "user-2")).resolves.toBe(true);
    mocks.subscription.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "sub-1" });
    await expect(clearSubscriptionThrottle("missing")).resolves.toBe(false);
    await expect(clearSubscriptionThrottle("sub-1")).resolves.toBe(true);
    expect(mocks.subscription.update).toHaveBeenCalledWith({ where: { id: "sub-1" }, data: expect.objectContaining({ pullThrottledUntil: null, refreshThrottledUntil: null, pullCountInWindow: 0, refreshCountInWindow: 0 }) });
  });
  it("aggregates throttles, auto-update states and activity for each account", async () => {
    const now = new Date("2026-10-15T00:00:00Z");
    const future = new Date(now.getTime() + 10000);
    mocks.subscription.findMany.mockResolvedValue([
      { id: "pull", name: "Pull", ownerId: "user-2", pullThrottledUntil: future, refreshThrottledUntil: null, pullThrottleTrippedAt: now, pullCountInWindow: 2, lastAccessedAt: now, autoUpdateInterval: 600, autoUpdateState: { disabledAt: now } },
      { id: "refresh", name: "Refresh", ownerId: "user-2", pullThrottledUntil: null, refreshThrottledUntil: future, pullThrottleTrippedAt: null, pullCountInWindow: null, lastAccessedAt: new Date(now.getTime()-1000), autoUpdateInterval: null },
      { id: "unknown", name: "Unknown", ownerId: "missing", pullThrottledUntil: future, refreshThrottledUntil: null },
      { id: "inactive", name: "Inactive", ownerId: "user-2", pullThrottledUntil: now, refreshThrottledUntil: null, lastAccessedAt: null },
    ]);
    const result = await buildAdminStats(now);
    expect(result.overview).toMatchObject({ totalUsers: 1, totalSubscriptions: 4, totalTemplates: 2, throttledSubscriptions: 3, autoDisabledSubscriptions: 1 });
    expect(result.users[0]).toMatchObject({ throttledCount: 2, recentPullCount: 2, autoUpdateEnabledCount: 1, lastAccessedAt: now.toISOString() });
    mocks.subscription.findMany.mockResolvedValueOnce([]);
    expect((await buildAdminStats(now)).users[0].lastAccessedAt).toBeNull();
  });
  it("preserves defaults and validates and persists global force-refresh settings", async () => {
    mocks.localSetting.findUnique.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("missing table"));
    for (let i=0;i<2;i++) await expect(getLocalSettings()).resolves.toEqual({ forceRefreshOnFetch: false, forceRefreshMinIntervalSeconds: 600 });
    await expect(updateLocalSettings({ forceRefreshOnFetch: true, forceRefreshMinIntervalSeconds: "60" })).resolves.toEqual({ forceRefreshOnFetch: true, forceRefreshMinIntervalSeconds: 60 });
    await expect(updateLocalSettings(null)).resolves.toEqual({ forceRefreshOnFetch: false, forceRefreshMinIntervalSeconds: 600 });
    await expect(updateLocalSettings({ forceRefreshOnFetch: false, forceRefreshMinIntervalSeconds: 600 })).resolves.toMatchObject({ forceRefreshOnFetch: false });
    for (const v of [59, "bad", 60.5, Infinity]) await expect(updateLocalSettings({ forceRefreshMinIntervalSeconds: v })).rejects.toThrow("不小于 60");
    const settings = { forceRefreshOnFetch: true, forceRefreshMinIntervalSeconds: 60 };
    const now = new Date();
    expect(shouldForceRefresh(settings, null, now)).toBe(true);
    expect(shouldForceRefresh({ ...settings, forceRefreshOnFetch: false }, null, now)).toBe(false);
    expect(shouldForceRefresh(settings, now, now)).toBe(false);
    expect(shouldForceRefresh(settings, new Date(now.getTime()-60000), now)).toBe(true);
  });
});
