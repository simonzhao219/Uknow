# 設計語言地基（D1+D2）實作審查報告

<!-- 由 /review-implementation 彙整四個 reviewer subagent 的發現而成。
     聚合規則：只彙整、去重、排序，不改判。 -->

審查對象：`claude/design-language-foundation-7cunir` 相對 `origin/develop` 的完整 diff
（實作，非規劃書）
審查日期：2026-09-14

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 0 | 3 | 資料流／API 契約／DB／外部整合（皆不適用，已核實）；對比度公式、oklch 灰階解析化簡、正則規則與 baseline 數字，逐一手算/抽樣核對無誤 |
| 架構 | 0 | 1 | 1 | 模組邊界、checker 家族慣例相容性、framework-check 接線位置、baseline 選址與棘輪紀律、五階段測試落點可實作性，逐一核對與 plan.md 一致 |
| UI/UX | 0 | 2 | 2 | 色彩 token 選色對比度（6 組 A/B/border 配對手算全數達標）、三處同步、G1 灰階完整性、「不確定時怎麼辦」退路、色盲 checklist 措辭、§12 八點映射、模式一致性、S1/S2 邊界 |
| 需求 | 0 | 2 | 0 | §1.3 驗收情境 2–7、業主六項裁決執行完整性、S1/S2 scope-out 邊界（零元件改動）、對比度公式與自我指涉陷阱處理 |

**合計 P0 × 0、P1 × 3（去重後）、P2 × 5（去重後）。** 無阻擋項。

去重說明：
- **vitest.config.ts 覆蓋率棘輪異動**——架構視角判 P2、UIUX 與需求視角各判
  P1（UIUX 另加「需人工裁決：真實成因」）。三者是同一個發現的三個角度，
  依「不改判但取重」慣例合併為一條 **P1**。
- 其餘發現彼此不重疊，各自保留。

四位 reviewer 均在報告中明確回答了必答題：**未發現實作偏離 plan.md 審核
通過的設計**，S1「零元件改動、畫面零變化」的 scope-out 邊界守住。

---

## 發現清單（依嚴重度排序）

### P1（應改）

**[P1]〔plan.md §1.3 驗收情境 1／`scripts/check-color-usage.py`〕違規訊息缺行號與具體 token 建議（需求視角）**

plan.md §1.3 第 1 條明文要求「訊息指出檔名行號與『改用哪個 token』」。
`scan_repo()` 算出的 `Hit`（行號+片段）在 `counts_of()` 就被丟棄成純計數，
`evaluate()`/`scan()` 全程只操作計數，違規訊息只有「檔名+規則類型計數」，
沒有行號、沒有針對命中片段的具體建議——這正是本規劃反覆點名、自己最忌諱
的「宣稱驗過但沒驗到」失效模式，這次發生在守門腳本自己身上。
→ 已修：`scan_repo()` 額外回傳 `hits_by_file`，新增 `format_violation_detail()`
+ `TOKEN_HINT`，只對「命中數比 baseline 多」的路徑印行號明細與依規則類型
給的具體建議；`_paths_with_new_hits()` 與訊息格式各補表格案例。

**[P1]〔plan.md §3.1／§3.3〕`vitest.config.ts` 覆蓋率棘輪異動未宣告、且歸因錯誤（架構＋UIUX＋需求三視角收斂）**

`vitest.config.ts` 不在 plan.md §3.1「動到的檔案」表內，且 §3.3 明文斷言
「不影響覆蓋率棘輪」。實作卻調整了門檻，註解把漲幅歸因於
`src/styles/globals.test.ts`——但該檔完全落在 `coverage.exclude` 的
`src/**/*.test.{ts,tsx}` 規則內，結構上不可能貢獻覆蓋率。
→ 已修：與 `origin/develop` 對照，確認 develop 本身覆蓋率已是
53.04/83.14/68.24（早於本分支任何 commit），漲幅是 develop 既有漂移，
與本 PR 無關。**完整還原** `vitest.config.ts` 至 `origin/develop` 版本，
plan.md §3.3 的斷言維持成立，棘輪校準留給真正造成漲幅的 PR 處理。

**[P1]〔plan.md §4.2(5)(c) / review.md R2-UIUX-1〕S2 驗收站需明列的檢查項只活在即將刪除的規劃目錄裡（UIUX 視角）**

review.md 第 2 輪裁決 R2-UIUX-1 明文要求「S2 驗收站 1 須明列『深色模式下
世代頭像灰是否與已失效圓點灰混淆』」，但這句話只出現在 `plan.md`——S1
收尾會依 CLAUDE.md 規則整個刪除 `docs/plans/design-language-foundation/`，
屆時這個具體驗收項會從所有存活文件裡消失，只能靠 `git show` 考古找回。
→ 已修：升級進 `docs/plans/platform-uiux-redesign/construction-plan.md`
§4.3 驗收 1 那一列，明文附上裁決依據與可推翻的說明。

### P2（建議）

**[P2]〔ui-ux-guidelines.md §12.8〕深色/色盲 checklist 未要求窄版重跑（UIUX 視角）**

checklist 通篇只描述桌面 devtools 操作，未提及要在窄版（375px，本 repo
既有慣例）下重複跑。本專案使用者幾乎都在手機，WCAG 1.4.1 安全網（狀態靠
文字/圖示傳遞）在窄版換行/截斷時可能失效，只在桌面檢查抓不到。
→ 已修：§12.8 補一段窄版重跑第 1、2 步的要求。

**[P2]〔`scripts/check-color-usage.py` C3(a)／C1,C3〕兩處已知掃描盲點未寫進「怎麼用」（系統視角）**

(1) href 誤報防呆是固定 20 字元視窗，多行 JSX 會失效；(2) 動態拼接色相
（`` `bg-${hue}-600` ``）完全不受 C1/C3 保護。皆為技術限制、現況 repo
不會踩到，但沒寫進文件會讓踩到的人 debug 半天。
→ 已修：§12.9 補「兩個已知的掃描盲點」段落。

**[P2]〔globals.css `--destructive-border`〕選色偏離 success/warning 的「border 重用 A 值」模式，未記錄理由（UIUX 視角）**

success/warning 的 border 直接重用 A 形狀色值，destructive 另選新色，
沒有註解說明，容易被誤讀為隨手決定。核算後確認**不能**改成重用：
`.dark` 版 A 色（`#82181a`）對 `.dark` 版 subtle 底（`#450a0a`）只有
≈1.6:1，遠低於 3:1 門檻，border 必須獨立選色。
→ 已修：補 CSS 註解說明原因（含手算數字）。

**[P2]〔ui-ux-guidelines.md §9〕a11y 章節未指路到 §12（UIUX 視角）**

§9 是最直覺會被搜尋「色彩可達性規則放哪」的地方，缺一行指路。
→ 已修：§9 末尾補一行「色彩對比度／色盲驗證 → 見 §12」。

**[P2]〔`vitest.config.ts` 校準註解〕functions 門檻的因果敘述邏輯顛倒（系統視角，併入上方 P1 一起處置）**

註解寫「66.24 落在現行值（66）以下」，但 66.24 > 66，邏輯顛倒（維持不動
的結果碰巧正確，因為取整後兩者相同）。此發現隨 `vitest.config.ts` 整份
還原一併解決，不需要單獨修訂措辭。

---

## 需人工裁決

- 〔系統視角〕plan.md §2.3 要求「commit message 記下轉換前後值」——已人工
  核對 `57e2681`（S1 階段 2 紅燈）/`90e78b7`（階段 2 綠燈）commit message，
  確認 `.dark --destructive`/`--destructive-foreground` 的 oklch 原值與
  轉換後 hex 值都寫在 commit message 內，**要求已滿足，無需處置**。
- 〔UIUX 視角〕`vitest.config.ts` 真實成因需要人工執行 coverage diff 才能
  確認——已在處置 P1 時完成驗證（與 `origin/develop` 對照跑
  `npm run test:coverage`），結論已併入上方 P1 說明，無需再等人工。

## 處置（2026-09-14，同一 session 內完成）

<!-- P0 的處置規則：必須修掉才可 push，或人工明文豁免。本次 P0 = 0，無此問題。 -->

- [x] P1 × 3 全數修掉：check-color-usage.py 訊息補行號+建議、
      vitest.config.ts 完整還原、R2-UIUX-1 驗收項升級進 construction-plan.md。
- [x] P2 × 5 全數修掉：§12.8 補窄版、§12.9 補兩處盲點、
      `--destructive-border` 補註解、§9 補指路、vitest.config.ts 因果
      敘述隨整份還原一併解決。
- [x] 一項「規劃書宣稱與現況不符」記錄但不回頭改規劃書內容
      （plan.md §2.4 C3(b)「現況 0 處」與實況不符，見 `progress.md`）——
      機制本身沒問題，baseline 已正確吸收，plan.md 即將隨目錄刪除。
- 對應 commit：`fbc93f2`（還原 vitest.config.ts）、`88f9006`（回填其餘
  P1/P2）。
