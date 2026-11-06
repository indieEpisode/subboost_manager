import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buttons: [] as any[],
  pickers: [] as any[],
  inputs: [] as any[],
}));

vi.mock("lucide-react", () => ({
  ChevronDown: () => null,
  Shuffle: () => null,
}));

vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: any) => {
    mocks.buttons.push(props);
    return props.children;
  },
}));

vi.mock("@subboost/ui/components/ui/emoji-picker", () => ({
  EmojiPickerPopover: (props: any) => {
    mocks.pickers.push(props);
    return props.children;
  },
}));

vi.mock("@subboost/ui/components/ui/input", () => ({
  Input: (props: any) => {
    mocks.inputs.push(props);
    return null;
  },
}));

vi.mock("@subboost/ui/lib/utils", () => ({
  cn: (...parts: unknown[]) => parts.filter(Boolean).join(" "),
}));

import {
  ProxyGroupNameEditor,
  PROXY_GROUP_EMOJI_PALETTE,
  buildProxyGroupName,
  parseProxyGroupNameDraft,
  toProxyGroupNameDraft,
} from "./proxy-group-name-editor";

describe("ProxyGroupNameEditor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.buttons = [];
    mocks.pickers = [];
    mocks.inputs = [];
  });

  it("parses and builds proxy group name drafts", () => {
    expect(PROXY_GROUP_EMOJI_PALETTE.length).toBeGreaterThan(10);
    expect(PROXY_GROUP_EMOJI_PALETTE).toEqual(expect.arrayContaining(["🤖", "🚀", "🇺🇸"]));
    expect(parseProxyGroupNameDraft("🤖 AI 服务", "🧩")).toEqual({ emoji: "🤖", name: "AI 服务" });
    expect(parseProxyGroupNameDraft("Group A", "")).toEqual({ emoji: "", name: "Group A" });
    expect(parseProxyGroupNameDraft(123 as any, "🔗")).toEqual({ emoji: "🔗", name: "" });
    expect(toProxyGroupNameDraft("⚡ 快速选择", "🔗")).toEqual({ emoji: "⚡", name: "快速选择" });
    expect(toProxyGroupNameDraft(null)).toEqual({ emoji: "🧩", name: "" });
    expect(toProxyGroupNameDraft({ emoji: "", name: "" }, "🔗")).toEqual({ emoji: "", name: "" });
    expect(toProxyGroupNameDraft({ emoji: 1 as any, name: 2 as any }, "🔗")).toEqual({ emoji: "🔗", name: "" });
    expect(buildProxyGroupName({ emoji: "🧩", name: "自定义" })).toBe("🧩 自定义");
    expect(buildProxyGroupName("🔗 链路")).toBe("🔗 链路");
    expect(buildProxyGroupName({ emoji: "", name: "自定义" })).toBe("自定义");
    expect(buildProxyGroupName({ emoji: "🧩", name: "   " })).toBe("");
  });

  it("edits emoji and name values through the shared control", () => {
    const onChange = vi.fn();
    const onKeyDown = vi.fn();
    vi.spyOn(Math, "random").mockReturnValue(0);

    const html = renderToStaticMarkup(
      React.createElement(ProxyGroupNameEditor, {
        value: { emoji: "🧩", name: "旧名称" },
        onChange,
        namePlaceholder: "代理组名称",
        allowEmptyEmoji: false,
        autoFocus: true,
        onKeyDown,
      })
    );

    const emojiInput = mocks.inputs.find((props: any) => props["aria-label"] === "emoji");
    const nameInput = mocks.inputs.find((props: any) => props.placeholder === "代理组名称");
    expect(emojiInput).toEqual(expect.objectContaining({ value: "🧩" }));
    expect(html).toContain("w-[51px]");
    expect(emojiInput.className).toContain("pl-2");
    expect(emojiInput.className).toContain("pr-5");
    expect(nameInput).toEqual(expect.objectContaining({ value: "旧名称", autoFocus: true }));
    expect(mocks.buttons.find((props: any) => props.title === "随机 emoji")).toBeUndefined();
    expect(mocks.buttons.find((props: any) => props.title === "选择 emoji").className).toContain("right-1");
    expect(mocks.pickers[0]).toEqual(expect.objectContaining({ value: "🧩", allowEmpty: false }));

    emojiInput.onChange({ target: { value: "" } });
    expect(onChange).not.toHaveBeenCalled();

    emojiInput.onChange({ target: { value: "🤖" } });
    expect(onChange).toHaveBeenCalledWith({ emoji: "🤖", name: "旧名称" });

    nameInput.onChange({ target: { value: "新名称" } });
    expect(onChange).toHaveBeenCalledWith({ emoji: "🧩", name: "新名称" });

    mocks.pickers[0].onSelect(mocks.pickers[0].randomEmoji());
    expect(onChange).toHaveBeenCalledWith({ emoji: "🚀", name: "旧名称" });
    mocks.pickers[0].onSelect("🧑🏽‍🚀");
    expect(onChange).toHaveBeenCalledWith({ emoji: "🧑🏽‍🚀", name: "旧名称" });

    nameInput.onKeyDown({ key: "Enter" });
    expect(onKeyDown).toHaveBeenCalledWith({ key: "Enter" });
  });

  it("allows clearing optional emojis and keeps the name unchanged", () => {
    const onChange = vi.fn();
    renderToStaticMarkup(React.createElement(ProxyGroupNameEditor, { value: "🔗 自动选择", onChange }));
    expect(mocks.pickers[0].allowEmpty).toBe(true);
    mocks.pickers[0].onSelect("");
    expect(onChange).toHaveBeenCalledWith({ emoji: "", name: "自动选择" });
    mocks.inputs.find((props: any) => props["aria-label"] === "emoji").onChange({ target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith({ emoji: "", name: "自动选择" });
  });
});
