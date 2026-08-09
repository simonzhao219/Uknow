"""刊登名稱的單一產生器——40_listing 與 60_time_scenarios 共用。

原本 f40 與 f60 各有一份一模一樣的 `f"服務{run_id}{node}"`,兩份一起錯、
也必須一起修;收斂成一處之後,「名稱怎麼產生」只有一個答案。

⚠️ 名稱最後會被送進 CreateServiceProvider 的 `#name`,而該欄位有
`maxLength={10}`(產品規則,src/utils/constants.ts 的 NAME_MAX_LENGTH)。
超過上限時 Playwright 的 `fill()` 會被瀏覽器**靜默截斷**——表單照樣通過
驗證、刊登照樣建得起來,只有名字短了一截,失敗因此出現在很遠的地方。
長度不變式由 tools/test_listing_name.py 釘住(離線,journey-offline 軌會跑)。
"""

from __future__ import annotations

# 對齊 src/utils/constants.ts 的 NAME_MAX_LENGTH。這裡刻意抄一份常數而不是
# 執行期去讀 TS 檔:journey 跑在真瀏覽器前面,不該為了一個常數多一次檔案 IO
# 與一條失敗路徑。抄本與產品端的一致性由 test_listing_name.py 直接讀
# constants.ts 比對,漂移會在離線軌就紅。
NAME_MAX_LENGTH = 10

# run_id 形如 "gh31231809650"(GitHub run id 前綴 gh)。取尾碼即可:每場
# journey 都跑在自己的拋棄式 Supabase 分支上,跨場撞名不會互相看見,尾 4 碼
# 只是讓同一場的資料在人工查看時仍可辨識來源。
_RUN_ID_SUFFIX_LEN = 4


def listing_name(run_id: str, node: str) -> str:
    """刊登名稱。決定性(只由 run_id 與 node 導出)是刻意的——跨情境用的是
    不同的 browser context,不共享任何狀態也能重建出同一個名稱。

    Raises:
        ValueError: 產生的名稱超過 NAME_MAX_LENGTH。寧可在這裡大聲炸掉,
            也不要讓它進到表單裡被靜默截斷——後者的除錯成本高一個量級。
    """
    name = f"服務{run_id[-_RUN_ID_SUFFIX_LEN:]}{node}"
    if len(name) > NAME_MAX_LENGTH:
        raise ValueError(
            f"刊登名稱 {name!r} 有 {len(name)} 字,超過 #name 的上限 "
            f"{NAME_MAX_LENGTH}——填進表單會被瀏覽器靜默截斷。"
            f"(run_id={run_id!r} node={node!r})"
        )
    return name
