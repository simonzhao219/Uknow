Feature: 推薦與獎勵 — 樹與帳本
  對已建置的六代 30 人樹做 M2 斷言：
  - 帳本以「筆數 × reward_config 單代獎金」計算（不寫死金額）；
  - root 的三代邊界（第 4 代零貢獻、樹 UI 不顯示）；
  - 中間節點交叉驗證「獎勵相對每個節點各自計算」。

  Background:
    Given journey 測試環境已就緒
    And 組織樹已建置完成

  @journey @rewards
  Scenario: Root 帳本 — 代數分佈 8/8/8、總額為 24 × 單代獎金
    Then 資料庫中 "A0" 的獎勵代數分佈為 8/8/8
    And 資料庫中 "A0" 的獎勵總點數等於其三代下線數乘以單代獎金

  @journey @rewards
  Scenario: Root 獎勵頁顯示正確的可提領點數
    When "A0" 登入並開啟獎勵頁
    Then 獎勵頁顯示的可提領點數等於 "A0" 的預期總額

  @journey @rewards
  Scenario: Root 推薦樹只顯示三代且第四代不出現
    When "A0" 登入並開啟推薦頁
    Then 推薦樹三個世代區塊各顯示 8 人
    And 展開全部世代後名單包含 "D8" 的姓名
    And 頁面上不出現 "E1" 的姓名

  @journey @rewards
  Scenario Outline: 中間節點帳本交叉驗證
    Then 資料庫中 "<node>" 的獎勵總點數等於其三代下線數乘以單代獎金

    Examples:
      | node |
      | B1   |
      | B2   |
      | C1   |
      | F1   |
      | G1   |
