"""摺疊機展開態與平板的版面（第 7 波 S3）：首頁卡片同列等高、詳情頁 md 起雙欄。

**為什麼是 e2e 而不是 vitest**：jsdom 沒有排版引擎（`getBoundingClientRect` 一律 0），
能寫的只有「class 字串存在」，那是套套邏輯。量的是真瀏覽器裡的盒子。

**視窗矩陣**（CSS px）：摺疊展開直 884×1104、Pixel Fold 展開 841×701、平板直 768×1024、
斷點邊界 767／768／1023、桌機 1280。容差 2px；名稱與類別全形中文（字寬 1em，與 CI 字型無關）。
"""

import pytest
from playwright.sync_api import expect

from mocks.supabase_rest_mock import build_public_listing

TOLERANCE_PX = 2

_SHORT = "專業剪髮。"
_LONG = "專業剪髮染髮，十年經驗，歡迎預約，週一公休，地點近捷運站，停車方便。" * 3


def _home_listings():
    # 第一列（2 欄時是前兩張）就要有「描述 1 行」與「無描述」，3 欄時再加「2 行以上」，才量得到內容高度不同時的對齊。
    descriptions = [_SHORT, "", _LONG, _LONG, _SHORT, ""]
    return [
        build_public_listing(
            listing_id=f"11111111-1111-1111-1111-11111111110{i}",
            name=f"服務者{i}號",
            districts=["大安區", "信義區"],
            description=description,
        )
        for i, description in enumerate(descriptions, start=1)
    ]


# 桌面卡片格線的第一列：每張卡量三個位置——格線項（<a>）底邊、卡片（Card）底邊、地區列 top。
_HOME_FIRST_ROW_JS = """
() => {
  const links = [...document.querySelectorAll('a[data-listing-id]')]
    .filter((a) => a.getBoundingClientRect().height > 0
      && a.querySelector('.aspect-video'));
  if (!links.length) return null;
  const rect = (el) => el.getBoundingClientRect();
  const firstTop = Math.round(rect(links[0]).top);
  const row = links.filter((a) => Math.abs(Math.round(rect(a).top) - firstTop) <= 1);
  return row.map((a) => {
    const card = a.firstElementChild;
    const pin = card.querySelector('svg.lucide-map-pin');
    const loc = pin && pin.parentElement;
    return {
      linkBottom: Math.round(rect(a).bottom),
      cardBottom: Math.round(rect(card).bottom),
      locationTop: loc ? Math.round(rect(loc).top) : null,
    };
  });
}
"""


@pytest.mark.compatibility
@pytest.mark.parametrize(
    "width,height,min_cards",
    [(1280, 900, 3), (884, 1104, 2), (768, 1024, 2)],
    ids=["1280", "884", "768"],
)
def test_home_cards_in_a_row_share_the_same_bottoms(page, rest_mock, width, height, min_cards):
    """首頁桌面卡片：同一列的卡片外框底邊與地區列位置一致，不論描述 0／1／多行。"""
    page.set_viewport_size({"width": width, "height": height})
    listings = _home_listings()
    rest_mock.set_public_listings(listings)
    page.goto("/")
    expect(page.get_by_text(f"找到 {len(listings)} 位服務者")).to_be_visible()

    row = page.evaluate(_HOME_FIRST_ROW_JS)
    assert row and len(row) >= min_cards, f"{width}px 第一列只量到 {row}——探針過時或欄數不符"
    for key in ("linkBottom", "cardBottom", "locationTop"):
        values = [card[key] for card in row]
        assert None not in values, f"找不到地區列（MapPin）——結構探針過時了：{row}"
        assert max(values) - min(values) <= TOLERANCE_PX, (
            f"{width}px 同列卡片的 {key} 不齊：{values}（完整量測 {row}）。"
            f"卡片要撐滿格高、地區列貼底。"
        )


@pytest.mark.compatibility
@pytest.mark.parametrize(
    "width,desktop_cards",
    [(767, False), (768, True)],
    ids=["767", "768"],
)
def test_home_shows_exactly_one_card_set_across_the_md_boundary(page, rest_mock, width, desktop_cards):
    """首頁在 md 邊界（767／768）只顯示一套卡片：767 是手機版、768 起是桌面版。"""
    page.set_viewport_size({"width": width, "height": 1024})
    listings = _home_listings()
    rest_mock.set_public_listings(listings)
    page.goto("/")
    expect(page.get_by_text(f"找到 {len(listings)} 位服務者")).to_be_visible()

    desktop_visible = page.locator("a[data-listing-id]:visible .aspect-video:visible").count()
    assert desktop_visible == (len(listings) if desktop_cards else 0), (
        f"{width}px 可見的桌面版卡片數 {desktop_visible}"
    )


DETAIL_LISTING = build_public_listing(
    name="林小美專業髮型設計師",
    category="美髮",
    gender="女",
    districts=["大安區", "信義區"],
    photos=[f"https://example.com/{i}.jpg" for i in (1, 2, 3)],
    contacts={"instagram": "test_ig", "line": "test_line", "facebook": "test.fb"},
    description="專業剪髮染髮，十年經驗。\n歡迎預約，週一公休。\n地點近捷運站，停車方便。",
)

_DETAIL_COLUMNS_JS = """
() => {
  const grid = document.querySelector('[data-browse-content]');
  if (!grid) return null;
  const [media, info] = grid.children;
  const head = info.children[0];
  const r = (el) => el.getBoundingClientRect();
  return {
    mediaTop: Math.round(r(media).top),
    mediaBottom: Math.round(r(media).bottom),
    infoTop: Math.round(r(info).top),
    nameBottom: Math.round(r(head.children[0]).bottom),
    categoryBottom: Math.round(r(head.children[1]).bottom),
    locationBottom: Math.round(r(head.children[2]).bottom),
    viewport: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  };
}
"""


def _open_detail(page, rest_mock, service_provider_detail_page, width, height):
    page.set_viewport_size({"width": width, "height": height})
    rest_mock.set_public_listing(DETAIL_LISTING)
    page.goto(f"/service-providers/{DETAIL_LISTING['id']}")
    expect(service_provider_detail_page.name_heading(DETAIL_LISTING["name"])).to_be_visible()
    measured = page.evaluate(_DETAIL_COLUMNS_JS)
    assert measured, "找不到 [data-browse-content]——結構探針過時了，不是版面問題"
    return measured


@pytest.mark.compatibility
@pytest.mark.parametrize(
    "width,height",
    [(768, 1024), (841, 701), (884, 1104), (1023, 768)],
    ids=["768", "841x701", "884", "1023"],
)
def test_detail_is_two_columns_from_md_with_the_summary_above_the_fold(
    page, rest_mock, service_provider_detail_page, width, height
):
    """詳情頁 md（768）起雙欄：照片與資訊並排，名稱／類別／地區在首屏內，且無橫向溢出。"""
    m = _open_detail(page, rest_mock, service_provider_detail_page, width, height)

    assert abs(m["infoTop"] - m["mediaTop"]) <= TOLERANCE_PX, (
        f"{width}px 應為雙欄（資訊欄與照片欄同 top），實際 {m}"
    )
    for key in ("nameBottom", "categoryBottom", "locationBottom"):
        assert m[key] <= m["viewport"], f"{width}×{height} 首屏看不到 {key}：{m}"
    assert m["scrollWidth"] <= m["clientWidth"], f"{width}px 出現橫向溢出：{m}"


@pytest.mark.compatibility
@pytest.mark.parametrize("width,height", [(375, 844), (767, 1024)], ids=["375", "767"])
def test_detail_stays_single_column_below_md(page, rest_mock, service_provider_detail_page, width, height):
    """詳情頁 <768 維持單欄：資訊欄在照片欄下方。"""
    m = _open_detail(page, rest_mock, service_provider_detail_page, width, height)

    assert m["infoTop"] >= m["mediaBottom"] - TOLERANCE_PX, f"{width}px 應為單欄，實際 {m}"


@pytest.mark.compatibility
def test_detail_stays_two_columns_on_desktop(page, rest_mock, service_provider_detail_page):
    """詳情頁 1280 桌機維持雙欄（不因斷點下移而改變）。"""
    m = _open_detail(page, rest_mock, service_provider_detail_page, 1280, 900)

    assert abs(m["infoTop"] - m["mediaTop"]) <= TOLERANCE_PX, f"實際 {m}"


@pytest.mark.compatibility
@pytest.mark.parametrize("width,height", [(768, 1024), (841, 701)], ids=["768", "841x701"])
def test_detail_with_long_name_and_long_contacts_does_not_overflow(
    page, rest_mock, service_provider_detail_page, width, height
):
    """詳情頁 md–lg 雙欄（資訊欄約 356px）遇到 10 個全形字名稱與超長聯絡字串時不橫向溢出。"""
    long_listing = build_public_listing(
        name="林小美專業髮型設計師",
        category="美髮",
        districts=["大安區", "信義區"],
        photos=["https://example.com/1.jpg"],
        contacts={
            "instagram": "a" * 30,
            "line": "l" * 40,
            "facebook": "https://www.facebook.com/" + "x" * 80,
        },
    )
    page.set_viewport_size({"width": width, "height": height})
    rest_mock.set_public_listing(long_listing)
    page.goto(f"/service-providers/{long_listing['id']}")
    expect(service_provider_detail_page.name_heading(long_listing["name"])).to_be_visible()

    m = page.evaluate(_DETAIL_COLUMNS_JS)
    assert m["scrollWidth"] <= m["clientWidth"], f"{width}px 出現橫向溢出：{m}"
