#!/usr/bin/env bash
# 框架軌：驗證「框架自身」的檔案（CLAUDE.md、.claude/、hooks 腳本）。
#
# 存在理由：框架檔案幾乎全是 .md，會被 CI 主軌的路徑過濾跳過——若無
# 本軌，「框架像 code 一樣走 PR 演進」就是零機械驗證（設計審查 P1）。
# 本軌必須秒級、免依賴安裝、免 secrets，所以永遠執行、不設路徑過濾，
# 也因此可以放進 branch protection 的 required checks 而不會卡 pending。
#
# 檢查對象若不存在（分批交付期間）一律視為通過——本軌驗證的是
# 「存在的框架檔案是否健康」，不是「框架是否已交付完畢」。
set -uo pipefail

cd "$(git rev-parse --show-toplevel)" || exit 1
fail=0

# 1. .claude/settings.json 必須是合法 JSON（hooks/permissions 拼錯會靜默失效）
if [ -f .claude/settings.json ]; then
  if ! python3 -m json.tool .claude/settings.json >/dev/null 2>&1; then
    echo "FAIL: .claude/settings.json 不是合法 JSON"
    fail=1
  fi
fi

# 2. CLAUDE.md 行數上限——context 經濟的硬指標（超過＝該搬去 rules/ 或 docs/）
if [ -f CLAUDE.md ]; then
  lines=$(wc -l < CLAUDE.md)
  if [ "$lines" -gt 200 ]; then
    echo "FAIL: CLAUDE.md 共 ${lines} 行，超過 200 行上限"
    fail=1
  fi
fi

# 3. skills / agents / rules 必須有 YAML frontmatter（缺了會靜默不註冊）
for f in .claude/skills/*/SKILL.md .claude/agents/*.md .claude/rules/*.md; do
  [ -f "$f" ] || continue
  if [ "$(head -1 "$f")" != "---" ]; then
    echo "FAIL: $f 缺 YAML frontmatter（首行必須是 ---）"
    fail=1
  fi
done

# 4. hooks / scripts 腳本：可執行位＋bash 語法
for f in scripts/git-hooks/* scripts/*.sh; do
  [ -f "$f" ] || continue
  if [ ! -x "$f" ]; then
    echo "FAIL: $f 沒有可執行位（chmod +x 後重新提交）"
    fail=1
  fi
  if ! bash -n "$f"; then
    echo "FAIL: $f bash 語法錯誤"
    fail=1
  fi
done

# 5. Claude Code hooks（settings.json 以 bash/python3 顯式呼叫，驗語法即可）
for f in .claude/hooks/*.sh; do
  [ -f "$f" ] || continue
  if ! bash -n "$f"; then
    echo "FAIL: $f bash 語法錯誤"
    fail=1
  fi
done
for f in .claude/hooks/*.py; do
  [ -f "$f" ] || continue
  if ! python3 -m py_compile "$f" 2>/dev/null; then
    echo "FAIL: $f python 語法錯誤"
    fail=1
  fi
done

# 6. hook 的行為測試（不只語法）——閘門自己也要有紅綠燈。
#    friction-log 2026-07-25「pre-commit 誤擋 merge」的防線回填：那次是靠
#    人工模擬才發現的，行為分支沒有自動測試就只能靠事故發現迴歸。
if [ -f scripts/test-hooks.py ]; then
  if ! python3 scripts/test-hooks.py; then
    echo "FAIL: hook 行為測試未過（scripts/test-hooks.py）"
    fail=1
  fi
fi

if [ "$fail" -eq 0 ]; then
  echo "framework-check: OK"
fi
exit "$fail"
