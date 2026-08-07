"""以「使用者身分」直打 PostgREST 的 client——RLS 行為驗證的載體。

與 `supa.py` 的分工:`SupabaseAdmin` 一律用 service_role(**繞過 RLS**),
是測試基礎設施;這裡用 anon key + 使用者 access token,走的正是前端
(CreateServiceProvider / EditServiceProvider / ServiceProviderManagement)
實際走的那條路——RLS 在這條路上是唯一的授權機制。

**純網路 client,不放純函式**(比照 `supa.py`,無配對測試檔)。
回應的判讀邏輯在零網路依賴的 `rls_probe.py`,由 `test_rls_probe.py`
離線覆蓋——這個分層是刻意的,見 `time_shift.py` 的同款先例。

⚠️ 只在拋棄式測試分支上使用;conftest 已擋下 ref 指向正式專案的設定錯誤。
"""

from __future__ import annotations

from dataclasses import dataclass, field

import requests


@dataclass
class RestAsUser:
    """PostgREST client。`access_token` 為 None 時就是未登入的訪客(anon)。

    anon 的兩個 header 都放 anon key——這正是前端未登入時 supabase-js
    送出的形狀,不是我們為了測試捏造的。
    """

    project_ref: str
    anon_key: str
    access_token: str | None = None
    timeout: float = 30.0
    session: requests.Session = field(default_factory=requests.Session, repr=False)

    @property
    def base_url(self) -> str:
        return f"https://{self.project_ref}.supabase.co/rest/v1"

    def _headers(self, extra: dict | None = None) -> dict:
        bearer = self.access_token or self.anon_key
        return {
            "apikey": self.anon_key,
            "Authorization": f"Bearer {bearer}",
            **(extra or {}),
        }

    # --- 讀 -------------------------------------------------------------

    def select(self, table: str, params: dict) -> requests.Response:
        return self.session.get(
            f"{self.base_url}/{table}",
            headers=self._headers(),
            params=params,
            timeout=self.timeout,
        )

    # --- 寫(一律要求回傳 representation)---------------------------------
    #
    # 帶 Prefer: return=representation 才分得出「成功但影響 0 列」與「成功且
    # 影響 N 列」——不帶的話 PATCH/DELETE 成功一律 204 無 body,而被 RLS 的
    # USING 過濾掉也是 204,兩者無從區別,斷言就失去辨別力。

    _REPRESENTATION = {"Prefer": "return=representation", "Content-Type": "application/json"}

    def insert(self, table: str, values: dict) -> requests.Response:
        return self.session.post(
            f"{self.base_url}/{table}",
            headers=self._headers(self._REPRESENTATION),
            json=values,
            timeout=self.timeout,
        )

    def update(self, table: str, params: dict, values: dict) -> requests.Response:
        return self.session.patch(
            f"{self.base_url}/{table}",
            headers=self._headers(self._REPRESENTATION),
            params=params,
            json=values,
            timeout=self.timeout,
        )

    def delete(self, table: str, params: dict) -> requests.Response:
        return self.session.delete(
            f"{self.base_url}/{table}",
            headers=self._headers(self._REPRESENTATION),
            params=params,
            timeout=self.timeout,
        )


def body_of(resp: requests.Response) -> object:
    """把回應轉成 `classify()` 吃的 body:204 或空 body → None。"""
    if resp.status_code == 204 or not resp.content:
        return None
    try:
        return resp.json()
    except ValueError:
        return None
