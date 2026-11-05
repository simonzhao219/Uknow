# 刊登詳情頁左右滑換篇 實作進度

<!-- plans-keep: 施工鷹架；/tdd-implement 收尾刪除 -->

分支:`feature/listing-swipe-nav`
規劃書:`./plan.md`|審查:`./review.md`

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | 規格書先行＋抽 filterAndSortListings／distance.ts | ✅ 綠 | 45975d2 | 760fa6b |
| 2 | 座標表＋區級排序＋動態載入接入＋預算決定 | ⬜ 未開始 | | |
| 3 | 等待狀態機＋FLIP 重排＋orderMode | ⬜ 未開始 | | |
| 4 | 凍結脈絡＋lastViewedId＋返回定位 | ⬜ 未開始 | | |
| 5 | PhotoCarousel onEdgeSwipe＋swipeIntent | ⬜ 未開始 | | |
| 6 | 詳情頁換篇（key wrapper／控制列／鍵盤／焦點） | ⬜ 未開始 | | |
| 7 | 換篇滑入動畫與頭尾回彈 | ⬜ 未開始 | | |
| 8 | e2e mocked Gherkin＋骨架探針 | ⬜ 未開始 | | |
| 9 | 文件同步與收尾 | ⬜ 未開始 | | |

## 目前位置與下一步

開工授權：業主 2026-11-05 在本 session 親打 /tdd-implement；階段 1 完成，下一步階段 2（座標表授權確認→座標表＋區級排序）。

## Blockers(逃生口紀錄)

- **階段 2 / Q5（2026-11-05，已部分解除）**：業主放行 data.gov.tw、www.nlsc.gov.tw、api.nlsc.gov.tw 後重測皆 200。確認結果：
  - 資料集：政府資料開放平臺「鄉鎮市區界線(TWD97經緯度)」（datasetId 7441，修改日 2025-12-24，SHP，欄位含 TOWNCODE／COUNTYNAME／TOWNNAME）。
  - **授權成立**：政府資料開放授權條款－第 1 版（https://data.gov.tw/license）：不限目的、時間、地域，免授權金，含衍生物與商用；**須依附件「顯名聲明」標示**（格式：提供機關／單位 [年份] [資料釋出名稱與版本號]＋條款連結）。
  - **下載被擋**：`resourceDownloadUrl` 在 `https://www.tgos.tw/tgos/VirtualDir/Product/…/鄉(鎮、市、區)界線1140318.zip`，容器經代理回 `CONNECT tunnel failed, response 403`（www.tgos.tw 不在白名單）。`api.nlsc.gov.tw` 可達但只提供縣市／鄉鎮名單與點位反查，沒有中心座標。W5-30 規定不改用其他來源，階段 2 仍暫停，待主 session／業主放行 `www.tgos.tw`（或改由有網路處提供該 zip）。
  - 待主 session 決定：顯名聲明要放哪裡（座標表檔頭＋？是否需在網站頁面／條款頁可見處標示）。

- **階段 2 / Q5 續（2026-11-05，W5-33／W5-34 已裁）**：`www.tgos.tw` 白名單已通（HTTP 通），但整站回「系統維護中／系統更新中」（首頁 200、其餘路徑含資料集下載 zip 與 metadata 頁 404，回應皆為同一張 16212 bytes 維護頁），資料檔下載不到。這是對方暫時停機，非本地問題；依 W5-30 不改用其他來源（也不採用 NLSC 他處的同類圖資，授權範圍未確認）。已知：W5-34 顯名只寫在程式檔頭與規格書資料來源段，不放網站可見處，PR 內文「需要業主知道的事」記一行風險；腳本檔頭要記下載網址、SHA-256、取得日期。等 TGOS 恢復後重試。

## 框架摩擦

(無)
