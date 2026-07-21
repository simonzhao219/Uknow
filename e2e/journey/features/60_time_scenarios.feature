Feature: 跨時間情境 — 會籍狀態機（時光機）
  以 service role 回填訂閱時間戳（資料是種的），再從 GUI 驗證系統
  反應（行為斷言是真的）。使用 C7/C8/C4 等中段節點，不影響 A0/B1
  的帳本情境。

  會籍兩態（見 0721 移除寬限期）：end_date 一過即完全失效，無 60 天
  緩衝窗。has_active_subscription 以 now() <= end_date 為界，到期即隱藏
  刊登（原本寬限期仍公開刊登的落差已隨移除寬限期而消除）。

  設計確認（非落差）：失效會員的推薦碼「不作廢、仍可驗證使用」為正式
  決策（0721；spec §2 已對齊）——本 feature 的「過期會員推薦碼仍可推廣」
  情境即驗證此行為。點數/任務進度亦「保留不歸零、僅擋提領」。

  已知落差（不寫成情境，詳 README）：
  - 規格 §7.1：連續推薦達人（連續 12 個月）後端未實作，/tasks 只有
    推薦王一個任務。

  Background:
    Given journey 測試環境已就緒
    And 組織樹已建置完成

  @journey @timemachine
  Scenario: 刊登可見性隨會籍狀態變化（active → expired）
    When "C7" 登入並建立自己的刊登
    And 訪客在首頁搜尋 "C7" 的刊登名稱
    Then 搜尋結果出現該刊登卡片
    When 時光機將 "C7" 推入完全失效
    And 訪客在首頁搜尋 "C7" 的刊登名稱
    Then 首頁顯示查無結果

  @journey @timemachine
  Scenario: 過期會員的推薦碼仍可推廣
    Given 時光機將 "C4" 推入剛過期（未滿一年）
    When 臨時使用者 "X1" 在完善資料頁驗證 "C4" 的推薦碼
    Then 推薦碼欄即時顯示 "C4" 的真實姓名

  @journey @timemachine
  Scenario: 過期補繳 — 效期接續原到期日而非付款日
    Given 時光機將 "C8" 推入剛過期（未滿一年）並記下接續錨點
    When "C8" 登入並以「續約（接續原效期）」完成補繳
    Then "C8" 的新到期日接續原到期日約一年
    And "C8" 的新到期日早於「從付款日起算一年」
