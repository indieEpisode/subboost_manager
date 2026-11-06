import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ props: {} as any }));
vi.mock("emoji-picker-react", () => ({ default: (props: any) => { mocks.props = props; return null; } }));

import { EmojiPickerPanel } from "./emoji-picker-panel";

describe("localized emoji picker adapter", () => {
  it("uses bundled Chinese data and native glyphs and forwards selections intact", () => {
    const onSelect = vi.fn();
    renderToStaticMarkup(React.createElement(EmojiPickerPanel, { onSelect }));
    expect(mocks.props.emojiStyle).toBe("native");
    expect(mocks.props.emojiData.emojis.flags).toEqual(expect.arrayContaining([expect.objectContaining({ u: "1f1fa-1f1f8" })]));
    expect(mocks.props.labels.searchLabel).toBe("搜索 emoji");
    mocks.props.onEmojiClick({ emoji: "🏳️‍🌈" });
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("🏳️‍🌈");
  });
});
