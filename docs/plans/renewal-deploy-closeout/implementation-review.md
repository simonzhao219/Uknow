# renewal-deploy-closeout 實作審查報告

<!-- plans-keep: 跨 session 施工鷹架；退場條件＝/tdd-implement 收尾時刪除 -->

審查對象：`git diff origin/develop...HEAD`（af638d26）。四個 fresh-context reviewer 平行審；只彙整不改判。

| 視角 | P0 | P1 | P2 | 偏離 plan |
|---|---|---|---|---|
| 系統 | 0 | 0 | 2 | 無未記錄偏離 |
| 架構 | 0 | 0 | 2 | 無未記錄偏離 |
| UI/UX | 0 | 0 | 3 | 無偏離 |
| 需求 | 0 | 1 | 3 | bundle 預算不在 plan §3（授權只在 progress） |

## P1
1. 〔需求〕`scripts/check-bundle-budget.mjs:37` entry gzip 316→316.5 kB 不在 plan 範圍清單，授權只寫在會被刪的 progress.md → **處置：PR「偏離規劃說明」逐字寫入。**

## P2
2. 〔系統〕`20261117000001` 檔尾 revoke 重複兩次 → **已修**（刪一行）。
3. 〔系統〕`check-remote-migrations.py` 註解「真實回應樣本」實為依形狀合成 → **已修**（註解改「依形狀合成」）。
4. 〔架構〕`--max-wait`／`--interval` 非數字會 traceback、退出碼 1 與「缺版本」混同 → **已修**（正規化成退出碼 2）。
5. 〔架構、需求〕progress.md 狀態落後 → 收尾時整個目錄刪除；PR 內文為準。
6. 〔需求〕0d「讀不到目前預設碼」分支（`current_default_code_read_failed`）無測試：在 definer 函式內讀 `reward_config` 無法從測試注入失敗 → **處置：PR 註明為未驗分支**（子交易隔離已由系統視角讀碼核過）。
7. 〔需求〕`docs/supabase-setup-checklist.md` 查無部署順序段 → PR 註明「已查無此段」。
8. 〔UI/UX，需人工裁決〕keeps_same 且當初自己填碼者：placeholder「輸入推薦碼」＋hint「維持原本的推薦人」，看不到原推薦人是誰——W6-28／29 的既定取捨，不改。
9. 〔UI/UX〕元件層少「預設可用且非現任」一案（純函式層已涵蓋）→ 不改。
10. 〔UI/UX〕checking／unavailable 文字不在 `aria-describedby`——R2-7 明列範圍外的既有債。
