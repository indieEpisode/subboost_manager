"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Shuffle } from "lucide-react";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import styles from "./emoji-picker.module.css";

const EmojiPickerPanel = dynamic(() => import("./emoji-picker-panel").then((module) => module.EmojiPickerPanel), {
  ssr: false,
  loading: () => <div role="status" className="grid h-80 place-items-center text-sm text-fg-50">正在加载表情…</div>,
});

export function EmojiPickerPopover({ value, onSelect, randomEmoji, allowEmpty = true, children }: {
  value: string;
  onSelect: (emoji: string) => void;
  randomEmoji: () => string;
  allowEmpty?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const select = (emoji: string) => {
    onSelect(emoji);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" aria-label="选择 emoji" className={`${styles.popover} w-[352px] overflow-hidden rounded-2xl p-0`}
        onOpenAutoFocus={(event) => event.preventDefault()}>
        <div className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-fg">选择表情</p>
            <p className="text-[11px] text-fg-40">让分组更容易辨认</p>
          </div>
          <span aria-label="当前表情" className="grid h-9 w-9 place-items-center rounded-xl border border-ink/10 bg-ink/5 text-2xl">{value || "☺️"}</span>
        </div>
        {open && <EmojiPickerPanel onSelect={select} />}
        <div className="flex items-center justify-between gap-2 border-t border-ink/10 px-3 py-2">
          <Button type="button" variant="ghost" size="sm" title="随机 emoji" className="h-7 gap-1.5 px-2 text-xs text-fg-60"
            onClick={() => select(randomEmoji())}>
            <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />随机一个
          </Button>
          {allowEmpty && <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-fg-40"
            onClick={() => select("")}>移除表情</Button>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
