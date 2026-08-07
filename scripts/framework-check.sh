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

# 7. CI workflow 設定的語意檢查。既有閘門對 .github/workflows/ 只驗「GitHub
#    願不願意跑」，設定寫了但不生效（語意錯誤）沒有任何一層會紅——2026-07-25
#    的 changes 路徑過濾就是這樣漏網的。檢查器自己也表格化驗行為。
if [ -f scripts/check-workflows.py ]; then
  if ! python3 scripts/check-workflows.py --self-test; then
    echo "FAIL: workflow 檢查器自身的表格案例未過（scripts/check-workflows.py）"
    fail=1
  fi
  if ! python3 scripts/check-workflows.py; then
    echo "FAIL: CI workflow 設定檢查未過（scripts/check-workflows.py）"
    fail=1
  fi
fi

# 8. 測試命名的機械檢查——命名慣例只寫在文件裡一定會漂（見
#    .claude/rules/test-naming.md）。同樣先驗檢查器自己再驗 repo。
if [ -f scripts/check-test-names.py ]; then
  if ! python3 scripts/check-test-names.py --self-test; then
    echo "FAIL: 測試命名檢查器自身的表格案例未過（scripts/check-test-names.py）"
    fail=1
  fi
  if ! python3 scripts/check-test-names.py; then
    echo "FAIL: 測試命名檢查未過（scripts/check-test-names.py）"
    fail=1
  fi
fi

# 9. 規格書漂移。規格書是 plan-reviewer-requirements 的溯源對象（對不到章節的
#    功能斷言一律 P0），所以它失真時這道審查閘門不是失效而是**反向作用**——
#    用作廢的規則擋掉正確的規劃。2026-07-25 的文件整理發現多處與實作相反的
#    敘述，且落差曾被三份文件各自旁註「以程式碼為準」卻沒人回頭修上游。
#    人工逐條比對不會發生第二次，所以接一道機器。
if [ -f scripts/check-spec-drift.py ]; then
  if ! python3 scripts/check-spec-drift.py --self-test; then
    echo "FAIL: 規格書漂移檢查器自身的表格案例未過（scripts/check-spec-drift.py）"
    fail=1
  fi
  if ! python3 scripts/check-spec-drift.py; then
    echo "FAIL: 規格書與程式碼不一致（scripts/check-spec-drift.py）"
    fail=1
  fi
fi

# 10. docs/ 文件命名的機械檢查——命名慣例只寫在文件裡一定會漂（見
#     .claude/rules/document-naming.md）。同樣先驗檢查器自己再驗 repo。
if [ -f scripts/check-document-naming.py ]; then
  if ! python3 scripts/check-document-naming.py --self-test; then
    echo "FAIL: 文件命名檢查器自身的表格案例未過（scripts/check-document-naming.py）"
    fail=1
  fi
  if ! python3 scripts/check-document-naming.py; then
    echo "FAIL: 文件命名檢查未過（scripts/check-document-naming.py）"
    fail=1
  fi
fi

# 11. Context 預算與讀取成本。其餘各軌驗「設定寫對了沒」，這一軌驗「這個
#     repo 對 agent 來說貴不貴」——啟動固定成本、單檔讀取成本（軟警戒）、
#     以及 rule 的 paths 是否真的匹配得到檔案（匹配不到＝宣告了但永遠不
#     載入，與 2026-07-25 的 changes 路徑過濾同一類 bug）。
if [ -f scripts/check-context-budget.py ]; then
  if ! python3 scripts/check-context-budget.py --self-test; then
    echo "FAIL: context 預算檢查器自身的表格案例未過（scripts/check-context-budget.py）"
    fail=1
  fi
  if ! python3 scripts/check-context-budget.py; then
    echo "FAIL: context 預算檢查未過（scripts/check-context-budget.py）"
    fail=1
  fi
fi

# 12. 受控 input 的 IME 安全性。2026-08-07 的 iOS 注音災情(姓名欄位打不了字)
#     在三層閘門下全綠通過:vitest 用 fireEvent.change、e2e 用 Playwright fill(),
#     兩者模擬的都是「已組完字」的終點狀態,組字生命週期從來沒被走過;
#     biome/typecheck 看不出「這個 setState 發生在組字期間」。
#     **但「onChange 有沒有原樣接受 e.target.value」是靜態看得出來的**——這一軌
#     守的是那個形狀,不證明 iOS 上不會壞(那只有真機能證明),而是證明沒有人
#     再度引入它。同樣先驗檢查器自己再驗 repo。
if [ -f scripts/check-ime-safe-inputs.py ]; then
  if ! python3 scripts/check-ime-safe-inputs.py --self-test; then
    echo "FAIL: IME 安全性檢查器自身的表格案例未過（scripts/check-ime-safe-inputs.py）"
    fail=1
  fi
  if ! python3 scripts/check-ime-safe-inputs.py; then
    echo "FAIL: 受控 input 的 IME 安全性檢查未過（scripts/check-ime-safe-inputs.py）"
    fail=1
  fi
fi

# 13. Harness 感測器的讀取器。前十一項驗的都是「閘門有沒有壞」,這一項驗的是
#     「量測閘門的那支東西有沒有壞」——感測器故障是靜默的(閘門壞了會擋住人,
#     感測器壞了只是不再記錄),所以它比閘門更需要機器盯著。
#     repo 掃描本身不擋:「還沒有資料」是全新 clone 的正常狀態,只有「日誌裡
#     全是讀不懂的行」才紅(見該檔的無資料不變式)。
if [ -f scripts/harness-metrics.py ]; then
  if ! python3 scripts/harness-metrics.py --self-test; then
    echo "FAIL: harness 指標讀取器自身的表格案例未過（scripts/harness-metrics.py）"
    fail=1
  fi
  if ! python3 scripts/harness-metrics.py >/dev/null; then
    echo "FAIL: harness 指標日誌無法解析（scripts/harness-metrics.py）"
    fail=1
  fi
fi

if [ "$fail" -eq 0 ]; then
  echo "framework-check: OK"
fi
exit "$fail"
