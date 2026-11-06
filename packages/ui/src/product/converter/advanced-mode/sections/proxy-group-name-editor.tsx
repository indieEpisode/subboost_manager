"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { EmojiPickerPopover } from "@subboost/ui/components/ui/emoji-picker";
import { Input } from "@subboost/ui/components/ui/input";
import { Button } from "@subboost/ui/components/ui/button";
import { cn } from "@subboost/ui/lib/utils";
import { splitLeadingEmoji } from "@subboost/core/proxy-group-name";

export type ProxyGroupNameDraft = {
  emoji: string;
  name: string;
};

export type ProxyGroupNameDraftInput = ProxyGroupNameDraft | string | null | undefined;

export const PROXY_GROUP_EMOJI_PALETTE = [
  "🧩",
  "🚀",
  "⚡",
  "🤖",
  "🎯",
  "🔍",
  "🛡️",
  "🌐",
  "📡",
  "🔗",
  "💎",
  "✨",
  "🇺🇸",
  "🇭🇰",
  "🇯🇵",
  "🇸🇬",
  "🇰🇷",
  "🇹🇼",
  "🇬🇧",
  "🇩🇪",
];

export function parseProxyGroupNameDraft(raw: string, fallbackEmoji = "🧩"): ProxyGroupNameDraft {
  const safeRaw = typeof raw === "string" ? raw : "";
  const parsed = splitLeadingEmoji(safeRaw);
  if (parsed.hasEmojiPrefix) {
    return { emoji: parsed.emoji, name: parsed.label };
  }
  return {
    emoji: fallbackEmoji.trim(),
    name: safeRaw.trim(),
  };
}

export function toProxyGroupNameDraft(value: ProxyGroupNameDraftInput, fallbackEmoji = "🧩"): ProxyGroupNameDraft {
  if (typeof value === "string") {
    return parseProxyGroupNameDraft(value, fallbackEmoji);
  }

  if (!value || typeof value !== "object") {
    return { emoji: fallbackEmoji.trim(), name: "" };
  }

  return {
    emoji: typeof value.emoji === "string" ? value.emoji.trim() : fallbackEmoji.trim(),
    name: typeof value.name === "string" ? value.name.trim() : "",
  };
}

export function buildProxyGroupName(draft: ProxyGroupNameDraftInput): string {
  const normalized = toProxyGroupNameDraft(draft, "");
  const name = normalized.name.trim();
  const emoji = normalized.emoji.trim();
  if (!name) return "";
  return emoji ? `${emoji} ${name}` : name;
}

export function pickRandomEmoji(current = ""): string {
  const pool = PROXY_GROUP_EMOJI_PALETTE.filter((emoji) => emoji !== current.trim());
  const choices = pool.length > 0 ? pool : PROXY_GROUP_EMOJI_PALETTE;
  return choices[Math.floor(Math.random() * choices.length)] ?? "🧩";
}

export function ProxyGroupNameEditor({
  value,
  onChange,
  namePlaceholder = "代理组名称",
  allowEmptyEmoji = true,
  autoFocus,
  className,
  onKeyDown,
}: {
  value: ProxyGroupNameDraftInput;
  onChange: (value: ProxyGroupNameDraft) => void;
  namePlaceholder?: string;
  allowEmptyEmoji?: boolean;
  autoFocus?: boolean;
  className?: string;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const draft = toProxyGroupNameDraft(value);

  const setEmoji = (emoji: string) => {
    onChange({ ...draft, emoji: emoji.trim() });
  };

  return (
    <div className={cn("flex min-w-0 flex-1 items-center gap-1", className)}>
      <div className="relative h-7 w-[51px] shrink-0">
        <Input
          value={draft.emoji}
          onChange={(e) => {
            const next = e.target.value.trim();
            if (!next && !allowEmptyEmoji) return;
            setEmoji(next);
          }}
          className="h-7 w-full pl-2 pr-5 text-center text-xs"
          placeholder={allowEmptyEmoji ? "" : "🧩"}
          title="emoji"
          aria-label="emoji"
        />
        <EmojiPickerPopover value={draft.emoji} onSelect={setEmoji}
          randomEmoji={() => pickRandomEmoji(draft.emoji)} allowEmpty={allowEmptyEmoji}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 h-4 w-4 -translate-y-1/2 shrink-0 px-0 text-fg-45 hover:text-fg"
            title="选择 emoji"
            aria-label="选择 emoji"
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
        </EmojiPickerPopover>
      </div>
      <Input
        value={draft.name}
        onChange={(e) => onChange({ ...draft, name: e.target.value })}
        className="h-7 min-w-0 flex-1 text-xs"
        placeholder={namePlaceholder}
        autoFocus={autoFocus}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
