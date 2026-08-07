#!/usr/bin/env python3
"""hook 決策的記錄器——這個框架的第一個感測器。

存在理由:本框架有十幾道閘門、零個感測器。每個機制都是 feed-forward
(規劃前擋、寫 code 前擋、commit 前擋、push 前擋),唯一的回饋管道是
friction-log——人工、軼事式、未彙總。於是兩件該知道的事沒人知道:

1. **誤擋率**。friction-log 有「誤擋」分類,代表在乎它,但只能靠人記得寫。
2. **skill 觸發的命中率**。feature-plan-guard 的 docstring 自己寫著「skill
   的自動觸發是啟發式的,不保證每次都中」——知道它是機率性的,蓋了確定性
   守衛當備援,卻從來沒量過那個機率。而守衛擋下來的每一次,都正好是
   skill 那一層漏掉的一次:這個計數就是命中率的補數。

## 為什麼落檔點在 pre-commit,不在 Stop hook

近 14 天 47 個合併 PR 有 46 個來自 claude.ai/code 的 web session,容器是
拋棄式的——CLAUDE.md 那句「git 是唯一能跨 session 的通道」在這裡是硬約束。
而 Stop hook 在**最後一次 commit 之後**才觸發,它寫出來的東西永遠不會被
commit,容器一死就沒了。所以分成兩段:

    hook record()     →  .session.json            當前 session 的計數(gitignored)
    SessionStart      →  .pending.jsonl           上一個 session 的殘留(gitignored)
    pre-commit        →  sessions/<分支>.jsonl    committed,**唯一寫受版控檔案的地方**

中間那個 pending 是踩過坑才有的。直覺上 SessionStart 與 Stop hook 都是
「順手落個檔」的好時機,但受版控的檔案一被寫就是髒工作區,而髒工作區會被
讀成「有事情沒做完」,持續消耗每個之後路過的人的注意力。判準因此不是
「這裡方不方便寫」,而是**「寫出去的東西有沒有下游能把它帶到終點」**——
只有 pre-commit 有:它正在做的那個 commit 就是下游。

一 session 一行,每次 flush **改寫自己那一行**而不是新增,所以一個 session
產生多次 commit 只會看到同一行在演進。

## 為什麼一分支一個檔,而不是共用一個 sessions.jsonl

第一版把所有分支寫進同一個 `.claude/metrics/sessions.jsonl`,並用
.gitattributes 的 `merge=union` 解跨分支的尾端衝突。union 在**本機**確實
每次都自動解掉,但 GitHub 算 PR 的 mergeable_state 時不套用 repo 的
merge driver——develop 一有 commit 碰到這個檔,每個開著的 PR 就被標成
「This branch has conflicts that must be resolved」。誤報,但它跟真衝突
長得一模一樣,於是每次都要一個人去判斷一次。

分片把這件事從「解衝突」降級成「不產生衝突」:衝突的根因就是**跨分支寫
同一個檔尾**,那就讓分片鍵等於分支。兩條分支再也沒有共同的寫入區域,
GitHub 也就無從算出衝突。這是 changesets / towncrier newsfragment 解
CHANGELOG 衝突的同一招。

分片鍵取的是 **flush 當下**的分支,不是 state 裡記的 session 起始分支:
落檔的下游是「正在做的這個 commit」,而那個 commit 落在當下的分支上。
session 中途換過分支時,若照起始分支寫,這個 commit 就會去改另一條分支
的檔案——正好把剛消掉的跨分支重疊請回來。session 究竟從哪條分支開始,
由行內的 `branch` 欄位保存(檔名只是分片鍵,不承載語意)。

`.claude/metrics/sessions.jsonl` 保留為**凍結的歷史**(分片前的 458 個
session):刪除或改名都是 delete/modify,會讓當時開著的每個 PR 各撞一次
衝突——那正是這次要消滅的症狀。它不再被寫,所以也不會再衝突;
scripts/harness-metrics.py 仍會讀它。

## 三條約束(缺任一條,這個感測器就會從資產變成負債)

1. **不得改變任何 decide() 的行為。** 記錄只發生在各 hook 的 main();
   decide() 保持純函式。感測器不該有機會影響它在量測的東西。
2. **壞掉不得擋住任何人。** 全程 try/except 靜默失敗,延續本 repo
   「guard 壞掉不該把人鎖死」的既有哲學——量測的優先序永遠低於工作。
3. **模組層零 I/O。** scripts/test-hooks.py 用 exec_module 載入 hook 模組,
   而 check-output-filter 每次呼叫也會 exec_module 載入 bash-guard。模組層
   若有副作用,跑一次測試就污染一次真實日誌,而且每個 Bash 指令會被記兩次。

## 為什麼桶子叫 fired/passed 而不是 denies/allows

五個 hook 裡只有三個是 deny 閘門:check-output-filter 是**改寫器**
(回 allow + updatedInput),deletion-residue-check 是**非阻斷的回報**。
把它們的動作記成「deny」會讓讀數在第一天就開始說謊,所以用語意中性的
「出手 / 沒出手」,由 rule id(如 `check-output-filter/collapse`)去區分
出手的性質。

純函式 new_state / bump / to_line / merge_lines 由 scripts/test-hooks.py
以表格案例驗行為(與五個 hook 的 decide() 同慣例)。
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

try:
    import fcntl
except ImportError:  # 非 POSIX:退化成只有原子寫入,不做互斥
    fcntl = None  # type: ignore[assignment]

ROOT = Path(__file__).resolve().parent.parent.parent

# 關閉開關。設成 "0" 時整個記錄器變成 no-op——量測不該是沒有退路的東西。
ENV_SWITCH = "HARNESS_METRICS"

# 測試接縫:把落檔位置指到別處。scripts/test-hooks.py 靠它跑真實 I/O 而不
# 污染 repo 的日誌(與 pre-commit 的 PRE_COMMIT_FAKE_STAGED 同慣例)。
# 在模組層讀取,所以測試必須在 import 前設好——這正好也讓「模組層零 I/O」
# 這條約束可以用子行程實測:指到空目錄 import 一次,目錄必須仍是空的。
ENV_DIR = "HARNESS_METRICS_DIR"

METRICS_DIR = Path(os.environ.get(ENV_DIR) or ROOT / ".claude" / "metrics")
BUFFER = METRICS_DIR / ".session.json"
# 已結束、等待落檔的 session。gitignored——被 .claude/metrics/* 的 pattern 涵蓋。
PENDING = METRICS_DIR / ".pending.jsonl"
# 受版控的落檔目錄:一分支一個 .jsonl(見檔頭「為什麼一分支一個檔」)。
SHARD_DIR = METRICS_DIR / "sessions"

# 分片檔名長度上限。碰撞的後果很輕——兩條超長分支共用一個檔,退回 union 保底
# 的舊行為而已,所以這裡不需要 hash 後綴那種複雜度。
SHARD_MAX = 100
# 分支名抓不到時(detached HEAD、非 git 目錄)的固定檔名。**必須有值**:
# 空檔名會讓落檔靜默失敗,而感測器的靜默失敗跟「真的沒事」長得一模一樣。
SHARD_FALLBACK = "_unknown"


def enabled() -> bool:
    """記錄器是否啟用。純函式(只讀環境變數,不碰檔案系統)。"""
    return os.environ.get(ENV_SWITCH, "1") != "0"


# --------------------------------------------------------------- 純函式區


def new_state(session: str, started: str, branch: str) -> dict:
    """建一個空的 session 狀態。純函式。"""
    return {
        "session": session,
        "started": started,
        "ended": started,
        "branch": branch,
        "fired": {},
        "passed": {},
    }


def bump(state: dict, hook: str, rule: str | None, now: str) -> dict:
    """記一次 hook 決策,回傳**新的** state。純函式,不改動傳入的 dict。

    rule 是 None 代表這個 hook 看過了但沒出手(passed 的分母,誤擋率靠它算);
    非 None 代表出手了,計進 `fired` 的 "<hook>/<rule>" 鍵。
    """
    fired = dict(state.get("fired", {}))
    passed = dict(state.get("passed", {}))
    if rule is None:
        passed[hook] = passed.get(hook, 0) + 1
    else:
        key = f"{hook}/{rule}"
        fired[key] = fired.get(key, 0) + 1
    return {**state, "fired": fired, "passed": passed, "ended": now}


def to_line(state: dict) -> str:
    """把 state 壓成 sessions.jsonl 的一行。純函式。

    sort_keys 讓同一個 session 的多次 flush 產生穩定的鍵序——否則 diff 會
    因為字典順序抖動而看起來每次都變,git 上讀不出「這行改了什麼」。
    """
    return json.dumps(state, ensure_ascii=False, sort_keys=True)


def merge_lines(lines: list[str], line: str, session: str) -> list[str]:
    """把 line 併進既有的 log:同 session 就**取代自己那一行**,否則附在最後。

    純函式。取代而非附加,是因為 pre-commit 每次 commit 都會 flush 一次——
    附加的話一個 session 會留下十幾行半成品,而只有最後一行是完整的。
    """
    out = []
    replaced = False
    for existing in lines:
        try:
            if json.loads(existing).get("session") == session:
                out.append(line)
                replaced = True
                continue
        except (json.JSONDecodeError, ValueError, AttributeError):
            pass  # 壞行原樣保留——記錄器不該有刪掉別人資料的權力
        out.append(existing)
    if not replaced:
        out.append(line)
    return out


def shard_name(branch: str) -> str:
    """分支名 → 分片檔名(不含 .jsonl)。純函式。

    只有兩個責任,兩個都是「錯了會很難看出來」的那種:

    1. **同分支必得同名。** 分片鍵不穩定的話,同一條分支會散進好幾個檔,而
       merge_lines 的「取代自己那一行」就再也找不到自己那一行——每次 commit
       附加一筆半成品,日誌只增不收斂,而且看起來很正常。
    2. **輸出必是安全檔名。** 分支名可以帶 `/`、空白、萬國碼;這個檔案會被
       pre-commit 自動 git add,吐出怪檔名等於在別人的 commit 裡塞垃圾。

    `/` 特別換成 `__` 而不是併進通用的 `-`,是為了讓 `claude/foo` 與
    `claude-foo` 這兩條分支不會撞成同一個檔名。
    """
    name = branch.strip().replace("/", "__")
    name = "".join(ch if (ch.isascii() and ch.isalnum()) or ch in "._-" else "-" for ch in name)
    if name.startswith("."):
        # 隱藏檔會被 git add 進去卻不出現在 ls 裡——查問題時最花時間的那種狀態。
        name = "-" + name[1:]
    return name[:SHARD_MAX] or SHARD_FALLBACK


# --------------------------------------------------------------- I/O 區
# 以下每個函式都必須「壞掉也不影響呼叫方」——約束 2。


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _branch() -> str:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=5,
        )
        return out.stdout.strip() if out.returncode == 0 else ""
    except (OSError, subprocess.SubprocessError):
        return ""


@contextmanager
def _exclusive():
    """序列化 read-modify-write。

    非要不可,而不是保險:bash-guard 與 check-output-filter 掛在 settings.json
    的**同一個 Bash matcher** 上,Claude Code 會並行執行它們——兩個行程同時
    read-modify-write 同一個 buffer。沒有這道鎖時實測到的後果不是少算一兩筆,
    而是**整個 session 消失**:其中一方讀到對方寫到一半的檔案,JSON 解析失敗
    被當成「還沒有 buffer」,於是開一個新 session id 覆蓋掉既有那筆。

    這是感測器最惡劣的失效模式——它不會報錯,只會安靜地少報,而少報的讀數
    看起來跟「真的沒事」一模一樣。
    """
    METRICS_DIR.mkdir(parents=True, exist_ok=True)
    lock = METRICS_DIR / ".session.lock"
    handle = None
    try:
        handle = open(lock, "w", encoding="utf-8")  # noqa: SIM115 — 生命週期由本 contextmanager 管
        if fcntl is not None:
            fcntl.flock(handle, fcntl.LOCK_EX)
        yield
    finally:
        if handle is not None:
            try:
                if fcntl is not None:
                    fcntl.flock(handle, fcntl.LOCK_UN)
            except OSError:
                pass
            handle.close()


def _atomic_write(path: Path, text: str) -> None:
    """先寫暫存檔再 os.replace——POSIX 保證 rename 是原子的。

    直接 write_text 會讓並行的讀取方看到寫到一半的內容。鎖擋得住有參與
    鎖的行程,擋不住讀取器(harness-metrics.py 不上鎖),所以兩層都要。
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=".tmp-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(text)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def _read_buffer() -> dict | None:
    try:
        return json.loads(BUFFER.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, ValueError):
        return None


def record(hook: str, rule: str | None) -> None:
    """記一次決策。**任何例外都吞掉**——量測失敗不該讓 hook 失敗(約束 2)。"""
    if not enabled():
        return
    try:
        with _exclusive():
            state = _read_buffer()
            if state is None:
                state = new_state(uuid.uuid4().hex[:12], _now(), _branch())
            _atomic_write(BUFFER, json.dumps(bump(state, hook, rule, _now()), ensure_ascii=False))
    except Exception:  # noqa: BLE001 — 感測器的失敗絕不能傳染給閘門
        return


def _log_path() -> Path:
    """本次 flush 該寫哪個分片。

    分支抓不到時落到 SHARD_FALLBACK 而不是放棄落檔:資料進得了 git 才有價值,
    而檔名只是分片鍵——真正的分支記在每一行的 `branch` 欄位裡。
    """
    return SHARD_DIR / f"{shard_name(_branch())}.jsonl"


def _read_lines(path: Path) -> list[str]:
    try:
        return [ln for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]
    except OSError:
        return []


def flush() -> bool:
    """pending + 當前 buffer → 當前分支的分片。回傳是否真的寫了東西。

    **這是唯一會寫受版控檔案的地方,而且只由 pre-commit 呼叫。** 這個不變式
    不是潔癖,是這個感測器兩次踩過的坑:寫入點的價值不看「這裡方便寫」,要看
    「寫出去的東西有沒有下游能把它帶到終點」。沒有下游的寫入不是備援,而是把
    一個受版控的檔案改髒——然後每個之後路過的人都會以為有事情沒做完。

    pre-commit 是唯一保證有下游的時機:它正在做的那個 commit 就是下游。
    """
    if not enabled():
        return False
    try:
        with _exclusive():
            pending = _read_lines(PENDING)
            state = _read_buffer()
            if not pending and state is None:
                return False

            log = _log_path()
            lines = _read_lines(log)
            for row in pending:
                try:
                    session = json.loads(row).get("session", "")
                except (json.JSONDecodeError, ValueError, AttributeError):
                    continue  # 壞行跳過,不讓它污染分片
                lines = merge_lines(lines, row, session)
            if state is not None:
                lines = merge_lines(lines, to_line(state), state.get("session", ""))

            _atomic_write(log, "\n".join(lines) + "\n")
            PENDING.unlink(missing_ok=True)
            return True
    except Exception:  # noqa: BLE001
        return False


def rotate() -> None:
    """SessionStart 用:把上一個 session 的殘留 buffer 移進 pending,再清掉 buffer。

    本機 CLI 的容器會活過多個 session,不清 buffer 的話兩個 session 會併成一行。
    web session 的容器是新的,這條路徑等於 no-op。

    **刻意不呼叫 flush()。** 第一版在這裡直接落檔,理由是「反正 SessionStart
    之後通常會有 commit 把它帶走」。但「通常」不夠:唯讀 session(問答、review、
    plan mode)不會有 commit,此時它就退化成 Stop hook 那個已經被移除的純成本
    ——session 一開始工作區就是髒的,而使用者什麼都還沒做。

    改成搬進 gitignored 的 pending 後,資料一樣不會遺失(下一次 pre-commit 會把
    pending 一起帶走),但受版控的檔案只有在真的要 commit 時才會被動到。
    """
    if not enabled():
        return
    try:
        with _exclusive():
            state = _read_buffer()
            if state is not None:
                merged = merge_lines(
                    _read_lines(PENDING), to_line(state), state.get("session", "")
                )
                _atomic_write(PENDING, "\n".join(merged) + "\n")
            BUFFER.unlink(missing_ok=True)
    except Exception:  # noqa: BLE001
        return


def main(argv: list[str]) -> int:
    if "--flush" in argv:
        flush()
    elif "--rotate" in argv:
        rotate()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
