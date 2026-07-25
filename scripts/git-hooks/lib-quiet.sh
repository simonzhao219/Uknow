#!/usr/bin/env bash
# pre-commit 的「綠燈安靜化」包裝器。供 pre-commit source,不直接執行。
#
# 為什麼要有:`npm run check` 綠燈時仍吐 200+ 行——光 biome 的 advisory
# warning 就 214 條(導入時降級為 warn 的存量債,見 friction-log)。那些行在
# 綠燈時資訊量為零:對 Claude 是每次 commit 都付一次的 context 支出,對人是
# 每次 commit 都要滑過去的雜訊。紅燈時原樣全印——失敗才是要讀的東西。
#
# 為什麼抽成獨立檔案:這是 commit 閘門的一部分,而閘門自己必須有紅綠燈
# (framework-check 的既有原則)。內嵌在 pre-commit 裡就沒有可測的接縫——
# pre-commit 一被 source 就會開始跑閘門。抽出來之後 scripts/test-hooks.py
# 可以直接餵 true/false 驗兩個方向,不需要真的跑一次 npm run check。
#
# **exit code 一律原樣傳遞。** 這是本檔唯一的致命失敗模式:這裡是 commit
# 閘門,吞掉退出碼等於閘門失效——而且是「看起來正常」的失效。所以顯式
# 捕捉 $? 再 return,不讓 pipeline 的最後一段決定成敗。
#
# PRE_COMMIT_VERBOSE=1 取回完整輸出(折疊會吃掉即時進度與顏色)。

# run_gate_quiet <label> <指令...>
#   綠燈:印一行摘要,回傳 0
#   紅燈:原樣印出全部輸出到 stderr,回傳原始退出碼
run_gate_quiet() {
  local label="$1"
  shift

  if [ "${PRE_COMMIT_VERBOSE:-0}" = "1" ]; then
    "$@"
    return $?
  fi

  local out rc lines
  out=$("$@" 2>&1)
  rc=$?

  if [ "$rc" -eq 0 ]; then
    lines=$(printf '%s\n' "$out" | wc -l | tr -d ' ')
    echo "[pre-commit] ${label} 綠燈（${lines} 行輸出已折疊；PRE_COMMIT_VERBOSE=1 看完整輸出）"
  else
    printf '%s\n' "$out" >&2
  fi

  return "$rc"
}
