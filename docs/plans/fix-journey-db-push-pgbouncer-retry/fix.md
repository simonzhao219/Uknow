# journey.yml 重試迴圈漏接 PgBouncer 殘留 prepared statement 修復紀錄

分支:`fix/journey-db-push-pgbouncer-retry` | 重現測試(紅燈 commit):不適用,
理由同前兩次(bash-in-YAML 對真實外部服務的時序問題)。這次的證據來自 PR #302
第三次 journey-full 嘗試(修好 errexit 後,重試邏輯首度真正執行)的真實 log。

## 1. 症狀與重現

PR #304(errexit 修復)合進 develop 後,PR #302 第三次觸發 journey-full——這次
重試邏輯**確實執行了**(印出 `::warning::...第 1 次撞到 schema_migrations_pkey`,
證明 errexit 修復生效),但第 2 次嘗試撞到一個新錯誤:

```
failed to parse rows: ERROR: prepared statement "lrupsc_1_0" already exists (SQLSTATE 42P05)
```

不在既有的 `schema_migrations_pkey` 比對範圍內,依設計正確判定為不可重試,立即
紅燈——這正是設計的一部分(未知錯誤不該被吞掉),不是這次要修的缺陷本身,但
表示重試邏輯的「可重試錯誤」清單需要擴充。

## 2. 根因

`db push` 的連線走 pooler URL(`POSTGRES_URL`,見 §3 對應的既有註解)。Supabase
的 pooler 是 PgBouncer,預設 transaction-mode pooling——每個邏輯連線的底層
實體 TCP 連線用完即還回池子,供下一個請求者取用,但 transaction-mode 不保證
`DISCARD ALL` 之類的完整 session reset。

第 1 次嘗試因撞到 `schema_migrations_pkey` 被 errexit 中斷(現在是 `exit 1` 主動
中斷 while 迴圈的那個分支),CLI process 中途死亡,沒有機會對它已經 PREPARE 過
的 statement(driver 自動產生的名字,如 `lrupsc_1_0`)做 DEALLOCATE。這個連線
被交還連線池後,第 2 次嘗試若剛好分配到同一條底層連線,driver 用同名重新
PREPARE 就撞見「已存在」。

**這是重試機制本身的副作用**:不重試就不會有「上一次留下殘留狀態、這一次
撞見」這種時序;兩個 SQLSTATE(`23505`、`42P05`)本質上是同一個故事的兩種
表現形式——都是「快速重試撞見連線池/資料庫殘留的上一次嘗試痕跡」,不是
migration 內容或程式邏輯有問題。

## 3. 同類掃描

- pattern 延續前一次的同類掃描結論(repo 內僅此一處做這種重試),這次額外
  確認:`grep -n "POSTGRES_URL\|pgbouncer\|pooler" .github/workflows/journey.yml`
  只有這一處使用 pooler 連線做寫入重試,沒有第二處。
- 結果:☑ 無同病灶。

## 4. 四面向審視

同前兩次(系統/UIUX/需求皆不適用或無變化;架構——點狀,非結構問題)。

## 5. 修法與驗證

- 修了什麼:把可重試錯誤的判斷從單一字串 `schema_migrations_pkey` 改成比對
  SQLSTATE 代碼 `grep -qE 'SQLSTATE (23505|42P05)'`,涵蓋這次新觀察到的
  `42P05`(prepared statement already exists)。
- 為什麼這樣修是對的:比對 SQLSTATE 代碼比比對訊息文字精確——PostgreSQL
  錯誤代碼是穩定的協定層事實,不會因 CLI 版本改錯誤訊息措辭而失配,且不會
  誤配到無關但恰好包含「already exists」之類字樣的其他錯誤。
- 驗證(延續上次教訓,全程用 `bash -e`):新增情境 4——第 1 次撞 23505、第 2
  次撞 42P05、第 3 次成功,確認重試迴圈正確吃過兩種錯誤後收斂;並重新驗證
  情境 2(非白名單錯誤立即失敗)與情境 3(持續失敗到重試上限)在新的比對條件
  下依然正確,沒有因為擴大比對範圍而誤放行不該重試的錯誤。四個情境全數通過。

## 6. 防線回填

- 為什麼既有閘門沒攔到:與前兩次同——這是只有在真實 PgBouncer 連線池上才會
  出現的殘留狀態問題,靜態檢查與本機模擬都無法在不連真實服務的情況下重現。
- 處置:☑ 攔不到,記 friction-log——這是同一條「重試快速嘗試會撞見連線池
  殘留狀態」原則的具體案例,與前一則(errexit)一併記錄,避免下次遇到類似
  SQLSTATE 又重新從頭診斷。若未來再出現第三種可重試的 SQLSTATE,比照這次的
  模式擴充清單即可,不需要整體重新設計。
