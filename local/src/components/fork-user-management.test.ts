import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  enabled: false, index: 0, values: {} as Record<number, unknown>,
  setters: [] as Array<ReturnType<typeof vi.fn>>, effects: [] as Array<() => void>,
  buttons: [] as Array<Record<string, any>>, inputs: [] as Array<Record<string, any>>,
  dialogs: [] as Array<Record<string, any>>, switches: [] as Array<Record<string, any>>,
  toast: vi.fn(), confirm: vi.fn(), currentUser: { id: "admin-1", isAdmin: true },
}));
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  return { ...actual,
    useState: (initial: unknown) => {
      if (!harness.enabled) return actual.useState(initial);
      const index = harness.index++;
      const setter = vi.fn(); harness.setters[index] = setter;
      return [Object.hasOwn(harness.values, index) ? harness.values[index] : initial, setter];
    },
    useEffect: (effect: React.EffectCallback, deps?: React.DependencyList) => {
      if (!harness.enabled) return actual.useEffect(effect, deps);
      const cleanup = effect(); if (cleanup) harness.effects.push(cleanup);
    },
  };
});
vi.mock("lucide-react", () => Object.fromEntries(["Ban","CheckCircle2","Pencil","RefreshCw","ShieldAlert","Trash2","UserPlus","Users"].map(n=>[n,()=>null])));
vi.mock("@subboost/ui/store/user-store", () => ({ useUserStore: () => ({ user: harness.currentUser }) }));
vi.mock("@subboost/ui/components/ui/toaster", () => ({ toast: harness.toast }));
vi.mock("@subboost/ui/components/ui/confirm-dialog", () => ({ confirmDialog: harness.confirm }));
vi.mock("@subboost/ui/components/ui/button", () => ({ Button: (p: any) => { harness.buttons.push(p); return React.createElement("button", null, p.children); } }));
vi.mock("@subboost/ui/components/ui/input", () => ({ Input: (p: any) => { harness.inputs.push(p); return React.createElement("input", { readOnly: true, value: p.value }); } }));
vi.mock("@subboost/ui/components/ui/switch", () => ({ Switch: (p: any) => { harness.switches.push(p); return React.createElement("span"); } }));
vi.mock("@subboost/ui/components/ui/label", () => ({ Label: (p: any) => React.createElement("label", null, p.children) }));
vi.mock("@subboost/ui/components/ui/badge", () => ({ Badge: (p: any) => React.createElement("span", null, p.children) }));
vi.mock("@subboost/ui/components/ui/card", () => Object.fromEntries(["Card","CardContent","CardHeader","CardTitle"].map(n=>[n,(p:any)=>React.createElement("div",null,p.children)])));
vi.mock("@subboost/ui/components/ui/dialog", () => ({
  ...Object.fromEntries(["DialogContent","DialogDescription","DialogFooter","DialogHeader","DialogTitle"].map(n=>[n,(p:any)=>React.createElement("div",null,p.children)])),
  Dialog: (p:any) => { harness.dialogs.push(p); return React.createElement("div",null,p.children); },
}));
import { LocalUserManagement } from "./local-user-management";
import { SubscriptionThrottleNotice } from "./subscription-throttle-notice";

const quota = { maxSubscriptions: null, maxNodesPerSubscription: null, pullRateLimitMax: null, pullRateWindowSeconds: null, pullCooldownSeconds: null };
const user = (id = "user-2", extra = {}) => ({ id, username: id, role: "user", disabled: false,
  createdAt: "2026-06-01", lastLoginAt: null, subscriptionCount: 1, templateCount: 0,
  recentPullCount: 2, autoUpdateEnabledCount: 1, throttledCount: 0, quota, ...extra });
const data = () => ({
  overview: { totalUsers: 3, totalSubscriptions: 4, totalTemplates: 1, throttledSubscriptions: 1, autoDisabledSubscriptions: 0 },
  users: [user("admin-1", { role: "admin" }), user(), user("disabled", { disabled: true, throttledCount: 1, lastLoginAt: "2026-06-02", quota: { maxSubscriptions: 2, maxNodesPerSubscription: 3, pullRateLimitMax: 4, pullRateWindowSeconds: 60, pullCooldownSeconds: 120 } })],
  throttledSubscriptions: [{ id: "sub-1", name: "Limited", ownerUsername: "user-2", pullThrottledUntil: "2027-01-01", refreshThrottledUntil: null }],
});
function text(value: any): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(text).join("");
  return value?.props ? text(value.props.children) : "";
}
function render(values: Record<number, unknown> = {}, component: React.ComponentType = LocalUserManagement) {
  harness.values = values; harness.index = 0; harness.buttons = []; harness.inputs = []; harness.dialogs = []; harness.switches = [];
  harness.enabled = true;
  try { return renderToStaticMarkup(React.createElement(component)); }
  finally { harness.enabled = false; }
}
const flush = async () => { for (let i=0;i<30;i++) await Promise.resolve(); await new Promise(resolve=>setImmediate(resolve)); };
const button = (label: string) => harness.buttons.find(p => text(p.children) === label)!;
const response = (body: unknown, status=200) => new Response(JSON.stringify(body), { status });
function installFetch() {
  const fetch = vi.fn(async (url: string, options?: { method?: string; body?: string }) => {
    if (url === "/api/admin/stats") return response(data());
    if (url === "/api/admin/settings") return response({ settings: { forceRefreshOnFetch: true, forceRefreshMinIntervalSeconds: 60 } });
    return response({ success: true });
  });
  vi.stubGlobal("fetch", fetch); return fetch;
}
describe("fork user-management controls", () => {
  beforeEach(() => { vi.clearAllMocks(); harness.effects = []; harness.setters = []; harness.confirm.mockResolvedValue(true); installFetch(); });
  afterEach(() => { harness.effects.forEach(fn=>fn()); vi.unstubAllGlobals(); });

  it("loads statistics and global settings and distinguishes forbidden access", async () => {
    expect(render()).toContain("加载中"); await flush();
    expect(harness.setters[0]).toHaveBeenCalledWith(expect.objectContaining({ users: expect.any(Array) }));
    expect(harness.setters[11]).toHaveBeenCalledWith(true);
    for (const status of [401,403]) {
      vi.stubGlobal("fetch", vi.fn(async()=>response({},status))); render(); await flush();
      expect(harness.setters[2]).toHaveBeenCalledWith(true);
    }
    expect(render({ 2: true })).toContain("需要管理员权限"); await flush();
    vi.stubGlobal("fetch", vi.fn(async()=>{ throw "network unavailable"; })); render({ 1: false }); await flush();
    expect(harness.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "加载失败", description: "请稍后重试" }));
    vi.stubGlobal("fetch", vi.fn(async url=>url === "/api/admin/stats" ? response(data()) : response({},500)));
    render(); await flush();
  });

  it("renders enabled/disabled accounts, quota defaults, alerts and safe action states", async () => {
    const html = render({ 0: data(), 1: false, 11: true, 12: "60" }); await flush();
    expect(html).toContain("普通用户"); expect(html).toContain("管理员"); expect(html).toContain("已禁用"); expect(html).toContain("恢复于");
    expect(harness.switches[0]["aria-label"]).toBe("客户端拉取时强制刷新订阅");
    harness.switches[0].onCheckedChange(false); expect(harness.setters[11]).toHaveBeenCalledWith(false);
    for (const input of harness.inputs) input.onChange?.({ target: { value: "9" } });
    expect(harness.setters[7]).toHaveBeenCalled(); expect(harness.setters[10]).toHaveBeenCalled();
    button("新建用户").onClick(); expect(harness.setters[4]).toHaveBeenCalledWith(true);
    harness.dialogs.forEach(d=>{ d.onOpenChange(true); d.onOpenChange(false); });
    expect(harness.setters[8]).toHaveBeenCalledWith(null);
    for (const edit of harness.buttons.filter(p=>text(p.children)==="编辑 / 配额")) edit.onClick();
    expect(harness.setters[10]).toHaveBeenCalledWith(expect.objectContaining({ maxSubscriptions: "2", pullRateLimitMax: "4" }));
    const empty = { ...data(), throttledSubscriptions: [], users: [] };
    render({ 0: empty, 1: false, 3: "create", 13: true }); await flush();
    harness.dialogs.forEach(d=>d.onOpenChange(false));
    expect(button("创建中…").disabled).toBe(true);
    render({ 0: data(), 1: false, 3: "sub-1", 8: user(), 11: true }); await flush();
    expect(button("解除").disabled).toBe(true);
    render({ 0: data(), 1: false, 3: "user-2", 8: user() }); await flush();
    expect(button("保存中…").disabled).toBe(true);
    const formatting = vi.spyOn(Date.prototype, "toLocaleString").mockImplementation(()=>{ throw new Error("format failure"); });
    render({ 0: data(), 1: false }); formatting.mockRestore(); await flush();
  });

  it("creates users, edits quotas and passwords, cancels dialogs and saves force-refresh settings", async () => {
    const fetch = installFetch();
    render({ 0: data(), 1: false, 5: "new-user", 6: "long-password", 8: user(), 9: "new-password", 11: true, 12: "60" }); await flush();
    button("创建").onClick(); await flush();
    expect(fetch).toHaveBeenCalledWith("/api/admin/users", expect.objectContaining({ method: "POST", body: expect.stringContaining('"username":"new-user"') }));
    button("保存").onClick(); await flush();
    expect(fetch).toHaveBeenCalledWith("/api/admin/users/user-2", expect.objectContaining({ method: "PATCH", body: expect.stringContaining('"password":"new-password"') }));
    button("保存设置").onClick(); await flush();
    expect(fetch).toHaveBeenCalledWith("/api/admin/settings", expect.objectContaining({ method: "PUT", body: JSON.stringify({ forceRefreshOnFetch: true, forceRefreshMinIntervalSeconds: 60 }) }));
    harness.buttons.filter(p=>text(p.children)==="取消").forEach(p=>p.onClick());
    render({ 0: data(), 1: false, 8: user() }); await flush(); button("保存").onClick(); await flush();
    const patch = fetch.mock.calls.filter(([url, options])=>url==="/api/admin/users/user-2" && options?.method==="PATCH").at(-1);
    expect(patch?.[1]?.body).not.toContain("password");
    render({ 0: data(), 1: false }); await flush(); button("保存").onClick(); await flush();
  });

  it("toggles both account states, confirms deletion and releases throttles", async () => {
    const fetch = installFetch(); render({ 0: data(), 1: false }); await flush();
    button("禁用").onClick(); await flush(); button("启用").onClick(); await flush();
    expect(fetch).toHaveBeenCalledWith("/api/admin/users/disabled", expect.objectContaining({ body: JSON.stringify({ disabled: false }) }));
    harness.confirm.mockResolvedValueOnce(false); button("删除").onClick(); await flush();
    expect(fetch.mock.calls.some(([,o])=>o?.method==="DELETE")).toBe(false);
    button("删除").onClick(); await flush();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/admin/users/"), { method: "DELETE" });
    button("解除").onClick(); await flush();
    expect(fetch).toHaveBeenCalledWith("/api/admin/subscriptions/sub-1/unthrottle", expect.objectContaining({ method: "POST" }));
  });

  it("reports failed writes while retaining current forms and clearing busy state", async () => {
    render({ 0: data(), 1: false, 8: user() }); await flush();
    vi.stubGlobal("fetch", vi.fn(async()=>response({ error: "write failed" },400)));
    for (const label of ["创建","保存","禁用","删除","解除","保存设置"]) {
      button(label).onClick(); await flush();
      expect(harness.toast).toHaveBeenLastCalledWith(expect.objectContaining({ variant: "destructive", description: "write failed" }));
    }
    expect(harness.setters[3]).toHaveBeenLastCalledWith(null);
    expect(harness.setters[13]).toHaveBeenLastCalledWith(false);
  });

  it("shows cooldowns as read-only notices and ignores late responses after unmount", async () => {
    const future = new Date(Date.now()+60000).toISOString();
    const subscriptions = [{ id: "pull", name: "Pull", pullThrottledUntil: future },
      { id: "refresh", name: "Refresh", refreshThrottledUntil: future },
      { id: "old", name: "Old", pullThrottledUntil: "2020-01-01" }, { id: "none", name: "None" }];
    vi.stubGlobal("fetch", vi.fn(async()=>response({ subscriptions })));
    expect(render({}, SubscriptionThrottleNotice)).toBe(""); await flush();
    expect(harness.setters[0]).toHaveBeenCalledWith(subscriptions.slice(0,2));
    const html = render({ 0: subscriptions.slice(0,2) }, SubscriptionThrottleNotice); await flush();
    expect(html).toContain("Pull、Refresh"); expect(harness.buttons).toHaveLength(0);
    render({}, SubscriptionThrottleNotice); harness.effects.at(-1)?.(); await flush(); expect(harness.setters[0]).not.toHaveBeenCalled();
    vi.stubGlobal("fetch", vi.fn(async()=>response({}))); render({}, SubscriptionThrottleNotice); await flush();
    expect(harness.setters[0]).toHaveBeenCalledWith([]);
    vi.stubGlobal("fetch", vi.fn(async()=>{ throw new Error("unavailable"); })); render({}, SubscriptionThrottleNotice); await flush();
    expect(harness.setters[0]).not.toHaveBeenCalled();
  });
});
