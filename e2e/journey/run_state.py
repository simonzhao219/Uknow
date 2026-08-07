"""一個 journey run 的執行期狀態：RUN_ID 與 30 個模擬會員的憑證對照。

存成 `.run/<run_id>.json`（gitignored）——測試中途失敗時，人工調查與
`tools/cleanup.py --run-id` 都靠它。email/姓名的命名規則集中在這裡，
cleanup 的前綴掃描與 UI 斷言都引用同一套規則。
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path

from tools.zh_names import zh_name_for

RUN_DIR = Path(__file__).resolve().parent / ".run"


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
        user = JourneyUser(
            node=node,
            # 一律走生成規則，不開固定憑證的後門：cleanup 是靠
            # `e2e+<run_id>+` 這個 email 前綴掃描的，任何固定 email 都掃
            # 不到、也就刪不掉，等於在測試環境留下清不掉的帳號。
            email=f"e2e+{self.run_id}+{node.lower()}@{self.email_domain}",
            password=f"Journey!{self.run_id}",
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
