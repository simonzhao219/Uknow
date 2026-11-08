# 第 5 波：對帳排程上 pg_cron＋金流並行防線＋暫時性錯誤（11/22 收件）

<!-- plans-keep: 跨 session 鷹架（第 5 波主／執行／審查 session 的共同事實來源）；退場條件＝第 5 波審查 session 結案後，值得長留的升級進規格書／friction-log，其餘隨 commit 刪除 -->

寫給**本波任何新開的 session**：開局只有 repo 和這份檔，沒有對話記憶。三種 session 的分工與凍結規則見 `docs/README.md`〈慣例〉；
派工 prompt 在同目錄的 `dispatch-prompts.md`。主 session 是 `session_01MQovbBpvF5cMi5BqUrAH86`，分支 `claude/quirky-pasteur-hjb0pv`。
行號一律現算。第 4 波主 session 寫的交接原文：`git show 3a7f506:docs/plans/launch-wave-5/plan.md`。

## 0. 上游與裁決

**上游**

- `docs/plans/launch-wave-4/plan.md`：§0 裁決 W4-1～37（仍有效）、§5 候選。
- `docs/plans/launch-wave-4/review.md`：第 4 波審查（R4，P0 0／P1 0／P2 17）；§5 待辦、§6 升級表是 `launch-wave-4/` 退場的依據（由本波審查 session R5 執行）。
- `docs/plans/launch-wave-4/audit-{pay,ref,auth,ops}.md`：W4-30 稽核，行號以 main `f88bae5` 為準。**本波工項直接引用這四份的編號**；
  R5 刪 `launch-wave-4/` 前要確認沒有待辦只存在稽核報告裡（見 §5）。

**開局現況**（11/04 21:30 台北）

- main＝`26c5ae8`，develop＝`3a7f506`；develop 領先 main 的只有 docs（#503、#505）。
- #502 的正式站 Edge 部署（run 41706804315）業主已於 11/04 21:14 核准。煙霧測試結果：`/health` sha＝`26c5ae8`（第 1 次探測就對上），
  PayUni production 憑證齊全，預設推薦人 ok。
  （Actions 列表上這個 run 的 head_branch 顯示 develop，但 job 環境的 `DEPLOY_BRANCH=main`、`DEPLOY_SHA=26c5ae8`，以 job 為準）
- 主 session dispatch 的 deploy-smoke（ref=main，run 41844045128）綠。
- 沒有開著的 PR；open issue：#467、#395、#384、#383。

**目標**：S1、S2、S3、S5、S7 五項全部合進 develop 就晉升（S7 由 W5-20 加入）。S6 本波至少把規劃做完並經過審查，實作有完成才上；S4 有完成才上。
收件截止 11/22（日）22:00。

**裁決（AskUserQuestion，業主 2026-11-04 21:30 台北）**

| # | 題 | 裁決 |
|---|---|---|
| W5-1 | 本波範圍 | **S1、S2、S3、S5 必上**。S6 本波完成規劃與審查，實作有完成才上，沒完成由第 6 波接手；S4 有完成才上（被推翻：S1–S6 全必上；只做 S1＋S2＋S3） |
| W5-2 | 派工順序 | **第一批四項並行**：S2 規劃（Opus）、S1 規劃（Opus）、S3（Sonnet）、S5（Sonnet）。S6 規劃等 S2 合併後再開（同碰 prepare／register）；S4 等 S1、S2 進實作後再開（被推翻：全部同時開；一項一項來） |
| W5-3 | 晉升時點 | **必上項全部合併就晉升，11/22 22:00 收件**，沒合的順延第 6 波（被推翻：分兩次晉升；固定 11/29） |
| W5-4 | 稽核其餘 P1 加收 | **ref P1-2（重複發獎：補鎖＋partial unique index，併 ref P2-1）→ 併 S2**；**auth P1-4（cancel-signup 無鎖）→ 併 S2**；**ops P1-3＋pay P1-3（對帳告警）→ 併 S1**（未選：ops P1-2 upload-photo 限流，留候選） |
| W5-5 | W4-34① 停權者能否續費（pay P2-9＝auth P2-1） | **不允許，前後端都擋**：結帳頁顯示「帳號已停權，請聯絡客服」，prepare 回 403；規格書 §5.2 把「付款」列為凍結項（被推翻：允許付款、維持現行） |
| W5-6 | W4-34② 網絡搜尋比對真名（ref P1-4） | **二、三代只比對遮罩後看得到的字元，並加限流**：一代照舊比對真名；`name_*` 排序二、三代改用遮罩名；每人加限流；`network-endpoints.test.ts` 刻意釘住的舊行為改成反向斷言（被推翻：只接受完整全名；維持比對真名） |
| W5-7 | W4-34③ 新約二次確認（pay P2-10） | **改程式，無條件確認**：fresh 一律跳二次確認，確認框依資產列出後果，沒有資產時至少說明推薦人會變（被推翻：改規格成有資產才確認） |
| W5-8 | W4-34④ 新約清空對推薦王 credit 與當月推薦的會員（ref P2-2／P2-3） | **保留已發的、門檻重算、名單不刪**：已發出的 credit（含未領）保留；fresh 後當月從 0 計門檻；當月桶只清計數，配對名單另存，守住 §9.2「R 從未出現在 U 歷史」（被推翻：維持現行並寫進規格；全部清空） |

**裁決（AskUserQuestion，業主 2026-11-04 23:00 台北；S2、S1 規劃審查後的題目）**

| # | 題 | 裁決 |
|---|---|---|
| W5-11 | S2 Q1：重複付款要不要在建單時加 15 分鐘確認框 | **不加**，只靠付款當下的防線＋告警（被推翻：加 409 確認框） |
| W5-12 | S2 Q2／Q6：「稍後註冊」4 天窗與提示框 → 業主改問「稍後註冊」該不該刪帳號 | **改成不刪、等同登出**：保留資料與草稿，下次登入接回；移除註冊中的自助刪帳號（要刪找客服）。auth P1-4 的並發風險與 4 天窗隨之消失；`/auth/cancel-signup` 由 S2 退場（被推翻：不刪＋次要刪除連結；保留刪除改名；維持現狀＋4 天窗） |
| W5-13 | S2 Q3＋Q4：重複付款的第二筆 | **接續效期＋三代獎金照發**，error 告警附該筆獎金列；退款由客服個案處理並人工沖銷（提領需人工審核，是第二道防線）（被推翻：獎金暫不發；不開通留 pending） |
| W5-14 | S2 Q5：付款途中才被停權 | **照開通＋error 告警**（錢已收）（被推翻：不開通交客服） |
| W5-15 | S1 技術題六條 | **全照 S1 建議**：Vault 存 RECONCILE_SECRET 副本；對帳每小時；未知 TradeStatus 排掃描後段、永不標 expired；health 端點與告警本波做；門檻由 S1 寫依據；兩環境暫不分密鑰 |
| W5-16 | S1：GitHub 排程的角色 | **看門狗兼後備觸發**：pg_cron 最近一次成功超過 90 分鐘就補跑＋推 LINE；自動接住晉升空窗（被推翻：只留手動＋告警） |
| W5-17 | S1：照片實刪開關 | **本波並存、不一致推 LINE**；統一成單一開關留第 6 波（被推翻：本波統一） |
| W5-18 | S1：pay P2-14（heal pass 失敗不告警） | **不收**，留第 6 波 |

**裁決（AskUserQuestion，業主 2026-11-05 02:30 台北；業主新增 UX 需求，附手機錄影）**

| # | 題 | 裁決 |
|---|---|---|
| W5-20 | 刊登詳情頁左右滑換上／下一篇（有篩選時只在篩選結果內）怎麼排 | **新工項 S7，本波必上、立即開**（Sonnet 三段式）；必上變 S1、S2、S3、S5、S7，11/22 截止不變（被推翻：有完成才上；hotfix） |
| W5-21 | 與照片輪播的手勢衝突 | **照片滑到盡頭再滑就換篇**：照片區內滑＝換照片，最後一張再往左＝下一篇、第一張再往右＝上一篇；照片以外的區域左右滑直接換篇（被推翻：照片區外才換篇；整頁一律換篇） |
| W5-22 | 桌機與邊界 | **桌機加上一篇／下一篇箭頭鈕＋鍵盤 ←→**；**返回一次回到列表原位置**（不逐篇倒退，捲到最後看的那篇）；**顯示「3 / 12」位置**，到頭尾回彈、不循環（未選：循環） |
| W5-23 | 業主說「有兩題 UX」，第二題 | **稍後補充**；收到後再排 |

**裁決（AskUserQuestion，業主 2026-11-05 03:00 台北；第二題 UX＋S7 規劃題）**

業主第二題（手機錄影）：首頁先依刊登時間顯示，約 6 秒後拿到定位突然換成遠近排序。主 session 讀碼：距離只用縣市中心點（同縣市距離全相同），定位逾時 8 秒、座標回來直接重排。

| # | 題 | 裁決 |
|---|---|---|
| W5-24 | 遠近排序的精度 | **改以「區」為單位**：服務區含使用者所在區者最前，其餘依刊登最近服務區中心距離；「全區」視為該縣市每區都服務；加全台鄉鎮市區中心座標靜態表（被推翻：維持縣市中心） |
| W5-25 | 拿到定位後的重排體驗 | **先等一下＋動畫重排**：已授權定位者最多等約 1.5 秒；拿不到才先顯示最新，座標回來後方格以動畫移位重排（被推翻：不等只動畫；等到定位才顯示） |
| W5-26 | 落點 | **併入 S7，本波必上**（換篇順序＝畫面順序；一併解 S7 審查的「座標晚到漂移」）（被推翻：另開 S8） |
| W5-27 | S7 換篇手感 | **手機標題列常駐「‹ n/N ›」＋滑入動畫，不跟手拖曳**（被推翻：跟手拖曳；只滑動不顯示箭頭） |
| W5-29 | S7 Q8：座標晚到時使用者已捲動／在操作，是否仍重排 | **一律重排（有動畫）**（業主 2026-11-05；被推翻：僅頂部且未操作才重排；不重排改提示）。主 session 附技術緩解：動畫期間忽略或延後卡片點擊、捲離頂部時以第一張可見卡為錨維持位置 |

**主 session 裁決**（落點與分配，非業主題目）

| # | 題 | 裁決 |
|---|---|---|
| W5-9 | W5-5～8 的工項落點 | W5-5 → S2（同碰 prepare，S2 必上）；W5-6 → S5（後端小修，Sonnet）；W5-7、W5-8 → S6（同屬 fresh 路徑；W5-8 碰獎勵規則，Opus） |
| W5-10 | R4 §6 指定給本波的升級 | 「裁決編號只由主 session 發」、「hash 以 PR 內文為準」→ 主 session 在本檔所屬 PR 寫進 `docs/README.md`〈慣例〉；「F1 草稿在 session 失效時也清」→ 主 session 改 `docs/multi-step-flow-recovery.md`，`src/utils/formDraft.ts` 檔頭的同步交 S3（產品碼不由主 session 改） |
| W5-19 | S1 審查 P0 #1「過半失敗也告警」無出處 | 出處是本檔所屬 `dispatch-prompts.md` S1 段原文（需求 reviewer 讀不到派工檔），豁免；`checked>=2` 門檻在 S1 plan 寫明理由 |
| W5-28 | S7 其餘規劃題 | 照 S7 建議：凍結脈絡存模組層；未換篇返回維持原 scrollY、換過篇才置中最後那張；無首頁脈絡不顯示換篇；輪播聚焦時 ←→ 換照片；審查 P0（換 :id 時元件狀態未重設）必處置 |
| W5-30 | S7 Q5 座標資料授權、entry 預算 | 授權 S7 在階段 2 開頭於有網路處確認國土測繪中心資料來源與授權，不成立就停下；entry gzip 預算准於階段 2 實測後上調，上限比現行多 3 kB，超過就停下回報 |
| W5-40 | S7 座標資料：TGOS（www.tgos.tw）整站維護中，zip 下載不到 | 先做不依賴座標表的階段（輪播邊界換篇、按鈕、鍵盤、焦點等），TGOS 恢復後補階段 2；到 11/08（台北）仍下載不到再與業主討論備案；不改用其他來源 |
| W5-43 | S7 entry raw 預算（#509 build-bundle 紅：raw 1000.2 > 1000 kB） | raw 1000→1010 kB（與 gzip +3 kB 同比例）；S7 硬上限 gzip 315／raw 1010；S4 另有 gzip +1.0／raw 約 +3.2 kB，後合者在 PR 寫合計 |
| W5-44 | S1 實作審查 P2 三條 | ①DataSource＝B 持續超過 4 天轉 unknown＋error 告警（本 PR 做）；②「SUCCESS 但缺 TradeStatus→missing_field」本 PR 不改，上線後第一輪看帳本 summary 的 unknownStatus／missing_field 計數（列晉升清單與 W4-26 現場查詢）；③unknown 單人工確認已付款後的手動開通入口 → 第 6 波候選 |
| W5-45 | S1 看門狗只漏一輪 pg_cron 就必推「停擺」LINE（GitHub 啟動延遲必然越過 90 分） | 補跑門檻維持 90 分；LINE 停擺推播改連漏兩輪（約 150 分）才推 |
| W5-46 | migration 撞號：S2 #510 的 `20261111000001_reward_idempotency_index.sql` 與 S1 #512 的 `20261111000001_scheduled_job_runs.sql` | #510 先合；S1 改號為 `20261112000001_scheduled_job_runs.sql`，rebase 後跑 `check-migration-versions.py` |
| W5-47 | #510 審查 P2-1：「稍後註冊」改走登出後，SIGNED_OUT → clearAccountLocalState 會清完善資料草稿，與 W5-12「保留資料與草稿」措辭不符 | **維持程式行為**（等同登出、清草稿是隱私上正確的做法）；規格書、formDraft.ts、multi-step-flow-recovery.md 改成「不刪帳號；已送出資料保留，未送出草稿隨登出清除」 |
| W5-48 | S4 兩問：/dashboard/qr?tab=scan 是否另行 block；手機欄位 `tel-national` | QR 由 canvas 畫（canvas 錄製已關）、相機不錄、對方姓名為文字已遮、無照片 → 不另 block；`tel-national` 接受，列晉升後業主真機驗收 |
| W5-49 | S6 換線規則（Q1、Q2、Q4） | 全照 S6 建議（業主 2026-11-05）：重複付款的 fresh 單不換線；付款當下才成環 → 維持原上代、帳本照清、error 告警；環判定不限深度 |
| W5-50 | S6 異常付款（Q3、D4） | 曾訂閱者的 null 單仍付款 → 照開通＋error 告警；永遠修不好的 SUCCESS pending 單造成永久 409 → 接受，擋下時寫 system_alert 交客服（業主 2026-11-05） |
| W5-51 | S6 新約確認框（Q6、D2、D3） | 依 source 分句（default 寫「推薦人將改變」、keep 不寫推薦人句）；有資產紅實心、無資產墨黑流程鈕（業主 2026-11-05） |
| W5-52 | S6 D1：#167 閘門 changed_at 修正放哪 | 留在 S6（與 0d 同處；正式站 q7＝3 筆、獎金皆已發，屬潛伏） |
| W5-53 | 用語「下線」（業主重申，2026-11-05） | **維持 2026-10-23 裁決範圍＋加機械把關**：使用者看得到的文案（律師定案四份內容頁除外）一律「推薦人／您推薦的會員／一代二代三代」，不出現「下線／上線／傳銷商／直銷」；主 session 與各 session 給業主的回報同樣不用。新開 **S8** 加自動檢查讓 CI 擋下；規格書 §7 術語對照、程式註解、測試、已套用 migration 不改（被推翻：連內部文件一起改；律師文件也改） |
| W5-54 | S6 E1：走本機快照進結帳頁、背景讀不到 /profile 時 | **首購者放行，後端兜底**（快照無 subscriptionEndDate 且 /profile 失敗 → 放行；後端回 RENEWAL_MODE_REQUIRED 走 R3 提示）（業主 2026-11-05） |
| W5-55 | S6 E2：新約填的碼就是現任推薦人 | 確認框寫「您的推薦人維持 {姓名}」（業主 2026-11-05） |
| W5-56 | S6 F1：新約建單後、付款前新推薦人被停權或碼被撤銷 | **付款當下重驗**：失敗就不換推薦人、帳本照清、error 告警（與 W5-49② 同形）；首購路徑不重驗（業主 2026-11-05） |
| W5-57 | S4 加固：lazy-recorder 由 PostHog CDN 載入，預設 strict_script_versioning="fallback" 失敗時退回未釘版最新檔 | 設 `strict_script_versioning: true`（寧可不錄）；`/array/<token>/config.js` 必執行屬廠商信任剩餘風險，PR 記一行、補 CSP 時處理 |
| W5-58 | S6：king_round_base 寫入失敗會讓整筆 fresh 付款回滾 | **子交易隔離＋error 告警，付款照常完成**（含 ledger_reset）；告警附 user_id／月份／應寫 base 供人工補（業主 2026-11-05） |
| W5-59 | S6：預設推薦人在會員自己網絡內（會成環）時確認框仍寫「推薦人將改變」 | **本 PR 修**：先判成環，會成環視為 keep、不寫推薦人句（業主 2026-11-05） |
| W5-60 | S6：journey f70 缺章（fresh 後三代獎金、任務、自領停發、ch7、ch9） | **留第 6 波**，已由 Deno 整合測試與 mock e2e 涵蓋（業主 2026-11-05） |
| W5-61 | S6 獨立審查 P2-1：批次自癒 `complete_paid_pending_orders(null)` 單一交易內握前輪 profiles 列鎖，0a′ 等 advisory 時可與線上 fresh 付款死鎖，被選中方的一代獎金被 `when others` 吞掉而靜默漏發 | **本 PR 修**：批次路徑在 0a′ 改 `pg_try_advisory_xact_lock`，拿不到就跳過留給下一輪；補測試（業主 2026-11-06） |
| W5-62 | S6 獨立審查 P2-2：新 Edge 若先於 migration 部署，prepare 全 500（含首購） | **晉升清單加一步**（核准正式站部署前確認 migration 已套用）；部署 workflow 自動檢查列第 6 波（業主 2026-11-06） |
| W5-63 | S6 P2-3：會員現任推薦人即預設推薦人時，新約留空確認框仍寫「您的推薦人將改變」（實際不變；推薦人與獎金正確） | **先合 #514，留第 6 波**：後端回第三態「預設推薦人即現任」，前端寫「您的推薦人維持不變」、不揭露是誰（業主 2026-11-06） |
| W5-64 | S7：www.tgos.tw 維護結束後對雲端機器回 HTTP 403（非代理白名單；疑 WAF），界線 zip 取不到，卡階段 2、3、8b | **業主用瀏覽器自行下載「鄉(鎮、市、區)界線1140318.zip」（data.gov.tw 7441），在 S7 session 附檔**；S7 記 SHA-256／URL／取得日期，離線產座標表，顯名照 W5-34；不繞封鎖（業主 2026-11-06）。預算確認：S7 疊在 develop 1005／313 上 → raw 1015／gzip 316（W5-43 合計），超過即停下回報 |
| W5-65 | S7：`TAIWAN_REGIONS` 屏東縣「南鄉」應為官方「南州鄉」（疑筆誤；座標表以別名對應，排序不受影響） | **第 6 波修**：改 constants＋migration 轉換既有資料，走 `/fix-bug`（業主 2026-11-07） |
| W5-66 | S7 手機實測三項（LINE 邊緣返回、滑入動畫橫向閃動、返回捲動 smooth） | **#509 合併後、晉升前**業主在 develop 網址實測；有問題先修再晉升（業主 2026-11-07） |
| W5-67 | develop Vault `uknow_internal_secret` 與 Edge `RECONCILE_SECRET` 不一致（pg_net 打端點 401）、原值無人持有 | **整組換新**：主 session 提供本機腳本（openssl 產值 → gh secret、正式站／develop Edge，Vault SQL 進剪貼簿），晉升時再跑一次寫正式站 Vault（業主 2026-11-07） |
| W5-68 | PostHog 免費方案限 1 個 project，第 2 個需綁卡升級 | **只用 1 個給正式站**：main 注入正式 key，develop／預覽維持佔位不注入；晉升前不在 develop 驗證，改由上線當天業主抽看錄影（W5-39）（業主 2026-11-07） |
| W5-69 | 業主正式站實測：左右滑可順利換到下一篇，但換篇缺少過場動畫、感覺突然 | **列第 6 波優化**（業主 2026-11-07） |
| W5-70 | 業主：後台要能看到整棵推薦樹，搭配查帳必要資訊，確認推薦、獎勵、任務、提領一切如預期 | **列第 6 波**（新功能，走三段式；規劃時先和業主確認要顯示的欄位與查帳情境）（業主 2026-11-07） |
| W5-71 | R5 P2-1～4：PaymentCheckout 送單錯誤分支（自己的碼／碼失效 400 無專屬處理、非 JSON／斷網顯示技術字串、已有有效訂閱不導走）與新約確認框 portal 未包 privateClass | **第 6 波合成一支 Sonnet `/fix-bug`**（業主 2026-11-07） |
| W5-72 | R5 P2-5：批次自癒與線上付款在三代鏈上 profiles 列鎖互鎖（W5-61 同類），被選中方漏發獎金只留 warning，下次 /profile 由 repair 補回 | **第 6 波優先修**，與 W5-61 同處；同 PR 先把 40P01 改成 error 告警（業主 2026-11-07） |
| W5-73 | 業主抽看正式站錄影：文字與輸入已遮蔽，但照片不顯示 | **維持現狀**：照片空白是 W5-38 屬性白名單（`src` 不在白名單）的預期結果，證件照／大頭照網址不進 PostHog；不開放刊登照片（業主 2026-11-07） |
| W5-31 | S1 階段 0 ④：pg_net 裝好後 anon／authenticated 有 net schema 權限（平台預設，postgres 無法 revoke；PostgREST 未暴露 net） | **接受平台預設**（業主 2026-11-05 04:00 於 S1 session 互動選項）；plan §2.2 照實改寫，階段 8 改斷言：PostgREST 暴露 schema 不含 net、invoke／帳本函式已 revoke、vault 不可讀 |
| W5-32 | S1 ⑥ PayUni 官方 TradeStatus 碼表、S7 Q5 內政部鄉鎮市區界線：雲端網路白名單擋 `docs.payuni.com.tw`、`data.gov.tw`、`www.nlsc.gov.tw`、`api.nlsc.gov.tw` | **業主自行到環境網路設定放行四個網域**（業主 2026-11-05 04:00 互動選項），兩個 session 重試；仍不通再議（S1 備案 (c) 第三方碼表＋晉升前補官方碼表）。S1 階段 1、3～9 先做；S7 階段 2 暫停 |
| W5-41 | S1：PayUni 官方 TradeStatus 碼表有 8（訂單待確認），plan 未預期 | **當 unknown 交人工**：永不自動標 expired、每張一筆 error、掃描排後段（業主 2026-11-05 約 08:2x 於 S1 session 互動選項）。官方碼表（單筆交易查詢 Ver 2.0）：0 取號成功／9 未付款／1 已付款／2 失敗／3 取消／4 逾期／8 待確認；4、9 依 plan 併入 0 的路徑，6 不存在→unknown |
| W5-42 | S1：DataSource＝B（處理中、資料未完整） | **一律本輪不下結論**：不收斂、不標 failed／expired、不告警，下輪再查（理由：資料不完整時收斂可能拿不到付款時間，會籍起算日會算錯）（業主同上） |
| W5-33 | S7 界線資料實際下載點 `www.tgos.tw` 不在白名單 | **業主再放行 www.tgos.tw**（業主 2026-11-05 互動選項）；S7 下載並把 SHA-256、URL、取得日期記入腳本檔頭 |
| W5-34 | 政府資料開放授權第 1 版的顯名義務放哪 | **只寫在程式檔頭與規格書**（業主 2026-11-05；被推翻：另加條款頁「資料來源」一行；頁尾）。業主已知「未盡顯名義務視為自始未取得授權」條文；PR 內文記這條風險 |
| W5-35 | S4 PostHog EU project key | **先佔位、預設關閉開發，晉升前業主建兩個 project 提供 key**，主 session 轉交；合進 develop 時必須是關閉、不送任何請求 |
| W5-36 | S4 隱私設定 | **全照 S4 建議**：admin 不錄（對 W4-36「全錄」的偏離）、錯誤追蹤先關、`ip:false` 不收 geo、LINE in-app 全錄但保留抽樣開關、登出 `reset(true)`。主 session 另定：S4 entry 預算 ≤ +1.0 kB gzip，與 S7 的 +3 kB 分開算；S4 審查 P0（錄影與 URL 帶 query）必須修完重審，用真實 SDK＋假 key 攔截 payload 驗證 |
| W5-37 | S4 Q7：recorder 載入來源 | **從 PostHog 資產網域外部載入**（業主 2026-11-05；明確接受供應鏈風險：第三方 JS 不受 lockfile 控制、可讀 DOM）（被推翻：自帶 +232 kB 懶載入 chunk） |
| W5-38 | S4 Q9：錄影 DOM 屬性遮罩 | **白名單**：只留 class／style／尺寸等非內容屬性，其餘遮罩或剝 query（被推翻：maskAllElementAttributes） |
| W5-39 | S4 Q10：上線驗收 | **人工抽看第一批錄影**：上線第一天業主在 PostHog 抽看 5～10 支（註冊、付款、提領頁），確認無個資；不設自動退化門檻 |

## 1. 時程

| 時點（台北） | 事 |
|---|---|
| 11/04 晚 | 本檔落檔；開 S2 規劃、S1 規劃（Opus）、S3、S5（Sonnet） |
| 業主時間 | 審 S1、S2 規劃與 `/review-plan` 報告 → 在各自 session 親打 `/tdd-implement <slug>` |
| S1、S2 進實作後 | 開 S4（Sonnet，三段式） |
| S2 合併後 | 開 S6 規劃（Opus） |
| **11/22（日）22:00** | 收件截止：沒合進 develop 的順延第 6 波 |
| 必上四項合併後 | 開晉升 PR（develop→main，標題 `chore(release): 晉升 develop → main——第 5 波`）→ journey-full 綠 → merge commit → 業主核准 `production` → `/health` sha 與 build-sha 對上 |
| 晉升後 24～48 小時 | 主 session 跑上線後現場查詢（W4-26），**特別看 pg_cron 的準時度**（S1 的唯一現場驗證） |
| 晉升後 | 開 R5 第 5 波審查 session（兼做 `launch-wave-4/` 退場） |

## 2. 工作分解

在途上限：**程式碼工項同時最多 3 個**（主 session 審查是瓶頸）；三段式工項在規劃期不佔名額，進實作才佔。

| ID | 工項 | 流程／分支 | 模型 | 主要動到 | 撞檔 |
|---|---|---|---|---|---|
| S1 | **對帳與照片清理改由 Supabase pg_cron 觸發**（W4-25），GitHub workflow 留作手動觸發與告警；併 ops P1-3（對帳 PayUni 查詢全滅時排程仍綠）、pay P1-3（未知 TradeStatus 建單第 4 天靜默標 expired） | 三段式，`feature/pg-cron-schedulers` | Opus | 新 migration（pg_cron／pg_net 排程、驗證機制）、`reconcile-payments.yml`、照片清理 workflow、`index.ts` 對帳與清理端點、`system_alerts`、`supabase/README.md`、規格書排程段 | `index.ts` 對帳段與 S2 不同區；migration 版本號 rebase 後必跑 `check-migration-versions.py` |
| S2 | **金流與推薦的並行防線**（W4-33 第一優先）：pay P1-2 同人兩分頁重複付款；auth P0-1／P1-2（＝ref P1-1）register 查推薦碼錯誤被吞（改走 `validate_referral_code`，error→503，查無／停權→400 同形）；ref P1-2＋P2-1 重複發獎（補鎖＋partial unique index）；auth P1-4 cancel-signup 無鎖；W5-5 停權者不得付款 | 三段式，`feature/payment-concurrency-guard` | Opus | `index.ts`（prepare、register、cancel-signup）、新 migration（鎖、唯一索引）、`PaymentCheckout.tsx`、`registrationFlow.ts`、規格書 §5.2／§6／§8.3 | 與 S6 同碰 prepare → S6 等 S2 合併；與 S3 同碰 `CompleteProfile.tsx`／cancel-signup → 一個分支只能由一方 rebase，後合的那支 rebase |
| S3 | **暫時性錯誤被當成定論**（R4 §5-2）：R4 P2-1（cancel-signup 401 一律當帳號已刪）、P2-4（CompleteProfile 冷載失去 8 秒逾時）、P2-5（閘道 404 判成帳號異常，改認 `code: 'PROFILE_MISSING'`）；T1-B 未修的 PaymentCheckout／CompleteProfile getSession retryable 仍導 `/login`；`formDraft.ts` 檔頭同步「session 失效也清」（W5-10） | `/fix-bug`，`fix/transient-not-final` | Sonnet | `CompleteProfile.tsx`、`fetchProfile.ts`、`PaymentCheckout.tsx`、`index.ts`（cancel-signup 改用分類式 `authenticate()`、`/profile` 零列 404 帶 code）、`api-contract.ts`、`formDraft.ts` | 見 S2：cancel-signup 後端，S3 只改認證分類（401／503），S2 改鎖 |
| S4 | **PostHog EU 監控＋錄影**（W4-35～37）：照 W4-37 的遮罩清單施工，敏感欄位 block 要有測試釘住；不改條款 | 三段式，`feature/posthog-monitoring` | Sonnet | `src/main.tsx` 或新 `src/utils/analytics.ts`、CSP（`public/_headers`）、敏感表單元件加 block 屬性、`package.json` | S1、S2 進實作後才開 |
| S5 | **後端小修組**：ops P1-1＝ref P1-9 提領 CSV 銀行代號與帳號前導 0、15 位以上截斷（第一筆提領前必修）；W5-6 網絡搜尋二、三代只比對可見字元＋限流（ref P1-4） | `/fix-bug`，`fix/csv-and-network-search` | Sonnet | `src/utils/csv.ts`、`WithdrawalManagement.tsx`、`index.ts`（`/referrals/network/search`）、`network-endpoints.test.ts`、規格書 §7.2／§7.3 | 無 |
| S7 | **刊登詳情頁左右滑換篇＋首頁遠近排序**（W5-20～22、W5-24～28）：區級距離、等定位＋動畫重排；在篩選後的清單內換上／下一篇；照片輪播到盡頭接續換篇；桌機箭頭鈕＋鍵盤；返回回列表原位置；顯示位置「n / N」 | 三段式，`feature/listing-swipe-nav` | Sonnet | `ServiceProviderDetail.tsx`、`listing/PhotoCarousel.tsx`、`HomePage.tsx`、`utils/homeListingsCache.ts`（篩選後清單與捲動位置的來源）、e2e 首頁／詳情 feature、`docs/ui-ux-guidelines.md` | 純前端，與 S1／S2 不撞；與 S4（PostHog）同碰頁面元件，S4 後開 |
| S8 | **用語機械把關**（W5-53）：前端使用者看得到的字串（JSX 文字、字串常數、toast／錯誤訊息、內容頁）出現「下線／上線／傳銷商／直銷」即 CI 紅；律師定案四份內容頁列白名單；沿用 `RECRUITMENT_FORBIDDEN_WORDS` 的單一來源思路 | `/fix-bug`，`fix/terminology-guard` | Sonnet | 新測試或 `scripts/` 檢查、`src/` 命中處（若有）、`.claude/rules` 或 ui-ux §12.13 指標 | 與 S7、S4 同碰前端文案：先掃描、只改命中處 |
| S6 | **續約路徑潛伏組**（期限 2027-10-27）：ref P0-1＝pay P0-1（fresh 棄單後改付 extend 仍換線／發獎）；ref P0-2（推薦成環）；pay P1-1＝auth P1-1（續費者走首購路徑，prepare 應拒已有訂閱者 `renewalMode=null`）；pay P1-4（續費者卡單被送回結帳頁）；W5-7 新約無條件二次確認；W5-8 新約清空語意 | 三段式，`feature/renewal-path-hardening`；**本波必交規劃＋審查**，實作有完成才上 | Opus | `index.ts`（prepare fresh／extend、`/profile` 卡單旗標）、migration（成環檢查、`reconcile_king_credits`、配對名單）、`PaymentCheckout.tsx`、規格書 §6.2／§9 | S2 合併後才開 |
| R5 | 第 5 波審查（晉升後）；兼做 `launch-wave-4/` 退場（依 R4 §6；四份 audit 一併） | 審查 session；報告 `docs/plans/launch-wave-5/review.md` | Opus | — | — |

主 session 自己做：本檔 §7、§8；審每支 PR；合併後 dispatch 驗證（S1 合併後在 develop 驗 pg_cron 首輪觸發，並 dispatch 兩支 workflow 的手動路徑）；
W5-10 的兩條文件升級（本 PR）；上線後現場查詢（W4-26）。

## 3. 執行環境須知（寫進每個派工 prompt）

`docs/README.md`〈慣例〉的「雲端 session 的執行環境須知」全部適用。第 3、4 波累積、仍有效的（原文見 `launch-wave-4/plan.md` §3 與交接 §2）：

- **合併後 GitHub 會自動刪 head 分支**。主 session 的紀錄分支合併後也會消失，再推前要 `git fetch --prune` 並從 develop 重建，否則 `--force-with-lease` 會報 stale info。
- **推送守衛在指令執行前就會攔下**並要求 rebase＋`--force-with-lease`：commit 和 push 分成兩次 Bash 呼叫。
- **一個分支只能由一方 rebase**（W4-7）。
- **執行 session 不一定收得到 CI 事件**：主 session 自己查 check runs。rebase 後 diff 與審過的版本逐位元組相同，可直接合併。
- **子 session 對正式站的唯讀 SQL 會被權限分類器擋**：一律交主 session 代跑。
- **合併一支 PR 讓 base 前進後，其他 PR 的 `ci-ok` 會變 expected、不能合**。同時交件的多支 docs PR，由主 session 的 PR 逐字帶入、一次跑 CI。
- **雲端容器連不到 `*.supabase.co` 與 `*.pages.dev`**（proxy 403）。正式站 `/health` 只能看 deploy-supabase 的煙霧測試步驟，或 dispatch deploy-smoke。
- **晉升 PR 開著時不合任何 PR 進 develop**（含主 session 自己的紀錄 PR）。
- **首輪 CI 偶發**：`PhotoPicker.test.tsx`〈取消與 Esc 都只取消當張〉。再出現就列 E 類補診斷，不要跳過。
- **雲端 worker 常重啟**：重啟後先讀 notifications，再看 `git status` 與本檔 §8，不憑記憶判斷進度。
- **裁決編號只由主 session 發**（W5-10）：執行 session 拿到的授權記成「業主 YYYY-MM-DD HH:MM 互動選項：原話」，不自編 W5-x。
- **紅綠燈 hash 以 PR 內文為準**（W5-10）：rebase 會改寫 hash，PR 內文的表是唯一正本；本檔 §8 只記 PR 號，不抄 hash。

## 4. 晉升清單（主 session）

1. 必上五項合併後 develop 凍結；列出 `3a7f506` 之後合進 develop 的全部 PR、後端變動、migration 檔名。
2. 開晉升 PR、訂閱；journey-full（sandbox）綠 → merge commit 合 main → 請業主核准 `production` → `/health` sha、deploy-smoke build-sha 對上。
3. S1 的 pg_cron 在正式站由 migration 建立：晉升後確認 `cron.job` 有預期的排程列，首輪 `cron.job_run_details` 成功；GitHub 那兩支 workflow 改手動後，排程不再重複觸發。
4. **S1 硬性驗收**（S1 plan §2.9）：
   - 甲段（migration 套用後、Edge 核准部署前）：正式站 Edge Secrets 有 `RECONCILE_SECRET` 與 `PHOTO_PURGE_LIVE=true`；Vault 建 `uknow_api_base_url`、`uknow_internal_secret`；（若階段 0 結論如此）Dashboard 開 pg_net；`cron.job` 有 5 列。
   - 乙段（Edge 部署後）：`select public.invoke_internal_endpoint('reconcile')` 回 request id，1 分鐘後帳本最新列 `succeeded`；核准後第一個整點 +7 分，帳本出現 `pg_cron` 完成列。
   - develop 在 S1 合併、migration 套用後，同樣做甲段（不設 `PHOTO_PURGE_LIVE`）。
4a. **W5-62**：核准 `production` 部署前，先確認本次 migration（含 S6 `20261113*`）已在正式站套用（`supabase_migrations.schema_migrations` 有對應版本、`prepare_payment_order` 六參數版與 `referral_would_cycle` 存在）；未套用不核准——新 Edge 配舊 DB 會讓建單全 500。
5. S1 上線後第一輪：帳本 `scheduled_job_runs.summary` 的 `unknownStatus`、`missing_field` 計數（W5-44②），異常就開修。
6. 開 R5。

## 5. 第 6 波候選（未納入本波，一行一項）

**稽核未收的 P1**（R5 刪 `launch-wave-4/` 前，這些要已在本節或規格書 §14）：
ref P1-3（推薦網絡超過 1000 列時 PostgREST 靜默截斷）；ref P1-5（`/rewards/history` error 被吞成 200）；ref P1-6（`upload-id-photos` update error 被吞）；
ref P1-7（`withdrawalBankData` 鍵不綁 uid）；ref P1-8＝pay P1-5（`pendingUser` 付款後不清、不綁 uid）；auth P1-3（後端不驗 18 歲／手機／身分證）；
auth P1-5（重設密碼後不登出）；ops P1-2（upload-photo 無限流、不要求會籍）。各報告其餘 P2 以報告為準，R5 退場時逐條決定進候選或 §14。

**R4 未收的 P2**：P2-2（`AuthRefreshDiscardedError` 被判非暫時性，多分頁休眠還原會全體登出）、P2-3（冷啟動 getSession 不 resolve 永遠 loading）、
P2-6（degraded 時頁首畫訪客版）、P2-7（degraded 按登出閃 `/login`）、P2-8（結帳頁重試中登出被蓋掉）、P2-9（N 個請求 N 次確認）、
P2-10（冷啟動換帳號不觸發 `onAccountSwitched`，提領會預填前一人的銀行帳號；併 auth P2-21／P2-22 的 DataCache 同類）、P2-11（三顆 aria-disabled 鈕不灰化）、
P2-13（hash 網址導向判準）、P2-14（App 靜態 import）、P2-15（smoke 告警標題不分環境）；T1-B 未修：`/auth/register` 讀回擲非 ProfileReadError 仍 500。

**第 4 波 §5 帶過來的**：Playwright 升到支援 Ubuntu 26.04 的版本（含 e2e 容器 image）、journey-suite 改回 `ubuntu-latest`（**W4-23 退場條件，不可遺失**）；
vitest／vite 大版本（#467 拆出）；`otpSession` 存 email、共用裝置可能預填前一人 email（H1 未處理）；
T1-B 審查未修：各頁 401 文案「登入已過期」；E 同類掃描（`expect_or_dump` 統一包裝、`open_task_center` 只等標題）；登出清所有模組快取的機械把關；
R3 P2-16、P2-17、P2-8、P2-9、P2-11、P2-14、P2-19、P2-20；#395 方向 3 sandbox 實打（需業主憑證）；PR #379 launch-readiness ①–④ 分拆；備份／PITR 評估；
伺服器端密碼規則；`handle_new_user` 不讀 metadata＋`national_id` 唯一；後台稽核軌跡 A1b-2/3；SEO 進階；框架修訂（friction-log）；`lazyWithRetry` 簡化＋表單草稿保存；
#421 記債；#430 輪播 P2；成功頁發卡行評估；邀請體驗整體重調；A1a、A2、L1-1、S7b；寬限期失效破圖通知（W2-12）；首頁 `searchQuery` 計入 `totalFilters`；
`setup-node` 逾時；notify／return 的 `payuniConfig()` 擲錯告警；子網域盤點＋完整 CSP；#383、#384。
**S2（#510）留下的**：後台刪帳號工具（W5-12「註冊中要刪找客服」目前沒有工具）；停權狀態確認期間付款鈕灰掉無說明（UIUX P2）；`/auth/register` 先驗推薦碼後查已完成註冊（已付款者舊分頁拿 400 而非 403）。
**S1（#512）留下的**：unknown 單人工確認已付款後的手動開通入口（W5-44③）。
**S6／S4 留下的**：PostHog develop project（W5-68，需付費方案時再議）。
**R5（review.md §6.3）補遺**：本波審查 P2、PR 未驗與已知限制、第 4 波四份稽核未修 P2 的完整清單以 `docs/plans/launch-wave-5/review.md` §6.3 為準（第 4 波稽核檔已隨 R5 退場，原文 `git show 3a7f506:docs/plans/launch-wave-4/audit-*.md`）；其中 W5-71、W5-72 已裁決。
**業主新增（W5-70）**：後台完整推薦樹＋查帳資訊。
**S7（#509）留下的**：換篇過場動畫（W5-69）；屏東「南鄉」→「南州鄉」（W5-65）。
**S6（#514）留下的**：journey f70 缺章（W5-60）；deploy-supabase.yml 部署 Edge 前自動確認 migration 已套用（W5-62）；確認框推薦人句在「讀 status 後才成環」競態下與結果不符（P2-3）；現任推薦人即預設推薦人時新約留空仍寫「將改變」（W5-63）。
**S6 實作**若 11/22 前沒合，列第 6 波第一優先（期限 2027-10-27）。

## 6. 業主待辦

| # | 事 | 狀態 |
|---|---|---|
| 1 | 審 S1、S2 規劃與 `/review-plan` 報告，通過後在各自 session 親打 `/tdd-implement pg-cron-schedulers`／`/tdd-implement payment-concurrency-guard` | 等規劃 |
| 2 | 實機確認（第 4 波交接 §3-2，未回報）：H1 曾開邀請連結的瀏覽器新註冊不帶推薦碼、帶 `?ref=` 仍帶入；`uknow.pages.dev` 根網址、深層路徑、query＋hash 都導向 `uknow.com.tw`，`develop.uknow.pages.dev` 不導；正式站實際登入一次 | 待回報 |
| 3 | PayUni 商店後台確認第一筆付款（11/03）發票已開立 | 待回報 |
| 4 | GitHub 設定（補強，非必須）：Fork PR workflows 設「Require approval for all external contributors」；Environments → develop 加 required reviewer | 待回報 |
| 5 | 晉升合進 main 後核准 `production` 部署 | 等晉升 |
| 6 | 晉升前在 eu.posthog.com 建 develop、正式站兩個 project，把 `phc_` key 給主 session（W5-35）；專案端勾選：Discard client IP、開 Session replay，關 exception autocapture／dead clicks／console／network／canvas（S4 Q8） | S4 合併前 |
| 9 | develop 甲段：S1（#512）已合，在 develop 的 SQL Editor 建 Vault 兩筆（`uknow_api_base_url`＝`https://ijcxnxhrziehdtkwausy.supabase.co/functions/v1/api`、`uknow_internal_secret`＝develop 的 RECONCILE_SECRET），不設 PHOTO_PURGE_LIVE；Edge 部署後做乙段驗證（checklist 步驟 8） | ✅ 11/07（W5-67 換新後乙段通過） |
| 8 | 晉升上線第一天在 PostHog 抽看 5～10 支錄影（註冊、付款、提領頁），確認無個資（W5-39） | 晉升後 |
| 7 | 環境網路白名單再加 `www.tgos.tw`，並告知 S7（W5-33） | ✅ 11/05 |

## 7. 執行 session 名冊（主 session 維護）

| ID | session | 模型 | 分支 | PR | 狀態 |
|---|---|---|---|---|---|
| S1 | `session_01MQovbF3C28ytruiwpCaQbE` | Opus | `feature/pg-cron-schedulers` | #512 ✅ 3712737 | 收工；develop 甲段待業主 |
| S2 | `session_01MQovbESfcRiNxR7jrSF4PC` | Opus | `feature/payment-concurrency-guard` | #510 ✅ 54ac83f | 收工 |
| S3 | `session_01MQovbC1eQchSVQ5EtHXBdN` | Sonnet | `fix/transient-not-final` | #508 ✅ 22a03af | 收工 |
| S5 | `session_01MQovbFK1GajBKp2k4tryQx` | Sonnet | `fix/csv-and-network-search` | #507 ✅ 547adb1 | 收工 |
| S7 | `session_01MQovbBUd7B4BdTZNQngYxy` | Sonnet | `feature/listing-swipe-nav` | #509 | **已合（45556bc）**，收工 |
| S4 | `session_01MQovbEeehM4wJEccfk4ez9` | Sonnet | `feature/posthog-monitoring` | #511 ✅ cebc239 | 收工；晉升前填 key（W5-35） |
| S6 | `session_01MQovbEoRnFFpm8XdeNidBN` | Opus | `feature/renewal-path-hardening` | #514 | **已合（fb8f95c）**，收工 |
| S8 | `session_01MQovbBQu7kxFjWhxHoGSZi` | Sonnet | `fix/terminology-guard` | #513 ✅ 2957408 | 收工 |
| R5 | `session_01MQovbB6vPbhWwnHkkkYDeZ` | Opus | `docs/wave5-review` | — | 審查中（11/07 開） |

## 8. 進度與異動紀錄（主 session 每次被事件喚醒記一列；hash 以 PR 內文為準）

| 時間（台北） | 事件 | 下一步 |
|---|---|---|
| 11/04 21:30 | 主 session 開局：讀交接、第 4 波 plan／review、〈慣例〉。#502 的正式站部署 run 41706804315 已在 21:14 核准，煙霧測試 `/health` sha＝`26c5ae8`（第 1 次探測）、PayUni production、預設推薦人 ok；dispatch deploy-smoke（ref=main）run 41844045128 綠。#502 收尾完成。業主裁決 W5-1～8（全照建議）；主 session 定 W5-9、W5-10。本檔擴寫、落 `dispatch-prompts.md` | 開 S1、S2、S3、S5 |
| 11/04 22:25 | 開 #506（本檔，draft，已訂閱）。開 S2、S1（Opus，規劃）與 S3、S5（Sonnet），tag `uknow-wave-5`；prompt 只放指標，正本是本分支的 `dispatch-prompts.md` | 等各 session 回報；S1、S2 規劃交業主審 |
| 11/04 22:35 | S5 交 #507：CSV 銀行欄位 `textCell`（`="…"`）；網絡搜尋二、三代比對遮罩名＋每人 30 次／分限流（429）。主 session 審：無 P0／P1。偏離：紅綠燈同一 commit（已寫進 PR 內文）；`="…"` 前綴不適合直接上傳銀行批次（目前用途是人工核對）。CI 全綠 → **#507 合進 develop（547adb1）** | — |
| 11/04 22:40 | S2 回報規劃＋/review-plan（P0 0、P1 13、P2 11），Q1～Q6 待裁決。主 session 代跑唯讀 SQL：正式站、develop 的 `reward_transactions` 四組索引候選重複 0 列；4 天內未完成訂單 0 筆 | 收業主裁決 |
| 11/04 22:40 | S1 回報規劃＋/review-plan（P0 1、P1 17、P2 15）。主 session 代跑：兩環境已裝 pg_cron 1.6.4、supabase_vault 0.3.1，**pg_net 未裝**；cron.job 只有 prune-rate-limits、purge-stale-referral-invites；正式站 48 小時 prune 48/48、啟動延遲最大 0.23 秒（佐證 pg_cron 準點） | 收業主裁決 |
| 11/04 22:50 | S3 交 #508（紅燈→綠燈，hash 以 PR 內文為準）：cancel-signup 改 `authenticate()`、CompleteProfile 帶 8 秒逾時、`PROFILE_MISSING`、`readSession`、formDraft 檔頭。主 session 審：無 P0／P1；不做「舊後端無 code」相容的判斷同意（空窗只是 404 走 degraded）。base 已前進 → 請 S3 自行 rebase | S3 rebase、CI 綠 → 合 |
| 11/04 23:00 | 業主裁決 **W5-11～18**；主 session 定 W5-19。W5-12 改變 S2 範圍：「稍後註冊」不刪帳號、`/auth/cancel-signup` 退場。已轉達 S2、S1 | S1、S2 修 plan → 主 session 親審 → 業主親打 `/tdd-implement` |
| 11/05 02:30 | 業主新增 UX 需求（手機錄影：首頁篩選剩 3 篇，逐篇點進、返回、再點下一篇）。裁決 **W5-20～23**：開 S7（刊登詳情頁左右滑換篇，本波必上）；第二題稍後補充 | 開 S7 |
| 11/05 02:40 | S3 rebase 到 547adb1，diff 與審過的版本除行號外相同，CI 全綠 → **#508 合進 develop（22a03af）**。S2 交規劃 r2：D 段照 W5-12 改成「稍後註冊」走 `useFunnelLogout`、拿掉確認框、`/auth/cancel-signup` 與 8 條守衛測試退場（以 404 測試釘住）；A／E 照 W5-13、W5-14；13 條 P1 都有處置。主 session 親審通過（未重跑整輪 /review-plan）。P2：後台沒有刪帳號工具（W5-12 的「找客服」）→ 第 6 波候選 | 業主到 S2 session 親打 `/tdd-implement payment-concurrency-guard` |
| 11/05 03:00 | S7 交規劃（#509 draft；P0 1：換 :id 時元件狀態未重設）。業主第二題 UX（首頁排序跳動）：主 session 讀碼說明現況，業主裁決 **W5-24～27**，主 session 定 W5-28；第二題併入 S7。S1 交規劃 v3.1（三輪審查，P0 皆處置）→ 主 session 親審通過，晉升硬性驗收寫進 §4。S2 已 rebase 到 22a03af | 業主到 S1、S2 session 親打 `/tdd-implement`；S7 修 plan 重審 |
| 11/05 03:20 | S7 交規劃 v2.1（第二輪 /review-plan P0 0、P1 10 皆處置；座標表走動態 chunk、FLIP 手刻 WAAPI）。業主裁決 **W5-29**（座標晚到一律重排）；主 session 定 W5-30（資料授權於階段 2 確認、預算上限 +3 kB）。主 session 親審通過 | 業主到 S7 session 親打 `/tdd-implement listing-swipe-nav` |
| 11/05 04:00 | 業主已在 S1、S7 親打 `/tdd-implement`。S1 階段 0 spike：①②③⑤ 過，④ 由業主裁 **W5-31**，⑥ 碼表連不到。S7 階段 1 綠（hash 以 #509 內文為準），階段 2 的界線資料連不到。業主裁 **W5-32**：自行放行四個網域 | 業主放行後 S1、S7 重試；S2 等業主親打 `/tdd-implement` |
| 11/05 04:10 | 業主已在 S2 親打 `/tdd-implement`，並放行四個網域（W5-32）；主 session 從同一個環境實測四個都通（302／200），已通知 S1、S7 重試。S1、S2 都已進實作 → 照 W5-2 開 **S4**（Sonnet，規劃） | 等各 session 回報 |
| 11/05 06:15 | S7：資料授權確認成立（data.gov.tw datasetId 7441，政府資料開放授權第 1 版），但 zip 在 www.tgos.tw → 業主裁 **W5-33**、**W5-34**。S4 交規劃（#511，P0 1、P1 13）→ 業主裁 **W5-35**、**W5-36**；主 session 定 S4 預算與 P0 驗證法 | 業主放行 www.tgos.tw；S4 修 plan 重審 |
| 11/05 07:40 | S4 交規劃 v2.1（第二輪 /review-plan P0 0；以 posthog-js 1.445.5 原始碼核實：compress_events 讓 before_send 看不到 DOM 屬性 → maskAttributeFn 白名單；未設選項會被專案端遠端開啟 → 全部明確 false）。業主裁 **W5-37～39**；主 session 親審通過 | 業主到 S4 session 親打 `/tdd-implement posthog-monitoring` |
| 11/05 08:00 | 業主已在 S4 親打 `/tdd-implement`、放行 `www.tgos.tw` 並告知 S7（主 session 實測 200）。S1、S2、S4、S7 四項都在實作 | 等各 session 回報 PR |
| 11/05 08:30 | S7：tgos 白名單通，但 TGOS 整站維護中，資料 zip 404。主 session 定 **W5-40**：先做不依賴座標表的階段 | 11/08 前 TGOS 未恢復再議 |
| 11/05 08:35 | S1：官方碼表取得（docs.payuni.com.tw 單筆交易查詢 Ver 2.0），業主在 S1 session 裁 **W5-41**、**W5-42**；階段 0～9 全綠，收尾後開 PR | 審 S1 PR |
| 11/05 08:45 | S7 階段 4、5 綠並推上；階段 6 有 1 條紅燈是測試夾具錯（重驗回三張照片），需業主在 S7 session 親口授權改一行（tdd 逃生口 2）。#509 build-bundle 紅（entry raw 超 1000 kB）→ 主 session 定 **W5-43** | 業主到 S7 session 授權 |
| 11/05 08:55 | S1 開 **#512**（33 檔、+3,443 行；實作審查 P0 0、P1 5 皆處置）。主 session 訂閱、親審 TradeStatus 對應（與 W5-41／42 一致），另派獨立 Opus 審查員審 diff。主 session 定 **W5-44** | 等審查與 CI |
| 11/05 09:10 | #512 審查（主 session＋獨立 Opus 審查員）：P1-1 模組頂層建 Supabase client（unit-tests 紅，本 PR 造成）；**P1-2（主 session 讀碼核實）標過 unknown 的單遇查詢層失敗仍會在 4 天後被標 expired**，違反 W5-41；P1-3 即 W5-44①（313ca52 已做）。P2：MerTradeNo 收斂、看門狗推播門檻（主 session 定 **W5-45**）、清理看門狗用 lastCompletedAt（可選）。已全部轉 S1 | S1 修完 → 審 delta → CI 綠 → 合 |
| 11/05 09:25 | S2 交 **#510**（ready，CI 綠；實作審查 P0 0、P1 6 處置；業主 08:25 於 S2 session 授權改 appShell.test.ts）。主 session 發現 #510／#512 migration 撞號 → **W5-46**。另派獨立 Opus 審查員審 #510。S2 待辦：後台刪帳號工具、停權期間付款鈕灰掉無說明 → 第 6 波候選；S6 須知：fresh 換線寫 profiles 在建單 RPC 之前，RPC 回 active／suspended 時不回復 | 等 #510 審查 |
| 11/05 09:40 | #510 獨立審查：**P0 0、P1 0**（process_successful_payment 與基準版逐行比對、告警隔離、v_paid_at、鎖序、索引、停權、register、cancel-signup 退場皆核實）。P2：文件兩處與程式不符（P2-1 → **W5-47**、P2-2 撞索引語意只限三代獎勵）、P2-3 並行 repair 測試分不出鎖或索引 → 本 PR 修；P2-4 register 檢查順序 → 第 6 波 | S2 修 P2-1～3 → CI 綠 → 合 |
| 11/05 09:50 | S2 修 #510 審查 P2-1～3（文件四處改「未送出草稿隨登出清除」、撞索引語意限三代獎勵、並行 repair 測試加 `repaired_count==0`），主 session 核實 delta、CI 全綠 → **#510 合進 develop（54ac83f）**。已通知 S1 rebase 並改 migration 號（W5-46）。照 W5-2 開 **S6**（Opus，規劃） | S1 修 #512；develop 部署後驗 #510 migration 已套 |
| 11/05 14:00 | S1 修 #512（P1-1 client factory、P1-2 unknown 單不 expire、MerTradeNo、W5-45、可選 P2 也做、W5-46 改號 `20261112000001`；業主 13:25 於 S1 session 授權修 stub），主 session 核實 P1-2 守衛、CI 全綠 → **#512 合進 develop（3712737）**。develop 甲段交業主。S4 交 #511（CI 綠）→ 獨立 Opus 審查：**P0 posthog-js 預設載入 Logs 擴充，專案端開 console 擷取即繞過所有防線**、P1 3、P2 5 → 退回 S4；主 session 定 **W5-48**。S6 交規劃（P0 0、P1 16）；主 session 代跑正式站／develop 唯讀 SQL（環 0、自領 0、q7＝3／1 佐證閘門 bug、回填差集 0）；業主裁 **W5-49～51**，主 session 定 **W5-52** | 業主做 develop 甲段；S4 修 P0；S6 修 plan 重審；S7 等業主授權 |
| 11/05 20:30 | 業主重申不得用「下線」；主 session 盤點 develop：使用者可見只剩律師定案的事業手冊（6）、參加契約（2），屬 10-23 裁決例外；內部 67 檔 197 行（規格書 §7 術語對照明定內部術語）；主 session 今日回覆與本檔 1 處違反 → 已更正。業主裁 **W5-53**（開 S8 機械把關）、**W5-54**、**W5-55**（S6 E1／E2）。S6 v2 主 session 親審：P1 3 收進 v3，只重審系統視角 | 開 S8；S6 v3 |
| 11/05 21:00 | S8 交 **#513**（TS compiler API 掃 src 字串、白名單只列有命中的兩份律師檔），主 session 審過無 P0／P1，等 CI。S7 階段 4～6 綠（業主 12:43 UTC 於 S7 session 授權夾具修正；預算 raw 1002.7／gzip 311.8，在 W5-43 內）。S6 v3.1 系統第 3 輪 P0／P1 清零 → 主 session 核對通過；業主裁 **W5-56** | 業主到 S6 session 親打 `/tdd-implement`；#513 CI 綠 → 合 |
| 11/05 21:10 | #513 CI 綠 → **合進 develop（2957408）**，S8 收工。S4 修 #511（module.slim＋SessionReplayExtensions、最壞遠端設定測試、P1／P2 全修；業主授權解鎖一次）→ 獨立 Opus 複審（scratch worktree 跑 npm ci 對照原始碼）：**P0／P1 清零**；P2：銀行 SelectContent portal 未 block、worst-case 內容斷言在舊程式上不紅、harness 非字串本文假綠；主 session 定 **W5-57**。退回 S4 補完 | S4 補完 → CI 綠 → 合 #511 |
| 11/05 21:30 | S4 補完複審四項（銀行 SelectContent 遮蔽、以 SDK 實例斷言擴充不存在並以舊 import 實測轉紅、harness 解碼 Blob／gzip 並新增壓縮路徑測試、`strict_script_versioning:true`）；主 session 核對 delta、CI 全綠 → **#511 合進 develop（cebc239）**。PostHog 維持關閉（佔位 key） | 晉升前業主給 key；S6 等業主親打；S7 施工 |
| 11/06 01:40 | S6 交 **#514**（draft；7 階段綠、/review-implementation P0 0、3 條 P1 已修、2 條 P1 記偏離、journey dispatch 中）。業主裁 **W5-58～60**。主 session 另派獨立 Opus 審查員審 #514 | S6 補 W5-58／59；等審查、CI、journey |
| 11/06 02:00 | #514 獨立 Opus 審查：**P0 0、P1 0**、P2 3（鎖序、R1～R7、新舊版本相容、正式站 migration 安全皆核實）。業主裁 **W5-61**（批次自癒死鎖本 PR 修）、**W5-62**（部署順序進晉升清單＋第 6 波）；P2-3 交 S6 確認 | S6 修 W5-61 → CI 綠 → 合 #514 |
| 11/06 03:05 | S6 修 W5-61（紅 3ac750b1／綠 356cb48c；批次設交易層旗標、0a′ try 鎖拋 U6R01、批次記 skipped_locked；主 session 對基準版逐行比對只差三處）；CI 全綠、journey 全套於 74e0c0b 綠。S6 回報 P2-3 有兩條非競態錯句 → 業主裁 **W5-63**（留第 6 波）。**#514 合進 develop（fb8f95c）**，S6 收工 | develop 部署後確認 S6 migration 已套；S7 收尾 → 晉升 |
| 11/06 09:35 | develop 部署 fb8f95c 成功（health sha 比對過）、S6 migration 7 支與 W5-61 函式已在 develop。S7 回報：rebase 後 check 全綠、階段 1、4～7、8a 完成；TGOS 改回 403 → 業主裁 **W5-64**（業主下載後附檔給 S7）；預算合計 1015／316 主 session 核可 | 業主附檔給 S7；S7 做階段 2、3、8b、9 |
| 11/07 14:20 | 業主附界線 zip 給 S7；S7 全階段完成（#509 head 9fea296，CI 綠、ready；/review-implementation P0 0；bundle entry 1011.6／315.2、總 1946.4，在 1015／316／1950 內）。主 session 派獨立 Opus 審查（第一次因容器重啟中斷，重派）。業主裁 **W5-65、66**。develop 乙段 pg_net 回 401 → 指紋比對不一致 → **W5-67** 腳本換新 | 等審查 → 合 #509 → 業主手機實測、跑換新腳本 → 乙段驗證 → 晉升 |
| 11/07 15:00 | #509 獨立 Opus 審查：**P0 0、P1 1**（座標在離開首頁期間回來 → 返回時第二次定位被接受而重排，違反「返回不重排」；審查員以補完測試實證轉紅）、P2 3（定位錯誤仍等滿 1.5 秒、方向鍵 repeat 連續換篇、檔頭缺資料集完整網址）→ 全數退回 S7 本 PR 修 | S7 修 → CI 綠 → 合 #509 |
| 11/07 15:10 | S7 修審查 P1＋P2 三項（紅 42c1e2b／綠 ea1ffad；`homeListingsCache.orderMode` 記離開前排序，返回本次造訪不採用座標；定位錯誤解除等待；忽略 event.repeat；檔頭補資料集網址），主 session 核對 delta、CI 全綠 → **#509 合進 develop（45556bc）**，S7 收工。本波五項必上與 S6、S7、S8 全數合併 | 業主手機實測（W5-66）＋手動換 RECONCILE_SECRET（W5-67）→ develop 乙段驗證 → PostHog key → 開晉升 PR |
| 11/07 16:35 | 業主手動換新 RECONCILE_SECRET（GitHub、正式站／develop Edge、develop Vault；W5-67）。develop 乙段通過：`invoke_internal_endpoint('reconcile')` → HTTP 200、`scheduled_job_runs` 新增 succeeded 列（先前 06:07～08:07 三輪 pg_cron 皆 401、01:07～05:07 為 vault_missing） | 確認正式站看門狗 :37 那輪成功；業主手機實測、PostHog key → 晉升 |
| 11/07 16:50 | 主 session 手動觸發 reconcile-payments（workflow_dispatch，打正式站）→ success，確認 GitHub 與正式站 Edge 新 RECONCILE_SECRET 一致。業主手機實測 W5-66 三項（LINE 邊緣返回、換篇無橫向閃動、返回捲動）**全部正常** | PostHog key → 開晉升 PR |
| 11/07 18:15 | 業主給正式站 PostHog key → 主 session 開 **#515**（`config/posthogTarget.ts` 正式 key、develop 佔位、規格書 §15）CI 全綠 → **合進 develop（e6c2835）**。開**晉升 PR #516**（develop → main，journey 全套跑中）。#506 於晉升後合併（不讓 journey 重跑） | journey 綠 → 合 main → W5-62 確認 migration → 業主正式站 Vault 甲段 → 核准 production → 乙段、health sha |
| 11/07 18:58 | **晉升 #516 合進 main（f5a1ed8）**：journey 全套綠（28 分）、main push CI 綠。W5-62 核對：正式站 7 支 migration 已套、六參數 prepare／referral_would_cycle／W5-61 版函式在、cron.job 5 列、pg_net 已裝、配對名單回填 18 列（預查 15，差額為 11/05 後新配對）。業主建正式站 Vault 兩筆 → 核准 production（run 42365227288 success，含 health sha 比對）→ Deploy Smoke success。乙段：`invoke_internal_endpoint('reconcile')` HTTP 200、帳本 succeeded | 11:07 UTC pg_cron 首輪、業主確認 PHOTO_PURGE_LIVE、上線首日抽看錄影（W5-39）；合 #506；開 R5 |
| 11/07 19:13 | 正式站乙段後半通過：pg_cron `reconcile-pending-payments` 11:07 UTC 首輪 succeeded（net 200、帳本 succeeded、checked／unknown／incomplete 全 0）。部署後 system_alerts 0 列；配對名單 hist 18＝來源 18、差集 0；無 pending 訂單。R5 開工（P0 0），代跑查詢已交。業主新增第 6 波 W5-69、W5-70 | 19:25 UTC 檢查照片清理首輪 dryRun（佐證 PHOTO_PURGE_LIVE）；業主完成 PostHog 引導並確認有錄影；等 R5 |
| 11/07 19:20 | R5 交 **#517**（P0 0、P1 0、P2 8；跨 PR 交互核實無誤；`launch-wave-4/` 已退場）。業主裁 **W5-71**（結帳頁四項第 6 波合一支 fix-bug）、**W5-72**（批次自癒互鎖第 6 波優先、先改 error 告警）。§6.3 補遺以指標併入 §5。合併順序：#506 先、#517 後 | 合 #506 → #517；19:25 UTC 照片清理 dryRun |
| 11/07 19:45 | 業主完成 PostHog 引導（只留 Product analytics＋Session replay；Autocapture／heatmaps／web vitals 關；拒絕 Wizard PR 與 Data Warehouse 連線），onboarding 顯示 Installation complete。**W5-39 抽查：文字與輸入已遮蔽**；照片空白屬預期 → **W5-73** 維持。#506 合（27bb1cb）、R5 **#517 合（f31a263）**，`launch-wave-4/` 退場、R5 收工 | 19:25 UTC 照片清理首輪 dryRun（PHOTO_PURGE_LIVE 佐證）；第 6 波由新主 session 開局 |
