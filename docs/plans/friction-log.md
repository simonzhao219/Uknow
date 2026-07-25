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

## 2026-07-25｜誤擋教訓｜biome unsafe autofix 誤刪檔頭註解

`--unsafe --only=correctness/noUnusedImports` 移除 `import React` 時，把黏附
其上的整段檔頭註解塊（含 `// @vitest-environment jsdom` pragma）一併刪除，
導致 8 個測試紅。教訓：unsafe autofix 之後必須 diff 檢查「註解淨損」
（本次已用內容級比對腳本掃全 diff，僅此一檔受害，已還原）。
