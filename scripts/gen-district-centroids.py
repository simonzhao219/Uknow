#!/usr/bin/env python3
"""產生 src/utils/districtCentroids.ts（鄉鎮市區中心座標表，S7 階段 2，W5-24）。

**這是一次性的資料產生工具，不是 CI 守衛**：不進 framework-check、不被 CI 執行；
產出的 TS 檔才是被測試與 build 使用的東西。重新產生只在內政部更新界線版本時才需要。

用法（需 `pip install pyshp shapely`，裝在 repo 外的 venv）：
    python3 scripts/gen-district-centroids.py <鄉(鎮、市、區)界線1140318.zip> \\
        --retrieved 2026-11-07 --provided-by "業主以瀏覽器自 data.gov.tw 資料集 7441 下載後提供"

輸入：政府資料開放平臺資料集 7441「鄉鎮市區界線(TWD97經緯度)」的 SHP 壓縮檔
（內政部地政司；內政部國土測繪中心保管，版本 1140318＝民國 114/03/18）。
演算法：每區取多邊形質心（經緯度平面近似）；質心不在區界內（狹長、環狀、離島區）
則取最大塊多邊形的界內代表點。座標取小數 3 位（約 110 公尺）。
鍵：`<縣市>|<區>`，縣市與區名用應用程式 `TAIWAN_REGIONS` 的寫法（臺／台寫法不一致，以程式為準）。
"""

import argparse
import hashlib
import json
import re
import sys
import tempfile
import zipfile
from pathlib import Path

# 官方名稱 → 應用程式 TAIWAN_REGIONS 的寫法。
# 程式裡「屏東縣」的區寫成「南鄉」，官方是「南州鄉」；程式側的區名清單不在本工項範圍內修改
# （既有刊登可能存著「南鄉」），所以座標表沿用程式的鍵，並把這個差異留在這裡。
OFFICIAL_TO_APP_ALIAS = {"屏東縣|南州鄉": "屏東縣|南鄉"}

SHP_STEM = "TOWN_MOI_1140318"
REPO = Path(__file__).resolve().parent.parent


def load_app_regions() -> dict[str, list[str]]:
    """從 constants.ts 讀出 TAIWAN_REGIONS（縣市 → 區清單，保留原順序）。"""
    text = (REPO / "src/utils/constants.ts").read_text(encoding="utf8")
    start = text.index("export const TAIWAN_REGIONS")
    body = text[start:]
    body = body[: body.index("\n};")]
    regions: dict[str, list[str]] = {}
    current = None
    for line in body.split("\n")[1:]:
        m = re.match(r"^\s{2}([^\s:]+):\s*\[(.*)$", line)
        if m:
            current = m.group(1).strip("'")
            regions[current] = re.findall(r"'([^']+)'", m.group(2))
        elif current:
            regions[current] += re.findall(r"'([^']+)'", line)
    return regions


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("zip_path")
    ap.add_argument("--retrieved", required=True, help="取得日期 YYYY-MM-DD")
    ap.add_argument("--provided-by", required=True, help="檔案怎麼來的（寫進檔頭）")
    ap.add_argument("--out", default=str(REPO / "src/utils/districtCentroids.ts"))
    args = ap.parse_args()

    import shapefile  # pyshp
    from shapely.geometry import shape

    zip_path = Path(args.zip_path)
    sha256 = hashlib.sha256(zip_path.read_bytes()).hexdigest()
    norm = lambda s: s.replace("臺", "台")

    regions = load_app_regions()
    expected = [f"{city}|{district}" for city, districts in regions.items() for district in districts]
    app_by_norm = {norm(k): k for k in expected}
    centroids: dict[str, tuple[float, float]] = {}
    with tempfile.TemporaryDirectory() as tmp:
        with zipfile.ZipFile(zip_path) as z:
            for ext in ("shp", "shx", "dbf", "prj", "CPG"):
                z.extract(f"{SHP_STEM}.{ext}", tmp)  # 固定檔名，不信任壓縮檔內其他路徑
        reader = shapefile.Reader(str(Path(tmp) / SHP_STEM), encoding="utf-8")
        for sr in reader.iterShapeRecords():
            rec = sr.record.as_dict()
            key = f"{rec['COUNTYNAME']}|{rec['TOWNNAME']}"
            key = OFFICIAL_TO_APP_ALIAS.get(key, key)
            key = app_by_norm.get(norm(key), key)  # 「臺／台」寫法以程式為準（例：霧臺鄉）
            geom = shape(sr.shape.__geo_interface__)
            point = geom.centroid
            if not geom.contains(point):
                parts = list(geom.geoms) if geom.geom_type == "MultiPolygon" else [geom]
                point = max(parts, key=lambda p: p.area).representative_point()
            centroids[key] = (round(point.y, 3), round(point.x, 3))  # (lat, lng)

    missing = [k for k in expected if k not in centroids]
    extra = [k for k in centroids if k not in set(expected)]
    if missing or extra:
        print(f"鍵對不上：程式有、資料沒有 {missing}；資料有、程式沒有 {extra}", file=sys.stderr)
        return 1

    header = f"""/**
 * 鄉鎮市區中心座標表（{len(expected)} 區）。**由 scripts/gen-district-centroids.py 產生，勿手改。**
 *
 * 用途：首頁「由近到遠」排序以區為單位（W5-24）——使用者座標反查最近的區中心作為所在區，
 * 刊登依最近的服務區中心距離排序。只作排序近似，不是行政區判定。動態載入的獨立 chunk，不進 entry。
 *
 * 資料來源：內政部地政司「鄉鎮市區界線(TWD97經緯度)」（內政部國土測繪中心保管），
 *   版本 1140318（民國 114 年 3 月 18 日），政府資料開放平臺資料集 7441。
 *   中介資料頁：https://www.tgos.tw/MDE/MetaData/CRUD/ViewMetaData?GUID=08cccb3b-2ac9-4459-a3f0-8db0af3c04fc&VIEW_TYPE=only&SOURCE=1
 * 取得：{args.retrieved}，{args.provided_by}。
 *   檔案「鄉(鎮、市、區)界線1140318.zip」SHA-256：{sha256}
 * 授權：政府資料開放授權條款－第 1 版（https://data.gov.tw/license），可商用、可製作衍生物，須顯名。
 *
 * 顯名聲明：
 *   內政部地政司 2025 鄉鎮市區界線(TWD97經緯度) 1140318
 *   此開放資料依政府資料開放授權條款 (Open Government Data License) 進行公眾釋出，
 *   使用者於遵守本條款各項規定之前提下，得利用之。
 *   政府資料開放授權條款：https://data.gov.tw/license
 *   Open Government Data License, version 1.0
 *
 * 衍生說明：本表為上述界線資料的衍生物——每區取多邊形質心（不在區界內者取界內代表點），
 * 座標取小數 3 位（約 110 公尺）。鍵的區名沿用應用程式 TAIWAN_REGIONS 的寫法
 * （臺/台寫法以程式為準；屏東縣「南州鄉」在程式裡是「南鄉」，見產生腳本的別名表）。
 */
"""
    # 依縣市分組輸出（縣市名只寫一次，省下約 1.5 kB；載入時展開成「縣市|區」鍵，bundle 預算緊）。
    lines = [
        header,
        "const BY_CITY: Record<string, Record<string, readonly [number, number]>> = {",
    ]
    for city, districts in regions.items():
        lines.append(f"  {city}: {{")
        for d in districts:
            lat, lng = centroids[f"{city}|{d}"]
            lines.append(f"    {d}: [{lat:.3f}, {lng:.3f}],")
        lines.append("  },")
    lines.append("};")
    lines.append("")
    lines.append("/** 鍵：`縣市|區`；值：[緯度, 經度]。 */")
    lines.append("export const DISTRICT_CENTROIDS: Readonly<Record<string, readonly [number, number]>> =")
    lines.append("  Object.fromEntries(")
    lines.append("    Object.entries(BY_CITY).flatMap(([city, ds]) =>")
    lines.append("      Object.entries(ds).map(([d, xy]) => [`${city}|${d}`, xy] as const),")
    lines.append("    ),")
    lines.append("  );")
    Path(args.out).write_text("\n".join(lines) + "\n", encoding="utf8")
    print(f"OK: {len(expected)} 區 → {args.out}（zip SHA-256 {sha256}）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
