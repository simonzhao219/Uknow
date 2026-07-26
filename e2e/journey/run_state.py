"""一個 journey run 的執行期狀態：RUN_ID 與 30 個模擬會員的憑證對照。

存成 `.run/<run_id>.json`（gitignored）——測試中途失敗時，人工調查與
`tools/cleanup.py --run-id` 都靠它。email/姓名的命名規則集中在這裡，
cleanup 的前綴掃描與 UI 斷言都引用同一套規則。
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path

from tools.zh_names import zh_name_for

RUN_DIR = Path(__file__).resolve().parent / ".run"

ROOT_NODE = "A0"


def _root_override(node: str) -> tuple[str, str]:
    """root 節點（A0）的固定憑證，供 develop 種資料用；其餘節點一律走生成規則。

    種出來的資料是要給人登入來看的，所以 root 必須是「記得住的帳號」，
    不能是 e2e+<run_id>+a0@... 這種一次性 email。

    ⚠️ 只在種資料時設。cleanup 是靠 `e2e+<run_id>+` 這個 email 前綴掃描
    的——固定 email 掃不到，也就刪不掉。測試流程（會 cleanup 的那條）
    設了它等於留下一個清不掉的帳號，所以 journey.yml 不設這兩個變數。
    """
    if node != ROOT_NODE:
        return "", ""
    return os.environ.get("JOURNEY_ROOT_EMAIL", ""), os.environ.get("JOURNEY_ROOT_PASSWORD", "")


@dataclass
class JourneyUser:
    node: str                 # 組織樹節點名：A0 / B1 / ... / G1 / admin
    email: str
    password: str
    name: str                 # 真實姓名（UI 斷言用，帶 run_id 好認）
    national_id: str
    phone: str = ""           # 由身分證序號決定性導出，run 內不重複
    user_id: str = ""         # 註冊完成後回填
    referral_code: str = ""   # 付款完成後回填


@dataclass
class RunState:
    run_id: str
    email_domain: str
    users: dict[str, JourneyUser] = field(default_factory=dict)

    def new_user(self, node: str, national_id: str) -> JourneyUser:
        root_email, root_password = _root_override(node)
        user = JourneyUser(
            node=node,
            email=root_email or f"e2e+{self.run_id}+{node.lower()}@{self.email_domain}",
            password=root_password or f"Journey!{self.run_id}",
            # 姓名必須通過註冊的中文模式規則（全中文字元、恰好 0 或 1 個
            # 半形空格）。run_id 與 node 含英數，直接拼進去會被擋在 Step 2。
            name=zh_name_for(self.run_id, node),
            national_id=national_id,
            # 規格只驗格式，但用身分證序號導出可讓 run 內 30 人不同號。
            phone=f"09{int(national_id[2:9]) % 10**8:08d}",
        )
        self.users[node] = user
        self.save()
        return user

    # --- persistence -------------------------------------------------------

    @property
    def path(self) -> Path:
        return RUN_DIR / f"{self.run_id}.json"

    def save(self) -> None:
        RUN_DIR.mkdir(exist_ok=True)
        payload = asdict(self)
        payload["users"] = {k: asdict(v) if not isinstance(v, dict) else v
                            for k, v in self.users.items()}
        self.path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    @classmethod
    def load(cls, run_id: str) -> "RunState":
        data = json.loads((RUN_DIR / f"{run_id}.json").read_text(encoding="utf-8"))
        state = cls(run_id=data["run_id"], email_domain=data["email_domain"])
        state.users = {k: JourneyUser(**v) for k, v in data["users"].items()}
        return state
