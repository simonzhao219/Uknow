#!/usr/bin/env python3
"""UserPromptSubmit hook:依 CLAUDE.md「模型與 effort 分級」表格提示建議的 model/effort。

存在理由:CLAUDE.md 已經有一張人工維護的分級表,但表格只在有人記得回去看
時才生效。UserPromptSubmit 是官方文件裡唯一「在 Claude 看到 prompt 之前」
執行、且 stdout 的 `hookSpecificOutput.additionalContext` 會被當成 context
塞回去的 hook event(PreToolUse 只能擋工具呼叫,SessionStart 只在整個
session 開始時跑一次)——這裡不是新規則,只是把既有規則從文件搬到「開始
動手前」這個時間點,讓機械提醒取代「記得回去翻表格」。

為什麼只在偵測到強訊號時才出聲,不是每個 prompt 都印一段:
CLAUDE.md 表格四類裡「一般功能實作、修 bug」本來就是預設值(Sonnet、
預設 effort),不需要提醒——提醒的邊際價值只在兩端:touches 金流/會籍/
獎勵/跨層契約這種該升到 Opus 的訊號,或改文案/log 這種該降 effort 省
成本的訊號。每個 prompt 都印一樣的話,幾輪後就會被當雜訊略過(狼來了),
所以刻意做成稀疏的、只在命中關鍵字時開口。

為什麼是建議而不是強制:model/effort 切換是互動式的 `/model` `/effort`
指令,hook 沒有介面替使用者按下去(UserPromptSubmit 能加 context、不能
改寫 prompt 本身,官方文件明講這點),所以這裡的角色止於「讓 Claude 在
動手前主動提醒使用者」,決定權留在人身上——如同框架裡其他建議類機制
(deletion-residue-check),不是 deny 閘門。

決策邏輯抽成純函式 classify(),與其他 hook 同慣例,方便 test-hooks.py
表格化驗證。
"""

from __future__ import annotations

import json
import sys

# 對應 CLAUDE.md「模型與 effort 分級」表格的 Opus 那一列:
# 金流·會籍·獎勵規則、跨層契約、api/index.ts 結構調整
OPUS_SIGNALS = (
    "金流",
    "payuni",
    "會籍",
    "獎勵",
    "提領",
    "退款",
    "跨層契約",
    "api/index.ts",
    "edge function",
    "database schema",
    "資料庫 schema",
    "migration",
)

# 對應「改文案、加 log、修 typo」那一列
LIGHT_SIGNALS = (
    "改文案",
    "文案調整",
    "錯字",
    "typo",
    "加個 log",
    "加 log",
    "log 訊息",
    "console.log",
    "調整措辭",
    "wording",
)


def classify(prompt: str) -> dict | None:
    """回傳建議 dict,或 None 表示沒有強訊號、維持預設(Sonnet、預設 effort)。

    純函式,無 I/O。統一轉小寫比對——中文關鍵字轉小寫是 no-op,英文/
    英數混排(如 PayUni、api/index.ts)則靠這步做到大小寫不敏感。
    """
    lowered = (prompt or "").lower()

    opus_hits = [kw for kw in OPUS_SIGNALS if kw in lowered]
    if opus_hits:
        return {
            "rule": "opus-tier",
            "model": "opus",
            "effort": None,
            "signals": opus_hits,
            "message": (
                "[model-effort-advisor] 本次提示命中 CLAUDE.md「模型與 effort "
                f"分級」表格的金流/會籍/獎勵/跨層契約類別(關鍵字:{'、'.join(opus_hits)})。"
                "建議切到 Opus 再繼續(`/model opus`)——這類改動出錯代價高,"
                "值得多花 reasoning token。這只是建議,由你決定是否切換。"
            ),
        }

    light_hits = [kw for kw in LIGHT_SIGNALS if kw in lowered]
    if light_hits:
        return {
            "rule": "light-tier",
            "model": "sonnet",
            "effort": "low",
            "signals": light_hits,
            "message": (
                "[model-effort-advisor] 本次提示命中 CLAUDE.md「模型與 effort "
                f"分級」表格的文案/log/typo 類別(關鍵字:{'、'.join(light_hits)})。"
                "建議維持 Sonnet 並降 effort(`/effort low`)——這類改動不需要"
                "高 reasoning 預算。這只是建議,由你決定是否切換。"
            ),
        }

    return None


def _record(rule: str | None) -> None:
    """記一次決策給 harness 感測器(理由見 decision_log.py 檔頭)。"""
    try:
        import decision_log

        decision_log.record("model-effort-advisor", rule)
    except Exception:  # noqa: BLE001 — 量測的優先序永遠低於工作
        return


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return  # 讀不懂就放行——advisor 壞掉不該擋任何 prompt

    prompt = str(payload.get("user_prompt") or payload.get("prompt") or "")
    suggestion = classify(prompt)
    _record(suggestion["rule"] if suggestion else None)

    if suggestion:
        print(
            json.dumps(
                {
                    "hookSpecificOutput": {
                        "hookEventName": "UserPromptSubmit",
                        "additionalContext": suggestion["message"],
                    }
                },
                ensure_ascii=False,
            )
        )


if __name__ == "__main__":
    main()
