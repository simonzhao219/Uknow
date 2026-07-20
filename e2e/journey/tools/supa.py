"""Supabase 測試分支的 service-role 存取封裝。

journey harness 唯二繞過 GUI 的地方都在這裡，且都是「測試基礎設施」而
非受測旅程本身：

1. 取得 email OTP（GoTrue Admin `generate_link` 回傳 `email_otp`，
   harness 拿到後仍照樣打進 GUI 的 OTP 輸入框——被替代的只有收信）；
2. 清理與 DB 斷言（PostgREST + Auth Admin API）。

任何方法都以測試分支的 project ref 組 URL；conftest 已擋下「ref 指向
正式專案」的設定錯誤。
"""

from __future__ import annotations

from dataclasses import dataclass, field

import requests


@dataclass
class SupabaseAdmin:
    project_ref: str
    service_role_key: str
    anon_key: str
    timeout: float = 30.0
    session: requests.Session = field(default_factory=requests.Session, repr=False)

    # --- URL helpers -------------------------------------------------------

    @property
    def base_url(self) -> str:
        return f"https://{self.project_ref}.supabase.co"

    @property
    def _service_headers(self) -> dict:
        return {
            "apikey": self.service_role_key,
            "Authorization": f"Bearer {self.service_role_key}",
        }

    # --- Auth admin --------------------------------------------------------

    def fetch_signup_otp(self, email: str, password: str) -> str:
        """對「GUI 已 signUp、待驗證」的帳號產生一組新的 signup OTP。

        GoTrue 的 admin generate_link 對同一帳號重新產生驗證碼，回應同時
        帶 `email_otp`（新版在頂層，舊版在 properties 內——兩處都找）。
        """
        resp = self.session.post(
            f"{self.base_url}/auth/v1/admin/generate_link",
            headers=self._service_headers,
            json={"type": "signup", "email": email, "password": password},
            timeout=self.timeout,
        )
        resp.raise_for_status()
        data = resp.json()
        otp = data.get("email_otp") or data.get("properties", {}).get("email_otp")
        if not otp:
            raise RuntimeError(
                f"generate_link 回應中找不到 email_otp（keys={sorted(data.keys())}）——"
                "GoTrue 版本差異，請檢查回應結構"
            )
        return str(otp)

    def create_confirmed_user(self, email: str, password: str) -> str:
        """建立一個已驗證的帳號（僅供 admin bootstrap 等測試基礎設施用）。"""
        resp = self.session.post(
            f"{self.base_url}/auth/v1/admin/users",
            headers=self._service_headers,
            json={"email": email, "password": password, "email_confirm": True},
            timeout=self.timeout,
        )
        resp.raise_for_status()
        return resp.json()["id"]

    def password_grant_token(self, email: str, password: str) -> str:
        resp = self.session.post(
            f"{self.base_url}/auth/v1/token?grant_type=password",
            headers={"apikey": self.anon_key},
            json={"email": email, "password": password},
            timeout=self.timeout,
        )
        resp.raise_for_status()
        return resp.json()["access_token"]

    def list_users_by_email_prefix(self, prefix: str) -> list[dict]:
        """列出 email 以 prefix 開頭的所有 auth users（分頁掃到空頁為止）。"""
        found: list[dict] = []
        page = 1
        while True:
            resp = self.session.get(
                f"{self.base_url}/auth/v1/admin/users",
                headers=self._service_headers,
                params={"page": page, "per_page": 50},
                timeout=self.timeout,
            )
            resp.raise_for_status()
            users = resp.json().get("users") or []
            if not users:
                return found
            found.extend(
                u for u in users
                if (u.get("email") or "").lower().startswith(prefix.lower())
            )
            page += 1

    def delete_user(self, user_id: str) -> None:
        resp = self.session.delete(
            f"{self.base_url}/auth/v1/admin/users/{user_id}",
            headers=self._service_headers,
            timeout=self.timeout,
        )
        resp.raise_for_status()

    # --- PostgREST ---------------------------------------------------------

    def rest_select(self, table: str, params: dict) -> list[dict]:
        resp = self.session.get(
            f"{self.base_url}/rest/v1/{table}",
            headers=self._service_headers,
            params=params,
            timeout=self.timeout,
        )
        resp.raise_for_status()
        return resp.json()

    def rest_update(self, table: str, params: dict, values: dict) -> list[dict]:
        """帶條件 PATCH（service role 繞過 RLS）。僅供拋棄式分支上的
        時光機資料回填使用——正式環境沒有任何路徑會呼叫到這裡。"""
        resp = self.session.patch(
            f"{self.base_url}/rest/v1/{table}",
            headers={**self._service_headers, "Prefer": "return=representation"},
            params=params,
            json=values,
            timeout=self.timeout,
        )
        resp.raise_for_status()
        return resp.json()

    def rest_delete(self, table: str, params: dict) -> None:
        """帶條件刪除（service role 繞過 RLS）。僅供測試分支的
        基礎設施操作（如重置 rate_limits 計數）使用。"""
        resp = self.session.delete(
            f"{self.base_url}/rest/v1/{table}",
            headers=self._service_headers,
            params=params,
            timeout=self.timeout,
        )
        resp.raise_for_status()

    def reward_config(self) -> dict:
        """讀 reward_config 單列（單代獎金、推薦王門檻）——預期值斷言
        用實際設定計算，不寫死。"""
        rows = self.rest_select("reward_config", {"select": "*", "limit": "1"})
        if not rows:
            raise RuntimeError("reward_config 不存在——分支 migrations 未套用完整？")
        return rows[0]

    def reset_check_email_rate_limit(self) -> None:
        """清掉 check-email 的固定窗口計數（10 次/5 分/IP）。

        30 人建樹同一 IP 一定撞限流；正式碼不動，改在拋棄式分支上
        於波次之間重置計數器——這正是設計書「測試分支放寬限流參數、
        不動產品碼」的落地。"""
        self.rest_delete("rate_limits", {"key": "like.check-email:*"})

    # --- Storage -----------------------------------------------------------

    def storage_list(self, bucket: str, prefix: str) -> list[str]:
        resp = self.session.post(
            f"{self.base_url}/storage/v1/object/list/{bucket}",
            headers=self._service_headers,
            json={"prefix": prefix, "limit": 1000},
            timeout=self.timeout,
        )
        if resp.status_code == 404:  # bucket 不存在（尚未跑到該功能）
            return []
        resp.raise_for_status()
        return [f"{prefix.rstrip('/')}/{o['name']}" for o in resp.json() if o.get("name")]

    def storage_delete(self, bucket: str, paths: list[str]) -> None:
        if not paths:
            return
        resp = self.session.delete(
            f"{self.base_url}/storage/v1/object/{bucket}",
            headers=self._service_headers,
            json={"prefixes": paths},
            timeout=self.timeout,
        )
        resp.raise_for_status()

    # --- Edge Function API -------------------------------------------------

    def api_post(self, path: str, access_token: str, payload: dict | None = None) -> requests.Response:
        return self.session.post(
            f"{self.base_url}/functions/v1/api{path}",
            headers={"apikey": self.anon_key, "Authorization": f"Bearer {access_token}"},
            json=payload or {},
            timeout=self.timeout,
        )

    def api_get(self, path: str, access_token: str) -> requests.Response:
        return self.session.get(
            f"{self.base_url}/functions/v1/api{path}",
            headers={"apikey": self.anon_key, "Authorization": f"Bearer {access_token}"},
            timeout=self.timeout,
        )
