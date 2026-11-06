import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initialState } from "@subboost/ui/store/config-store/definitions";

const mocks = vi.hoisted(() => ({
  state: {} as any,
  selected: undefined as Set<string> | undefined,
  close: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return {
    ...actual,
    useMemo: (factory: () => unknown) => factory(),
    useState: (initial: () => Set<string>) => [mocks.selected ?? initial(), (next: any) => {
      mocks.selected = typeof next === "function" ? next(mocks.selected ?? initial()) : next;
    }],
  };
});
vi.mock("@subboost/ui/store/config-store", () => ({ useConfigStore: () => mocks.state }));
vi.mock("@subboost/ui/components/ui/toaster", () => ({ toast: mocks.toast }));
vi.mock("@subboost/ui/components/ui/dialog", () => {
  const wrapper = ({ children }: any) => React.createElement("div", null, children);
  return { Dialog: wrapper, DialogContent: wrapper, DialogHeader: wrapper, DialogTitle: wrapper, DialogDescription: wrapper, DialogFooter: wrapper };
});
vi.mock("@subboost/ui/components/ui/button", () => ({ Button: ({ children, ...props }: any) => React.createElement("button", props, children) }));

import { CustomGroupBulkAddDialog } from "./custom-group-bulk-add-dialog";

function elements(node: React.ReactNode): React.ReactElement<any>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as React.ReactElement<any>;
  return [element, ...elements(element.props.children)];
}
function render() {
  return CustomGroupBulkAddDialog({ groupId: "pool", onClose: mocks.close });
}
function button(tree: React.ReactElement, label: string) {
  return elements(tree).find((element) => element.props.children === label)!;
}

describe("custom group bulk add dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selected = undefined;
    mocks.state = {
      ...structuredClone(initialState),
      nodes: [], enabledProxyGroups: ["select", "auto", "ai", "youtube"],
      customProxyGroups: [{ id: "pool", name: "Pool", emoji: "", groupType: "select" }],
      addCustomProxyGroupToGroups: vi.fn(),
    };
  });

  it("selects eligible targets, explains skipped targets, and submits once", () => {
    const tree = render();
    const html = renderToStaticMarkup(tree);
    expect(html).toContain("保留原有成员、顺序和默认选择");
    expect(html).toContain("不能添加到自身");
    expect(html).toContain("自动策略组无需手动选择");
    expect(html).toContain("已选 3 个");
    button(tree, "添加到所选分流组").props.onClick();
    expect(mocks.state.addCustomProxyGroupToGroups).toHaveBeenCalledExactlyOnceWith("pool", ["module:select", "module:ai", "module:youtube"]);
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.toast).toHaveBeenCalledOnce();
  });

  it("supports clear, select all, individual selection, cancel, and closing without applying", () => {
    button(render(), "取消全选").props.onClick();
    expect(button(render(), "添加到所选分流组").props.disabled).toBe(true);
    button(render(), "全选可添加分组").props.onClick();
    const input = elements(render()).find((element) => element.type === "input" && !element.props.disabled)!;
    input.props.onChange({ target: { checked: false } });
    expect(mocks.selected?.size).toBe(2);
    input.props.onChange({ target: { checked: true } });
    expect(mocks.selected?.size).toBe(3);
    button(render(), "取消").props.onClick();
    render().props.onOpenChange(false);
    render().props.onOpenChange(true);
    expect(mocks.close).toHaveBeenCalledTimes(2);
    expect(mocks.state.addCustomProxyGroupToGroups).not.toHaveBeenCalled();
  });

  it("revalidates selections when a group becomes unavailable", () => {
    mocks.selected = new Set(["module:ai", "module:youtube"]);
    mocks.state.hiddenProxyGroups = ["ai"];
    mocks.state.proxyGroupAdvanced.youtube = { extraMembers: [{ kind: "custom", id: "pool" }] };
    expect(button(render(), "添加到所选分流组").props.disabled).toBe(true);
    mocks.state.customProxyGroups[0].enabled = false;
    expect(renderToStaticMarkup(render())).toContain("请先启用当前自定义分组");
    expect(button(render(), "全选可添加分组").props.disabled).toBe(true);
  });
});
