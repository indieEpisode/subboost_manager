import { beforeEach, describe, expect, it } from "vitest";
import { generateProxyGroups } from "@subboost/core/generator/proxy-groups";
import type { CustomProxyGroup } from "@subboost/core/types/config";
import type { ParsedNode } from "@subboost/core/types/node";
import { SUBBOOST_TEMPLATE_CONFIG_SCHEMA, validateSubBoostTemplateConfig } from "@subboost/core/templates/config-template";
import { useConfigStore } from "../config-store";
import { initialState, type ConfigState } from "./definitions";
import { buildCustomGroupMemberPatch, getCustomGroupMemberTargets } from "./custom-group-membership";

const source: CustomProxyGroup = { id: "pool", name: "US Pool", emoji: "", groupType: "select" };
const other: CustomProxyGroup = { id: "other", name: "Other Pool", emoji: "", groupType: "select" };
const node: ParsedNode = { name: "US Node", type: "ss", server: "example.com", port: 8388, cipher: "aes-128-gcm", password: "test" };

function state(overrides: Partial<ConfigState> = {}): ConfigState {
  return { ...structuredClone(initialState), nodes: [node], enabledProxyGroups: ["select", "auto", "ai", "youtube", "ad", "cn"], customProxyGroups: [source, other], ...overrides };
}

function groups(config: ConfigState) {
  return generateProxyGroups({ ...config, enabledModules: config.enabledProxyGroups });
}

describe("bulk custom group membership", () => {
  beforeEach(() => useConfigStore.getState().reset());

  it("only appends to selected groups and keeps defaults, order, filters, and unrelated settings", () => {
    const before = state({ proxyGroupAdvanced: { ai: { includeRegex: "US", memberOrder: [{ kind: "node", name: "US Node" }, { kind: "node", name: "Hidden Node" }, { kind: "direct" }] } } });
    const original = structuredClone(before);
    const patch = buildCustomGroupMemberPatch(before, "pool", ["module:ai", "custom:other", "module:ad", "module:cn", "module:ai", "module:missing"]);
    const after = { ...before, ...patch };
    for (const name of ["🤖 AI 服务", "Other Pool", "🛑 广告拦截", "🔒 国内服务"]) {
      expect(groups(after).find((group) => group.name === name)?.proxies)
        .toEqual([...groups(before).find((group) => group.name === name)!.proxies!, source.name]);
    }
    expect(groups(after).find((group) => group.name === "📹 油管视频"))
      .toEqual(groups(before).find((group) => group.name === "📹 油管视频"));
    expect(after.proxyGroupAdvanced.ai.includeRegex).toBe("US");
    expect(after.proxyGroupAdvanced.ai.memberOrder).toContainEqual({ kind: "node", name: "Hidden Node" });
    expect(before).toEqual(original);
    expect(buildCustomGroupMemberPatch(after, "pool", ["module:ai", "custom:other"])).toBe(after);
  });

  it("restores an excluded default member at the end rather than changing the first member", () => {
    const before = state({
      customProxyGroups: [{ ...source, includeInGroupMembers: true }, other],
      proxyGroupAdvanced: { ai: {
        excludedMembers: [{ kind: "custom", id: "pool" }, { kind: "reject" }],
        memberOrder: [{ kind: "custom", id: "pool" }, { kind: "direct" }],
      } },
    });
    const after = { ...before, ...buildCustomGroupMemberPatch(before, "pool", ["module:ai"]) };
    expect(groups(after).find((group) => group.name === "🤖 AI 服务")?.proxies)
      .toEqual([...groups(before).find((group) => group.name === "🤖 AI 服务")!.proxies!, source.name]);
    expect(after.proxyGroupAdvanced.ai.excludedMembers).toEqual([{ kind: "reject" }]);
  });

  it("skips direct and transitive cycles, itself, automatic groups, and existing membership", () => {
    const before = state({
      customProxyGroups: [{ ...source, advanced: { extraMembers: [{ kind: "custom", id: "other" }] } },
        { ...other, advanced: { extraMembers: [{ kind: "module", id: "ai" }] } }],
      proxyGroupAdvanced: { youtube: { extraMembers: [{ kind: "custom", id: "pool" }] } },
    });
    const targets = new Map(getCustomGroupMemberTargets(before, "pool").map((target) => [target.key, target.reason]));
    expect(targets.get("custom:pool")).toBe("不能添加到自身");
    expect(targets.get("custom:other")).toBe("会形成循环引用");
    expect(targets.get("module:ai")).toBe("会形成循环引用");
    // AI uses the global selector by default; this path must also be blocked.
    expect(targets.get("module:select")).toBe("会形成循环引用");
    expect(targets.get("module:auto")).toBe("自动策略组无需手动选择");
    expect(targets.get("module:youtube")).toBe("已添加");
    expect(buildCustomGroupMemberPatch(before, "pool", [...targets.keys()].filter((key) => targets.get(key)))).toBe(before);
  });

  it("omits disabled and hidden targets and revalidates stale target selections", () => {
    const before = state({ enabledProxyGroups: ["select", "ai"], hiddenProxyGroups: ["ai"], customProxyGroups: [source, { ...other, enabled: false }] });
    expect(getCustomGroupMemberTargets(before, "pool").map((target) => target.key)).toEqual(["module:select", "custom:pool"]);
    expect(buildCustomGroupMemberPatch(before, "pool", ["module:ai", "module:youtube", "custom:other", "name:Other Pool"])).toBe(before);
    expect(buildCustomGroupMemberPatch(before, "missing", ["module:select"])).toBe(before);
    expect(getCustomGroupMemberTargets(state({ customProxyGroups: [{ ...source, enabled: false }] }), "pool")).toEqual([]);
  });

  it("adds to empty groups without nodes, supports renamed groups, and preserves persisted membership", () => {
    const before = state({ nodes: [], proxyGroupNameOverrides: { ai: "🤖 Renamed AI" } });
    const after = { ...before, ...buildCustomGroupMemberPatch(before, "pool", ["module:ai"]) };
    expect(groups(after).find((group) => group.name === "🤖 Renamed AI")?.proxies)
      .toEqual([...groups(before).find((group) => group.name === "🤖 Renamed AI")!.proxies!, source.name]);
    const restored = JSON.parse(JSON.stringify(after)) as ConfigState;
    expect(groups(restored)).toEqual(groups(after));
    const template = validateSubBoostTemplateConfig({ ...restored, schema: SUBBOOST_TEMPLATE_CONFIG_SCHEMA });
    expect(template.ok).toBe(true);
    if (template.ok) expect(groups({ ...after, ...template.config })).toEqual(groups(after));
  });

  it("applies the batch in one store update and regenerates valid YAML", () => {
    useConfigStore.setState(state());
    let updates = 0;
    const unsubscribe = useConfigStore.subscribe(() => { updates += 1; });
    useConfigStore.getState().addCustomProxyGroupToGroups("pool", ["module:ai", "custom:other"]);
    unsubscribe();
    expect(updates).toBe(1);
    expect(useConfigStore.getState().generatedYamlError).toBeNull();
    expect(useConfigStore.getState().generatedYaml).toContain("US Pool");
    const renamed = { ...useConfigStore.getState(), customProxyGroups: useConfigStore.getState().customProxyGroups.map((group) => group.id === "pool" ? { ...group, name: "Renamed Pool" } : group) };
    expect(groups(renamed).find((group) => group.name === "🤖 AI 服务")?.proxies?.at(-1)).toBe("Renamed Pool");
  });
});
