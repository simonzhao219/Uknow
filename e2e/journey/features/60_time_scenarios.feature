Feature: 跨時間情境 — 會籍狀態機（時光機）
  以 service role 回填訂閱時間戳（資料是種的），再從 GUI 驗證系統
  反應（行為斷言是真的）。使用 C7/C8/C4 等中段節點，不影響 A0/B1
  的帳本情境。

  已知落差（不寫成情境，詳 README）：
  - 規格 §2：即將失效（寬限期）應「隱藏刊登」——實作的
    has_active_subscription 在寬限期內仍回 true，刊登照常公開；
    本 feature 以「現況」斷言並標記落差。
  - 規格 §2：永久失效應「舊碼作廢」——實作沒有任何機制把
    referral_codes.status 改掉，失效會員的碼仍驗證成功。
  - 規格 §7.1：連續推薦達人（連續 12 個月）後端未實作，/tasks 只有
    推薦王一個任務。

  Background:
    Given journey 測試環境已就緒
    And 組織樹已建置完成

  @journey @timemachine
  Scenario: 刊登可見性隨會籍狀態變化（active → grace → expired）
    When "C7" 登入並建立自己的刊登
    And 訪客在首頁搜尋 "C7" 的刊登名稱
    Then 搜尋結果出現該刊登卡片
    When 時光機將 "C7" 推入寬限期
    And 訪客在首頁搜尋 "C7" 的刊登名稱
    Then 搜尋結果出現該刊登卡片
    When 時光機將 "C7" 推入永久失效
    And 訪客在首頁搜尋 "C7" 的刊登名稱
    Then 首頁顯示查無結果

  @journey @timemachine
  Scenario: 寬限期會員的推薦碼仍可推廣
    Given 時光機將 "C4" 推入寬限期
    When 臨時使用者 "X1" 在完善資料頁驗證 "C4" 的推薦碼
    Then 推薦碼欄即時顯示 "C4" 的真實姓名

  @journey @timemachine
  Scenario: 寬限期補繳 — 效期接續原到期日而非付款日
    Given 時光機將 "C8" 推入寬限期並記下接續錨點
    When "C8" 登入並以「續約（接續原效期）」完成補繳
    Then "C8" 的新到期日接續原到期日約一年
    And "C8" 的新到期日早於「從付款日起算一年」
