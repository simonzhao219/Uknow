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

- **階段 2 / Q5（2026-11-05）**：W5-30 授權於階段 2 開頭確認區中心座標來源（內政部國土測繪中心／政府資料開放平臺）的授權與可下載性。雲端容器對 data.gov.tw、www.nlsc.gov.tw、api.nlsc.gov.tw 連線失敗（curl http_code 000，疑為網路政策擋下），無法讀授權文字也無法下載界線資料；僅 raw.githubusercontent.com 可達。W5-30 規定「不成立就停下回報，不改用其他來源」，故階段 2 暫停，等主 session／業主決定（放行上述網域、由有網路的環境提供原始資料檔、或指定替代來源）。階段 3 以後不依賴座標表資料本身，但依賴階段 2 的排序接入，順序不調整。

## 框架摩擦

(無)
