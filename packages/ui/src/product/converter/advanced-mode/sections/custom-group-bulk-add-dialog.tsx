"use client";

import * as React from "react";
import { Button } from "@subboost/ui/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@subboost/ui/components/ui/dialog";
import { toast } from "@subboost/ui/components/ui/toaster";
import { useConfigStore } from "@subboost/ui/store/config-store";
import { getCustomGroupMemberTargets } from "@subboost/ui/store/config-store/custom-group-membership";

export function CustomGroupBulkAddDialog({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const state = useConfigStore();
  const group = state.customProxyGroups.find((entry) => entry.id === groupId);
  const targets = React.useMemo(() => getCustomGroupMemberTargets(state, groupId), [state, groupId]);
  const available = targets.filter((target) => !target.reason);
  const [selected, setSelected] = React.useState(() => new Set(available.map((target) => target.key)));
  // Revalidate against current state; a target may have been removed or edited
  // while the dialog was open. The store action validates again atomically.
  const selectedKeys = available.filter((target) => selected.has(target.key)).map((target) => target.key);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="break-words pr-6">添加到多个分流组</DialogTitle>
          <DialogDescription>
            将「{group?.name}」追加为所选分流组的候选项，保留原有成员、顺序和默认选择。
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={available.length === 0}
            onClick={() => setSelected(new Set(available.map((target) => target.key)))}>全选可添加分组</Button>
          <Button type="button" variant="ghost" size="sm" disabled={selectedKeys.length === 0}
            onClick={() => setSelected(new Set())}>取消全选</Button>
          <span className="ml-auto text-xs text-fg-50">已选 {selectedKeys.length} 个</span>
        </div>
        <div className="max-h-[45dvh] space-y-1 overflow-y-auto custom-scrollbar" role="group" aria-label="目标分流组">
          {targets.length === 0 && <p className="py-3 text-sm text-fg-50">请先启用当前自定义分组。</p>}
          {targets.map((target) => (
            <label key={target.key} className="flex min-h-10 items-center gap-3 rounded-lg border border-ink/10 px-3 py-2 text-sm">
              <input type="checkbox" checked={!target.reason && selected.has(target.key)} disabled={Boolean(target.reason)}
                onChange={(event) => setSelected((current) => {
                  const next = new Set(current);
                  if (event.target.checked) next.add(target.key);
                  else next.delete(target.key);
                  return next;
                })} className="h-4 w-4 shrink-0 accent-indigo-500" />
              <span className="min-w-0 flex-1 break-words text-fg">{target.name}</span>
              {target.reason && <span className="shrink-0 text-xs text-fg-50">{target.reason}</span>}
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>取消</Button>
          <Button type="button" disabled={selectedKeys.length === 0} onClick={() => {
            state.addCustomProxyGroupToGroups(groupId, selectedKeys);
            toast({ title: "已添加到所选分流组", description: "保存订阅后，更新客户端订阅即可使用。" });
            onClose();
          }}>添加到所选分流组</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
