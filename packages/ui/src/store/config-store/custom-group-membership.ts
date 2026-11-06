import { generateProxyGroups, PROXY_GROUP_MODULES } from "@subboost/core/generator/proxy-groups";
import { resolveProxyGroupModuleName } from "@subboost/core/proxy-group-name";
import { getProxyGroupMemberKey } from "@subboost/core/proxy-group-targets";
import { resolveNodeNameFilter } from "@subboost/core/subscription/node-name-filter";
import type { ProxyGroupAdvancedConfig, ProxyGroupMemberRef } from "@subboost/core/types/config";
import type { ConfigState } from "./definitions";

export type CustomGroupMemberTarget = {
  kind: "module" | "custom";
  id: string;
  name: string;
  key: string;
  reason?: string;
  members: ProxyGroupMemberRef[];
};

export function getCustomGroupMemberTargets(state: ConfigState, sourceId: string): CustomGroupMemberTarget[] {
  const source = state.customProxyGroups.find((group) => group.id === sourceId && group.enabled !== false);
  if (!source) return [];
  const { effectiveNodes } = resolveNodeNameFilter(state.nodes, state.nodeNameFilter);
  const nodeNames = new Set(effectiveNodes.map((node) => node.name));
  const generated = generateProxyGroups({
    ...state,
    nodes: effectiveNodes,
    enabledModules: state.enabledProxyGroups,
  });
  const byName = new Map(generated.map((group) => [group.name, group]));
  const reachable = new Set<string>();
  const pending = [source.name];
  while (pending.length > 0) {
    const name = pending.pop()!;
    if (reachable.has(name)) continue;
    reachable.add(name);
    pending.push(...(byName.get(name)?.proxies ?? []).filter((member) => byName.has(member)));
  }

  const moduleTargets = PROXY_GROUP_MODULES.map((module) => ({
    kind: "module" as const,
    id: module.id,
    name: resolveProxyGroupModuleName(module, state.proxyGroupNameOverrides[module.id]),
  }));
  const targets = [
    ...moduleTargets.filter((module) => state.enabledProxyGroups.includes(module.id) && !state.hiddenProxyGroups.includes(module.id)),
    ...state.customProxyGroups
      .filter((group) => group.enabled !== false)
      .map((group) => ({ kind: "custom" as const, id: group.id, name: group.name })),
  ].map((target) => ({ ...target, key: getProxyGroupMemberKey(target) }));

  return targets.map((target) => {
    const group = byName.get(target.name);
    const members = (group?.proxies ?? []).flatMap<ProxyGroupMemberRef>((name) => {
      if (name === "DIRECT") return [{ kind: "direct" }];
      if (name === "REJECT") return [{ kind: "reject" }];
      if (nodeNames.has(name)) return [{ kind: "node", name }];
      const member = moduleTargets.find((entry) => entry.name === name) ?? targets.find((entry) => entry.name === name);
      return member ? [{ kind: member.kind, id: member.id }] : [];
    });
    const reason = target.kind === "custom" && target.id === sourceId ? "不能添加到自身"
      : !group || group.type !== "select" ? "自动策略组无需手动选择"
      : reachable.has(target.name) ? "会形成循环引用"
      : group.proxies?.includes(source.name) ? "已添加"
      : undefined;
    return { ...target, reason, members };
  });
}

function appendCustomMember(
  advanced: ProxyGroupAdvancedConfig = {}, sourceId: string, members: ProxyGroupMemberRef[],
): ProxyGroupAdvancedConfig {
  const ref: ProxyGroupMemberRef = { kind: "custom", id: sourceId };
  const key = getProxyGroupMemberKey(ref);
  // Keep saved references (including filtered nodes) and append any current
  // defaults before the new member, so restoring an excluded group stays last.
  const memberOrder = (advanced.memberOrder ?? []).filter((member) => getProxyGroupMemberKey(member) !== key);
  const orderedKeys = new Set(memberOrder.map(getProxyGroupMemberKey));
  return {
    ...advanced,
    extraMembers: [...(advanced.extraMembers ?? []).filter((member) => getProxyGroupMemberKey(member) !== key), ref],
    excludedMembers: (advanced.excludedMembers ?? []).filter((member) => getProxyGroupMemberKey(member) !== key),
    memberOrder: [...memberOrder, ...members.filter((member) => !orderedKeys.has(getProxyGroupMemberKey(member))), ref],
  };
}

export function buildCustomGroupMemberPatch(
  state: ConfigState,
  sourceId: string,
  targetKeys: readonly string[],
): Partial<ConfigState> {
  const selected = new Set(targetKeys);
  const targets = getCustomGroupMemberTargets(state, sourceId)
    .filter((target) => selected.has(target.key) && !target.reason);
  if (targets.length === 0) return state;
  const proxyGroupAdvanced = { ...state.proxyGroupAdvanced };
  const customTargets = new Map(targets.filter((target) => target.kind === "custom").map((target) => [target.id, target]));
  for (const target of targets) {
    if (target.kind === "module") {
      proxyGroupAdvanced[target.id] = appendCustomMember(proxyGroupAdvanced[target.id], sourceId, target.members);
    }
  }
  return {
    proxyGroupAdvanced,
    customProxyGroups: state.customProxyGroups.map((group) => customTargets.has(group.id)
      ? { ...group, advanced: appendCustomMember(group.advanced, sourceId, customTargets.get(group.id)!.members) }
      : group),
  };
}
