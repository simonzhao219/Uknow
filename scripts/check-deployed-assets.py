#!/usr/bin/env python3
"""部署後 smoke:對**真實網址**驗證這次部署是完整且可用的。

為什麼需要這一層——這三件事沒有任何靜態檢查或 CI 驗得到,它們只在
「檔案已經上傳到 Cloudflare」之後才成立或不成立:

1. **上傳完整**(2026-08-07 正式站事故):那次 Pages 部署少上傳了三個
   chunk(textarea / stat-card-grid / trash-2)。同一個 commit 在本機
   建置三個檔都在、hash 也一致——**建置正確、上傳不完整**。單元測試、
   型別檢查、build 全綠,只有對線上實測才抓得到。

2. **深層路徑仍交回 SPA**(2026-08-08 事故):`public/404.html` 的存在會
   把 Pages 從 SPA 模式切成 Not Found 模式,於是 /admin 這類前端路由在
   硬導航時回 404 頁。src/appShell.test.ts 擋住了「檔案再度出現」,但擋
   不住「Pages 行為又改了」或「dashboard 設定被人動過」。

3. **快取標頭真的生效**:index.html 必須每次重新驗證,否則使用者重整拿到
   的還是舊的資產清單,lazyWithRetry 的自癒路徑就死了。而資產檔的長快取
   不得被 no-cache 汙染(`_headers` 的重複宣告會被逗號合併)。

另外 Pages 的資產保存本身就有下限:官方 Serving Pages 文件寫「Assets have
a time-to-live (TTL) of one week but **can also disappear at any time**」——
所以這支不只在部署後跑,也排程定期跑。

用法:
    python3 scripts/check-deployed-assets.py https://develop.uknow.pages.dev
    python3 scripts/check-deployed-assets.py <url> --deep-path /admin --deep-path /rewards

只用標準函式庫,CI 不必安裝任何東西。
"""

from __future__ import annotations

import argparse
import re
import sys
import urllib.error
import urllib.request
from urllib.parse import urljoin

TIMEOUT = 30
USER_AGENT = "uknow-deploy-smoke/1.0"

# index.html 引用的資產。Vite 產出的是 <script type="module" src="/assets/...">
# 與 <link rel="stylesheet" href="/assets/...">,兩者都要驗。
ASSET_REF = re.compile(r"""(?:src|href)\s*=\s*["'](/assets/[^"']+)["']""")

# SPA 外殼的識別特徵(index.html 的 <div id="root">)。用它分辨「拿到應用
# 程式」與「拿到一張靜態 404 頁」——只看狀態碼不夠,Pages 的 SPA 後備
# 本來就會用 200 送出 index.html。
SPA_MARKER = re.compile(r"""<div\s+id=["']root["']""")


class SmokeFailure(Exception):
    """一項檢查失敗。訊息要能直接讀懂,不必再開瀏覽器。"""


def fetch(url: str, method: str = "GET") -> tuple[int, dict[str, str], str]:
    """回傳 (狀態碼, 標頭, 內文)。連不上視為失敗,不吞例外。"""
    request = urllib.request.Request(
        url, method=method, headers={"User-Agent": USER_AGENT, "Accept": "*/*"}
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            body = response.read().decode("utf-8", errors="replace") if method == "GET" else ""
            return response.status, {k.lower(): v for k, v in response.headers.items()}, body
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace") if method == "GET" else ""
        return error.code, {k.lower(): v for k, v in error.headers.items()}, body
    except (urllib.error.URLError, TimeoutError) as error:
        raise SmokeFailure(f"連不上 {url}:{error}") from error


def check_shell(base: str) -> str:
    """取得 index.html,確認它真的是 SPA 外殼。回傳內文供後續解析。"""
    status, _, body = fetch(base)
    if status != 200:
        raise SmokeFailure(f"首頁 {base} 回 {status},預期 200")
    if not SPA_MARKER.search(body):
        raise SmokeFailure(f"首頁 {base} 的內容不是 SPA 外殼(找不到 <div id=\"root\">)")
    return body


def check_assets(base: str, shell_html: str) -> int:
    """index.html 引用的每個 /assets/* 都必須存在**且型別正確**。回傳驗過的檔數。

    ⚠️ 只看狀態碼會漏掉 2026-08-07 事故本身的形狀。SPA 後備(`/* /index.html
    200`)會把「檔案不存在」翻譯成 **200 + text/html**——狀態碼是 200,內容
    卻是一份 HTML。瀏覽器的 module loader 正是在這一步拒絕的:

        Failed to load module script: Expected a JavaScript-or-Wasm module
        script but the server responded with a MIME type of "text/html"

    所以判準是 Content-Type,不是狀態碼。(這個漏洞是本支腳本開發時用
    「搬走一個 chunk」實測抓到的——原本的版本照樣全綠。)
    """
    refs = sorted(set(ASSET_REF.findall(shell_html)))
    if not refs:
        raise SmokeFailure(
            "index.html 沒有引用任何 /assets/*——建置產物形狀變了,這支檢查等於失效,先修檢查器"
        )

    expected_type = {".js": "javascript", ".mjs": "javascript", ".css": "css"}
    bad: list[str] = []
    for ref in refs:
        url = urljoin(base, ref)
        status, asset_headers, _ = fetch(url, method="HEAD")
        if status != 200:
            bad.append(f"  {ref} → {status}(檔案不存在)")
            continue
        suffix = ref[ref.rfind(".") :].split("?")[0]
        want = expected_type.get(suffix)
        got = asset_headers.get("content-type", "")
        if want and want not in got.lower():
            bad.append(f"  {ref} → 200 但 Content-Type 是 {got!r}(預期含 {want!r})")

    if bad:
        raise SmokeFailure(
            "index.html 引用的資產有問題(部署上傳不完整,2026-08-07 事故的形狀)。\n"
            "「200 但型別是 text/html」代表檔案其實不存在、被 SPA 後備接走了:\n"
            + "\n".join(bad)
        )
    return len(refs)


def check_deep_paths(base: str, deep_paths: list[str]) -> None:
    """前端路由的硬導航必須拿回 SPA,而不是靜態 404 頁。"""
    broken: list[str] = []
    for path in deep_paths:
        url = urljoin(base, path)
        status, _, body = fetch(url)
        if status != 200:
            broken.append(f"  {path} → {status}(預期 200)")
        elif not SPA_MARKER.search(body):
            broken.append(f"  {path} → 200 但內容不是 SPA 外殼")

    if broken:
        raise SmokeFailure(
            "深層路徑沒有交回 SPA(2026-08-08 事故的形狀:Pages 落到 Not Found 模式)。\n"
            "先確認建置輸出根目錄有沒有跑出 404.html,以及 _redirects 的 SPA 後備還在不在:\n"
            + "\n".join(broken)
        )


def check_cache_headers(base: str, shell_html: str) -> None:
    """index.html 必須每次重新驗證;資產檔的長快取不得被 no-cache 汙染。"""
    _, shell_headers, _ = fetch(base)
    shell_cache = shell_headers.get("cache-control", "")
    revalidates = "no-cache" in shell_cache or "max-age=0" in shell_cache or "no-store" in shell_cache
    if not revalidates:
        raise SmokeFailure(
            f"index.html 的 Cache-Control 是 {shell_cache!r},不會每次重新驗證。\n"
            "使用者重整會拿到舊的資產清單,lazyWithRetry 的自癒路徑會失效。"
        )

    refs = sorted(set(ASSET_REF.findall(shell_html)))
    if not refs:
        return
    asset_url = urljoin(base, refs[0])
    _, asset_headers, _ = fetch(asset_url, method="HEAD")
    asset_cache = asset_headers.get("cache-control", "")
    if "no-cache" in asset_cache or "no-store" in asset_cache:
        raise SmokeFailure(
            f"資產 {refs[0]} 的 Cache-Control 是 {asset_cache!r},含 no-cache。\n"
            "多半是 _headers 有兩個區塊各宣告一次 Cache-Control——Cloudflare 是逗號\n"
            "合併而非覆寫,長快取因此完全失效(見 public/_headers 的檔頭)。"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="部署後 smoke:驗證線上部署完整且可用")
    parser.add_argument("base_url", help="要驗的網址,例:https://develop.uknow.pages.dev")
    parser.add_argument(
        "--deep-path",
        action="append",
        default=None,
        help="要驗的前端路由(可重複)。預設驗 /admin 與 /dashboard。",
    )
    args = parser.parse_args()

    base = args.base_url.rstrip("/") + "/"
    deep_paths = args.deep_path or ["/admin", "/dashboard"]

    print(f"[deploy-smoke] 目標:{base}")
    try:
        shell_html = check_shell(base)
        print("[deploy-smoke] ✓ 首頁回 200 且是 SPA 外殼")

        count = check_assets(base, shell_html)
        print(f"[deploy-smoke] ✓ index.html 引用的 {count} 個資產全部取得到")

        check_deep_paths(base, deep_paths)
        print(f"[deploy-smoke] ✓ 深層路徑交回 SPA:{', '.join(deep_paths)}")

        check_cache_headers(base, shell_html)
        print("[deploy-smoke] ✓ 快取標頭正確(HTML 重新驗證、資產長快取未被汙染)")
    except SmokeFailure as failure:
        print(f"\n[deploy-smoke] ✗ {failure}", file=sys.stderr)
        return 1

    print("[deploy-smoke] 全數通過。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
