Feature: Walking skeleton — 單人從註冊到訂閱生效的完整旅程
  M1 的驗收路徑：一位新會員全程透過 Web GUI 完成註冊三步與付款，
  後端在真實分支上落地訂閱、付款訂單與推薦碼。這條線也是 CI 軌道 2
  （journey-smoke）的內容。

  @journey @skeleton
  Scenario: A0 完成 GUI 註冊與付款，取得推薦碼並落地訂閱
    Given journey 測試環境已就緒
    And 管理員帳號已完成 bootstrap
    When 使用者 "A0" 走完 GUI 註冊流程
    And 使用者 "A0" 以測試卡完成付款
    Then "A0" 可以進入會員儀表板
    And 後端已為 "A0" 落地訂閱、完成訂單與 active 推薦碼
