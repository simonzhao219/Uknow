#!/usr/bin/env bash
# TDD 相位鎖的唯一合法解鎖路徑。
#
# 鎖（.claude/tdd-lock）的意義：紅燈期進行中——測試已 commit、實作未綠。
# 鎖存在時：pre-commit 走紅燈通道（跳過 vitest）、Claude Code 的
# PreToolUse hook 擋 *.test.* 編輯（防「改測試遷就實作」）。
#
# 解鎖必須經過本腳本：npm run check 全綠才刪鎖——這讓「宣稱綠燈」和
# 「真的綠燈」之間沒有縫隙。直接 rm 鎖檔等於自欺，防的是無意疏忽，
# 不是蓄意繞過（蓄意繞過防不了，也不必防——單人專案騙的是自己）。
set -uo pipefail

cd "$(git rev-parse --show-toplevel)" || exit 1

if [ ! -f .claude/tdd-lock ]; then
  echo "[tdd-unlock] 沒有鎖（.claude/tdd-lock 不存在），無事可做。"
  exit 0
fi

echo "[tdd-unlock] 驗證 npm run check……"
if npm run check; then
  rm -f .claude/tdd-lock
  echo ""
  echo "[tdd-unlock] check 全綠，紅燈期結束、鎖已解除。"
  echo "  下一步：commit 綠燈實作（feat/fix + 測試不動），更新 progress.md。"
else
  echo "" >&2
  echo "[tdd-unlock] check 未過——鎖保留、紅燈期繼續。" >&2
  echo "  繼續實作至綠；卡住時把 blocker 記入 progress.md 並求人工裁決" >&2
  echo "  （不准為了綠而改測試——那要先人工裁決並記錄）。" >&2
  exit 1
fi
