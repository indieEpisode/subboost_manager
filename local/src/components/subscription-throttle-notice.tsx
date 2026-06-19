"use client";

import * as React from "react";
import { ShieldAlert } from "lucide-react";
import { readJsonResponse } from "@subboost/ui/product/client-response";

type ThrottleSub = {
  id: string;
  name: string;
  pullThrottledUntil?: string | null;
  refreshThrottledUntil?: string | null;
};

/**
 * 普通用户 dashboard 顶部的限流告知（只读）。
 * 故意不提供「解除」入口——手动解除仅限管理员，被限流者只能等冷却结束或联系管理员。
 */
export function SubscriptionThrottleNotice() {
  const [throttled, setThrottled] = React.useState<ThrottleSub[]>([]);

  React.useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch("/api/subscriptions", { cache: "no-store" });
        const data = await readJsonResponse<{ subscriptions?: ThrottleSub[] }>(res, "");
        const now = Date.now();
        const list = (data.subscriptions ?? []).filter((s) => {
          const until = s.pullThrottledUntil ?? s.refreshThrottledUntil;
          return until ? new Date(until).getTime() > now : false;
        });
        if (active) setThrottled(list);
      } catch {
        // 提示是附加信息，加载失败时静默忽略。
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (throttled.length === 0) return null;

  return (
    <div className="container mx-auto px-4 pt-6">
      <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
        <div className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <div>
            <p className="font-medium">部分订阅因拉取过于频繁被临时限流</p>
            <p className="mt-1 text-amber-100/80">
              受影响订阅：{throttled.map((s) => s.name).join("、")}。系统会在冷却结束后自动恢复；如需提前解除，请联系管理员。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
