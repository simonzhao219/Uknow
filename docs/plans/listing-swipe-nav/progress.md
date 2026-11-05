# 刊登詳情頁左右滑換篇 實作進度

<!-- plans-keep: 施工鷹架；/tdd-implement 收尾刪除 -->

分支:`feature/listing-swipe-nav`
規劃書:`./plan.md`|審查:`./review.md`

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | 規格書先行＋抽 filterAndSortListings／distance.ts | ✅ 綠 | f5537e9 | 033c641 |
| 2 | 座標表＋區級排序＋動態載入接入＋預算決定 | ⬜ 未開始 | | |
| 3 | 等待狀態機＋FLIP 重排＋orderMode | ⬜ 未開始 | | |
| 4 | 凍結脈絡＋lastViewedId＋返回定位 | ✅ 綠 | 6673372 | 7565a3e |
| 5 | PhotoCarousel onEdgeSwipe＋swipeIntent | ✅ 綠 | 5b01c9c | 095a500 |
| 6 | 詳情頁換篇（key wrapper／控制列／鍵盤／焦點） | ✅ 綠（夾具一行經業主授權修正） | 48f41bd | 899cab4 |
| 7 | 換篇滑入動畫與頭尾回彈 | ⬜ 未開始 | | |
| 8 | e2e mocked Gherkin＋骨架探針 | ⬜ 未開始 | | |
| 9 | 文件同步與收尾 | ⬜ 未開始 | | |

## 目前位置與下一步

**順序調整（W5-40，主 session 2026-11-05）**：TGOS 維護期間先做不依賴座標表的階段。依賴分析：階段 4（凍結脈絡等）只依賴階段 1 的 `filterAndSortListings`，與座標表無關；階段 3（等待＋FLIP）依賴階段 2 的表；階段 8 的 e2e 拆為 8a（換篇／返回，不依賴排序）與 8b（定位已授權時依距離排序，依賴 2、3）。
新順序：**5 → 4 → 6 → 7 → 8a → 2 → 3 → 8b → 9**。TGOS 恢復後補階段 2（自動重試已排，11/08 台北仍下載不到就回報主 session，不改用其他來源）。
hash 說明：2026-11-05 推送守衛把分支 rebase 到最新 origin/develop（3712737），下表為 rebase 後的 hash（舊 hash 已不在分支上）；階段 6 另有 wip commit 53c4987（非綠燈證據）。
目前位置：階段 1、5、4、6 完成；下一步階段 7（換篇滑入動畫與頭尾回彈）→ 8a（e2e）。階段 2、3、8b 等 TGOS 恢復。預算硬上限（W5-43）：entry gzip ≤315 kB、raw ≤1010 kB，超過就停下回報；階段 6 實測 raw 1002.7／gzip 311.8。

## Blockers(逃生口紀錄)

- **階段 2 / Q5（2026-11-05，已部分解除）**：業主放行 data.gov.tw、www.nlsc.gov.tw、api.nlsc.gov.tw 後重測皆 200。確認結果：
  - 資料集：政府資料開放平臺「鄉鎮市區界線(TWD97經緯度)」（datasetId 7441，修改日 2025-12-24，SHP，欄位含 TOWNCODE／COUNTYNAME／TOWNNAME）。
  - **授權成立**：政府資料開放授權條款－第 1 版（https://data.gov.tw/license）：不限目的、時間、地域，免授權金，含衍生物與商用；**須依附件「顯名聲明」標示**（格式：提供機關／單位 [年份] [資料釋出名稱與版本號]＋條款連結）。
  - **下載被擋**：`resourceDownloadUrl` 在 `https://www.tgos.tw/tgos/VirtualDir/Product/…/鄉(鎮、市、區)界線1140318.zip`，容器經代理回 `CONNECT tunnel failed, response 403`（www.tgos.tw 不在白名單）。`api.nlsc.gov.tw` 可達但只提供縣市／鄉鎮名單與點位反查，沒有中心座標。W5-30 規定不改用其他來源，階段 2 仍暫停，待主 session／業主放行 `www.tgos.tw`（或改由有網路處提供該 zip）。
  - 待主 session 決定：顯名聲明要放哪裡（座標表檔頭＋？是否需在網站頁面／條款頁可見處標示）。

- **階段 2 / Q5 續（2026-11-05，W5-33／W5-34 已裁）**：`www.tgos.tw` 白名單已通（HTTP 通），但整站回「系統維護中／系統更新中」（首頁 200、其餘路徑含資料集下載 zip 與 metadata 頁 404，回應皆為同一張 16212 bytes 維護頁），資料檔下載不到。這是對方暫時停機，非本地問題；依 W5-30 不改用其他來源（也不採用 NLSC 他處的同類圖資，授權範圍未確認）。已知：W5-34 顯名只寫在程式檔頭與規格書資料來源段，不放網站可見處，PR 內文「需要業主知道的事」記一行風險；腳本檔頭要記下載網址、SHA-256、取得日期。等 TGOS 恢復後重試。

- **階段 6 測試夾具錯誤（逃生口 2，2026-11-05）**：`ServiceProviderDetailRoute.test.tsx`〈只有一張照片時，在照片上往左滑（盡頭續滑）換下一篇〉把首頁快取的 B 換成單張照片版本，但 `singleFor` 預設仍回傳原本三張照片的 B，詳情頁背景重驗後輪播變三張、起點不在盡頭，所以不換篇——是測試夾具與快取資料不一致，不是實作問題（其餘 30 條全綠）。需要的修正只有一行：該測試內加 `singleFor.mockResolvedValue({ data: solo, error: null })`。紅燈期測試被 hook 鎖定，依規則不私改，已向主 session 請求裁決。
  - **授權（業主 2026-11-05 12:43 UTC，在本 session 親口）：「授權修改」**——僅限上述一行夾具（該測試內加 `singleFor.mockResolvedValue({ data: solo, error: null })`，斷言與測試意圖不變）。依派工規定由我代刪 `.claude/tdd-lock`（雲端打不了 `! rm`），修完後跑 `npm run check` 全綠再提交階段 6 綠燈。

## 框架摩擦

(無)
