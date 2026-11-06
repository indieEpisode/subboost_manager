"use client";

import Picker, { type PickerLabels } from "emoji-picker-react";
import emojiData from "emoji-picker-react/data/emojis-zh";
import styles from "./emoji-picker.module.css";

const labels: PickerLabels = {
  searchPlaceholder: "搜索表情，如：笑脸、火箭、美国",
  searchLabel: "搜索 emoji",
  searchClear: "清除搜索",
  searchResultsNone: "没有找到相关表情，试试其他关键词",
  searchResultsOne: "找到 1 个表情",
  searchResultsMany: "找到 %n 个表情",
  categoryNavigation: "表情分类",
  reactions: "常用表情",
  expandReactions: "展开所有表情",
  loading: "正在加载表情…",
  loadingError: "表情加载失败",
  retryLoading: "重新加载",
  skinToneNeutral: "默认肤色",
  skinToneLight: "浅肤色",
  skinToneMediumLight: "中浅肤色",
  skinToneMedium: "中等肤色",
  skinToneMediumDark: "中深肤色",
  skinToneDark: "深肤色",
};

export function EmojiPickerPanel({ onSelect }: { onSelect: (emoji: string) => void }) {
  return (
    <Picker
      className={styles.picker}
      emojiData={emojiData}
      emojiStyle="native"
      theme="light"
      width="100%"
      height="min(396px, max(220px, calc(var(--radix-popover-content-available-height, 520px) - 104px)))"
      columns={8}
      autoFocusSearch
      keepSearchFocus
      suggestedEmojisMode="recent"
      labels={labels}
      previewConfig={{ defaultEmoji: "1f60a", defaultCaption: "找到一个喜欢的表情", showPreview: true }}
      onEmojiClick={({ emoji }) => onSelect(emoji)}
    />
  );
}
