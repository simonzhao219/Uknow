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


def classify(status: int, body: object) -> str:
    """把一次 PostgREST 回應歸成五種形狀之一。

    回傳:allowed / filtered_empty / denied_by_rls / denied_by_grant /
    unauthenticated。42501 但訊息無法歸類時 raise ValueError——寧可吵,
    也不要靜默歸錯類。
    """
    return ""
