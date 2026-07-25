#!/usr/bin/env bash
# SessionStart hook:讓 agent 醒來的第一秒就能跑 npm run check。
#
# Harness 原則:環境是工程產物——agent 不該浪費迴圈猜「為什麼 npm test
# 掛了」,缺什麼直接說、能補的直接補。輸出走 stdout(SessionStart 的
# stdout 會進 context),缺件訊息 agent 看得到。
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}" || exit 0

# 1. node 依賴:缺了就裝(prepare script 會順帶掛好 git hooks)
if [ ! -d node_modules ]; then
  echo "[bootstrap] node_modules 不存在,執行 npm ci……(首次約 1-2 分鐘)"
  if ! npm ci --no-audit --no-fund 2>&1 | tail -2; then
    echo "[bootstrap] npm ci 失敗——請檢查網路/proxy 後手動執行 npm ci"
  fi
fi

# 2. git hooks 掛載確認(npm ci 可能被跳過的情況下補掛)
if [ "$(git config core.hooksPath 2>/dev/null)" != "scripts/git-hooks" ]; then
  git config core.hooksPath scripts/git-hooks 2>/dev/null \
    && echo "[bootstrap] 已掛載 git hooks(core.hooksPath=scripts/git-hooks)"
fi

# 3. TDD 鎖殘留校驗:上一個 session 若在綠燈後死掉,鎖會殘留並誤擋
#    新紅燈期的測試編輯。git log 最後一筆不是 test(red) 就代表鎖過期。
if [ -f .claude/tdd-lock ]; then
  last=$(git log -1 --pretty=%s 2>/dev/null || echo "")
  case "$last" in
    "test(red)"*|"test:"*"red"*)
      echo "[bootstrap] TDD 紅燈期進行中(.claude/tdd-lock 存在,最後 commit:$last)" ;;
    *)
      echo "[bootstrap] ⚠️ 偵測到殘留的 .claude/tdd-lock(最後 commit 非紅燈:$last)。"
      echo "  若上輪已綠:跑 scripts/tdd-unlock.sh(check 綠會自動清鎖);"
      echo "  若紅燈仍在進行:忽略本訊息繼續實作。" ;;
  esac
fi

# 4. 選配工具存在性(缺了只提示,不擋——動到對應領域才需要)
command -v deno >/dev/null 2>&1 \
  || echo "[bootstrap] 提示:無 deno——動 supabase/functions 前需安裝 https://docs.deno.com/runtime/getting_started/installation/"
command -v supabase >/dev/null 2>&1 \
  || echo "[bootstrap] 提示:無 supabase CLI——跑 Deno 測試(deno task test)前需安裝"

exit 0
