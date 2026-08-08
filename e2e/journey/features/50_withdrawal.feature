Feature: 提領 — 雙視角全生命週期
  規則：最低 1,000P、須為 1,000 倍數、外加手續費 15P（檢核
  餘額 >= 提領額 + 15）；pending → awaiting_collection → completed，
  或 pending → rejected（點數退回）。金額斷言以 /rewards 的
  availableRewards（與前端同一 SSOT）為準。

  前提帳本：A0 = 24 × 單代獎金（100P 時為 2,400P）；B1 = 900P。

  Background:
    Given journey 測試環境已就緒
    And 組織樹已建置完成

  # 提領前置：request_withdrawal 第一道檢核是「已加入推薦計畫」
  # （GUI 簽名流程）——各情境先以冪等步驟確保主角已加入。

  @journey @withdrawal @negative
  Scenario: 未加入推薦計畫的會員看到未加入提示
    When "C1" 登入並開啟獎勵頁
    Then 獎勵頁顯示尚未加入推薦計畫的提示

  @journey @withdrawal @negative
  Scenario: 餘額不足 1,015P 的會員看到資格不足提示
    Given "B1" 已透過 GUI 加入推薦計畫
    When "B1" 登入並開啟獎勵頁
    Then 獎勵頁顯示可提領Point不足的提示

  @journey @withdrawal @negative
  Scenario: 金額驗證 — 低於下限、非倍數、超過上限
    Given "A0" 已透過 GUI 加入推薦計畫
    When "A0" 登入並開啟獎勵頁
    And "A0" 開始提領申請
    Then 金額 "500" 被拒且顯示最低提領限制
    And 金額 "1500" 被拒且顯示須為 1000 的倍數
    And 金額 "9000" 被拒且顯示超過可提領上限

  @journey @withdrawal
  Scenario: 完整生命週期 — 申請、匯款、查收
    Given "A0" 已透過 GUI 加入推薦計畫
    And 記下 "A0" 的可提領點數
    When "A0" 透過 GUI 申請提領 1000 點
    Then "A0" 的可提領點數減少 1015
    When 管理員在提領管理將第一筆申請標記已匯款
    And "A0" 透過 GUI 完成查收
    Then 資料庫中 "A0" 最新一筆提領狀態為 "completed"

  # 一天一次的限制不看狀態（has_withdrawn_today 只比對 requested_at 的日期），
  # 而上一個情境已經讓 A0 提領過一次——不解除當日額度，這裡的「申請Point提領」
  # 永遠是 disabled。規則沒錯、產品沒錯，是兩個情境共用了同一個人的當日額度。
  @journey @withdrawal
  Scenario: 退件路徑 — 點數退回
    Given "A0" 已透過 GUI 加入推薦計畫
    And "A0" 當日的提領額度已解除
    And 記下 "A0" 的可提領點數
    When "A0" 透過 GUI 申請提領 1000 點
    Then "A0" 的可提領點數減少 1015
    When 管理員在提領管理退件第一筆申請
    Then "A0" 的可提領點數恢復為記下的數值
    And 資料庫中 "A0" 最新一筆提領狀態為 "rejected"
