# renewal-rewards-automation-test 實作審查(/review-implementation)

日期:2026-08-07|對象:`claude/renewal-rewards-automation-test-jwjgwu`
相對 `origin/develop` 的 diff(20 檔,+1782/−15)|審前狀態:全 10 章
dispatch 綠(run 31157279168)
四視角:system / architecture / uiux / requirements 各自獨立審,本檔
只彙整不改判;處置欄為彙整者行動,降級與豁免一律列「需人工裁決」。

## P0

無。

## P1(彙整後去重)

| # | 視角 | 發現 | 處置 |
|---|---|---|---|
| 1 | system+requirements | ch7 缺 plan 表格明文要求的「K0 的 S9 付款:U2 +100(gen1)且任務不 +1」斷言——M7 已配對不重算在 U2 身上 ch4 後無任何覆蓋,回歸只會讓 ch10 總額模糊地對不上 | **已修**:feature ch7 補 `"U2" 因 "K0" 的 S9 付款獲得第 1 代獎勵增量 100P 且任務不增加【DB】`,共用 fresh 步驟加拍 `u2_tasks_before_fresh` |
| 2 | requirements | ch4 缺 plan 表格的「K0 任務進度 0」「迄日=付款日+1 年」兩格斷言 | **已修**:feature ch4 補 `任務卡顯示進度 0/8` 與新步驟 `最新到期日為付款日起約一年【DB】` |
| 3 | requirements | 人審核准的開放問題 #2a(W1 隨遷斷現況+「另一包」反轉標記)完全未落地 | **已修**:feature ch4 補 `"W1" 的上代仍為 "K0"【DB】` 並以註解標記「另一包上線時反轉(裁決 (b))」 |
| 4 | requirements | 聚合金額(300/200/700/100P)寫死且無 reward_config 漂移守衛,與單筆斷言吃 `reward_amount` fixture 的慣例不一致 | **已修**:roster ready 加 `assert referral_reward_amount == 100` 漂移守衛(與任務門檻 `==8` 守衛同原則) |
| 5 | architecture | f70 跨模組 import `org_builder._build_one` 私名,建立無契約的隱性耦合 | **已修**:org_builder 增公開名 `build_single_actor`,f70 改用之 |
| 6 | architecture | `builders/admin_bootstrap.py`(f10-f70 共用)的「一律 UPDATE 補齊 profiles」改動未列入 progress.md 偏離清單 | **已補記**(見 progress.md 偏離清單)。同項所指 `builders/login.py` 經 git 查證**不在本分支 diff 內**(0 commit、0 行)——它是 develop PR #205 的改動經 rebase 帶入,判**誤報**,不處置 |
| 7 | requirements | plan §2.2/§7 承諾的「各章 Background 自檢前置條件、標明斷鏈於第 N 章」未實作,降級為隱性防線(重導/逾時)且未記錄 | **記錄取捨,不補實作**(需人工裁決,見下):十章已跨多輪 dispatch 穩定,pytest 逐章命名已能定位失敗章;新增自檢步驟機制的複雜度與其診斷增益不成比例。已補記 progress.md |
| 8 | uiux+system+requirements | 產品碼 `JoinReferralProgramDialog.tsx`(4fefa62)違反 plan §1/§2.4/§4「零產品碼、不夾帶修改」;uiux 另指出 `aria-modal="true"` 無 focus trap 配套是不實承諾(P1)、`aria-label` 與 h2 重複有漂移風險(P2) | **技術面已修**:拿掉 `aria-modal`、`aria-label` 改 `aria-labelledby` 綁標題 h2(誠實最小態;測試選擇器只需 `role`)。**範圍豁免需人工裁決**(見下) |

## P2(彙整後去重)

| 視角 | 發現 | 處置 |
|---|---|---|
| architecture | P0 自備寫入的 `reward_config.default_referrer_code` 不在零殘留斷言覆蓋內(單列共享設定非逐使用者 FK 表) | 已在 `set_default_referrer_code` docstring 記為已知非阻擋殘留(拋棄式分支整支刪除+冪等覆寫,無實害) |
| system | `reject_first_withdrawal` 的 `.first` 依賴「全分支僅一筆 pending」的跨 feature 隱性排序不變量 | 已在該方法補註解說明依賴與未來的過濾版出路 |
| architecture | `_latest_end_date` 在 f60/f70/seed_time_machine 三處近親重複 | 不在本包收斂(動 f60 屬 #217 修復範圍,避免衝突);留待框架修訂 |
| architecture | `payment.py` 的 `pay_via_gui` 與 `_drive_payment` 各持一份 180 秒逾時處理 | 檔頭已明示「純加法不動 pay_via_gui」的保守取捨;留待框架修訂 |
| architecture+requirements | 設計書 §7 未補時光機新原語、§13 未補里程碑;journey README 範圍界線未提 70_ | **已修**:§7 補五原語、§13 補 M5 列、README 補 M5 段與 marker 示例 |
| uiux | A16 文案「請等待審核完成,或聯繫客服」是唯一未抽具名常數、無 vitest 防線的被斷言文案(來源檔不在本 diff) | 已記 friction-log,建議另開小票抽常數+補 vitest |
| system | `MIN_FILTERED=1` 只防「跑了 0 個」不防「跑少了」 | plan §2.4 已自陳的取捨;dispatch 記錄含 collected/ran 供人工核對,維持現狀 |
| uiux+system | 多處 `.first` 弱化斷言精確度(rewards 頁「可提領」、admin 詳情名稱比對) | 既有 journey text-first 慣例的延伸,兩輪規劃審查已認可;維持現狀 |
| requirements | plan ch8「迄日=現迄日+1 年(GUI)」的 (GUI) 標注與實作(DB)不符——但與 f30 既有同行為斷言一致,是 plan 用詞問題 | plan 屬鷹架、隨收尾刪除;本檔記錄即為溯源 |
| system | `age_monthly_bucket` select-then-overwrite 的窄 TOCTOU 窗口 | 章節嚴格序列化下無實際競態;docstring 層面已有「僅單執行緒使用」語意,不改 |
| system | `-v2` concurrency 改名屬範圍外變更 | 已定案:**留名、修註解**——名稱是任意識別字,revert 無益;誤診說明已改為正確的平台故障記錄(62b52a7) |

## 需人工裁決(合併前)

1. **產品碼豁免(P1-8)**:`JoinReferralProgramDialog.tsx` 補
   `role="dialog"`+`aria-labelledby` 保留在本 PR,抑或 revert 另走
   `/fix-bug` 分支?彙整者立場:保留——改動極小、無行為變更、是測試
   依 role 定位的技術必要條件,且同因很可能出現在 #217 的提領情境;
   revert 會讓本 PR 的 ch6 直接紅回去。**請於 PR 審查時對此項明文
   核可或否決。**
2. **斷鏈自檢降級(P1-7)**:接受「隱性防線+逐章命名定位」取代 plan
   承諾的顯式自檢?彙整者立場:接受,理由如上表。
3. `.first` 精確度與 `MIN_FILTERED` 取捨維持現狀(上表 P2)。

## 驗證

修復後全 10 章窄選 dispatch 需再綠一輪(run 連結記於 progress.md
階段 6 列);full 全套(30 人樹+saga 共存)另行 dispatch 驗證,60_
既有失敗屬 #217 範圍不計入本包判定。
