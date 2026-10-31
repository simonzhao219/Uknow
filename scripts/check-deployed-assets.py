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

4. **線上跑的是不是預期的 commit**(2026-10-28 事故):Cloudflare Pages 的
   main 建置在 clone 階段失敗,正式站停在舊版 18 小時,沒有任何訊號——
   GitHub 收不到 Cloudflare 的建置失敗事件,上面三項又只驗「資產完整」不驗
   「版本」。建置時 `<meta name="build-sha">` 帶著 commit sha(config/buildSha.ts),
   這裡拿它與預期的分支 HEAD 比對。不一致要分辨「還在建置中」與「真的停在
   舊版」:預期 commit 距今未滿寬限期(預設 30 分鐘)視為建置中,只警告;
   超過仍不一致才失敗。

5. **安全標頭生效**:`_headers` 的 `/*` 區塊(HSTS、nosniff、Referrer-Policy、
   frame-ancestors)只驗存在與關鍵值。

另外 Pages 的資產保存本身就有下限:官方 Serving Pages 文件寫「Assets have
a time-to-live (TTL) of one week but **can also disappear at any time**」——
所以這支不只在部署後跑,也排程定期跑。

用法:
    python3 scripts/check-deployed-assets.py https://develop.uknow.pages.dev
    python3 scripts/check-deployed-assets.py <url> --deep-path /admin --deep-path /rewards
    python3 scripts/check-deployed-assets.py <url> --expect-sha <sha> --expect-committed-at <epoch秒>
    python3 scripts/check-deployed-assets.py --self-test

只用標準函式庫,CI 不必安裝任何東西。
"""

from __future__ import annotations

import argparse
import re
import sys
import time
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

# 預期 commit 推上去後給建置＋部署的時間。Pages 建置通常數分鐘;30 分鐘
# 還沒換版就不是「還在建置」,而是建置失敗或卡住。
DEFAULT_GRACE_MINUTES = 30

# 建置時由 vite 外掛注入(屬性順序不保證,所以兩種順序都收)。
BUILD_SHA_META = re.compile(
    r"""<meta\s+(?:name=["']build-sha["']\s+content=["']([^"']*)["']"""
    r"""|content=["']([^"']*)["']\s+name=["']build-sha["'])""",
    re.IGNORECASE,
)


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


# 全站安全標頭(public/_headers 的 `/*` 區塊)。只驗「存在」與關鍵值,
# 不驗完整字串——max-age 等數值之後調整不該讓 smoke 變紅。
SECURITY_HEADERS: dict[str, str] = {
    "strict-transport-security": "max-age=",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "content-security-policy": "frame-ancestors 'none'",
}


def missing_security_headers(shell_headers: dict[str, str]) -> list[str]:
    """回傳缺少或值不符的安全標頭描述;純函式,方便表格測試。"""
    problems: list[str] = []
    for name, needle in SECURITY_HEADERS.items():
        value = shell_headers.get(name)
        if value is None:
            problems.append(f"  {name}:缺少")
        elif needle not in value.lower():
            problems.append(f"  {name}:值為 {value!r},預期含 {needle!r}")
    return problems


def check_security_headers(base: str) -> None:
    _, shell_headers, _ = fetch(base)
    problems = missing_security_headers(shell_headers)
    if problems:
        raise SmokeFailure(
            "全站安全標頭沒有生效(public/_headers 的 `/*` 區塊被改掉,或 Pages 沒套用):\n"
            + "\n".join(problems)
        )


def extract_build_sha(shell_html: str) -> str | None:
    match = BUILD_SHA_META.search(shell_html)
    if not match:
        return None
    return (match.group(1) or match.group(2) or "").strip().lower() or None


def judge_build_sha(
    live: str | None,
    expected: str,
    committed_at: int | None,
    now: float,
    grace_minutes: float,
) -> tuple[str, str]:
    """回傳 (結果, 說明);結果是 ok / warn / fail。純函式,方便表格測試。

    - live 缺或 unknown:線上沒有可比對的版本——fail。導入期寬鬆已結束
      (10/31 第 2 波晉升後,正式站與 develop 都帶 build-sha,正式站實測
      相符);此後缺 meta 代表建置沒帶到或建置環境取不到 sha,版本比對
      等於失效,不得靜默放行。
    - sha 前綴相符即 ok(CF 給完整 40 碼,人傳短碼也行)。
    - 不符:預期 commit 在寬限期內 → warn(建置中);超過 → fail(停在舊版)。
      不知道 commit 時間(committed_at 為 None)時保守判 fail。
    """
    if live is None or live == "unknown":
        return "fail", "線上頁面沒有可用的 build-sha(建置沒帶到 meta 或建置環境取不到 sha),無法比對版本"
    expected = expected.lower()
    if live.startswith(expected) or expected.startswith(live):
        return "ok", f"線上版本 {live[:7]} 與預期 {expected[:7]} 相符"
    if committed_at is not None:
        age_min = (now - committed_at) / 60
        if age_min < grace_minutes:
            return (
                "warn",
                f"線上 {live[:7]} ≠ 預期 {expected[:7]},但預期 commit 才 {age_min:.0f} 分鐘前"
                f"(寬限 {grace_minutes:.0f} 分鐘),視為建置中",
            )
        return (
            "fail",
            f"線上 {live[:7]} ≠ 預期 {expected[:7]},預期 commit 已 {age_min:.0f} 分鐘前"
            f"(超過寬限 {grace_minutes:.0f} 分鐘)——Pages 建置可能失敗,線上停在舊版",
        )
    return "fail", f"線上 {live[:7]} ≠ 預期 {expected[:7]},且未提供 commit 時間可判斷是否仍在建置"


def check_build_sha(
    shell_html: str, expected: str, committed_at: int | None, grace_minutes: float
) -> str:
    """比對線上 build-sha 與預期;fail 丟 SmokeFailure,warn 回傳說明由呼叫端印出。"""
    verdict, message = judge_build_sha(
        extract_build_sha(shell_html), expected, committed_at, time.time(), grace_minutes
    )
    if verdict == "fail":
        raise SmokeFailure(
            f"{message}。\n"
            "到 Cloudflare Pages → Deployments 看對應 commit 的建置紀錄(2026-10-28 就是 clone 階段失敗)。"
        )
    return f"{'✓' if verdict == 'ok' else '⚠'} {message}"


def self_test() -> int:
    now = 1_000_000.0
    full = "52039ca" + "0" * 33
    cases = [
        # (live, expected, committed_at, 預期結果, 說明)
        (full, full, now - 7200, "ok", "完整 sha 相符"),
        (full[:7], full, now - 7200, "ok", "短碼前綴相符"),
        ("a" * 40, full, now - 600, "warn", "不符但剛 push 10 分鐘:建置中"),
        ("a" * 40, full, now - 29 * 60, "warn", "29 分鐘仍在寬限內"),
        ("a" * 40, full, now - 31 * 60, "fail", "超過 30 分鐘:停在舊版"),
        ("a" * 40, full, now - 18 * 3600, "fail", "2026-10-28 事故形狀:停了 18 小時"),
        ("a" * 40, full, None, "fail", "不知道 commit 時間:保守判紅"),
        (None, full, now - 7200, "fail", "線上無 build-sha:版本比對失效，不得放行"),
        ("unknown", full, now - 7200, "fail", "建置環境取不到 sha:版本比對失效，不得放行"),
    ]
    failures = 0
    for live, expected, committed_at, want, label in cases:
        got, _ = judge_build_sha(live, expected, committed_at, now, DEFAULT_GRACE_MINUTES)
        if got != want:
            failures += 1
            print(f"✗ {label}:預期 {want},得到 {got}", file=sys.stderr)

    html_cases = [
        ('<meta name="build-sha" content="ABC1234">', "abc1234"),
        ('<meta content="abc1234" name="build-sha" />', "abc1234"),
        ("<meta name='build-sha' content='abc1234'>", "abc1234"),
        ('<meta name="description" content="x">', None),
        ('<meta name="build-sha" content="">', None),
    ]
    for html, want in html_cases:
        got = extract_build_sha(html)
        if got != want:
            failures += 1
            print(f"✗ 解析 {html!r}:預期 {want!r},得到 {got!r}", file=sys.stderr)

    good = {
        "strict-transport-security": "max-age=31536000; includeSubDomains",
        "x-content-type-options": "nosniff",
        "referrer-policy": "strict-origin-when-cross-origin",
        "content-security-policy": "frame-ancestors 'none'",
    }
    header_cases = [
        (good, 0, "四個標頭齊全"),
        ({k: v for k, v in good.items() if k != "x-content-type-options"}, 1, "缺 nosniff"),
        ({**good, "content-security-policy": "default-src 'self'"}, 1, "CSP 沒有 frame-ancestors"),
        ({}, 4, "全缺"),
    ]
    for hdrs, want_count, label in header_cases:
        got_count = len(missing_security_headers(hdrs))
        if got_count != want_count:
            failures += 1
            print(f"✗ 安全標頭 {label}:預期 {want_count} 項問題,得到 {got_count}", file=sys.stderr)

    if failures:
        return 1
    print(
        f"[deploy-smoke] self-test 通過({len(cases)} 判定 + {len(html_cases)} 解析"
        f" + {len(header_cases)} 安全標頭)"
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="部署後 smoke:驗證線上部署完整且可用")
    parser.add_argument(
        "base_url", nargs="?", help="要驗的網址,例:https://develop.uknow.pages.dev"
    )
    parser.add_argument("--self-test", action="store_true", help="跑內建表格案例後結束")
    parser.add_argument(
        "--expect-sha", default="", help="預期的線上 commit sha(分支 HEAD);留空則不驗版本"
    )
    parser.add_argument(
        "--expect-committed-at",
        type=int,
        default=None,
        help="預期 commit 的時間(epoch 秒),用來判斷是否仍在建置寬限內",
    )
    parser.add_argument(
        "--grace-minutes",
        type=float,
        default=DEFAULT_GRACE_MINUTES,
        help=f"預期 commit 推上去後容許尚未換版的分鐘數(預設 {DEFAULT_GRACE_MINUTES})",
    )
    parser.add_argument(
        "--deep-path",
        action="append",
        default=None,
        help="要驗的前端路由(可重複)。預設驗 /admin 與 /dashboard。",
    )
    args = parser.parse_args()
    if args.self_test:
        return self_test()
    if not args.base_url:
        parser.error("需要 base_url(或用 --self-test)")

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

        check_security_headers(base)
        print("[deploy-smoke] ✓ 安全標頭齊全(HSTS、nosniff、Referrer-Policy、frame-ancestors)")

        if args.expect_sha:
            print(
                "[deploy-smoke] "
                + check_build_sha(
                    shell_html, args.expect_sha, args.expect_committed_at, args.grace_minutes
                )
            )
        else:
            print("[deploy-smoke] - 未提供 --expect-sha,略過版本比對")
    except SmokeFailure as failure:
        print(f"\n[deploy-smoke] ✗ {failure}", file=sys.stderr)
        return 1

    print("[deploy-smoke] 全數通過。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
