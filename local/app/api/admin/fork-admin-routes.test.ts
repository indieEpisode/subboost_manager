import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentAdmin: vi.fn(), getLocalSettings: vi.fn(), updateLocalSettings: vi.fn(),
  listManagedUsers: vi.fn(), createManagedUser: vi.fn(), updateManagedUser: vi.fn(),
  deleteManagedUser: vi.fn(), clearSubscriptionThrottle: vi.fn(), buildAdminStats: vi.fn(),
}));
vi.mock("@local/lib/auth", () => ({ getCurrentAdmin: mocks.getCurrentAdmin }));
vi.mock("@local/lib/settings-service", () => ({ getLocalSettings: mocks.getLocalSettings, updateLocalSettings: mocks.updateLocalSettings }));
vi.mock("@local/lib/user-admin-service", () => ({
  listManagedUsers: mocks.listManagedUsers, createManagedUser: mocks.createManagedUser,
  updateManagedUser: mocks.updateManagedUser, deleteManagedUser: mocks.deleteManagedUser,
  clearSubscriptionThrottle: mocks.clearSubscriptionThrottle,
}));
vi.mock("@local/lib/admin-stats-service", () => ({ buildAdminStats: mocks.buildAdminStats }));
import { GET as settings, PUT as saveSettings } from "./settings/route";
import { GET as users, POST as create } from "./users/route";
import { PATCH as update, DELETE as remove } from "./users/[id]/route";
import { POST as unthrottle } from "./subscriptions/[id]/unthrottle/route";
import { GET as stats } from "./stats/route";

const context = () => ({ params: Promise.resolve({ id: "user-2" }) });
const request = (body = "{}", size?: number) => new Request("https://local.test/api/admin/users", {
  method: "POST", body, headers: size ? { "content-length": String(size) } : {},
});
const writers = [
  { send: (r: Request) => create(r), service: mocks.createManagedUser, key: "user" },
  { send: (r: Request) => update(r, context()), service: mocks.updateManagedUser, key: "user" },
  { send: (r: Request) => saveSettings(r), service: mocks.updateLocalSettings, key: "settings" },
];
describe("fork administrator API compatibility", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getCurrentAdmin.mockResolvedValue({ id: "admin-1", username: "admin", role: "admin", disabledAt: null });
    mocks.listManagedUsers.mockResolvedValue([]); mocks.buildAdminStats.mockResolvedValue({ overview: {} });
    mocks.getLocalSettings.mockResolvedValue({ forceRefreshOnFetch: true });
    for (const w of writers) w.service.mockResolvedValue({ id: "user-2" });
  });

  it("requires an authenticated administrator for every management endpoint", async () => {
    const senders = [settings, users, stats, ...writers.map(w => () => w.send(request())),
      () => remove(request(), context()), () => unthrottle(request(), context())];
    for (const account of [null, { id: "user-1", role: "user" }]) {
      mocks.getCurrentAdmin.mockResolvedValue(account);
      for (const send of senders) expect((await send()).status).toBe(account ? 403 : 401);
    }
    expect(mocks.createManagedUser).not.toHaveBeenCalled();
    expect(mocks.clearSubscriptionThrottle).not.toHaveBeenCalled();
  });

  it("returns the user list, statistics and global refresh settings", async () => {
    await expect((await users()).json()).resolves.toEqual({ users: [] });
    await expect((await stats()).json()).resolves.toEqual({ overview: {} });
    await expect((await settings()).json()).resolves.toEqual({ settings: { forceRefreshOnFetch: true } });
  });

  it("unwraps the new bounded JSON reader before calling custom services", async () => {
    for (const w of writers) {
      const body = { username: "user-2", forceRefreshOnFetch: true };
      const response = await w.send(request(JSON.stringify(body)));
      expect(response.status).toBe(w.service === mocks.createManagedUser ? 201 : 200);
      await expect(response.json()).resolves.toEqual({ [w.key]: { id: "user-2" } });
      expect(w.service.mock.calls.at(-1)?.at(-1)).toEqual(body);
    }
  });

  it("rejects malformed, non-object and oversized bodies before making changes", async () => {
    for (const w of writers) {
      for (const body of ["{", "null", "[]"]) expect((await w.send(request(body))).status).toBe(400);
      expect((await w.send(request("{}", 65537))).status).toBe(413);
      expect(w.service).not.toHaveBeenCalled();
    }
  });

  it("reports custom validation failures and missing users", async () => {
    for (const w of writers) {
      for (const error of [new Error("invalid quota"), "failure"]) {
        w.service.mockRejectedValueOnce(error);
        expect((await w.send(request())).status).toBe(400);
      }
    }
    mocks.updateManagedUser.mockResolvedValueOnce(null);
    expect((await update(request(), context())).status).toBe(404);
  });

  it("keeps delete and unthrottle actions restricted and reports absent records", async () => {
    mocks.deleteManagedUser.mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockRejectedValueOnce(new Error("last admin")).mockRejectedValueOnce("failure");
    expect((await remove(request(), context())).status).toBe(200);
    expect(mocks.deleteManagedUser).toHaveBeenCalledWith("admin-1", "user-2");
    for (const status of [404, 400, 400]) expect((await remove(request(), context())).status).toBe(status);
    mocks.clearSubscriptionThrottle.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect((await unthrottle(request(), context())).status).toBe(200);
    expect((await unthrottle(request(), context())).status).toBe(404);
  });
});
