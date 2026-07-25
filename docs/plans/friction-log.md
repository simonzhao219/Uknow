# Friction Log — 框架 Meta 迴路的單一彙整點

框架運行中的摩擦一律記在這裡（不散在各 feature 的 progress.md）。
整併觸發：每完成 2 個 feature 或每雙週，擇先到者——整併產物是框架修訂 PR。
「CI 未攔、journey/使用者才發現」的缺陷也記在這裡：此計數連續兩期上升，
即為啟用 claude-code-action 雲端 PR review 的觸發條件（見框架設計 v2 決策表）。

格式：日期｜類別（存量債/誤擋/漏網/待裁決）｜描述｜處置

---

## 2026-07-25｜存量債｜biome 導入時降為 warn 的規則

導入 biome 時 error 歸零的手段是把「需人工判斷的存量問題」降級 warn：

| 規則 | 數量 | 風險 |
|---|---|---|
| useExhaustiveDependencies | 82 | hooks 依賴不全，可能 stale closure |
| noExplicitAny | 60 | 型別漏洞 |
| noUnusedVariables / FunctionParameters | 28 | 死碼氣味 |
| useButtonType | 13 | 按鈕在 form 內誤觸 submit |
| noArrayIndexKey | 10 | 列表重排時 state 錯位 |
| noSvgWithoutTitle / useSemanticElements | 9 | a11y |
| noNonNullAssertion | 8 | 執行期 null 風險 |

償還方式：碰到該檔案就順手修該檔案的 warning（童子軍原則），不開專案式大掃除。

## 2026-07-25｜已裁決｜ReferralCodeCard / ReferralGuide 已建未接線 → 刪除

`src/components/referral/ReferralCodeCard.tsx` 與 `ReferralGuide.tsx` 只被
`ServiceProviderDetail.tsx` 的 dead import 引用（從未渲染）。biome 清 unused
imports 後成為孤兒、knip 閘門要求處置。
**人審裁決（2026-07-25）：刪除**——已隨框架 PR 移除（git 歷史可找回）。

## 2026-07-25｜誤擋（已修）｜pre-commit 的 deno 閘門擋住 merge commit

框架 PR 合併 develop 時，上游 commit 帶進 `supabase/functions/**` 變更，
pre-commit 的「後端有改但本機無 deno → 擋」規則觸發，**無法完成合併**
（沒裝 deno 的容器等於無法解任何含後端檔案的衝突＝死鎖）。

根因：閘門的意圖是「不准在無法驗證的情況下**寫**後端」，但判斷依據是
「staged 檔案路徑」，把「合併他人已驗證的 commit」誤判成「我在寫後端」。

處置：pre-commit 偵測 `MERGE_HEAD`，合併中且無 deno 時降為警告（上游
commit 已過 CI api-tests 軌）；deno 在則照跑。**自撰閘門的第一次誤擋，
修閘門而非繞閘門**——這正是 friction-log 存在的用途。

防線回填：framework-check 目前只驗腳本語法，不驗 hook 的行為分支。
本次靠人工模擬觸發才發現，已記為待辦：hook 行為需要 case 化的自我測試。

## 2026-07-25｜誤擋教訓｜biome unsafe autofix 誤刪檔頭註解

`--unsafe --only=correctness/noUnusedImports` 移除 `import React` 時，把黏附
其上的整段檔頭註解塊（含 `// @vitest-environment jsdom` pragma）一併刪除，
導致 8 個測試紅。教訓：unsafe autofix 之後必須 diff 檢查「註解淨損」
（本次已用內容級比對腳本掃全 diff，僅此一檔受害，已還原）。

## 2026-07-25｜環境阻擋（待裁決）｜pre-commit 的 Deno 閘門在本容器無法通過

改獎勵來源分類需要動 `supabase/functions/**`（契約 enum + 端點），
pre-commit 的 Deno 閘門因此觸發，但**兩個子閘門在這個執行環境都跑不過，
且都與本次改動無關**：

1. `deno task check`：需要從 `jsr.io` 下載 `@supabase/supabase-js`，
   本容器的 egress 政策回 403。離線無解（proxy README 明言不得繞道）。
2. `deno fmt --check`：對 **45 個檔案中的 41 個**報未格式化——其中絕大多數
   本次未動過。跨版本量測（2.2.8 / 2.9.4 各測一次，並移開 lockfile 排除
   「讀不到 lock」造成的偽陰性）結果**一致都是 41/45**，所以不是版本漂移：
   **`supabase/functions/` 從來沒有被 `deno fmt` 過**。差異類型是 import
   排序與長行斷行，全是格式，不含語意。
   之所以到今天才炸：這道閘門是 2026-07-25 的框架 PR 才加的（259940d），
   而 CI 從不跑 `deno fmt --check`（ci.yml 只有 `deno task check` +
   api-tests），於是「新閘門 × 從未格式化的舊碼」＝**任何裝了 deno 的環境
   都無法 commit 後端**。

處置（人審授權，2026-07-25）：**修閘門，不繞閘門**（與上一則 merge 誤擋同一
原則），拆成兩個獨立 commit，不混進 feature diff：

1. `style(deno)`：對 `supabase/functions/` 跑一次 `deno fmt` 正規化（41 檔，
   純空白／import 排序，無語意變動）——閘門的 fmt 這一半從此可通過。
2. `fix(hook)`：`deno task check` 失敗時分辨兩種情形——**型別真的有錯**照擋；
   **相依解析不到（registry 不可達）**降為警告並交給 CI 的 api-tests 軌
   （判別只認 deno 的相依解析／連線失敗訊息）。與 merge 例外同一種豁免：
   閘門的意圖是「不准寫沒驗證過的後端」，不是「沒有網路就不准寫後端」。

未做（留給下一次框架整併評估）：讓 CI 也跑 `deno fmt --check`。否則格式漂移
只有本機會發現，而這正是它累積到 41/45 檔都沒人察覺的原因。
