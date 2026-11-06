import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ open: false, setOpen: vi.fn(), panel: {} as any, buttons: [] as any[], popover: {} as any, content: {} as any }));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof React>(),
  useState: () => [mocks.open, mocks.setOpen],
}));
vi.mock("next/dynamic", () => ({ default: () => (props: any) => { mocks.panel = props; return React.createElement("div", null, "emoji panel"); } }));
vi.mock("lucide-react", () => ({ Shuffle: () => null }));
vi.mock("./button", () => ({ Button: (props: any) => { mocks.buttons.push(props); return React.createElement("button", { title: props.title }, props.children); } }));
vi.mock("./popover", () => ({
  Popover: (props: any) => { mocks.popover = props; return props.children; },
  PopoverTrigger: (props: any) => props.children,
  PopoverContent: (props: any) => { mocks.content = props; return props.children; },
}));

import { EmojiPickerPopover } from "./emoji-picker";

function render(allowEmpty?: boolean) {
  const onSelect = vi.fn();
  const randomEmoji = vi.fn(() => "🚀");
  const html = renderToStaticMarkup(React.createElement(EmojiPickerPopover, {
    value: "🧩", onSelect, randomEmoji, allowEmpty,
  } as React.ComponentProps<typeof EmojiPickerPopover>, React.createElement("button", null, "open picker")));
  return { onSelect, randomEmoji, html };
}

describe("shared emoji picker", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.open = false; mocks.panel = {}; mocks.buttons = []; });

  it("loads the panel on demand and closes after selecting a full Unicode sequence", () => {
    expect(render().html).not.toContain("emoji panel");
    mocks.popover.onOpenChange(true);
    expect(mocks.setOpen).toHaveBeenCalledWith(true);
    mocks.open = true;
    const { onSelect, html } = render();
    expect(html).toContain("emoji panel");
    mocks.panel.onSelect("🧑🏽‍🚀");
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("🧑🏽‍🚀");
    expect(mocks.setOpen).toHaveBeenLastCalledWith(false);
    const preventDefault = vi.fn();
    mocks.content.onOpenAutoFocus({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it("keeps random selection and optional clearing in the same selection flow", () => {
    const { onSelect, randomEmoji } = render();
    mocks.buttons.find((button) => button.title === "随机 emoji").onClick();
    expect(randomEmoji).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenLastCalledWith("🚀");
    mocks.buttons.find((button) => button.children === "移除表情").onClick();
    expect(onSelect).toHaveBeenLastCalledWith("");
    mocks.buttons = [];
    expect(render(false).html).not.toContain("移除表情");
  });
});
