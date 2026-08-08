"""PostgREST 回應的分類純函式——RLS 行為斷言的判讀核心。

**零網路依賴**(比照 `time_shift.py`):網路 client 在 `rest_as_user.py`。
這樣拆是因為離線軌 `pytest tools/ -q` 會跑本模組的配對測試,而
`classify()` 正是本 feature 唯一能在本機跑紅綠燈的邏輯。

為什麼需要分類器:**RLS 違規與 GRANT 拒絕共用同一個 SQLSTATE(42501)**,
只能靠 message 文字辨別。分不出來的話,「被拒絕」這個斷言會失去辨別力
——即使 policy 根本沒生效、拒絕來自不相干的權限層,測試也照樣綠
(同一個教訓見 `supabase/functions/api/name-write-paths.test.ts` 檔頭)。

還有第二個容易寫錯的地方:**被 USING 過濾不是錯誤**。PostgREST 對
SELECT/UPDATE/DELETE 的 RLS 過濾回 200/204 + 0 列,不回 403。只斷言
「請求失敗」的測試在 policy 全開時也會過。
"""

from __future__ import annotations

ALLOWED = "allowed"
FILTERED_EMPTY = "filtered_empty"
DENIED_BY_RLS = "denied_by_rls"
DENIED_BY_GRANT = "denied_by_grant"
UNAUTHENTICATED = "unauthenticated"

# Postgres 對「新列不符 WITH CHECK」與「既有列不符 USING(僅 INSERT/UPDATE
# 會拋錯)」都用這句;GRANT 層不足則一律是 "permission denied for <物件類型>"。
# 兩者的 SQLSTATE 同為 42501,所以只有訊息分得出來。
_RLS_MARKER = "violates row-level security policy"
_GRANT_MARKER = "permission denied for"


def classify(status: int, body: object) -> str:
    """把一次 PostgREST 回應歸成五種形狀之一。

    回傳:allowed / filtered_empty / denied_by_rls / denied_by_grant /
    unauthenticated。42501 但訊息無法歸類時 raise ValueError——寧可吵,
    也不要靜默歸錯類。

    **狀態碼是線索,訊息才是判準。** 401 不能直接當成 unauthenticated:
    PostgREST 把 42501 對**匿名角色**映成 401、對已認證角色才映成 403,
    所以訪客踩到 RLS 時拿到的是 401 + RLS 訊息。先看狀態碼就會把它歸成
    「沒登入」,而那正好是這個分類器要避免的失去辨別力(2026-08-08 run
    31232337950 的 `訪客不能建立刊登` 就是這樣紅的——policy 有生效,
    是判讀錯了)。
    """
    if 200 <= status < 300:
        # 204 無 body、200 帶空陣列:兩者都是「被 USING 過濾成 0 列」的樣子。
        # 這**不是**錯誤——只斷言「請求失敗」的測試在 policy 全開時也會過。
        if body is None or (isinstance(body, list) and not body):
            return FILTERED_EMPTY
        return ALLOWED

    message = body.get("message", "") if isinstance(body, dict) else ""
    if _RLS_MARKER in message:
        return DENIED_BY_RLS
    if _GRANT_MARKER in message:
        return DENIED_BY_GRANT

    # 訊息不是兩種 42501 的任一種,401 才真的是「沒帶/帶了壞的 JWT」
    # (PostgREST 回 JWSError…、JWT expired 之類)。
    if status == 401:
        return UNAUTHENTICATED

    # 歸不了類就吵。靜默猜一個等於讓「被拒絕」的斷言失去辨別力,
    # 而那正是這個分類器存在的理由。
    raise ValueError(
        f"無法歸類的 PostgREST 回應:status={status} body={body!r}。"
        "若這是新的拒絕形狀,請先確認它是 RLS 還是 GRANT 造成的,再擴充本函式。"
    )
