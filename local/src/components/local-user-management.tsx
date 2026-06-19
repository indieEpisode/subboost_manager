"use client";

import * as React from "react";
import { Ban, CheckCircle2, Pencil, RefreshCw, ShieldAlert, Trash2, UserPlus, Users } from "lucide-react";
import { Badge } from "@subboost/ui/components/ui/badge";
import { Button } from "@subboost/ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@subboost/ui/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@subboost/ui/components/ui/dialog";
import { Input } from "@subboost/ui/components/ui/input";
import { Label } from "@subboost/ui/components/ui/label";
import { confirmDialog } from "@subboost/ui/components/ui/confirm-dialog";
import { toast } from "@subboost/ui/components/ui/toaster";
import { cn } from "@subboost/ui/lib/utils";
import { readJsonResponse } from "@subboost/ui/product/client-response";
import { useUserStore } from "@subboost/ui/store/user-store";

type AdminUserQuota = {
  maxSubscriptions: number | null;
  maxNodesPerSubscription: number | null;
  pullRateLimitMax: number | null;
  pullRateWindowSeconds: number | null;
  pullCooldownSeconds: number | null;
};

type AdminUserStat = {
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
  throttledCount: number;
  recentPullCount: number;
  lastAccessedAt: string | null;
  autoUpdateEnabledCount: number;
};

type ThrottledSubscriptionItem = {
  id: string;
  name: string;
  ownerId: string;
  ownerUsername: string;
  pullThrottledUntil: string | null;
  refreshThrottledUntil: string | null;
  trippedAt: string | null;
};

type AdminStats = {
  overview: {
    totalUsers: number;
    totalSubscriptions: number;
    totalTemplates: number;
    throttledSubscriptions: number;
    autoDisabledSubscriptions: number;
  };
  users: AdminUserStat[];
  throttledSubscriptions: ThrottledSubscriptionItem[];
};

type QuotaForm = {
  maxSubscriptions: string;
  maxNodesPerSubscription: string;
  pullRateLimitMax: string;
  pullRateWindowSeconds: string;
  pullCooldownSeconds: string;
};

const EMPTY_QUOTA: QuotaForm = {
  maxSubscriptions: "",
  maxNodesPerSubscription: "",
  pullRateLimitMax: "",
  pullRateWindowSeconds: "",
  pullCooldownSeconds: "",
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("zh-CN", { hour12: false });
  } catch {
    return "—";
  }
}

function errMessage(error: unknown): string {
  return error instanceof Error ? error.message : "请稍后重试";
}

function quotaFromUser(u: AdminUserStat): QuotaForm {
  return {
    maxSubscriptions: u.quota.maxSubscriptions?.toString() ?? "",
    maxNodesPerSubscription: u.quota.maxNodesPerSubscription?.toString() ?? "",
    pullRateLimitMax: u.quota.pullRateLimitMax?.toString() ?? "",
    pullRateWindowSeconds: u.quota.pullRateWindowSeconds?.toString() ?? "",
    pullCooldownSeconds: u.quota.pullCooldownSeconds?.toString() ?? "",
  };
}

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-white/40">{label}</p>
        <p className={cn("mt-1 text-2xl font-bold", highlight && value > 0 ? "text-red-300" : "text-white")}>{value}</p>
      </CardContent>
    </Card>
  );
}

function QuotaFields({ form, onChange }: { form: QuotaForm; onChange: (next: QuotaForm) => void }) {
  const field = (key: keyof QuotaForm, label: string, placeholder: string) => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        min={1}
        value={form[key]}
        placeholder={placeholder}
        onChange={(e) => onChange({ ...form, [key]: e.target.value })}
      />
    </div>
  );
  return (
    <div className="grid grid-cols-2 gap-3">
      {field("maxSubscriptions", "最大订阅数", "默认 9999")}
      {field("maxNodesPerSubscription", "每订阅节点上限", "默认 10000")}
      {field("pullRateLimitMax", "拉取次数上限", "默认 20")}
      {field("pullRateWindowSeconds", "统计窗口（秒）", "默认 600")}
      {field("pullCooldownSeconds", "超限冷却（秒）", "默认 86400")}
    </div>
  );
}

export function LocalUserManagement() {
  const { user: currentUser } = useUserStore();
  const [data, setData] = React.useState<AdminStats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [forbidden, setForbidden] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [createUsername, setCreateUsername] = React.useState("");
  const [createPassword, setCreatePassword] = React.useState("");
  const [createQuota, setCreateQuota] = React.useState<QuotaForm>(EMPTY_QUOTA);

  const [editTarget, setEditTarget] = React.useState<AdminUserStat | null>(null);
  const [editPassword, setEditPassword] = React.useState("");
  const [editQuota, setEditQuota] = React.useState<QuotaForm>(EMPTY_QUOTA);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/stats", { cache: "no-store" });
      if (res.status === 401 || res.status === 403) {
        setForbidden(true);
        setData(null);
        return;
      }
      const next = await readJsonResponse<AdminStats>(res, "加载用户数据失败");
      setData(next);
      setForbidden(false);
    } catch (error) {
      toast({ variant: "destructive", title: "加载失败", description: errMessage(error) });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    try {
      setBusyId("create");
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: createUsername, password: createPassword, ...createQuota }),
      });
      await readJsonResponse(res, "创建失败");
      toast({ variant: "success", title: "用户已创建", description: `@${createUsername}` });
      setCreateOpen(false);
      setCreateUsername("");
      setCreatePassword("");
      setCreateQuota(EMPTY_QUOTA);
      await load();
    } catch (error) {
      toast({ variant: "destructive", title: "创建失败", description: errMessage(error) });
    } finally {
      setBusyId(null);
    }
  };

  const openEdit = (u: AdminUserStat) => {
    setEditTarget(u);
    setEditPassword("");
    setEditQuota(quotaFromUser(u));
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    try {
      setBusyId(editTarget.id);
      const body: Record<string, unknown> = { ...editQuota };
      if (editPassword) body.password = editPassword;
      const res = await fetch(`/api/admin/users/${encodeURIComponent(editTarget.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await readJsonResponse(res, "保存失败");
      toast({ variant: "success", title: "已保存" });
      setEditTarget(null);
      await load();
    } catch (error) {
      toast({ variant: "destructive", title: "保存失败", description: errMessage(error) });
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleDisable = async (u: AdminUserStat) => {
    try {
      setBusyId(u.id);
      const res = await fetch(`/api/admin/users/${encodeURIComponent(u.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: !u.disabled }),
      });
      await readJsonResponse(res, "操作失败");
      toast({ variant: "success", title: u.disabled ? "已启用" : "已禁用" });
      await load();
    } catch (error) {
      toast({ variant: "destructive", title: "操作失败", description: errMessage(error) });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (u: AdminUserStat) => {
    const ok = await confirmDialog({
      title: `删除用户 @${u.username}？`,
      description: "将同时删除该用户的全部订阅与模板，且不可恢复。",
      confirmText: "删除",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      setBusyId(u.id);
      const res = await fetch(`/api/admin/users/${encodeURIComponent(u.id)}`, { method: "DELETE" });
      await readJsonResponse(res, "删除失败");
      toast({ variant: "success", title: "用户已删除" });
      await load();
    } catch (error) {
      toast({ variant: "destructive", title: "删除失败", description: errMessage(error) });
    } finally {
      setBusyId(null);
    }
  };

  const handleUnthrottle = async (subId: string) => {
    try {
      setBusyId(subId);
      const res = await fetch(`/api/admin/subscriptions/${encodeURIComponent(subId)}/unthrottle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      await readJsonResponse(res, "解除失败");
      toast({ variant: "success", title: "已解除限流" });
      await load();
    } catch (error) {
      toast({ variant: "destructive", title: "解除失败", description: errMessage(error) });
    } finally {
      setBusyId(null);
    }
  };

  if (forbidden) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-amber-400" />
        <h1 className="mt-4 text-xl font-bold">需要管理员权限</h1>
        <p className="mt-2 text-white/50">此页面仅对管理员开放。</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">用户管理</h1>
        <p className="mt-1 text-white/50">管理普通用户、资源配额，以及订阅拉取限流监控</p>
      </div>

      {loading && !data ? (
        <p className="text-white/40">加载中…</p>
      ) : data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="用户" value={data.overview.totalUsers} />
            <StatCard label="订阅" value={data.overview.totalSubscriptions} />
            <StatCard label="模板" value={data.overview.totalTemplates} />
            <StatCard label="被限流" value={data.overview.throttledSubscriptions} highlight />
            <StatCard label="自动禁用" value={data.overview.autoDisabledSubscriptions} />
          </div>

          {data.throttledSubscriptions.length > 0 && (
            <Card className="border-red-500/30">
              <CardHeader className="flex flex-row items-center gap-2 space-y-0">
                <ShieldAlert className="h-5 w-5 text-red-400" />
                <CardTitle className="text-base">限流告警（{data.throttledSubscriptions.length}）</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.throttledSubscriptions.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{t.name}</p>
                      <p className="text-xs text-white/40">
                        @{t.ownerUsername} · 恢复于 {fmt(t.pullThrottledUntil ?? t.refreshThrottledUntil)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      disabled={busyId === t.id}
                      onClick={() => void handleUnthrottle(t.id)}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      解除
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-5 w-5 text-indigo-300" />
                用户（{data.users.length}）
              </CardTitle>
              <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
                <UserPlus className="h-4 w-4" />
                新建用户
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.users.map((u) => {
                const isSelf = u.id === currentUser?.id;
                return (
                  <div key={u.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">@{u.username}</span>
                      <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                        {u.role === "admin" ? "管理员" : "普通用户"}
                      </Badge>
                      {u.disabled && <Badge variant="destructive">已禁用</Badge>}
                      {u.throttledCount > 0 && <Badge variant="warning">{u.throttledCount} 个订阅被限流</Badge>}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-white/50 sm:grid-cols-3">
                      <span>订阅 {u.subscriptionCount}/{u.quota.maxSubscriptions ?? "默认"}</span>
                      <span>模板 {u.templateCount}</span>
                      <span>近期拉取 {u.recentPullCount}</span>
                      <span>自动更新 {u.autoUpdateEnabledCount}</span>
                      <span>最后登录 {fmt(u.lastLoginAt)}</span>
                      <span>创建 {fmt(u.createdAt)}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openEdit(u)}>
                        <Pencil className="h-3.5 w-3.5" />
                        编辑 / 配额
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={busyId === u.id}
                        onClick={() => void handleToggleDisable(u)}
                      >
                        {u.disabled ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                        {u.disabled ? "启用" : "禁用"}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="gap-1.5"
                        disabled={busyId === u.id || isSelf}
                        title={isSelf ? "不能删除当前登录的管理员账号" : undefined}
                        onClick={() => void handleDelete(u)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        删除
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* 新建用户 */}
      <Dialog open={createOpen} onOpenChange={(open) => !busyId && setCreateOpen(open)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>新建用户</DialogTitle>
            <DialogDescription>创建一个普通用户账号；配额留空则使用系统默认值。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>用户名</Label>
              <Input value={createUsername} onChange={(e) => setCreateUsername(e.target.value)} placeholder="用户登录名" />
            </div>
            <div className="space-y-2">
              <Label>初始密码</Label>
              <Input
                type="password"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                placeholder="至少 10 个字符"
              />
            </div>
            <QuotaFields form={createQuota} onChange={setCreateQuota} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={busyId === "create"}>
              取消
            </Button>
            <Button onClick={() => void handleCreate()} disabled={busyId === "create"}>
              {busyId === "create" ? "创建中…" : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑用户 / 配额 / 重置密码 */}
      <Dialog open={Boolean(editTarget)} onOpenChange={(open) => !busyId && !open && setEditTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>编辑用户 {editTarget ? `@${editTarget.username}` : ""}</DialogTitle>
            <DialogDescription>修改配额或重置密码；配额留空表示使用系统默认值。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>重置密码（留空则不修改）</Label>
              <Input
                type="password"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                placeholder="至少 10 个字符"
              />
            </div>
            <QuotaFields form={editQuota} onChange={setEditQuota} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={Boolean(busyId)}>
              取消
            </Button>
            <Button onClick={() => void handleSaveEdit()} disabled={Boolean(busyId)}>
              {busyId && editTarget && busyId === editTarget.id ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
