"""訪客兩頁（首頁、服務者詳情）的**骨架與載入後同形**：資料到位時版面不跳（S6，D1）。

**為什麼不寫成 vitest**：jsdom 沒有排版引擎，量不出盒子落在哪裡；能寫的只有
「class 字串存在」，而骨架靠手算的高度（`h-[22px]`、`mt-[3px]`）對齊，日後改
Badge／Button／Card 的內距會無聲漂移——只有真瀏覽器量得到。

**量法**（仿 `test_admin_mobile_layout.py` 的統計骨架）：扣住讀取 → 先確認骨架真的
在畫面上（沒進到目標狀態就量，會量到載入完成的頁還是綠的）→ 量 → 放行 → 等內容
→ 再量 → 比。骨架刻意與內容同結構（同一組 grid、同樣的子區塊順序），所以兩次用
同一支結構探針量。

**容差 2px、以 CI 字型為準**：本機字型（Inter）與 CI（DejaVu）數字寬差約 15%
（friction-log 2026-10-16），所以量的都是由行高與固定尺寸決定的位置，名稱與類別
刻意用全形中文（`test_overflow_sweep.py` 已硬性驗證中文字寬 1em）。
"""

import pytest
from playwright.sync_api import expect

from mocks.supabase_rest_mock import build_public_listing

TOLERANCE_PX = 2

# 名稱 10 字（NAME_MAX_LENGTH）、全形；服務介紹三行以上（ui-ux §5 的實測條件）。
DETAIL_LISTING = build_public_listing(
    name="林小美專業髮型設計師",
    category="美髮",
    gender="女",
    districts=["大安區", "信義區"],
    photos=[
        "https://example.com/1.jpg",
        "https://example.com/2.jpg",
        "https://example.com/3.jpg",
    ],
    contacts={"instagram": "test_ig", "line": "test_line", "facebook": "test.fb"},
    description="專業剪髮染髮，十年經驗。\n歡迎預約，週一公休。\n地點近捷運站，停車方便。",
)

# 詳情頁的結構探針：骨架與內容的第二欄都是 [名稱列, 類別, 地區]，第一欄是 [正方形, 圓點列]。
_DETAIL_BLOCKS_JS = """
() => {
  const grid = [...document.querySelectorAll('div.grid')]
    .find((g) => g.className.includes('lg:grid-cols-2'));
  if (!grid) return null;
  const [media, info] = grid.children;
  const head = info.children[0];
  const top = (el) => Math.round(el.getBoundingClientRect().top);
  return {
    image: top(media.children[0]),
    dots: top(media.children[1]),
    nameRow: top(head.children[0]),
    categoryRow: top(head.children[1]),
    locationRow: top(head.children[2]),
  };
}
"""


@pytest.mark.compatibility
@pytest.mark.parametrize("width", [375, 1280])
def test_detail_skeleton_matches_the_loaded_layout(page, rest_mock, service_provider_detail_page, width):
    """詳情頁：骨架的正方形照片、圓點列、名稱列、類別、地區與載入後同一個位置。"""
    page.set_viewport_size({"width": width, "height": 900})
    rest_mock.set_public_listing(DETAIL_LISTING)
    rest_mock.hold_public_listing()
    page.goto(f"/service-providers/{DETAIL_LISTING['id']}")

    expect(service_provider_detail_page.loading_skeleton()).to_be_visible()
    skeleton = page.evaluate(_DETAIL_BLOCKS_JS)

    rest_mock.release_public_listing()
    expect(service_provider_detail_page.name_heading(DETAIL_LISTING["name"])).to_be_visible()
    loaded = page.evaluate(_DETAIL_BLOCKS_JS)

    assert skeleton and loaded, "找不到 lg:grid-cols-2 的版面格線——結構探針過時了，不是版面問題"
    jumps = {k: loaded[k] - skeleton[k] for k in skeleton if abs(loaded[k] - skeleton[k]) > TOLERANCE_PX}
    assert not jumps, (
        f"{width}px 下資料到位時這些區塊跳了（px，正值＝往下）：{jumps}。"
        f"骨架 {skeleton}，載入後 {loaded}。骨架要跟內容同形（同一組 grid、同樣的子區塊）。"
    )


# 首頁的結構探針：結果列（含檢視切換的那一列）與第一張看得見的卡片。
_HOME_BLOCKS_JS = """
() => {
  const toggle = document.querySelector('[role="group"][aria-label="檢視方式"]');
  const row = toggle && toggle.closest('.mb-4');
  if (!row) return null;
  // 桌機格線只有 md:grid（沒有無前綴的 grid class），以實際的 display 判斷
  const grid = [...row.parentElement.querySelectorAll('div')]
    .find((g) => getComputedStyle(g).display === 'grid' && g.children.length > 0);
  if (!grid) return null;
  const rect = (el) => el.getBoundingClientRect();
  const card = grid.children[0];
  return {
    resultsRowTop: Math.round(rect(row).top),
    resultsRowHeight: Math.round(rect(row).height),
    firstCardTop: Math.round(rect(card).top),
    firstCardHeight: Math.round(rect(card).height),
  };
}
"""

_HOME_LISTINGS = [
    build_public_listing(
        listing_id=f"11111111-1111-1111-1111-11111111110{i}",
        name=f"服務者{i}號",
        districts=["大安區", "信義區"],
        # 桌機卡片的服務介紹兩行截斷：給夠長的字，量到的是滿兩行的卡片
        description="專業剪髮染髮，十年經驗，歡迎預約，週一公休，地點近捷運站，停車方便。" * 3,
    )
    for i in range(1, 7)
]


@pytest.mark.compatibility
@pytest.mark.parametrize(
    "width,view_mode",
    [(375, "photo"), (375, "detailed"), (1280, "photo")],
    ids=["375-photo", "375-detailed", "1280"],
)
def test_home_skeleton_matches_the_loaded_layout(page, context, rest_mock, width, view_mode):
    """首頁：結果列在載入中就佔位，第一張卡片的骨架與卡片同位置、同高。"""
    page.set_viewport_size({"width": width, "height": 900})
    context.add_init_script(
        f"localStorage.setItem('uknow:pref:home-view-mode', '{view_mode}')"
    )
    rest_mock.set_public_listings(_HOME_LISTINGS)
    rest_mock.hold_public_listings()
    page.goto("/")

    expect(page.get_by_role("status", name="載入服務者資料中")).to_be_visible()
    skeleton = page.evaluate(_HOME_BLOCKS_JS)

    rest_mock.release_public_listings()
    expect(page.get_by_text(f"找到 {len(_HOME_LISTINGS)} 位服務者")).to_be_visible()
    loaded = page.evaluate(_HOME_BLOCKS_JS)

    assert skeleton and loaded, "找不到結果列或卡片格線——結構探針過時了，不是版面問題"
    jumps = {k: loaded[k] - skeleton[k] for k in skeleton if abs(loaded[k] - skeleton[k]) > TOLERANCE_PX}
    assert not jumps, (
        f"{width}px／{view_mode} 下資料到位時這些量跳了（px）：{jumps}。"
        f"骨架 {skeleton}，載入後 {loaded}。結果列載入中要佔位、卡片骨架要跟卡片同形。"
    )
